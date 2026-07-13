import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { queryMiceVenueSafetyRulesTool } from "../tools/query-mice-venue-safety-rules.js";
import { MICE_DATA } from "../lib/mice-data.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { DATA_AS_OF } from "../config/constants.js";
import { sanitizePublicTerms } from "../presenters/terms.js";

const SUPPORTED_VENUE_EXAMPLES = "coex, kintex, bexco, setec, songdo_convensia, ceco, exco, icc_jeju, atcenter, suwon_convention_center, suwonmesse, kdjcenter, ueco, dcc, osco, hico, gumico, gsco, yeosu_expo";

export const getEventVenueRulesInputSchema = z.object({
  venueId: z.string().min(1).describe(`행사장 ID. 지원 예시: ${SUPPORTED_VENUE_EXAMPLES}`),
  category: z.string().optional().describe("규정 분류 필터"),
});

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

async function handler(rawInput: unknown) {
  const input = getEventVenueRulesInputSchema.parse(rawInput ?? {});
  const supportedVenueIds = MICE_DATA.venues.map((venue) => venue.id);
  if (!supportedVenueIds.includes(input.venueId)) {
    const message = `지원하지 않는 행사장 ID '${input.venueId}'입니다. 지원 목록: ${supportedVenueIds.join(", ")}`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { venueId: input.venueId, supported: false, message, supportedVenueIds, sources: [], meta: PUBLIC_RESPONSE_META },
    };
  }

  const internal = await queryMiceVenueSafetyRulesTool.handler(input);
  const venue = (Array.isArray(internal.structuredContent?.venues) ? internal.structuredContent.venues[0] : undefined) as Record<string, unknown> | undefined;
  const profile = (venue?.facilityProfile ?? {}) as Record<string, unknown>;
  const sources = (Array.isArray(venue?.sources) ? venue.sources : []) as Array<Record<string, unknown>>;
  const result = {
    venueId: input.venueId,
    venueName: String(venue?.name ?? input.venueId),
    supported: true,
    handlingLoading: [...stringArray(profile.freightEntrance), ...stringArray(profile.loadingDock)],
    floorLoad: stringArray(profile.floorLoad),
    ceilingHeight: stringArray(profile.ceilingHeight),
    electricity: stringArray(profile.electricity),
    fireEvacuation: [...stringArray(profile.fireLane), ...stringArray(profile.evacuationRoutes)],
    boothRigging: [...stringArray(profile.boothRules), ...stringArray(profile.riggingRules)],
    foodBeverage: stringArray(profile.foodRules),
    prohibited: stringArray(profile.restrictedItems),
    submissionDocuments: stringArray(profile.safetyDocuments),
    rules: Array.isArray(venue?.rules) ? venue.rules : [],
    sources: sources.map((source) => ({
      id: String(source.id ?? "venue_source"),
      title: String(source.title ?? "행사장 공식 자료"),
      url: String(source.url ?? venue?.website ?? ""),
      dataDate: DATA_AS_OF,
      verificationStatus: String(source.verificationStatus ?? "needs_review"),
    })),
    meta: PUBLIC_RESPONSE_META,
  };
  const line = (title: string, values: string[]) => `- ${title}: ${values.length > 0 ? values.join(" / ") : "행사장 최신 자료에서 확인 필요"}`;
  const markdown = sanitizePublicTerms([
    `# ${result.venueName} 행사장 안전규정`,
    line("반입·하역", result.handlingLoading),
    line("바닥하중", result.floorLoad),
    line("천장고", result.ceilingHeight),
    line("전기", result.electricity),
    line("소방·피난", result.fireEvacuation),
    line("부스·리깅", result.boothRigging),
    line("식음료", result.foodBeverage),
    line("금지행위", result.prohibited),
    line("제출 문서", result.submissionDocuments),
    `- 출처 확인일: ${DATA_AS_OF}`,
    "- 실제 사용 홀과 행사 구성에 따라 달라질 수 있으므로 행사장 담당자에게 최신 대관·작업 규정을 확인하세요.",
  ].join("\n"));
  return { content: [{ type: "text" as const, text: markdown }], structuredContent: result };
}

export const getEventVenueRulesTool: ToolDefinition = {
  name: "get_event_venue_rules",
  title: "행사장 안전규정 조회",
  description: `Returns loading, structural, electrical, fire, booth, food, and submission rules for supported venues using ${SERVICE_NAME}.`,
  inputSchema: getEventVenueRulesInputSchema,
  handler,
};
