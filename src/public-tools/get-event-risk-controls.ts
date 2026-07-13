import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { MICE_DATA } from "../lib/mice-data.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { sourcesForIds } from "../adapters/event-result-adapter.js";
import { sanitizePublicTerms } from "../presenters/terms.js";

export const RISK_TO_HAZARD_ID = {
  crowd_density: "crowd_density_high",
  entrance_bottleneck: "ingress_egress_bottleneck",
  temporary_structure: "temporary_structure_collapse",
  stage_rigging: "temporary_structure_collapse",
  temporary_electricity: "temporary_electrical_fire_shock",
  work_at_height: "worker_fall_height",
  heavy_objects: "heavy_object_handling",
  fire_lpg: "fire_hazard_hot_work_lpg",
  food_poisoning: "food_poisoning",
  fire_evacuation: "blocked_evacuation_route",
  medical_emergency: "medical_emergency",
  privacy_cctv: "personal_data_cctv_privacy",
  severe_weather: "weather_outdoor_event",
} as const;

export const getEventRiskControlsInputSchema = z.object({
  risk: z.enum(Object.keys(RISK_TO_HAZARD_ID) as [keyof typeof RISK_TO_HAZARD_ID, ...(keyof typeof RISK_TO_HAZARD_ID)[]])
    .describe("위험 유형: 군중 밀집, 출입구 병목, 임시구조물, 무대·리깅, 임시전기, 고소작업, 중량물, 화기·LPG, 식중독, 소방·피난, 응급환자, 개인정보·CCTV, 기상악화"),
});

async function handler(rawInput: unknown) {
  const input = getEventRiskControlsInputSchema.parse(rawInput ?? {});
  const hazardId = RISK_TO_HAZARD_ID[input.risk];
  const hazard = MICE_DATA.hazards.find((item) => item.id === hazardId);
  if (!hazard) throw new Error("지원 위험 정보를 찾을 수 없습니다.");
  const lawIds = Array.from(new Set(hazard.lawRefs.map((ref) => ref.split(":")[0])));
  const legalBasis = lawIds.map((lawId) => MICE_DATA.laws.find((law) => law.id === lawId)).filter((law) => law !== undefined).map((law) => ({
    id: law.id,
    title: law.name,
    url: law.sourceUrl,
    verificationStatus: law.verificationStatus,
  }));
  const result = {
    risk: input.risk,
    label: input.risk === "stage_rigging" ? "무대·트러스·리깅" : hazard.label,
    whyDangerous: `${hazard.label}은(는) ${hazard.riskLevel === "high" ? "중점 관리가 필요한" : "사전에 통제해야 하는"} 위험입니다.`,
    preventiveControls: hazard.controls.slice(0, 3),
    onSiteChecks: hazard.controls.slice(3).length > 0
      ? hazard.controls.slice(3)
      : hazard.controls.slice(0, 2).map((control) => `현장 실행 여부 확인: ${control}`),
    legalBasis,
    sources: sourcesForIds(hazard.sourceRefs),
    meta: PUBLIC_RESPONSE_META,
  };
  const markdown = sanitizePublicTerms([
    `# ${result.label} 위험 통제`,
    `- 위험 이유: ${result.whyDangerous}`,
    "## 예방조치",
    ...result.preventiveControls.map((control) => `- ${control}`),
    "## 현장 확인사항",
    ...result.onSiteChecks.map((check) => `- ${check}`),
    "## 근거",
    ...result.legalBasis.map((basis) => `- ${basis.title} (${basis.verificationStatus}): ${basis.url}`),
    "- 최신 원문과 현장 조건을 담당기관·행사장에 다시 확인하세요.",
  ].join("\n"));
  return { content: [{ type: "text" as const, text: markdown }], structuredContent: result };
}

export const getEventRiskControlsTool: ToolDefinition = {
  name: "get_event_risk_controls",
  title: "행사 위험 예방조치 조회",
  description: `Returns preventive controls and on-site checks for a selected event risk using ${SERVICE_NAME}.`,
  inputSchema: getEventRiskControlsInputSchema,
  handler,
};
