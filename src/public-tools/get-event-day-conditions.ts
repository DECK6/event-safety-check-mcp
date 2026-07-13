import { z } from "zod";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { queryLiveOperationsStatus } from "../lib/live-operations-adapters.js";
import {
  fetchKopisPerformanceCatalog,
  fetchNemcEmergencyHospitals,
  fetchTourApiFestivalCatalog,
  type LiveApiResult,
  type NormalizedExternalRecord,
} from "../lib/mice-public-api-clients.js";
import type { ToolDefinition } from "../lib/types.js";
import { getEventRiskControlsTool } from "./get-event-risk-controls.js";

const REQUIRED_LIVE_KEYS = ["KOPIS_SERVICE_KEY", "TOUR_API_SERVICE_KEY", "NEMC_SERVICE_KEY"] as const;
const CONFIGURATION_GUIDANCE = "실시간 연계를 쓰려면 KOPIS_SERVICE_KEY / TOUR_API_SERVICE_KEY / NEMC_SERVICE_KEY를 설정하세요";

export const getEventDayConditionsInputSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("확인할 행사일(YYYY-MM-DD)"),
  location: z.string().min(1).optional().describe("행사 장소 또는 관할 지역"),
  venueId: z.string().min(1).optional().describe("지원 행사장 ID"),
});

function configuredKeys(): string[] {
  return REQUIRED_LIVE_KEYS.filter((key) => Boolean(process.env[key]?.trim()));
}

function apiSummary(result: LiveApiResult<NormalizedExternalRecord>) {
  return {
    sourceId: result.sourceId,
    status: result.status,
    records: result.records.slice(0, 3),
    warnings: result.warnings,
  };
}

async function handler(rawInput: unknown) {
  const input = getEventDayConditionsInputSchema.parse(rawInput ?? {});
  const severeWeather = await getEventRiskControlsTool.handler({ risk: "severe_weather" });
  const offlineControls = severeWeather.structuredContent;
  const keys = configuredKeys();
  if (keys.length === 0) {
    const markdown = [
      "# 행사 당일 조건 확인",
      `- 행사일: ${input.eventDate}`,
      `- 장소: ${input.location ?? input.venueId ?? "미입력"}`,
      `- ${CONFIGURATION_GUIDANCE}.`,
      "",
      severeWeather.content[0]?.text ?? "",
    ].join("\n");
    return {
      content: [{ type: "text" as const, text: markdown }],
      structuredContent: {
        mode: "offline",
        configuredKeys: keys,
        guidance: CONFIGURATION_GUIDANCE,
        eventDate: input.eventDate,
        location: input.location,
        venueId: input.venueId,
        offlineControls,
        liveConditions: [],
        meta: PUBLIC_RESPONSE_META,
      },
    };
  }

  const compact = input.eventDate.replaceAll("-", "");
  const [kopis, tour, nemc, operations] = await Promise.all([
    fetchKopisPerformanceCatalog({ startDate: compact, endDate: compact, limit: 3, env: process.env }),
    fetchTourApiFestivalCatalog({ startDate: compact, endDate: compact, limit: 3, env: process.env }),
    fetchNemcEmergencyHospitals({ sido: input.location, limit: 3, env: process.env }),
    queryLiveOperationsStatus({ venueId: input.venueId, jurisdiction: input.location, env: process.env, live: true }),
  ]);
  const catalogs = [kopis, tour, nemc].map(apiSummary);
  const warnings = [...catalogs.flatMap((result) => result.warnings), ...operations.warnings];
  const markdown = [
    "# 행사 당일 조건 확인",
    `- 행사일: ${input.eventDate}`,
    `- 장소: ${input.location ?? input.venueId ?? "미입력"}`,
    `- 설정된 기본 연계 키: ${keys.join(", ")}`,
    "",
    "## 실시간·당일 운영 신호",
    ...operations.operationalEvidence.map((evidence) => `- ${evidence.label}: ${evidence.status}${evidence.warnings.length ? ` — ${evidence.warnings.join("; ")}` : ""}`),
    "",
    "## 연계 경고",
    ...(warnings.length > 0 ? warnings.map((warning) => `- ${warning}`) : ["- 별도 경고가 없습니다."]),
    "",
    severeWeather.content[0]?.text ?? "",
  ].join("\n");
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: {
      mode: "live",
      configuredKeys: keys,
      eventDate: input.eventDate,
      location: input.location,
      venueId: input.venueId,
      catalogs,
      liveConditions: operations.operationalEvidence,
      warnings,
      offlineControls,
      meta: PUBLIC_RESPONSE_META,
    },
  };
}

export const getEventDayConditionsTool: ToolDefinition = {
  name: "get_event_day_conditions",
  title: "행사 당일 외부 조건 확인",
  description: `Checks configured live event-day signals and always returns offline severe-weather controls using ${SERVICE_NAME}.`,
  inputSchema: getEventDayConditionsInputSchema,
  handler,
};
