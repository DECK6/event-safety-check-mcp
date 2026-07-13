import { describe, expect, test } from "bun:test";
import { assessEventSafetyTool } from "../src/public-tools/assess-event-safety.js";
import { createEventSafetyPlanTool } from "../src/public-tools/create-event-safety-plan.js";
import { reviewEventSafetyPlanInputSchema, reviewEventSafetyPlanTool } from "../src/public-tools/review-event-safety-plan.js";
import { searchEventVenuesTool } from "../src/public-tools/search-event-venues.js";
import { getEventVenueRulesTool } from "../src/public-tools/get-event-venue-rules.js";
import { getEventRiskControlsTool } from "../src/public-tools/get-event-risk-controls.js";
import { DATA_AS_OF } from "../src/config/constants.js";
import { MAX_SOURCES } from "../src/config/limits.js";

const representativeInput = {
  eventName: "학교 축제",
  eventType: "학교 축제",
  location: "서울시 학교 운동장",
  expectedCrowd: 800,
  outdoor: true,
  temporaryStructures: true,
  temporaryElectricity: true,
  foodService: true,
};

describe("quality gates", () => {
  test("assess output is deterministic", async () => {
    const first = await assessEventSafetyTool.handler(representativeInput);
    const second = await assessEventSafetyTool.handler(representativeInput);
    expect(second).toEqual(first);
  });

  test("assess markdown has no internal jargon", async () => {
    const result = await assessEventSafetyTool.handler(representativeInput);
    const text = result.content[0]?.text ?? "";
    for (const forbidden of ["MICE", "온톨로지", "적용성 엔진", "컴플라이언스"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  test("assess markdown numbers evidence and caps structured sources", async () => {
    const result = await assessEventSafetyTool.handler(representativeInput);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[S1]");
    expect(text).toContain("## 근거 자료");
    expect((result.structuredContent?.sources as unknown[]).length).toBeLessThanOrEqual(MAX_SOURCES);
  });

  test("review uses only qualified verdict language", async () => {
    const result = await reviewEventSafetyPlanTool.handler({
      eventType: "conference",
      expectedCrowd: 100,
      outdoor: false,
      planMarkdown: "# 행사 안전관리계획서\n## 행사 개요\n담당자와 비상연락망을 확인한다.",
    });
    const text = `${result.content[0]?.text ?? ""}${JSON.stringify(result.structuredContent)}`;
    for (const forbidden of ["적법", "허가 가능", "법적으로 완전함"]) expect(text).not.toContain(forbidden);
  });

  test("review rejects plans over 50,000 characters", () => {
    expect(() => reviewEventSafetyPlanInputSchema.parse({ planMarkdown: "가".repeat(50_001) })).toThrow();
  });

  test("venue search defaults to five and caps input at ten", async () => {
    const defaultResult = await searchEventVenuesTool.handler({});
    expect((defaultResult.structuredContent?.venues as unknown[]).length).toBe(5);
    const tenResult = await searchEventVenuesTool.handler({ limit: 10 });
    expect((tenResult.structuredContent?.venues as unknown[]).length).toBe(10);
    expect(() => searchEventVenuesTool.inputSchema.parse({ limit: 11 })).toThrow();
  });

  test("plan exposes all thirteen public sections", async () => {
    const result = await createEventSafetyPlanTool.handler({ ...representativeInput, eventDate: "2026-09-01", organizer: "학교" });
    const markdown = String(result.structuredContent?.planMarkdown ?? "");
    for (let section = 1; section <= 13; section += 1) expect(markdown).toContain(`## ${section}.`);
  });

  test("all public tools attach public metadata and sources where applicable", async () => {
    const results = await Promise.all([
      assessEventSafetyTool.handler(representativeInput),
      createEventSafetyPlanTool.handler({ ...representativeInput, eventDate: "2026-09-01" }),
      reviewEventSafetyPlanTool.handler({ ...representativeInput, planMarkdown: "# 행사 안전관리계획서\n비상연락망" }),
      searchEventVenuesTool.handler({ limit: 1 }),
      getEventVenueRulesTool.handler({ venueId: "coex" }),
      getEventRiskControlsTool.handler({ risk: "crowd_density" }),
    ]);
    for (const result of results) {
      expect((result.structuredContent?.meta as { dataDate?: string } | undefined)?.dataDate).toBe(DATA_AS_OF);
      if ("sources" in (result.structuredContent ?? {})) expect(Array.isArray(result.structuredContent?.sources)).toBe(true);
    }
  });
});
