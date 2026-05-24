import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowUpDown,
  BadgeCheck,
  Bot,
  Bug,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  Cpu,
  FileCode2,
  FileDiff,
  FolderGit2,
  Gauge,
  GitBranch,
  GitPullRequest,
  Home,
  LayoutDashboard,
  Loader2,
  Lock,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiAvailable,
  applyPrReviewFilters,
  applyReviewFilters,
  demoPrFiles,
  fetchPrFiles,
  isOfflineError,
  isValidPrUrl,
  reviewCodeFile,
  reviewPullRequest
} from "./api";

type Page = "home" | "code" | "pr" | "history" | "settings";
type Severity = "critical" | "high" | "medium" | "low";
type ReviewType = "bugs" | "security" | "performance" | "style";
type ModelChoice = "Claude Sonnet 4" | "Claude Opus 4" | "Claude Haiku 3.5";
type Threshold = "low" | "medium" | "high";

type CodeFile = {
  id: string;
  name: string;
  language: string;
  content: string;
};

type ReviewIssue = {
  id: string;
  type: ReviewType;
  severity: Severity;
  line: number;
  description: string;
  suggestion: string;
};

type ReviewResult = {
  score: number;
  security: number;
  reliability: number;
  performance: number;
  maintainability: number;
  issues: ReviewIssue[];
  strengths: string[];
  summary: string;
  model: ModelChoice;
};

type PrFile = {
  path: string;
  additions: number;
  deletions: number;
  status: "modified" | "added" | "renamed";
};

type PrResult = ReviewResult & {
  verdict: "Approve" | "Request Changes";
  confidence: number;
  concerns: string[];
};

type HistoryRecord = {
  id: string;
  kind: "Code" | "PR";
  fileName: string;
  language: string;
  score: number;
  date: string;
  issues: Record<Severity, number>;
  verdict?: "Approve" | "Request Changes";
  codeSnapshot?: ReviewResult;
  prSnapshot?: PrResult;
};

type AppSettings = {
  model: ModelChoice;
  reviewTypes: Record<ReviewType, boolean>;
  threshold: Threshold;
};

const severityOrder: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low"
};

const reviewTypeLabels: Record<ReviewType, string> = {
  bugs: "Bugs",
  security: "Security",
  performance: "Performance",
  style: "Style"
};

const initialFiles: CodeFile[] = [
  {
    id: "auth.ts",
    name: "auth.ts",
    language: "TypeScript",
    content: `type LoginResponse = {
  token: string;
  expiresAt: string;
  profile: {
    id: string;
    role: "admin" | "reviewer";
  };
};

export async function login(email: string, password: string) {
  const response = await fetch("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  const payload = (await response.json()) as LoginResponse;
  localStorage.setItem("session_token", payload.token);
  return payload.profile;
}

export function restoreSession() {
  const token = localStorage.getItem("session_token");
  return token ? { token, active: true } : null;
}`
  },
  {
    id: "review-worker.ts",
    name: "review-worker.ts",
    language: "TypeScript",
    content: `import { queueReview } from "./queue";

export async function runBatch(files: string[]) {
  const results: string[] = [];

  files.forEach(async (file) => {
    const reviewId = await queueReview(file);
    console.log("queued", reviewId);
    results.push(reviewId);
  });

  return results;
}

export function parseRuleExpression(expression: string) {
  return eval(expression);
}`
  },
  {
    id: "Dashboard.tsx",
    name: "Dashboard.tsx",
    language: "React",
    content: `import { useEffect, useState } from "react";

export function Dashboard() {
  const [usage, setUsage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/usage")
        .then((response) => response.json())
        .then((payload) => setUsage(payload.total));
    }, 5000);
  }, []);

  return (
    <section>
      <h1>Usage</h1>
      <strong>{usage}</strong>
    </section>
  );
}`
  }
];

const starterHistory: HistoryRecord[] = [
  {
    id: "hist-1",
    kind: "Code",
    fileName: "auth.ts",
    language: "TypeScript",
    score: 78,
    date: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    issues: { critical: 0, high: 1, medium: 2, low: 1 }
  },
  {
    id: "hist-2",
    kind: "PR",
    fileName: "github.com/acme/core#248",
    language: "Diff",
    score: 86,
    date: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    issues: { critical: 0, high: 0, medium: 2, low: 3 },
    verdict: "Approve"
  },
  {
    id: "hist-3",
    kind: "Code",
    fileName: "review-worker.ts",
    language: "TypeScript",
    score: 64,
    date: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    issues: { critical: 1, high: 1, medium: 0, low: 1 }
  },
  {
    id: "hist-4",
    kind: "PR",
    fileName: "github.com/atlas/web#913",
    language: "Diff",
    score: 71,
    date: new Date(Date.now() - 1000 * 60 * 260).toISOString(),
    issues: { critical: 0, high: 2, medium: 2, low: 0 },
    verdict: "Request Changes"
  }
];

const navItems: Array<{ page: Page; label: string; icon: LucideIcon }> = [
  { page: "home", label: "Home", icon: Home },
  { page: "code", label: "Code Review", icon: Code2 },
  { page: "pr", label: "PR Review", icon: GitPullRequest },
  { page: "history", label: "History", icon: Archive },
  { page: "settings", label: "Settings", icon: Settings }
];

const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

function countIssues(issues: ReviewIssue[]) {
  return issues.reduce<Record<Severity, number>>(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );
}

function formatRelativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60000));

  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function lineFor(content: string, snippet: string, fallback: number) {
  const index = content.toLowerCase().indexOf(snippet.toLowerCase());
  if (index < 0) return fallback;
  return content.slice(0, index).split("\n").length;
}

function detectIssues(file: CodeFile) {
  const content = file.content;
  const issues: ReviewIssue[] = [];

  if (content.includes("eval(")) {
    issues.push({
      id: "eval-security",
      type: "security",
      severity: "critical",
      line: lineFor(content, "eval(", 1),
      description: "Dynamic evaluation can execute untrusted review rules inside the runtime.",
      suggestion: "Replace eval with a constrained expression parser or a server-side allowlist."
    });
  }

  if (content.includes("localStorage") && content.toLowerCase().includes("token")) {
    issues.push({
      id: "token-storage",
      type: "security",
      severity: "high",
      line: lineFor(content, "localStorage", 1),
      description: "Session tokens stored in localStorage are exposed to script injection.",
      suggestion: "Prefer an httpOnly secure cookie and keep token refresh logic on the server."
    });
  }

  if (content.includes("fetch(") && !content.includes("response.ok")) {
    issues.push({
      id: "fetch-errors",
      type: "bugs",
      severity: "medium",
      line: lineFor(content, "fetch(", 1),
      description: "The request path reads JSON without checking HTTP failure states.",
      suggestion: "Guard on response.ok and return a typed failure state before reading the body."
    });
  }

  if (content.includes("forEach(async")) {
    issues.push({
      id: "async-foreach",
      type: "bugs",
      severity: "high",
      line: lineFor(content, "forEach(async", 1),
      description: "The batch runner returns before async queue operations finish.",
      suggestion: "Use Promise.all(files.map(...)) or a for...of loop with await."
    });
  }

  if (content.includes("setInterval") && !content.includes("clearInterval")) {
    issues.push({
      id: "interval-cleanup",
      type: "performance",
      severity: "medium",
      line: lineFor(content, "setInterval", 1),
      description: "The interval is never cleared when the component unmounts.",
      suggestion: "Return a cleanup function from useEffect and clear the interval."
    });
  }

  if (content.includes("console.log")) {
    issues.push({
      id: "console-log",
      type: "style",
      severity: "low",
      line: lineFor(content, "console.log", 1),
      description: "Debug logging is still present in production review flow code.",
      suggestion: "Route diagnostics through the app logger with environment-based levels."
    });
  }

  if (content.split("\n").some((line) => line.length > 96)) {
    issues.push({
      id: "line-length",
      type: "style",
      severity: "low",
      line: content.split("\n").findIndex((line) => line.length > 96) + 1,
      description: "One or more lines are dense enough to slow down scan review.",
      suggestion: "Wrap long expressions and name intermediate values where intent is hidden."
    });
  }

  return issues;
}

function buildRawReview(file: CodeFile, settings: AppSettings): ReviewResult {
  const allIssues = detectIssues(file);
  const penalty = allIssues.reduce((total, issue) => {
    if (issue.severity === "critical") return total + 24;
    if (issue.severity === "high") return total + 15;
    if (issue.severity === "medium") return total + 8;
    return total + 4;
  }, 0);
  const baseScore = Math.max(38, 96 - penalty);

  return {
    score: baseScore,
    security: baseScore,
    reliability: baseScore,
    performance: baseScore,
    maintainability: baseScore,
    issues: allIssues,
    strengths: [
      "Function boundaries are small enough for targeted fixes.",
      "The review surface is easy to reproduce from a single focused file.",
      "Naming is readable and the intent is visible at call sites."
    ],
    summary: "The review found concrete changes that would improve safety, correctness, and maintainability.",
    model: settings.model
  };
}

function buildReview(file: CodeFile, settings: AppSettings): ReviewResult {
  return applyReviewFilters(buildRawReview(file, settings), settings);
}

function buildRawPrResult(
  url: string,
  files: PrFile[],
  settings: AppSettings,
  overrides?: { score?: number; verdict?: "Approve" | "Request Changes" }
): PrResult {
  const syntheticFile: CodeFile = {
    id: "pull-request.diff",
    name: url.replace(/^https?:\/\//, "") || "pull-request.diff",
    language: "Diff",
    content: `fetch("/api/reviews")
localStorage.setItem("preview_token", token)
setInterval(sync, 2000)
console.log("merged", branch)
eval(rule)`
  };
  const rawReview = buildRawReview(syntheticFile, settings);
  const churn = files.reduce((total, file) => total + file.additions + file.deletions, 0);
  const adjustedScore = overrides?.score ?? Math.max(42, rawReview.score - (churn > 220 ? 6 : 0));
  const verdict =
    overrides?.verdict ??
    (adjustedScore >= 82 &&
    !rawReview.issues.some((issue) => issue.severity === "critical" || issue.severity === "high")
      ? "Approve"
      : "Request Changes");

  return {
    ...rawReview,
    score: adjustedScore,
    verdict,
    confidence: verdict === "Approve" ? 91 : 88,
    concerns:
      rawReview.issues.length > 0
        ? rawReview.issues.slice(0, 3).map((issue) => issue.description)
        : ["No blocking concerns found in the simulated diff."]
  };
}

function buildPrResult(
  url: string,
  files: PrFile[],
  settings: AppSettings,
  overrides?: { score?: number; verdict?: "Approve" | "Request Changes" }
): PrResult {
  return applyPrReviewFilters(buildRawPrResult(url, files, settings, overrides), settings);
}

function scoreTone(score: number) {
  if (score >= 85) return "good";
  if (score >= 70) return "warn";
  return "bad";
}

function countTotalIssues(issueCounts: Record<Severity, number>) {
  return Object.values(issueCounts).reduce((total, count) => total + count, 0);
}

function mostSevere(issueCounts: Record<Severity, number>): Severity | null {
  if (issueCounts.critical) return "critical";
  if (issueCounts.high) return "high";
  if (issueCounts.medium) return "medium";
  if (issueCounts.low) return "low";
  return null;
}

function severityRank(issueCounts: Record<Severity, number>) {
  const severity = mostSevere(issueCounts);
  return severity ? severityOrder[severity] : 0;
}

function inferLanguageFromFile(file: CodeFile): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : null;
  const extMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    java: "Java",
    go: "Go",
    rs: "Rust"
  };
  return ext ? extMap[ext] ?? null : null;
}

function languageMatchesSelection(file: CodeFile): boolean {
  const inferred = inferLanguageFromFile(file);
  if (!inferred) return true;
  const selected = file.language;
  if (selected.toLowerCase() === inferred.toLowerCase()) return true;
  if (selected === "React" && (inferred === "TypeScript" || inferred === "JavaScript")) return true;
  return false;
}

function formatHistoryName(name: string) {
  if (name.length <= 42) return name;
  return `${name.slice(0, 20)}…${name.slice(-18)}`;
}

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [files, setFiles] = useState<CodeFile[]>(initialFiles);
  const [openTabs, setOpenTabs] = useState<string[]>(initialFiles.map((file) => file.id));
  const [activeFileId, setActiveFileId] = useState(initialFiles[0].id);
  const [activeLine, setActiveLine] = useState(1);
  const [codeReview, setCodeReview] = useState<ReviewResult | null>(null);
  const [reviewAnchor, setReviewAnchor] = useState<{ fileId: string; content: string; language: string } | null>(
    null
  );
  const [loadingReview, setLoadingReview] = useState(false);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});
  const [prUrl, setPrUrl] = useState("https://github.com/acme/core/pull/248");
  const [prFiles, setPrFiles] = useState<PrFile[]>([]);
  const [prResult, setPrResult] = useState<PrResult | null>(null);
  const [loadingPr, setLoadingPr] = useState<"idle" | "diff" | "review">("idle");
  const [history, setHistory] = useState<HistoryRecord[]>(starterHistory);
  const [historySort, setHistorySort] = useState<"date" | "score" | "severity" | "language">("date");
  const [settings, setSettings] = useState<AppSettings>({
    model: "Claude Sonnet 4",
    reviewTypes: {
      bugs: true,
      security: true,
      performance: true,
      style: true
    },
    threshold: "low"
  });
  const [apiOnline, setApiOnline] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];

  const reviewStaleReason = useMemo(() => {
    if (!reviewAnchor) return null;
    if (reviewAnchor.fileId !== activeFileId) return "file" as const;
    if (reviewAnchor.content !== activeFile.content) return "content" as const;
    if (reviewAnchor.language !== activeFile.language) return "language" as const;
    return null;
  }, [reviewAnchor, activeFileId, activeFile.content, activeFile.language]);

  const displayedCodeReview = useMemo(() => {
    if (!codeReview || reviewStaleReason) return null;
    return applyReviewFilters(codeReview, settings);
  }, [codeReview, reviewStaleReason, settings]);

  const displayedPrResult = useMemo(() => {
    if (!prResult) return null;
    return applyPrReviewFilters(prResult, settings);
  }, [prResult, settings]);
  const activeOpenFiles = openTabs
    .map((id) => files.find((file) => file.id === id))
    .filter((file): file is CodeFile => Boolean(file));

  const lineNumbers = useMemo(() => activeFile.content.split("\n").map((_, index) => index + 1), [activeFile.content]);

  const stats = useMemo(() => {
    const average = history.length
      ? Math.round(history.reduce((total, item) => total + item.score, 0) / history.length)
      : 0;
    const critical = history.reduce((total, item) => total + item.issues.critical, 0);
    const prItems = history.filter((item) => item.kind === "PR");
    const approvals = prItems.filter((item) => item.verdict === "Approve").length;
    return {
      reviews: history.length,
      average,
      critical,
      approvalRate: prItems.length ? Math.round((approvals / prItems.length) * 100) : 0
    };
  }, [history]);

  const sortedHistory = useMemo(() => {
    const clone = [...history];
    clone.sort((a, b) => {
      if (historySort === "score") return b.score - a.score;
      if (historySort === "severity") {
        return severityRank(b.issues) - severityRank(a.issues);
      }
      if (historySort === "language") return a.language.localeCompare(b.language);
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return clone;
  }, [history, historySort]);

  useEffect(() => {
    setActiveLine(1);
    window.setTimeout(() => editorRef.current?.focus(), 50);
  }, [activeFileId]);

  const refreshApiStatus = async () => {
    const online = await apiAvailable();
    setApiOnline(online);
    return online;
  };

  useEffect(() => {
    refreshApiStatus();
  }, []);

  const updateFileContent = (content: string) => {
    setFiles((current) =>
      current.map((file) => (file.id === activeFileId ? { ...file, content } : file))
    );
  };

  const updateFileLanguage = (language: string) => {
    setFiles((current) =>
      current.map((file) => (file.id === activeFileId ? { ...file, language } : file))
    );
    if (reviewAnchor?.fileId === activeFileId && reviewAnchor.language !== language) {
      setCodeReview(null);
      setReviewAnchor(null);
    }
  };

  const updateActiveLine = () => {
    const textarea = editorRef.current;
    if (!textarea) return;
    setActiveLine(textarea.value.slice(0, textarea.selectionStart).split("\n").length);
  };

  const syncScroll = () => {
    if (!editorRef.current || !gutterRef.current) return;
    gutterRef.current.scrollTop = editorRef.current.scrollTop;
  };

  const jumpToLine = (line: number) => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const lines = activeFile.content.split("\n");
    const target = Math.min(Math.max(line, 1), lines.length);
    let position = 0;
    for (let index = 0; index < target - 1; index += 1) {
      position += lines[index].length + 1;
    }

    const lineText = lines[target - 1] ?? "";
    textarea.focus();
    textarea.setSelectionRange(position, position + lineText.length);
    setActiveLine(target);

    const lineHeight = 22;
    textarea.scrollTop = Math.max(0, (target - 3) * lineHeight);
    syncScroll();
  };

  const closeTab = (id: string) => {
    if (openTabs.length === 1) return;
    const nextTabs = openTabs.filter((tab) => tab !== id);
    setOpenTabs(nextTabs);
    if (activeFileId === id) {
      const nextValid = nextTabs.find((tabId) => files.some((f) => f.id === tabId));
      if (nextValid) setActiveFileId(nextValid);
    }
  };

  const addScratchFile = () => {
    const id = `scratch-${files.length + 1}.ts`;
    const scratch: CodeFile = {
      id,
      name: id,
      language: "TypeScript",
      content: `export function reviewTarget(input: unknown) {
  return {
    accepted: Boolean(input),
    reviewedAt: new Date().toISOString()
  };
}`
    };
    setFiles((current) => [...current, scratch]);
    setOpenTabs((current) => [...current, id]);
    setActiveFileId(id);
    setCodeReview(null);
    setReviewAnchor(null);
  };

  const runCodeReview = async () => {
    if (!activeFile.content.trim()) {
      setStatusNotice("Add code to the editor before running a review.");
      return;
    }

    if (!languageMatchesSelection(activeFile)) {
      setStatusNotice(`Language mismatch — select "${inferLanguageFromFile(activeFile)}" before reviewing.`);
      return;
    }

    setLoadingReview(true);
    setExpandedIssues({});
    setStatusNotice(null);

    let review: ReviewResult;
    try {
      if (!(await apiAvailable())) {
        throw new TypeError("offline");
      }
      review = await reviewCodeFile(
        activeFile.content,
        activeFile.language,
        activeFile.name,
        settings
      );
    } catch (error) {
      if (isOfflineError(error)) {
        review = buildRawReview(activeFile, settings);
        setStatusNotice("Using local analysis — start the Revvy API for Gemini-powered reviews.");
      } else {
        setStatusNotice(error instanceof Error ? error.message : "Review failed");
        setLoadingReview(false);
        return;
      }
    }

    const filtered = applyReviewFilters(review, settings);
    setCodeReview(review);
    setReviewAnchor({ fileId: activeFileId, content: activeFile.content, language: activeFile.language });
    setHistory((current) => [
      {
        id: `hist-${Date.now()}`,
        kind: "Code",
        fileName: activeFile.name,
        language: activeFile.language,
        score: filtered.score,
        date: new Date().toISOString(),
        issues: countIssues(filtered.issues),
        codeSnapshot: review
      },
      ...current
    ]);
    setLoadingReview(false);
  };

  const fetchPrDiff = async () => {
    if (!isValidPrUrl(prUrl)) {
      setStatusNotice("Enter a valid GitHub PR URL (github.com/owner/repo/pull/123).");
      return;
    }

    setLoadingPr("diff");
    setPrResult(null);
    setStatusNotice(null);

    try {
      if (!(await apiAvailable())) {
        throw new TypeError("offline");
      }
      setPrFiles(await fetchPrFiles(prUrl));
    } catch (error) {
      if (isOfflineError(error)) {
        setPrFiles(demoPrFiles);
        setStatusNotice("Loaded demo PR files — connect the API or add GITHUB_TOKEN for live diffs.");
      } else {
        setStatusNotice(error instanceof Error ? error.message : "Failed to fetch PR diff");
      }
    } finally {
      setLoadingPr("idle");
    }
  };

  const reviewPr = async () => {
    if (!isValidPrUrl(prUrl)) {
      setStatusNotice("Enter a valid GitHub PR URL (github.com/owner/repo/pull/123).");
      return;
    }

    let filesToReview = prFiles;
    if (!filesToReview.length) {
      try {
        if (!(await apiAvailable())) {
          throw new TypeError("offline");
        }
        filesToReview = await fetchPrFiles(prUrl);
        setPrFiles(filesToReview);
      } catch (error) {
        if (isOfflineError(error)) {
          filesToReview = demoPrFiles;
          setPrFiles(filesToReview);
        } else {
          setStatusNotice(error instanceof Error ? error.message : "Failed to load PR files");
          return;
        }
      }
    }

    setLoadingPr("review");
    setStatusNotice(null);

    let result: PrResult;
    try {
      if (!(await apiAvailable())) {
        throw new TypeError("offline");
      }
      result = await reviewPullRequest(prUrl, settings, filesToReview);
    } catch (error) {
      if (isOfflineError(error)) {
        result = buildRawPrResult(prUrl, filesToReview, settings);
        setStatusNotice("Using local PR analysis — connect the Revvy API for full reviews.");
      } else {
        setStatusNotice(error instanceof Error ? error.message : "PR review failed");
        setLoadingPr("idle");
        return;
      }
    }

    const filteredPr = applyPrReviewFilters(result, settings);
    setPrResult(result);
    setHistory((current) => [
      {
        id: `hist-${Date.now()}`,
        kind: "PR",
        fileName: prUrl.replace(/^https?:\/\//, "") || "pull-request.diff",
        language: "Diff",
        score: filteredPr.score,
        date: new Date().toISOString(),
        issues: countIssues(filteredPr.issues),
        verdict: filteredPr.verdict,
        prSnapshot: result
      },
      ...current
    ]);
    setLoadingPr("idle");
  };

  const toggleIssue = (id: string) => {
    setExpandedIssues((current) => ({ ...current, [id]: !current[id] }));
  };

  const toggleReviewType = (type: ReviewType) => {
    setSettings((current) => {
      const enabledCount = Object.values(current.reviewTypes).filter(Boolean).length;
      if (current.reviewTypes[type] && enabledCount <= 1) {
        return current;
      }
      return {
        ...current,
        reviewTypes: {
          ...current.reviewTypes,
          [type]: !current.reviewTypes[type]
        }
      };
    });
  };

  const jumpToHistoryItem = (record: HistoryRecord) => {
    setStatusNotice(null);
    setExpandedIssues({});

    if (record.kind === "Code") {
      const match = files.find((file) => file.name === record.fileName);
      if (!match) {
        setPage("code");
        setCodeReview(null);
        setReviewAnchor(null);
        setStatusNotice(`"${record.fileName}" is not in the workspace.`);
        return;
      }

      if (!openTabs.includes(match.id)) {
        setOpenTabs((current) => [...current, match.id]);
      }
      setActiveFileId(match.id);

      setCodeReview({ ...buildRawReview(match, settings), score: record.score });
      setReviewAnchor({ fileId: match.id, content: match.content, language: match.language });
      setPage("code");
      return;
    }

    const url = record.fileName.startsWith("github.com") ? `https://${record.fileName}` : record.fileName;
    setPrUrl(url);
    setPrFiles(demoPrFiles);
    setPrResult(
      buildRawPrResult(url, demoPrFiles, settings, {
        score: record.score,
        verdict: record.verdict
      })
    );
    setPage("pr");
  };

  return (
    <div className="ide-shell">
      <aside className="activity-bar" aria-label="Primary">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                className={cx("activity-button", page === item.page && "active")}
                onClick={() => setPage(item.page)}
                title={item.label}
                aria-label={item.label}
              >
                <Icon size={21} strokeWidth={1.8} />
              </button>
            );
          })}
        </nav>
        <div className="activity-bottom">
          <button className="activity-button" title="System online" aria-label="System online">
            <CircleDot size={20} />
          </button>
        </div>
      </aside>

      <aside className="side-rail">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Terminal size={18} />
          </div>
          <div>
            <strong>Revvy</strong>
            <span>{settings.model}</span>
          </div>
        </div>

        <div className="rail-search">
          <Search size={15} />
          <span>review / file / pull</span>
        </div>

        <div className="rail-section">
          <div className="rail-title">
            <FolderGit2 size={15} />
            Workspace
          </div>
          {files.slice(0, 5).map((file) => (
            <button
              key={file.id}
              className={cx("file-row", activeFileId === file.id && "active")}
              onClick={() => {
                if (!openTabs.includes(file.id)) setOpenTabs((current) => [...current, file.id]);
                setActiveFileId(file.id);
                setPage("code");
              }}
            >
              <FileCode2 size={15} />
              <span>{file.name}</span>
            </button>
          ))}
        </div>

        <div className="rail-section">
          <div className="rail-title">
            <Activity size={15} />
            Review Types
          </div>
          {(Object.keys(settings.reviewTypes) as ReviewType[]).map((type) => (
            <button
              key={type}
              className={cx("check-row", settings.reviewTypes[type] && "enabled")}
              onClick={() => toggleReviewType(type)}
            >
              <span>{reviewTypeLabels[type]}</span>
              <span className="check-dot" />
            </button>
          ))}
        </div>

        <div className="rail-meter">
          <span>Signal</span>
          <strong>{stats.average}</strong>
          <div className="meter-track">
            <span style={{ width: `${stats.average}%` }} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="top-bar">
          <div className="crumbs">
            <span>revvy</span>
            <ChevronDown size={14} />
            <strong>{navItems.find((item) => item.page === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className={cx("status-pill", !apiOnline && "offline")}>
              <CircleDot size={13} />
              {apiOnline ? "Revvy API connected" : "Revvy API offline"}
            </span>
            <button
              className="icon-button"
              title="Refresh status"
              aria-label="Refresh status"
              onClick={() => refreshApiStatus()}
            >
              <RefreshCcw size={17} />
            </button>
          </div>
        </header>

        {statusNotice && (
          <div className="status-notice" role="status">
            <AlertCircle size={16} />
            <span>{statusNotice}</span>
            <button type="button" className="notice-dismiss" onClick={() => setStatusNotice(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <section className="content-stage">
          {page === "home" && (
            <HomeView
              stats={stats}
              history={history}
              onNavigate={setPage}
              onOpenHistory={jumpToHistoryItem}
            />
          )}

          {page === "code" && (
            <CodeReviewView
              activeFile={activeFile}
              openFiles={activeOpenFiles}
              lineNumbers={lineNumbers}
              activeLine={activeLine}
              editorRef={editorRef}
              gutterRef={gutterRef}
              codeReview={displayedCodeReview}
              reviewStaleReason={reviewStaleReason}
              reviewTypes={settings.reviewTypes}
              languageMismatch={!languageMatchesSelection(activeFile)}
              inferredLanguage={inferLanguageFromFile(activeFile)}
              loadingReview={loadingReview}
              expandedIssues={expandedIssues}
              onSetActiveFile={(id) => {
                setActiveFileId(id);
              }}
              onCloseTab={closeTab}
              onAddScratchFile={addScratchFile}
              onContentChange={updateFileContent}
              onLanguageChange={updateFileLanguage}
              onRunReview={runCodeReview}
              onToggleIssue={toggleIssue}
              onJumpToLine={jumpToLine}
              onSelectionChange={updateActiveLine}
              onEditorScroll={syncScroll}
            />
          )}

          {page === "pr" && (
            <PrReviewView
              prUrl={prUrl}
              prFiles={prFiles}
              prResult={displayedPrResult}
              loadingPr={loadingPr}
              onPrUrlChange={setPrUrl}
              onFetchDiff={fetchPrDiff}
              onReviewPr={reviewPr}
            />
          )}

          {page === "history" && (
            <HistoryView
              history={sortedHistory}
              sort={historySort}
              onSort={setHistorySort}
              onOpen={jumpToHistoryItem}
            />
          )}

          {page === "settings" && (
            <SettingsView
              settings={settings}
              stats={stats}
              apiOnline={apiOnline}
              onSettingsChange={setSettings}
              onToggleReviewType={toggleReviewType}
            />
          )}
        </section>

        <footer className="status-bar">
          <span>
            <GitBranch size={14} />
            main
          </span>
          <span>
            <ShieldCheck size={14} />
            threshold: {settings.threshold}
          </span>
          <span>
            <Zap size={14} />
            {activeFile.language}
          </span>
          <span className="push-right">Ln {activeLine}, Col 1</span>
        </footer>
      </main>
    </div>
  );
}

function HomeView({
  stats,
  history,
  onNavigate,
  onOpenHistory
}: {
  stats: { reviews: number; average: number; critical: number; approvalRate: number };
  history: HistoryRecord[];
  onNavigate: (page: Page) => void;
  onOpenHistory: (record: HistoryRecord) => void;
}) {
  const statItems = [
    { label: "Reviews", value: stats.reviews, icon: Gauge, tone: "good" },
    { label: "Avg score", value: stats.average, icon: Activity, tone: scoreTone(stats.average) },
    { label: "Critical", value: stats.critical, icon: AlertTriangle, tone: stats.critical ? "bad" : "good" },
    { label: "PR approval", value: `${stats.approvalRate}%`, icon: BadgeCheck, tone: "good" }
  ];

  return (
    <div className="view-grid home-grid">
      <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Revvy</span>
          <h1>Review cockpit</h1>
          <p>Live review state, pull request verdicts, issue triage, and archive recall in one IDE surface.</p>
        </div>
        <div className="hero-telemetry" aria-label="Live review chart">
          {Array.from({ length: 34 }).map((_, index) => (
            <span
              key={index}
              style={{ height: `${24 + ((index * 17) % 62)}%` }}
              className={index % 7 === 0 ? "hot" : ""}
            />
          ))}
        </div>
      </section>

      <section className="stats-strip">
        {statItems.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={cx("stat-tile", item.tone)}>
              <Icon size={20} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="quick-grid">
        <button className="quick-action" onClick={() => onNavigate("code")}>
          <Code2 size={21} />
          <span>Code Review</span>
          <strong>Analyze active file</strong>
        </button>
        <button className="quick-action" onClick={() => onNavigate("pr")}>
          <GitPullRequest size={21} />
          <span>PR Review</span>
          <strong>Generate verdict</strong>
        </button>
        <button className="quick-action" onClick={() => onNavigate("history")}>
          <Clock3 size={21} />
          <span>History</span>
          <strong>Open archive</strong>
        </button>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Recent</span>
            <h2>Review feed</h2>
          </div>
          <Activity size={18} />
        </div>
        <div className="feed-list">
          {history.slice(0, 5).map((record) => {
            const severity = mostSevere(record.issues);
            return (
              <button key={record.id} className="feed-item" onClick={() => onOpenHistory(record)}>
                <span className={cx("severity-badge", severity ?? "low")}>
                  {severity ? severityLabels[severity] : "Clean"}
                </span>
                <span className="feed-main">
                  <strong>{record.fileName}</strong>
                  <small>{record.kind} / {record.language} / {formatRelativeTime(record.date)}</small>
                </span>
                <span className={cx("score-chip", scoreTone(record.score))}>{record.score}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CodeReviewView({
  activeFile,
  openFiles,
  lineNumbers,
  activeLine,
  editorRef,
  gutterRef,
  codeReview,
  reviewStaleReason,
  reviewTypes,
  languageMismatch,
  inferredLanguage,
  loadingReview,
  expandedIssues,
  onSetActiveFile,
  onCloseTab,
  onAddScratchFile,
  onContentChange,
  onLanguageChange,
  onRunReview,
  onToggleIssue,
  onJumpToLine,
  onSelectionChange,
  onEditorScroll
}: {
  activeFile: CodeFile;
  openFiles: CodeFile[];
  lineNumbers: number[];
  activeLine: number;
  editorRef: React.RefObject<HTMLTextAreaElement>;
  gutterRef: React.RefObject<HTMLDivElement>;
  codeReview: ReviewResult | null;
  reviewStaleReason: "file" | "content" | "language" | null;
  reviewTypes: Record<ReviewType, boolean>;
  languageMismatch: boolean;
  inferredLanguage: string | null;
  loadingReview: boolean;
  expandedIssues: Record<string, boolean>;
  onSetActiveFile: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddScratchFile: () => void;
  onContentChange: (content: string) => void;
  onLanguageChange: (language: string) => void;
  onRunReview: () => void;
  onToggleIssue: (id: string) => void;
  onJumpToLine: (line: number) => void;
  onSelectionChange: () => void;
  onEditorScroll: () => void;
}) {
  const staleMessage =
    reviewStaleReason === "language"
      ? "Language changed — run Review again so analysis matches the selected language."
      : reviewStaleReason === "content"
        ? "Code changed — run Review again to refresh results."
        : reviewStaleReason === "file"
          ? "You switched files — run Review on this file."
          : null;

  const enabledMetrics = [
    reviewTypes.security && { label: "Security", value: codeReview?.security ?? 0, icon: Lock },
    reviewTypes.bugs && { label: "Reliability", value: codeReview?.reliability ?? 0, icon: Bug },
    reviewTypes.performance && { label: "Performance", value: codeReview?.performance ?? 0, icon: Zap },
    reviewTypes.style && { label: "Maintainability", value: codeReview?.maintainability ?? 0, icon: SlidersHorizontal }
  ].filter((metric): metric is { label: string; value: number; icon: typeof Lock } => Boolean(metric));
  return (
    <div className="code-workbench">
      <section className="editor-pane panel">
        <div className="tab-bar">
          {openFiles.map((file) => (
            <button
              key={file.id}
              className={cx("editor-tab", file.id === activeFile.id && "active")}
              onClick={() => onSetActiveFile(file.id)}
            >
              <FileCode2 size={15} />
              <span>{file.name}</span>
              <span
                role="button"
                tabIndex={0}
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(file.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    onCloseTab(file.id);
                  }
                }}
                aria-label={`Close ${file.name}`}
              >
                <X size={13} />
              </span>
            </button>
          ))}
          <button className="new-tab" onClick={onAddScratchFile} aria-label="New file" title="New file">
            <Plus size={16} />
          </button>
        </div>

        <div className="editor-toolbar">
          <div>
            <strong>{activeFile.name}</strong>
            <span>{activeFile.content.length.toLocaleString()} chars</span>
          </div>
          <label className="select-wrap">
            <span>Language</span>
            <select value={activeFile.language} onChange={(event) => onLanguageChange(event.target.value)}>
              <option>TypeScript</option>
              <option>JavaScript</option>
              <option>React</option>
              <option>Python</option>
              <option>Go</option>
              <option>Java</option>
            </select>
          </label>
        </div>

        {languageMismatch && inferredLanguage && (
          <div className="inline-note language-warning">
            File looks like <strong>{inferredLanguage}</strong> but <strong>{activeFile.language}</strong> is selected.
            Pick the matching language, then run Review.
          </div>
        )}

        <div className="editor-frame">
          <div className="line-gutter" ref={gutterRef} aria-hidden="true">
            {lineNumbers.map((line) => (
              <span key={line} className={line === activeLine ? "active" : ""}>
                {line}
              </span>
            ))}
          </div>
          <textarea
            ref={editorRef}
            value={activeFile.content}
            spellCheck={false}
            onChange={(event) => onContentChange(event.target.value)}
            onClick={onSelectionChange}
            onKeyUp={onSelectionChange}
            onSelect={onSelectionChange}
            onScroll={onEditorScroll}
            aria-label="Code editor"
          />
        </div>
      </section>

      <aside className="review-pane panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Structured JSON</span>
            <h2>Review panel</h2>
          </div>
          <button className="primary-button" onClick={onRunReview} disabled={loadingReview}>
            {loadingReview ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            Review
          </button>
        </div>

        <div className="review-pane-body">
          {staleMessage && !loadingReview && (
            <div className="inline-note stale-review-note">{staleMessage}</div>
          )}

          {!codeReview && !loadingReview && !reviewStaleReason && (
            <div className="empty-state">
              <Bot size={32} />
              <strong>Ready</strong>
              <span>Score, issues, strengths, and fix suggestions render here.</span>
            </div>
          )}

          {loadingReview && (
            <div className="review-loading">
              <Loader2 className="spin" size={26} />
              <span>Analyzing {activeFile.name}</span>
            </div>
          )}

          {codeReview && !loadingReview && (
          <div className="review-output">
            <div className="score-band">
              <div className={cx("score-orb", scoreTone(codeReview.score))}>{codeReview.score}</div>
              <div>
                <strong>{codeReview.summary}</strong>
                <span>{codeReview.model}</span>
              </div>
            </div>

            {enabledMetrics.length > 0 && (
              <div className="metric-grid">
                {enabledMetrics.map((metric) => (
                  <Metric key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} />
                ))}
              </div>
            )}

            <section className="issue-stack">
              <div className="mini-heading">
                <AlertCircle size={16} />
                Issues
                <span>{codeReview.issues.length}</span>
              </div>
              {codeReview.issues.length === 0 && (
                <div className="inline-note">No issues match the enabled review types and severity threshold.</div>
              )}
              {codeReview.issues.map((issue) => (
                <article key={issue.id} className="issue-card">
                  <div className="issue-summary">
                    <button type="button" className="issue-toggle" onClick={() => onToggleIssue(issue.id)}>
                      <span className={cx("severity-badge", issue.severity)}>{severityLabels[issue.severity]}</span>
                      <span>
                        <strong>{reviewTypeLabels[issue.type]}</strong>
                        <small>Line {issue.line}</small>
                      </span>
                      <ChevronDown className={expandedIssues[issue.id] ? "rotate" : ""} size={16} />
                    </button>
                    <button type="button" className="line-link" onClick={() => onJumpToLine(issue.line)}>
                      Go to line
                    </button>
                  </div>
                  {expandedIssues[issue.id] && (
                    <div className="issue-detail">
                      <p>{issue.description}</p>
                      <div>
                        <Sparkles size={15} />
                        <span>{issue.suggestion}</span>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>

            {codeReview.strengths.length > 0 && (
              <section className="strengths">
                <div className="mini-heading">
                  <CheckCircle2 size={16} />
                  Strengths
                </div>
                {codeReview.strengths.map((strength) => (
                  <div key={strength} className="strength-row">
                    <span />
                    {strength}
                  </div>
                ))}
              </section>
            )}
          </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PrReviewView({
  prUrl,
  prFiles,
  prResult,
  loadingPr,
  onPrUrlChange,
  onFetchDiff,
  onReviewPr
}: {
  prUrl: string;
  prFiles: PrFile[];
  prResult: PrResult | null;
  loadingPr: "idle" | "diff" | "review";
  onPrUrlChange: (url: string) => void;
  onFetchDiff: () => void;
  onReviewPr: () => void;
}) {
  const additions = prFiles.reduce((total, file) => total + file.additions, 0);
  const deletions = prFiles.reduce((total, file) => total + file.deletions, 0);

  return (
    <div className="pr-layout">
      <section className="panel pr-input-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Pull request</span>
            <h2>PR Review</h2>
          </div>
          <GitPullRequest size={20} />
        </div>

        <div className="url-row">
          <input value={prUrl} onChange={(event) => onPrUrlChange(event.target.value)} aria-label="GitHub PR URL" />
          <button className="secondary-button" onClick={onFetchDiff} disabled={loadingPr !== "idle"}>
            {loadingPr === "diff" ? <Loader2 className="spin" size={17} /> : <FileDiff size={17} />}
            Fetch diff
          </button>
          <button className="primary-button" onClick={onReviewPr} disabled={loadingPr !== "idle"}>
            {loadingPr === "review" ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            Review PR
          </button>
        </div>
      </section>

      <section className="diff-summary">
        <article className="diff-stat">
          <span>Files</span>
          <strong>{prFiles.length}</strong>
        </article>
        <article className="diff-stat good">
          <span>Additions</span>
          <strong>{prFiles.length ? `+${additions}` : "—"}</strong>
        </article>
        <article className="diff-stat bad">
          <span>Deletions</span>
          <strong>{prFiles.length ? `-${deletions}` : "—"}</strong>
        </article>
      </section>

      <section className="panel diff-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Changed files</span>
            <h2>Diff</h2>
          </div>
          <FileDiff size={18} />
        </div>
        <div className="diff-list">
          {!prFiles.length && (
            <div className="inline-note">Fetch a diff to see changed files, or run Review PR to load demo data.</div>
          )}
          {prFiles.map((file) => (
            <div key={file.path} className="diff-row">
              <span className="file-status">{file.status[0].toUpperCase()}</span>
              <strong>{file.path}</strong>
              <span className="diff-counts">
                <span>+{file.additions}</span>
                <span>-{file.deletions}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel verdict-panel">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Verdict</span>
            <h2>Claude review</h2>
          </div>
          <PanelRightOpen size={18} />
        </div>

        {!prResult && (
          <div className="empty-state">
            <GitPullRequest size={32} />
            <strong>Pending</strong>
            <span>Approval state and concerns appear after review.</span>
          </div>
        )}

        {prResult && (
          <div className="review-output">
            <div className={cx("verdict-banner", prResult.verdict === "Approve" ? "approve" : "changes")}>
              {prResult.verdict === "Approve" ? <BadgeCheck size={24} /> : <AlertTriangle size={24} />}
              <div>
                <strong>{prResult.verdict}</strong>
                <span>{prResult.confidence}% confidence / score {prResult.score}</span>
              </div>
            </div>
            <div className="concern-list">
              {prResult.concerns.map((concern) => (
                <div key={concern} className="concern-row">
                  <AlertCircle size={15} />
                  <span>{concern}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function HistoryView({
  history,
  sort,
  onSort,
  onOpen
}: {
  history: HistoryRecord[];
  sort: "date" | "score" | "severity" | "language";
  onSort: (sort: "date" | "score" | "severity" | "language") => void;
  onOpen: (record: HistoryRecord) => void;
}) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Archive</span>
          <h2>History</h2>
          <small>{history.length} review{history.length === 1 ? "" : "s"}</small>
        </div>
        <div className="sort-controls">
          {(["date", "score", "severity", "language"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cx("segmented-button", sort === item && "active")}
              onClick={() => onSort(item)}
            >
              <ArrowUpDown size={14} />
              {item}
            </button>
          ))}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty-state history-empty">
          <Archive size={32} />
          <strong>No reviews yet</strong>
          <span>Run a code or PR review and it will appear here.</span>
        </div>
      ) : (
        <div className="history-table">
          <div className="history-head">
            <span>Name</span>
            <span>Kind</span>
            <span>Score</span>
            <span>Issues</span>
            <span>Severity</span>
            <span>Verdict</span>
            <span>Language</span>
            <span>Updated</span>
          </div>
          {history.map((record) => {
            const severity = mostSevere(record.issues);
            const issueTotal = countTotalIssues(record.issues);
            return (
              <button key={record.id} type="button" className="history-row" onClick={() => onOpen(record)}>
                <span className="history-name" title={record.fileName}>
                  {record.kind === "PR" ? <GitPullRequest size={16} /> : <FileCode2 size={16} />}
                  <strong>{formatHistoryName(record.fileName)}</strong>
                </span>
                <span>{record.kind}</span>
                <span className={cx("score-chip", scoreTone(record.score))}>{record.score}</span>
                <span className="issue-count">{issueTotal}</span>
                <span className={cx("severity-badge", severity ?? "low")}>
                  {severity ? severityLabels[severity] : "Clean"}
                </span>
                <span className={cx("verdict-chip", record.verdict === "Approve" ? "approve" : "changes")}>
                  {record.kind === "PR" ? record.verdict ?? "—" : "—"}
                </span>
                <span className="language-tag">{record.language}</span>
                <span>{formatRelativeTime(record.date)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SettingsView({
  settings,
  stats,
  apiOnline,
  onSettingsChange,
  onToggleReviewType
}: {
  settings: AppSettings;
  stats: { reviews: number; average: number; critical: number; approvalRate: number };
  apiOnline: boolean;
  onSettingsChange: (settings: AppSettings) => void;
  onToggleReviewType: (type: ReviewType) => void;
}) {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Model</span>
            <h2>Claude engine</h2>
          </div>
          <Cpu size={20} />
        </div>
        <div className="model-list">
          {(["Claude Sonnet 4", "Claude Opus 4", "Claude Haiku 3.5"] as ModelChoice[]).map((model) => (
            <button
              key={model}
              className={cx("model-option", settings.model === model && "active")}
              onClick={() => onSettingsChange({ ...settings, model })}
            >
              <BrainIcon model={model} />
              <span>
                <strong>{model}</strong>
                <small>{model.includes("Sonnet") ? "balanced" : model.includes("Opus") ? "deep" : "fast"}</small>
              </span>
              {settings.model === model && <CheckCircle2 size={17} />}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Review</span>
            <h2>Checks</h2>
          </div>
          <SlidersHorizontal size={20} />
        </div>
        <div className="toggle-list">
          {(Object.keys(settings.reviewTypes) as ReviewType[]).map((type) => (
            <button
              key={type}
              className={cx("toggle-row", settings.reviewTypes[type] && "on")}
              onClick={() => onToggleReviewType(type)}
            >
              <span>{reviewTypeLabels[type]}</span>
              <span className="switch"><span /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Threshold</span>
            <h2>Severity</h2>
          </div>
          <AlertTriangle size={20} />
        </div>
        <div className="threshold-switcher">
          {(["low", "medium", "high"] as Threshold[]).map((threshold) => (
            <button
              key={threshold}
              className={cx("threshold-option", settings.threshold === threshold && "active")}
              onClick={() => onSettingsChange({ ...settings, threshold })}
            >
              {threshold}
            </button>
          ))}
        </div>
      </section>

      <section className="panel system-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">System</span>
            <h2>Status</h2>
          </div>
          <Server size={20} />
        </div>
        <div className="system-grid">
          <SystemStatus label="Review engine" value={apiOnline ? "Online" : "Offline"} icon={CircleDot} />
          <SystemStatus label="Revvy API" value={apiOnline ? "Connected" : "Disconnected"} icon={ShieldCheck} />
          <SystemStatus label="Archive" value={`${stats.reviews} items`} icon={Archive} />
          <SystemStatus label="Signal score" value={`${stats.average}`} icon={Gauge} />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="metric">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="metric-bar">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SystemStatus({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="system-status">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BrainIcon({ model }: { model: ModelChoice }) {
  if (model.includes("Opus")) return <Sparkles size={18} />;
  if (model.includes("Haiku")) return <Zap size={18} />;
  return <Bot size={18} />;
}
