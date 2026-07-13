import { DATA_AS_OF } from "../config/constants.js";
import { sanitizeReviewTerms } from "./terms.js";

export type ReviewStatus = "확인됨" | "보완 필요" | "관할기관 확인 필요";

export interface PublicReviewFinding {
  requirementId: string;
  status: ReviewStatus;
  category: string;
  message: string;
  recommendation: string;
  evidence?: { line: number; excerpt: string };
}

export function presentReview(options: {
  verdictSummary: { 확인됨: number; 보완필요: number; 관할확인: number };
  findings: PublicReviewFinding[];
  missingItems: PublicReviewFinding[];
  overApplied: PublicReviewFinding[];
}): string {
  const { verdictSummary, findings, missingItems, overApplied } = options;
  const markdown = [
    "# 행사 안전관리계획 검수 결과",
    "",
    "## 판정 요약",
    `- 확인됨: ${verdictSummary.확인됨}건`,
    `- 보완 필요: ${verdictSummary.보완필요}건`,
    `- 관할기관 확인 필요: ${verdictSummary.관할확인}건`,
    "",
    "## 검수 항목",
    ...(findings.length > 0 ? findings.map((finding) => [
      `### [${finding.status}] ${finding.message}`,
      `- 분류: ${finding.category}`,
      `- 조치: ${finding.recommendation}`,
      finding.evidence ? `- 확인 위치: ${finding.evidence.line > 0 ? `${finding.evidence.line}행` : finding.evidence.excerpt}` : "",
    ].filter(Boolean).join("\n")) : ["- 주요 보완 항목이 발견되지 않았습니다."]),
    "",
    "## 빠진 항목",
    ...(missingItems.length > 0 ? missingItems.map((item) => `- [${item.status}] ${item.message} → ${item.recommendation}`) : ["- 별도로 분류된 누락 항목이 없습니다."]),
    "",
    "## 과도하게 적용했을 수 있는 항목",
    ...(overApplied.length > 0 ? overApplied.map((item) => `- [${item.status}] ${item.message} → ${item.recommendation}`) : ["- 과도한 적용 후보가 발견되지 않았습니다."]),
    "",
    "## 주의사항",
    `- 데이터 기준일: ${DATA_AS_OF}`,
    "- 이 검수는 입력 조건 대비 문서 커버리지 점검이며, 법률 자문이나 허가 판단을 대신하지 않습니다.",
  ].join("\n");
  return sanitizeReviewTerms(markdown);
}
