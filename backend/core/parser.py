import re

EXTENSION_MAP: dict[str, str] = {
    "py": "Python",
    "js": "JavaScript",
    "ts": "TypeScript",
    "jsx": "JavaScript",
    "tsx": "TypeScript",
    "java": "Java",
    "go": "Go",
    "rs": "Rust",
    "cpp": "C++",
    "c": "C",
    "cs": "C#",
    "rb": "Ruby",
    "php": "PHP",
    "swift": "Swift",
    "kt": "Kotlin",
}


def clean_code(code: str) -> str:
    code = code.replace("\x00", "")
    code = code.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in code.split("\n")]
    return "\n".join(lines)

def parse_diff(diff: str) -> list[dict]:
    if not diff or not diff.strip():
        return []

    files: list[dict] = []
    current_file: dict | None = None

    for raw_line in diff.split("\n"):
        
        if raw_line.startswith("Binary files"):
            continue

        if raw_line.startswith("diff --git"):
            if current_file is not None:
                files.append(current_file)
            current_file = {
                "filename": "",
                "additions": [],
                "removals": [],
                "hunks": [],
            }
            continue

        if current_file is None:
            continue

        if raw_line.startswith("+++ "):
            path = raw_line[4:]
            current_file["filename"] = path.removeprefix("b/")
            continue

        if raw_line.startswith("--- "):
            continue

        hunk_match = re.match(r"^@@\s.*?\s@@", raw_line)
        if hunk_match:
            current_file["hunks"].append(hunk_match.group())
            nums = re.findall(r"[+-](\d+)", hunk_match.group())
            current_file["_rem_line"] = int(nums[0]) if len(nums) > 0 else 1
            current_file["_add_line"] = int(nums[1]) if len(nums) > 1 else 1
            continue

        if raw_line.startswith("\\ No newline"):
            continue

        if raw_line.startswith("+"):
            add_line = current_file.get("_add_line", 1)
            current_file["additions"].append(
                {"line_number": add_line, "content": raw_line[1:]}
            )
            current_file["_add_line"] = add_line + 1
        elif raw_line.startswith("-"):
            rem_line = current_file.get("_rem_line", 1)
            current_file["removals"].append(
                {"line_number": rem_line, "content": raw_line[1:]}
            )
            current_file["_rem_line"] = rem_line + 1
        else:
            current_file["_add_line"] = current_file.get("_add_line", 1) + 1
            current_file["_rem_line"] = current_file.get("_rem_line", 1) + 1

    if current_file is not None:
        files.append(current_file)

    for f in files:
        f.pop("_add_line", None)
        f.pop("_rem_line", None)
    return files

def extract_language(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    return EXTENSION_MAP.get(ext, "Unknown")

def truncate_code(code: str, max_length: int) -> str:
    if len(code) <= max_length:
        return code

    search_region = code[:max_length]
    last_def = search_region.rfind("\ndef ")
    last_class = search_region.rfind("\nclass ")
    cut_point = max(last_def, last_class)

    if cut_point <= 0:
        return code[:max_length] + "\n# ... truncated for review"
    return code[:cut_point] + "\n# ... truncated for review"
