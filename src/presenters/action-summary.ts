import { DATA_AS_OF } from "../config/constants.js";
import type { EventSafetyResult } from "../adapters/event-result-adapter.js";
import { sanitizePublicTerms } from "./terms.js";

function valueText(value: unknown): string {
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function presentActionSummary(result: EventSafetyResult): string {
  const explicit = result.eventProfile.conditions.filter((condition) => !condition.inferred);
  const inferred = result.eventProfile.conditions.filter((condition) => condition.inferred);
  const sourceNumbers = new Map(result.sources.map((source, index) => [source.id, index + 1]));
  const citations = (sourceRefs: string[]): string => {
    const labels = Array.from(new Set(sourceRefs))
      .map((sourceRef) => sourceNumbers.get(sourceRef))
      .filter((number): number is number => number !== undefined)
      .map((number) => `[S${number}]`);
    return labels.length > 0 ? ` ${labels.join(" ")}` : "";
  };
  const markdown = [
    "# 행사 안전 준비 진단",
    "",
    "## 1. 행사 조건 요약",
    ...explicit.map((condition) => `- 입력 · ${condition.label}: ${valueText(condition.value)}`),
    ...(explicit.length === 0 ? ["- 입력된 행사 조건이 아직 없습니다."] : []),
    ...inferred.map((condition) => `- 추론 · ${condition.label}: ${valueText(condition.value)}`),
    `- 추가 검토 수준: ${result.attentionLevel}`,
    ...result.missingInputs.map((question) => `- 추가 질문: ${question}`),
    "",
    "## 2. 이것부터 하세요",
    ...(result.topActions.length > 0
      ? result.topActions.map((item, index) => [
        `### ${index + 1}. ${item.action}${citations(item.sourceRefs)}`,
        `- 이유: ${item.reason}`,
        `- 시점: ${item.deadline}`,
        `- 근거 유형: ${item.basisType}`,
        `- 확인 기관: ${item.agency}`,
      ].join("\n"))
      : ["- 현재 조건에서 우선 표시할 조건부 실행 항목은 없습니다. 행사장 비상구와 기본 연락망은 확인하세요."]),
    "",
    "## 3. 필요한 문서",
    ...(result.requiredDocuments.length > 0
      ? result.requiredDocuments.map((document) => `- [${document.category}] ${document.name} — ${document.basis}${citations(document.sourceRefs)}`)
      : ["- 현재 입력에서 추가로 선별된 문서는 없습니다."]),
    "",
    "## 4. 주요 위험요인",
    ...(result.riskControls.length > 0
      ? result.riskControls.map((item) => [
        `### ${item.risk}${citations(item.sourceRefs)}`,
        `- 위험 이유: ${item.why}`,
        ...item.controls.map((control) => `- 통제: ${control}`),
      ].join("\n"))
      : ["- 입력 조건에서 별도 위험요인이 선별되지 않았습니다. 일반 소방·피난·응급 연락 체계는 현장에서 확인하세요."]),
    "",
    "## 5. 적용하지 않은 항목",
    ...result.notApplicable.map((item) => `- ${item.title}: ${item.reason}`),
    "",
    "## 6. 주의사항",
    `- 데이터 기준일: ${DATA_AS_OF}`,
    "- 법령·조례·행사장 규정은 바뀔 수 있으므로 제출·시행 전에 최신 원문과 담당기관 답변을 확인하세요.",
    "- 이 결과는 법률 자문이나 허가 판단을 대신하지 않습니다.",
    `- 안내: ${result.meta.disclaimer}`,
    "",
    "## 근거 자료",
    ...(result.sources.length > 0
      ? result.sources.map((source, index) => `- [S${index + 1}] ${source.title} — ${source.url} (${source.dataDate}, ${source.verificationStatus})`)
      : ["- 연결된 근거 자료가 없습니다."]),
  ].join("\n");

  return sanitizePublicTerms(markdown);
}
