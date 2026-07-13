import type { EventSafetyResult } from "../adapters/event-result-adapter.js";
import type { AdaptedEventInput } from "../adapters/event-input-adapter.js";
import { DATA_AS_OF } from "../config/constants.js";
import { MAX_ITEM_TEXT_CHARS, MAX_PLAN_BULLETS_PER_SECTION } from "../config/limits.js";
import { sanitizePublicTerms } from "./terms.js";

type DocumentBundle = Record<string, unknown>;

function excerpt(bundle: DocumentBundle, key: string, fallback: string, maxLength = 2_200): string {
  const value = bundle[key];
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  const clean = value.trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}\n- 상세 실행 항목은 행사 조건 확정 후 보완하세요.` : clean;
}

function profileLines(adapted: AdaptedEventInput): string[] {
  return adapted.eventProfile.conditions.map((condition) => {
    const value = Array.isArray(condition.value) ? condition.value.join(", ") : typeof condition.value === "boolean" ? (condition.value ? "예" : "아니요") : String(condition.value);
    return `- ${condition.inferred ? "추론" : "입력"} · ${condition.label}: ${value}`;
  });
}

function limitSection(body: string): string {
  let bullets = 0;
  return body.split("\n").filter((line) => {
    if (!line.trimStart().startsWith("- ")) return true;
    bullets += 1;
    return bullets <= MAX_PLAN_BULLETS_PER_SECTION;
  }).map((line) => {
    if (!line.trimStart().startsWith("- ") || line.length <= MAX_ITEM_TEXT_CHARS) return line;
    return `${line.slice(0, MAX_ITEM_TEXT_CHARS - 1).trimEnd()}…`;
  }).join("\n");
}

export function presentSafetyPlan(options: {
  adapted: AdaptedEventInput;
  assessment: EventSafetyResult;
  documentBundle: DocumentBundle;
}): string {
  const { adapted, assessment, documentBundle } = options;
  const sections = [
    ["1. 행사 개요", [...profileLines(adapted), `- 추가 검토 수준: ${assessment.attentionLevel}`].join("\n")],
    ["2. 역할과 책임", excerpt(documentBundle, "staffAssignment", "- 안전총괄, 운영본부, 시설·전기, 소방·의료, 구역별 담당자와 대리자를 지정합니다.")],
    ["3. 인파·동선 관리", excerpt(documentBundle, "crowdFlowPlan", "- 입장·퇴장·대기열을 분리하고 비상차량 접근로와 피난동선을 확보합니다.")],
    ["4. 무대·부스·임시구조물", excerpt(documentBundle, "venueFacilityPlan", "- 구조 검토, 전도 방지, 바닥하중, 반입·하역 동선과 행사장 승인을 확인합니다.")],
    ["5. 전기·화기·LPG", excerpt(documentBundle, "foodLpgChecklist", "- 임시전기 누전차단·접지·방수와 화기·가스 사용 여부를 점검하고 사용하지 않는 항목은 제외합니다.")],
    ["6. 설치·철거 작업자 안전", excerpt(documentBundle, "workerSafetyPlan", "- 설치·철거 작업이 있다면 작업순서, 출입통제, 보호구, 고소·중량물 작업중지 기준을 정합니다.")],
    ["7. 소방·피난", excerpt(documentBundle, "fireEvacuationChecklist", "- 비상구·유도등·소화기·소방통로를 가리지 않고 개장 전과 운영 중에 확인합니다.")],
    ["8. 응급의료", excerpt(documentBundle, "medicalResponsePlan", "- 응급 연락망, AED 위치, 응급처치 담당자와 구급차 이송 동선을 확인합니다.")],
    ["9. 식음료 안전", adapted.internalInput.foodService
      ? excerpt(documentBundle, "foodLpgChecklist", "- 영업신고 대상, 보관 온도, 손위생, 교차오염, 보존식과 식중독 신고 절차를 확인합니다.", 1_500)
      : "- 식음료 판매·제공이 없는 조건입니다. 현장 변경 시 이 절을 다시 검토합니다."],
    ["10. 개인정보·CCTV", adapted.internalInput.personalDataProcessing
      ? excerpt(documentBundle, "privacyCctvChecklist", "- 최소 수집, 고지·동의, 보관기간, 접근권한과 CCTV 안내판을 확인합니다.")
      : "- 참가자 등록·촬영·CCTV 처리가 없는 조건입니다. 현장 변경 시 개인정보 담당자가 다시 확인합니다."],
    ["11. 비상연락 및 대응", excerpt(documentBundle, "emergencyContacts", "- 119·112·관할기관·행사장·운영본부 연락망과 상황전파 순서를 배포합니다.")],
    ["12. 사전 제출·협의 체크리스트", excerpt(documentBundle, "submissionChecklist", assessment.topActions.map((item) => `- ${item.action}: ${item.deadline} / ${item.agency}`).join("\n") || "- 관할기관과 행사장에 제출 대상과 기한을 확인합니다.")],
    ["13. 행사 전·당일·종료 후 실행 항목", excerpt(documentBundle, "operationsRunsheet", excerpt(documentBundle, "dailySafetyChecklist", "- 행사 전 문서·교육·시설을 확인하고, 당일 개장 승인과 순찰을 기록하며, 종료 후 철거·사고·개선 기록을 정리합니다."))],
  ];

  const markdown = [
    `# ${adapted.internalInput.eventName} 안전관리계획 초안`,
    "",
    "> 이 초안은 입력 조건을 바탕으로 만든 준비 문서입니다. 담당자·도면·현장 실측값을 채우고 관할기관과 행사장에 최신 기준을 확인하세요.",
    "",
    ...sections.flatMap(([title, body]) => [`## ${title}`, limitSection(body), ""]),
    "## 주의사항",
    `- 데이터 기준일: ${DATA_AS_OF}`,
    "- 이 초안은 법률 자문이나 허가 판단을 대신하지 않습니다.",
  ].join("\n");
  return sanitizePublicTerms(markdown);
}
