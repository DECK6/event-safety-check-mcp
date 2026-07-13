import { z } from "zod";
import type { MiceEventInput, MiceEventType } from "../lib/mice-event-input-schema.js";
import { MAX_MISSING_INPUTS } from "../config/limits.js";

const EVENT_TYPE_VALUES = [
  "festival",
  "outdoor_event",
  "exhibition",
  "conference",
  "performance",
  "food_event",
  "vip_event",
] as const;

const PublicEventTypeSchema = z.enum(EVENT_TYPE_VALUES);
const FlexibleEventTypeSchema = z.union([
  PublicEventTypeSchema,
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const publicEventInputShape = {
  eventName: z.string().min(1).optional().describe("행사 이름"),
  eventType: FlexibleEventTypeSchema.optional().describe("행사 유형. 학교 축제, 플리마켓, 야외공연, 전시, 컨퍼런스처럼 입력할 수 있습니다"),
  location: z.string().min(1).optional().describe("행사 장소 또는 관할 지역"),
  venueId: z.string().min(1).optional().describe("지원 행사장 ID"),
  expectedCrowd: z.number().int().min(0).optional().describe("한 번에 가장 많이 모일 것으로 예상되는 인원"),
  outdoor: z.boolean().optional().describe("야외 행사이면 true, 실내 행사이면 false"),
  roadUse: z.boolean().optional().describe("도로·보도 점용이나 교통 통제가 있으면 true"),
  temporaryStructures: z.boolean().optional().describe("임시로 설치하는 무대·천막·부스 등이 있으면 true"),
  temporaryElectricity: z.boolean().optional().describe("발전기·임시 배선·부스 전원을 사용하면 true"),
  lpgUse: z.boolean().optional().describe("LPG 용기나 가스를 사용하면 true"),
  foodService: z.boolean().optional().describe("식음료 판매·제공·시식이 있으면 true"),
  performance: z.boolean().optional().describe("공연·버스킹·콘서트 프로그램이 있으면 true"),
  setupTeardown: z.boolean().optional().describe("설치·철거 작업이 있으면 true"),
  workAtHeight: z.boolean().optional().describe("사다리·고소작업대·비계 등 높은 곳의 작업이 있으면 true"),
  heavyObjectHandling: z.boolean().optional().describe("무거운 장비·전시품을 반입하거나 들어 올리면 true"),
  personalDataProcessing: z.boolean().optional().describe("참가자 등록, QR 출입증, 촬영 또는 CCTV 운영이 있으면 true"),
  vipSecurity: z.boolean().optional().describe("VIP 동선, 보안검색 또는 민간경비가 필요하면 true"),
  unhostedCrowd: z.boolean().optional().describe("주최자 없이 자발적으로 많은 사람이 모이는 상황이면 true"),
};

export const publicEventInputSchema = z.object(publicEventInputShape);
export type PublicEventInput = z.infer<typeof publicEventInputSchema>;

export interface EventProfileCondition {
  field: string;
  label: string;
  value: unknown;
  inferred: boolean;
}

export interface AdaptedEventInput {
  internalInput: MiceEventInput;
  eventProfile: {
    conditions: EventProfileCondition[];
  };
  missingInputs: string[];
}

const DIRECT_EVENT_TYPES = new Set<string>(EVENT_TYPE_VALUES);

function rawEventTypes(value: PublicEventInput["eventType"]): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function typeMatches(value: string): MiceEventType[] {
  const normalized = value.trim().toLowerCase();
  if (DIRECT_EVENT_TYPES.has(normalized)) return [normalized as MiceEventType];
  const types: MiceEventType[] = [];
  if (/학교\s*축제|대학\s*축제|축제|페스티벌/.test(value)) types.push("festival");
  if (/플리\s*마켓|장터|야외\s*행사/.test(value)) types.push("festival", "outdoor_event");
  if (/버스킹|야외\s*공연/.test(value)) types.push("performance", "outdoor_event");
  else if (/공연|콘서트/.test(value)) types.push("performance");
  if (/전시|박람회|엑스포/.test(value)) types.push("exhibition");
  if (/포럼|세미나|컨퍼런스|회의/.test(value)) types.push("conference");
  if (/푸드\s*트럭|식음료|먹거리/.test(value)) types.push("food_event", "outdoor_event");
  if (/VIP|브이아이피|귀빈/i.test(value)) types.push("vip_event");
  return Array.from(new Set(types));
}

function labelFor(field: string): string {
  const labels: Record<string, string> = {
    eventName: "행사명",
    eventTypes: "행사 유형",
    location: "장소·관할 지역",
    venueId: "행사장",
    expectedCrowd: "예상 최대 인원",
    outdoor: "실내·실외",
    roadUse: "도로 사용",
    temporaryStructures: "임시 구조물",
    temporaryElectricity: "임시 전기",
    lpgUse: "LPG·가스",
    foodService: "식음료",
    performance: "공연",
    setupTeardown: "설치·철거",
    workAtHeight: "고소작업",
    heavyObjectHandling: "중량물",
    personalDataProcessing: "개인정보·CCTV",
    vipSecurity: "VIP·보안",
    unhostedCrowd: "주최자 없는 운집",
  };
  return labels[field] ?? field;
}

export function adaptEventInput(rawInput: unknown): AdaptedEventInput {
  const input = publicEventInputSchema.parse(rawInput ?? {});
  const explicitValues = rawEventTypes(input.eventType);
  const explicitKnownTypes = explicitValues.flatMap(typeMatches);
  const inferredTypes: MiceEventType[] = [];

  if (input.outdoor === true || input.roadUse === true) inferredTypes.push("festival", "outdoor_event");
  if (input.performance === true) inferredTypes.push("performance");
  if (input.foodService === true || input.lpgUse === true) inferredTypes.push("food_event");
  if (input.vipSecurity === true) inferredTypes.push("vip_event");
  if ((input.temporaryStructures || input.setupTeardown || input.workAtHeight || input.heavyObjectHandling || input.temporaryElectricity)
    && !explicitKnownTypes.includes("festival") && !explicitKnownTypes.includes("performance")) {
    inferredTypes.push("exhibition");
  }

  const eventTypes = Array.from(new Set([...explicitKnownTypes, ...inferredTypes]));
  const conditions: EventProfileCondition[] = [];
  for (const [field, value] of Object.entries(input)) {
    if (field === "eventType" || value === undefined) continue;
    const displayValue = field === "outdoor" ? (value === true ? "실외" : "실내") : value;
    conditions.push({ field, label: labelFor(field), value: displayValue, inferred: false });
  }
  if (explicitValues.length > 0) {
    conditions.push({ field: "eventTypes", label: labelFor("eventTypes"), value: explicitValues, inferred: false });
  }
  const onlyInferred = inferredTypes.filter((type) => !explicitKnownTypes.includes(type));
  if (onlyInferred.length > 0) {
    conditions.push({ field: "eventTypes", label: "추론한 행사 유형", value: Array.from(new Set(onlyInferred)), inferred: true });
  }

  const internalInput: MiceEventInput = {
    eventName: input.eventName ?? "행사명 미정",
    eventTypes,
    location: input.location,
    jurisdiction: input.location,
    venueId: input.venueId,
    expectedCrowd: input.expectedCrowd,
    outdoor: input.outdoor,
    outdoorEvent: input.outdoor,
    roadUse: input.roadUse,
    temporaryStructures: input.temporaryStructures,
    temporaryElectricity: input.temporaryElectricity,
    lpgUse: input.lpgUse,
    foodService: input.foodService,
    performance: input.performance ?? eventTypes.includes("performance"),
    setupTeardown: input.setupTeardown,
    workAtHeight: input.workAtHeight,
    heavyObjectHandling: input.heavyObjectHandling,
    personalDataProcessing: input.personalDataProcessing,
    vipSecurity: input.vipSecurity ?? eventTypes.includes("vip_event"),
    unhostedCrowd: input.unhostedCrowd,
  };

  const missingInputs: string[] = [];
  if (input.expectedCrowd === undefined) missingInputs.push("예상 최대 인원은 몇 명인가요?");
  const locationMissing = !input.location && !input.venueId;
  if (input.outdoor === undefined && locationMissing) {
    missingInputs.push("실내·실외 여부와 행사 장소(또는 관할 지역)를 알려주세요.");
  } else if (input.outdoor === undefined) {
    missingInputs.push("실내 행사인가요, 야외 행사인가요?");
  } else if (locationMissing) {
    missingInputs.push("행사 장소(또는 관할 지역)를 알려주세요.");
  }
  if ([input.temporaryStructures, input.temporaryElectricity, input.lpgUse, input.foodService].every((value) => value === undefined)) {
    missingInputs.push("임시무대·천막, 임시전기, 가스, 식음료 사용 여부를 알려주세요.");
  }

  return {
    internalInput,
    eventProfile: { conditions },
    missingInputs: missingInputs.slice(0, MAX_MISSING_INPUTS),
  };
}

export function adaptPlanEventInput(rawInput: unknown): AdaptedEventInput & { eventDate?: string; organizer?: string } {
  const extension = z.object({
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("행사일(YYYY-MM-DD)"),
    organizer: z.string().min(1).optional().describe("주최·주관 기관 또는 담당 조직"),
  });
  const parsed = publicEventInputSchema.merge(extension).parse(rawInput ?? {});
  const adapted = adaptEventInput(parsed);
  adapted.internalInput.eventDate = parsed.eventDate;
  adapted.internalInput.date = parsed.eventDate;
  adapted.internalInput.organizer = parsed.organizer;
  if (parsed.eventDate) adapted.eventProfile.conditions.push({ field: "eventDate", label: "행사일", value: parsed.eventDate, inferred: false });
  if (parsed.organizer) adapted.eventProfile.conditions.push({ field: "organizer", label: "주최·주관", value: parsed.organizer, inferred: false });
  return { ...adapted, eventDate: parsed.eventDate, organizer: parsed.organizer };
}
