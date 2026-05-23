type ReviewType = "bugs" | "security" | "performance" | "style";
type ModelChoice = "Claude Sonnet 4" | "Claude Opus 4" | "Claude Haiku 3.5";
type Severity = "critical" | "high" | "medium" | "low";

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

type AppSettings = {
  model: ModelChoice;
  reviewTypes: Record<ReviewType, boolean>;
  threshold: "low" | "medium" | "high";
};

type FocusArea = "bugs" | "security" | "performance" | "style";
type Threshold = "low" | "medium" | "high";

const severityOrder: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

export type { ReviewResult, PrResult, PrFile };

export const demoPrFiles: PrFile[] = [
  { path: "src/services/reviewProxy.ts", additions: 82, deletions: 18, status: "modified" },
  { path: "src/components/IssuePanel.tsx", additions: 56, deletions: 12, status: "modified" },
  { path: "src/lib/auth/session.ts", additions: 34, deletions: 21, status: "renamed" },
  { path: "tests/reviewProxy.test.ts", additions: 48, deletions: 0, status: "added" }
];

type BackendIssue = {
  id: string;
  type: "bug" | "security" | "performance" | "smell" | "style";
  severity: "critical" | "high" | "medium" | "low" | "info";
  line_start: number | null;
  line_end: number | null;
  title: string;
  description: string;
  suggestion: string;
  confidence: number;
};

type BackendReviewResult = {
  review_id: string;
  filename: string | null;
  language: string;
  issues: BackendIssue[];
  summary: string;
  score: number;
  verdict: "excellent" | "good" | "needs_work" | "critical";
  review_time_ms?: number | null;
};

function focusAreasFromSettings(settings: AppSettings): FocusArea[] | null {
  const areas = (Object.keys(settings.reviewTypes) as ReviewType[]).filter((type) => settings.reviewTypes[type]);
  return areas.length ? areas : null;
}

function filterByThreshold(issues: ReviewIssue[], threshold: Threshold) {
  return issues.filter((issue) => severityOrder[issue.severity] >= severityOrder[threshold]);
}

function filterByReviewTypes(issues: ReviewIssue[], reviewTypes: AppSettings["reviewTypes"]) {
  return issues.filter((issue) => reviewTypes[issue.type]);
}

export function applyReviewFilters(review: ReviewResult, settings: AppSettings): ReviewResult {
  let issues = filterByReviewTypes(review.issues, settings.reviewTypes);
  issues = filterByThreshold(issues, settings.threshold);
  const score = issues.length ? recalculateScore(issues) : Math.max(38, review.score);
  const metrics = deriveMetrics(score, issues);

  const enabledTypes = (Object.keys(settings.reviewTypes) as ReviewType[]).filter((type) => settings.reviewTypes[type]);

  return {
    ...review,
    score,
    ...metrics,
    issues,
    summary:
      issues.length === 0
        ? `No issues found for ${enabledTypes.join(", ") || "selected checks"} at the ${settings.threshold} threshold.`
        : review.summary,
    strengths: issues.length > 0 ? review.strengths : []
  };
}

export function applyPrReviewFilters(result: PrResult, settings: AppSettings): PrResult {
  const review = applyReviewFilters(result, settings);
  const verdict =
    review.score >= 82 && !review.issues.some((issue) => issue.severity === "critical" || issue.severity === "high")
      ? "Approve"
      : "Request Changes";

  return {
    ...review,
    verdict,
    confidence: verdict === "Approve" ? 91 : 88,
    concerns:
      review.issues.length > 0
        ? review.issues.slice(0, 3).map((issue) => issue.description)
        : ["No blocking concerns found for the enabled review checks."]
  };
}

export function recalculateScore(issues: ReviewIssue[]): number {
  const penalty = issues.reduce((total, issue) => {
    if (issue.severity === "critical") return total + 24;
    if (issue.severity === "high") return total + 15;
    if (issue.severity === "medium") return total + 8;
    return total + 4;
  }, 0);
  return Math.max(38, 96 - penalty);
}

export function isOfflineError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return /failed to fetch|networkerror|network request failed|load failed/i.test(error.message);
  }
  return false;
}

export function isValidPrUrl(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url.trim());
}

function prVerdictFromIssues(score: number, issues: ReviewIssue[]): PrResult["verdict"] {
  const blocking = issues.some((issue) => issue.severity === "critical" || issue.severity === "high");
  return score >= 82 && !blocking ? "Approve" : "Request Changes";
}

function languageForApi(language: string, filename: string) {
  const normalized = language.trim().toLowerCase();
  if (normalized && normalized !== "auto") {
    return normalized === "react" ? "typescript" : normalized;
  }
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java"
  };
  return ext ? map[ext] ?? "auto" : "auto";
}

function mapIssueType(type: BackendIssue["type"]): ReviewType {
  if (type === "bug" || type === "smell") return "bugs";
  if (type === "security" || type === "performance" || type === "style") return type;
  return "bugs";
}

function mapSeverity(severity: BackendIssue["severity"]) {
  if (severity === "info") return "low" as const;
  return severity;
}

function mapIssues(issues: BackendIssue[]): ReviewIssue[] {
  return issues.map((issue) => ({
    id: String(issue.id),
    type: mapIssueType(issue.type),
    severity: mapSeverity(issue.severity),
    line: issue.line_start ?? issue.line_end ?? 1,
    description: issue.title ? `${issue.title}: ${issue.description}` : issue.description,
    suggestion: issue.suggestion
  }));
}

function deriveMetrics(score: number, issues: ReviewIssue[]) {
  const hasSecurity = issues.some((issue) => issue.type === "security");
  const hasBug = issues.some((issue) => issue.type === "bugs");
  const hasPerformance = issues.some((issue) => issue.type === "performance");

  return {
    security: Math.max(35, score - (hasSecurity ? 12 : 0)),
    reliability: Math.max(40, score - (hasBug ? 10 : 0)),
    performance: Math.max(42, score - (hasPerformance ? 8 : 0)),
    maintainability: Math.min(98, score + (issues.length <= 2 ? 5 : 0))
  };
}

export function mapBackendReview(data: BackendReviewResult, model: ModelChoice): ReviewResult {
  const issues = mapIssues(data.issues);
  const score = data.score;
  const metrics = deriveMetrics(score, issues);

  return {
    score,
    ...metrics,
    issues,
    strengths: [
      "Review completed through the Revvy API.",
      data.summary || "Summary returned from the review engine."
    ].slice(0, score > 82 ? 2 : 1),
    summary: data.summary,
    model
  };
}

export function mapBackendPrReview(
  data: BackendReviewResult,
  model: ModelChoice,
  url: string,
  files: PrFile[]
): PrResult {
  const review = mapBackendReview(data, model);
  const churn = files.reduce((total, file) => total + file.additions + file.deletions, 0);
  const adjustedScore = Math.max(42, review.score - (churn > 220 ? 6 : 0));
  const verdict = prVerdictFromIssues(adjustedScore, review.issues);

  return {
    ...review,
    score: adjustedScore,
    verdict,
    confidence: verdict === "Approve" ? 91 : 88,
    concerns:
      review.issues.length > 0
        ? review.issues.slice(0, 3).map((issue) => issue.description)
        : ["No blocking concerns found in the reviewed diff."]
  };
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as {
      detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
    };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map((item) => item.msg ?? JSON.stringify(item))
        .join(", ");
    }
  } catch {
    // ignore parse errors
  }
  return `Request failed (${response.status})`;
}

export async function apiAvailable(): Promise<boolean> {
  try {
    return await checkApiHealth();
  } catch {
    return false;
  }
}

export async function reviewCodeFile(
  code: string,
  language: string,
  filename: string,
  settings: AppSettings
): Promise<ReviewResult> {
  const response = await fetch("/api/v1/review/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      language: languageForApi(language, filename),
      filename,
      focus_areas: focusAreasFromSettings(settings)
    })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as BackendReviewResult;
  return mapBackendReview(data, settings.model);
}

export async function fetchPrFiles(prUrl: string): Promise<PrFile[]> {
  const response = await fetch("/api/v1/review/pr/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pr_url: prUrl })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as {
    files: Array<{
      path: string;
      additions: number;
      deletions: number;
      status: string;
    }>;
  };

  return data.files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    status: (file.status === "added" || file.status === "renamed" ? file.status : "modified") as PrFile["status"]
  }));
}

export async function reviewPullRequest(
  prUrl: string,
  settings: AppSettings,
  files: PrFile[]
): Promise<PrResult> {
  const response = await fetch("/api/v1/review/pr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pr_url: prUrl,
      focus_areas: focusAreasFromSettings(settings)
    })
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as BackendReviewResult;
  return mapBackendPrReview(data, settings.model, prUrl, files);
}

export async function checkApiHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("/api/v1/health/ping", { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}
