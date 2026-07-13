import { describe, expect, test } from "bun:test";
import type { McpToolResult, ToolDefinition } from "../src/lib/types.js";
import { assessEventSafetyTool } from "../src/public-tools/assess-event-safety.js";

async function assess(input: Record<string, unknown>): Promise<Record<string, any>> {
  const result = await assessEventSafetyTool.handler(input);
  expect(result.isError).not.toBe(true);
  return result.structuredContent as Record<string, any>;
}

describe("public event safety scenarios", () => {
  test("800-person school festival", async () => {
    const result = await assess({
      eventName: "학교 축제",
      eventType: "학교 축제",
      location: "서울시 학교 운동장",
      expectedCrowd: 800,
      outdoor: true,
      temporaryStructures: true,
      foodService: true,
      temporaryElectricity: true,
    });
    expect(result.attentionLevel).toBe("enhanced");
    expect(result.topActions.length).toBeLessThanOrEqual(5);
    expect(result.requiredDocuments.length).toBeGreaterThan(0);
  });

  test("2,000-person flea market with food and LPG", async () => {
    const result = await assess({
      eventType: "플리마켓",
      location: "서울 성수동",
      expectedCrowd: 2_000,
      outdoor: true,
      temporaryStructures: true,
      foodService: true,
      lpgUse: true,
    });
    expect(result.attentionLevel).toBe("enhanced");
    const risks = result.riskControls.map((item: any) => item.risk);
    expect(risks).toContain("fire_hazard_hot_work_lpg");
    expect(risks).toContain("food_poisoning");
  });

  test("5,000-person outdoor performance with road control", async () => {
    const result = await assess({
      eventType: "야외공연",
      location: "도심 공원",
      expectedCrowd: 5_000,
      outdoor: true,
      roadUse: true,
      performance: true,
      temporaryStructures: true,
      temporaryElectricity: true,
    });
    expect(result.attentionLevel).toBe("high_review");
  });

  test("300-person indoor exhibition includes worker safety", async () => {
    const result = await assess({
      eventType: "exhibition",
      location: "실내 전시장",
      expectedCrowd: 300,
      outdoor: false,
      setupTeardown: true,
      temporaryStructures: true,
    });
    const searchable = JSON.stringify([result.requiredDocuments, result.riskControls]);
    expect(searchable).toMatch(/작업자|worker_fall|heavy_object|구조물/);
  });

  test("800-person conference includes privacy controls", async () => {
    const result = await assess({
      eventType: "conference",
      location: "실내 회의장",
      expectedCrowd: 800,
      outdoor: false,
      personalDataProcessing: true,
    });
    expect(JSON.stringify([result.requiredDocuments, result.riskControls])).toMatch(/개인정보|privacy|CCTV/);
  });

  test("40-person indoor workshop stays basic without excessive actions", async () => {
    const result = await assess({
      eventType: "워크숍",
      location: "사내 회의실",
      expectedCrowd: 40,
      outdoor: false,
      temporaryStructures: false,
      temporaryElectricity: false,
      lpgUse: false,
      foodService: false,
      performance: false,
      setupTeardown: false,
    });
    expect(result.attentionLevel).toBe("basic");
    expect(JSON.stringify(result.topActions)).not.toMatch(/LPG|식중독|공연 재해|임시구조물/);
  });

  test("unhosted 10,000-person crowd requires high review", async () => {
    const result = await assess({
      eventType: "outdoor_event",
      location: "도심 광장",
      expectedCrowd: 10_000,
      outdoor: true,
      unhostedCrowd: true,
    });
    expect(result.attentionLevel).toBe("high_review");
  });

  test("VIP event includes security items", async () => {
    const result = await assess({
      eventType: "vip_event",
      location: "호텔 연회장",
      expectedCrowd: 200,
      outdoor: false,
      vipSecurity: true,
    });
    expect(JSON.stringify([result.topActions, result.requiredDocuments, result.riskControls])).toMatch(/보안|경비|security/);
  });

  test("event without performance excludes performance law", async () => {
    const result = await assess({
      eventType: "conference",
      location: "회의실",
      expectedCrowd: 100,
      outdoor: false,
      performance: false,
    });
    expect(result.notApplicable.some((item: any) => item.id === "performance_act")).toBe(true);
    expect(result.applicableCandidates.some((item: any) => item.id.startsWith("performance_act"))).toBe(false);
  });

  test("event without food or LPG excludes related rules and documents", async () => {
    const result = await assess({
      eventType: "conference",
      location: "회의실",
      expectedCrowd: 100,
      outdoor: false,
      foodService: false,
      lpgUse: false,
    });
    expect(result.applicableCandidates.some((item: any) => /food_sanitation|lp_gas/.test(item.id))).toBe(false);
    expect(JSON.stringify(result.requiredDocuments)).not.toMatch(/식중독|식음료 영업|LPG|가스 반입/);
  });
});
