import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { queryPerformanceVenuesTool } from "../tools/query-performance-venues.js";
import { DEFAULT_VENUE_RESULT_LIMIT, MAX_VENUE_RESULT_LIMIT } from "../config/limits.js";
import { DATA_AS_OF } from "../config/constants.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { sanitizePublicTerms } from "../presenters/terms.js";

export const searchEventVenuesInputSchema = z.object({
  query: z.string().optional().describe("행사장 이름·주소·키워드"),
  region: z.string().optional().describe("시·도 또는 시·군·구"),
  category: z.string().optional().describe("시설 분류"),
  limit: z.number().int().min(1).max(MAX_VENUE_RESULT_LIMIT).optional().default(DEFAULT_VENUE_RESULT_LIMIT),
});

async function handler(rawInput: unknown) {
  const input = searchEventVenuesInputSchema.parse(rawInput ?? {});
  const internal = await queryPerformanceVenuesTool.handler(input);
  const data = internal.structuredContent ?? {};
  const venues = Array.isArray(data.venues) ? data.venues : [];
  const markdown = sanitizePublicTerms(String(internal.content[0]?.text ?? "").replace("공연시설 검색 결과", "행사장 검색 결과").replace("공연시설이 없습니다", "행사장이 없습니다"));
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: {
      query: input,
      totalIndexed: data.totalIndexed,
      matchCount: venues.length,
      venues,
      sources: [{ id: "KCISA_KOPIS_PERFORMANCE_FACILITY", title: "KOPIS 공연시설 오프라인 인덱스", url: "https://www.kopis.or.kr", dataDate: DATA_AS_OF, verificationStatus: "offline_derived" }],
      meta: PUBLIC_RESPONSE_META,
    },
  };
}

export const searchEventVenuesTool: ToolDefinition = {
  name: "search_event_venues",
  title: "행사장 검색",
  description: `Searches an offline Korean performance-facility directory for event venues using ${SERVICE_NAME}.`,
  inputSchema: searchEventVenuesInputSchema,
  handler,
};
