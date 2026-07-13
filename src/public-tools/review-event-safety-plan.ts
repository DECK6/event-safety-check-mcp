import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { reviewMiceSafetyPlanTool } from "../tools/review-mice-safety-plan.js";
import { adaptEventInput, publicEventInputSchema } from "../adapters/event-input-adapter.js";
import { MAX_PLAN_MARKDOWN_CHARS } from "../config/limits.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { presentReview, type PublicReviewFinding, type ReviewStatus } from "../presenters/review-markdown.js";
import { sanitizeReviewTerms } from "../presenters/terms.js";

type InternalFinding = {
  requirementId?: string;
  severity?: "error" | "warning" | "info";
  category?: string;
  message?: string;
  recommendation?: string;
  evidence?: { line: number; excerpt: string };
};

export const reviewEventSafetyPlanInputSchema = publicEventInputSchema.extend({
  planMarkdown: z.string().min(1).max(MAX_PLAN_MARKDOWN_CHARS).describe("검수할 행사 안전관리계획 Markdown(최대 50,000자)"),
});

function statusFor(finding: InternalFinding): ReviewStatus {
  if (finding.severity === "error") return "보완 필요";
  if (finding.severity === "warning") return finding.category === "over_application" ? "관할기관 확인 필요" : "보완 필요";
  return "확인됨";
}

function mapFinding(finding: InternalFinding): PublicReviewFinding {
  return {
    requirementId: String(finding.requirementId ?? "review_item"),
    status: statusFor(finding),
    category: sanitizeReviewTerms(String(finding.category ?? "general")),
    message: sanitizeReviewTerms(String(finding.message ?? "확인 항목")),
    recommendation: sanitizeReviewTerms(String(finding.recommendation ?? "담당자에게 확인하세요.")),
    evidence: finding.evidence,
  };
}

async function handler(rawInput: unknown) {
  const parsed = reviewEventSafetyPlanInputSchema.parse(rawInput ?? {});
  const adapted = adaptEventInput(parsed);
  const internal = await reviewMiceSafetyPlanTool.handler({ ...adapted.internalInput, planMarkdown: parsed.planMarkdown });
  const rawFindings = Array.isArray(internal.structuredContent?.findings)
    ? internal.structuredContent.findings as InternalFinding[]
    : [];
  const findings = rawFindings.map(mapFinding);
  const coverage = Array.isArray(internal.structuredContent?.documentCoverageMatrix)
    ? internal.structuredContent.documentCoverageMatrix as Array<Record<string, unknown>>
    : [];
  const confirmed = coverage.filter((row) => row.status === "present").map((row): PublicReviewFinding => ({
    requirementId: String(row.documentId ?? "coverage"),
    status: "확인됨",
    category: "문서 구성",
    message: `${String(row.title ?? "항목")}이 계획에서 확인되었습니다.`,
    recommendation: "현재 내용을 유지하고 담당자와 증빙을 연결하세요.",
  }));
  const allFindings = [...confirmed, ...findings];
  const verdictSummary = {
    확인됨: allFindings.filter((finding) => finding.status === "확인됨").length,
    보완필요: allFindings.filter((finding) => finding.status === "보완 필요").length,
    관할확인: allFindings.filter((finding) => finding.status === "관할기관 확인 필요").length,
  };
  const missingItems = findings.filter((finding) => finding.category !== "over_application" && finding.status !== "확인됨");
  const overApplied = findings.filter((finding) => finding.category === "over_application");
  const markdown = presentReview({ verdictSummary, findings: allFindings, missingItems, overApplied });
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: { verdictSummary, findings: allFindings, missingItems, overApplied, meta: PUBLIC_RESPONSE_META },
  };
}

export const reviewEventSafetyPlanTool: ToolDefinition = {
  name: "review_event_safety_plan",
  title: "행사 안전관리계획 검수",
  description: `Reviews missing, excessive, and condition-dependent items in an event safety plan using ${SERVICE_NAME}.`,
  inputSchema: reviewEventSafetyPlanInputSchema,
  handler,
};
