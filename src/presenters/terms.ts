const TERM_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/마이스\s*\(MICE\)/gi, "행사"],
  [/MICE\s*행사/gi, "행사"],
  [/MICE/gi, "행사"],
  [/온톨로지/gi, "지식베이스"],
  [/적용성\s*엔진/gi, "적용 여부 판정"],
  [/적용성/gi, "적용 여부"],
  [/컴플라이언스\s*매트릭스/gi, "준비 항목 표"],
  [/컴플라이언스/gi, "준수"],
];

const REVIEW_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/법적으로\s*완전함/g, "추가 검토 항목 없음"],
  [/허가\s*가능/g, "허가 여부 확인 필요"],
  [/적법/g, "요건 확인됨"],
];

export const PUBLIC_FORBIDDEN_TERMS = ["MICE", "온톨로지", "적용성 엔진", "컴플라이언스"] as const;
export const REVIEW_FORBIDDEN_TERMS = ["적법", "허가 가능", "법적으로 완전함"] as const;

function replaceAll(text: string, replacements: ReadonlyArray<readonly [RegExp, string]>): string {
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

export function sanitizePublicTerms(text: string): string {
  return replaceAll(text, TERM_REPLACEMENTS);
}

export function sanitizeReviewTerms(text: string): string {
  return replaceAll(sanitizePublicTerms(text), REVIEW_REPLACEMENTS);
}
