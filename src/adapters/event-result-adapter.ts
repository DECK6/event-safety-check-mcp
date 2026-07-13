import { DATA_AS_OF } from "../config/constants.js";
import { MAX_RISK_CONTROLS, MAX_TOP_ACTIONS } from "../config/limits.js";
import { PUBLIC_RESPONSE_META } from "../config/public-version.js";
import { MICE_DATA, type DutyEntry, type HazardEntry, type LawEntry, type LocalOrdinanceRecord, type SourceEntry } from "../lib/mice-data.js";
import type { Strictness } from "../lib/types.js";
import type { AdaptedEventInput } from "./event-input-adapter.js";

type AnyRecord = Record<string, unknown>;

export type AttentionLevel = "basic" | "enhanced" | "high_review";
export type BasisType = "법정 의무 후보" | "조례" | "베뉴 규정" | "권장";
export type DocumentCategory = "법정 의무 후보" | "베뉴 제출 문서" | "권장 체크리스트" | "관할기관 확인 필요";

export interface PublicSource {
  id: string;
  title: string;
  url: string;
  dataDate: string;
  verificationStatus: string;
}

export interface EventSafetyResult {
  eventProfile: AdaptedEventInput["eventProfile"];
  attentionLevel: AttentionLevel;
  topActions: Array<{ action: string; reason: string; deadline: string; basisType: BasisType; agency: string }>;
  requiredDocuments: Array<{ name: string; category: DocumentCategory; basis: string }>;
  riskControls: Array<{ risk: string; why: string; controls: string[] }>;
  applicableCandidates: Array<{ id: string; title: string; basisType: BasisType; reason: string; verificationStatus: string }>;
  notApplicable: Array<{ id: string; title: string; reason: string }>;
  missingInputs: string[];
  sources: PublicSource[];
  meta: typeof PUBLIC_RESPONSE_META;
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function calculateAttentionLevel(input: AdaptedEventInput["internalInput"]): AttentionLevel {
  if ((input.expectedCrowd ?? 0) >= 3000 || input.unhostedCrowd || input.roadUse) return "high_review";
  if ((input.expectedCrowd ?? 0) >= 1000
    || input.temporaryStructures || input.lpgUse || input.temporaryElectricity || input.workAtHeight) return "enhanced";
  return "basic";
}

function basisTypeForStrictness(strictness: Strictness): BasisType {
  if (strictness === "statutory_required") return "법정 의무 후보";
  if (strictness === "local_required") return "조례";
  if (strictness === "venue_required") return "베뉴 규정";
  return "권장";
}

function categoryForDuty(duty: DutyEntry): DocumentCategory {
  if (duty.strictness === "statutory_required") return "법정 의무 후보";
  if (duty.strictness === "venue_required") return "베뉴 제출 문서";
  if (duty.strictness === "needs_review" || duty.strictness === "local_required") return "관할기관 확인 필요";
  return "권장 체크리스트";
}

function agencyForDuty(duty: DutyEntry): string {
  const text = `${duty.title} ${duty.requiredWhen} ${duty.lawRefs.join(" ")}`;
  if (/도로|교통/.test(text)) return "관할 도로관리청·경찰·지자체";
  if (/식품|식음료|위생/.test(text)) return "관할 보건소·행사장 담당자";
  if (/LPG|가스|화기|소방|피난/.test(text)) return "소방서·가스 공급자·행사장 담당자";
  if (/공연/.test(text)) return "관할 지자체 공연 담당부서·행사장";
  if (/개인정보|CCTV/.test(text)) return "개인정보 책임자·행사장 담당자";
  if (/경비|보안|VIP/.test(text)) return "경찰·경비업체·행사장 보안실";
  if (/작업|부스|구조물|전기/.test(text)) return "안전총괄·시공업체·행사장 담당자";
  return "관할 지자체·행사장 담당자";
}

function deadlineForDuty(duty: DutyEntry): string {
  if (duty.cycle === "per_event") return "행사 전 대상 여부와 제출기한 확인";
  if (duty.cycle) return `${duty.cycle} 기준으로 확인`;
  return "행사 전 확인";
}

function lawIsRelevant(law: LawEntry, input: AdaptedEventInput["internalInput"]): boolean {
  if (law.id.startsWith("performance_act")) return Boolean(input.performance || input.eventTypes?.includes("performance"));
  if (law.id.startsWith("food_sanitation_act")) return Boolean(input.foodService || input.eventTypes?.includes("food_event"));
  if (law.id.startsWith("lp_gas_safety_act")) return input.lpgUse === true;
  if (law.id.includes("security_services_industry")) return input.vipSecurity === true;
  if (law.id.startsWith("road_act") || law.id.startsWith("road_traffic_act") || law.id.startsWith("outdoor_advertisements_act")) return input.roadUse === true;
  if (law.id.startsWith("personal_information_protection")) return input.personalDataProcessing === true || input.vipSecurity === true;
  return true;
}

function dutyIsRelevant(duty: DutyEntry, input: AdaptedEventInput["internalInput"]): boolean {
  const text = `${duty.id} ${duty.title} ${duty.requiredWhen}`;
  if (/도로점용|교통통제|옥외광고/.test(text) && input.roadUse !== true) return false;
  if (/공연/.test(text) && !input.performance && !input.eventTypes?.includes("performance")) return false;
  if (/식음료 영업|식중독|food/.test(text) && !input.foodService && !input.eventTypes?.includes("food_event")) return false;
  if (/LPG|가스 반입|lpg/.test(text) && !input.lpgUse && !input.foodService) return false;
  if (/개인정보|CCTV|privacy/.test(text) && !input.personalDataProcessing && !input.vipSecurity) return false;
  if (/VIP|보안검색|경비|security/.test(text) && !input.vipSecurity) return false;
  return true;
}

function hazardPriority(hazard: HazardEntry, input: AdaptedEventInput["internalInput"]): number {
  let score = 0;
  if (input.lpgUse && hazard.id === "fire_hazard_hot_work_lpg") score += 200;
  if (input.foodService && hazard.id === "food_poisoning") score += 200;
  if (input.personalDataProcessing && hazard.id === "personal_data_cctv_privacy") score += 200;
  if (input.vipSecurity && hazard.id === "security_access_control_gap") score += 200;
  if (input.temporaryElectricity && hazard.id === "temporary_electrical_fire_shock") score += 180;
  if (input.temporaryStructures && hazard.id === "temporary_structure_collapse") score += 180;
  if (input.workAtHeight && hazard.id === "worker_fall_height") score += 180;
  if (input.heavyObjectHandling && hazard.id === "heavy_object_handling") score += 180;
  if (input.setupTeardown && ["worker_fall_height", "heavy_object_handling", "temporary_structure_collapse"].includes(hazard.id)) score += 150;
  if ((input.expectedCrowd ?? 0) >= 1000 && ["crowd_density_high", "ingress_egress_bottleneck"].includes(hazard.id)) score += 120;
  return score;
}

function mapSource(source: SourceEntry): PublicSource {
  return {
    id: source.id,
    title: source.title,
    url: source.url,
    dataDate: DATA_AS_OF,
    verificationStatus: source.verificationStatus,
  };
}

function explicitNotApplicable(input: AdaptedEventInput["internalInput"]): EventSafetyResult["notApplicable"] {
  const items: EventSafetyResult["notApplicable"] = [];
  if (!input.performance && !input.eventTypes?.includes("performance")) {
    items.push({ id: "performance_act", title: "공연법 계열", reason: "공연 프로그램이 없다고 입력되어 공연 관련 기준을 적용 후보에서 제외했습니다." });
  }
  if (!input.foodService && !input.eventTypes?.includes("food_event")) {
    items.push({ id: "food_sanitation_act", title: "식품위생법 계열", reason: "식음료 판매·제공이 없다고 입력되어 식품 관련 기준을 제외했습니다." });
  }
  if (!input.lpgUse) {
    items.push({ id: "lp_gas_safety_act", title: "LPG·가스 안전 기준", reason: "LPG·가스를 사용하지 않는 조건이므로 관련 기준을 제외했습니다." });
  }
  if (!input.vipSecurity) {
    items.push({ id: "security_services_industry_act", title: "경비업법 계열", reason: "VIP 경호·보안검색·민간경비 조건이 없어 관련 기준을 제외했습니다." });
  }
  return items;
}

export function adaptApplicabilityResult(adapted: AdaptedEventInput, structuredContent: Record<string, unknown>): EventSafetyResult {
  const duties = arrayOf<DutyEntry>(structuredContent.duties).filter((duty) => dutyIsRelevant(duty, adapted.internalInput));
  const hazards = arrayOf<HazardEntry>(structuredContent.hazards);
  const laws = arrayOf<LawEntry>(structuredContent.laws).filter((law) => lawIsRelevant(law, adapted.internalInput));
  const ordinances = adapted.internalInput.jurisdiction || adapted.internalInput.venueId
    ? arrayOf<LocalOrdinanceRecord & AnyRecord>(structuredContent.localOrdinances).slice(0, 5)
    : [];
  const sources = arrayOf<SourceEntry>(structuredContent.sources);

  const topActions = duties.slice(0, MAX_TOP_ACTIONS).map((duty) => ({
    action: duty.title,
    reason: duty.requiredWhen,
    deadline: deadlineForDuty(duty),
    basisType: basisTypeForStrictness(duty.strictness),
    agency: agencyForDuty(duty),
  }));

  const requiredDocuments = duties.map((duty) => ({
    name: duty.title,
    category: categoryForDuty(duty),
    basis: duty.requiredWhen,
  }));

  const riskControls = hazards
    .map((hazard, index) => ({ hazard, index, priority: hazardPriority(hazard, adapted.internalInput) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, MAX_RISK_CONTROLS)
    .map(({ hazard }) => ({
    risk: hazard.id,
    why: `${hazard.label} 위험(${hazard.riskLevel})이 입력 조건과 연결됩니다.`,
    controls: hazard.controls.slice(0, 3),
  }));

  const applicableCandidates: EventSafetyResult["applicableCandidates"] = [
    ...laws.map((law) => ({
      id: law.id,
      title: law.name,
      basisType: "법정 의무 후보" as const,
      reason: law.miceUse,
      verificationStatus: law.verificationStatus,
    })),
    ...ordinances.map((ordinance) => ({
      id: ordinance.id,
      title: ordinance.name,
      basisType: "조례" as const,
      reason: ordinance.appliesWhen,
      verificationStatus: ordinance.verificationStatus,
    })),
  ];

  return {
    eventProfile: adapted.eventProfile,
    attentionLevel: calculateAttentionLevel(adapted.internalInput),
    topActions,
    requiredDocuments,
    riskControls,
    applicableCandidates,
    notApplicable: explicitNotApplicable(adapted.internalInput),
    missingInputs: adapted.missingInputs,
    sources: sources.map(mapSource),
    meta: PUBLIC_RESPONSE_META,
  };
}

export function sourcesForIds(sourceIds: string[]): PublicSource[] {
  const wanted = new Set(sourceIds);
  return MICE_DATA.sources.filter((source) => wanted.has(source.id)).map(mapSource);
}
