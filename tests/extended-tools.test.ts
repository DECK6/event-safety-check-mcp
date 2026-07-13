import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addEventToCalendarTool } from "../src/public-tools/add-event-to-calendar.js";
import { createEventChecklistTool } from "../src/public-tools/create-event-checklist.js";
import { exportEventDocumentsTool } from "../src/public-tools/export-event-documents.js";
import { getEventChecklistTool } from "../src/public-tools/get-event-checklist.js";
import { getEventDayConditionsTool } from "../src/public-tools/get-event-day-conditions.js";
import { updateChecklistItemTool } from "../src/public-tools/update-checklist-item.js";
import { clearChecklistStore, getEventChecklist, reloadChecklistStore } from "../src/lib-public/checklist-store.js";
import { closeHttpServer, startServer } from "../src/server/http.js";

const extendedInput = {
  eventName: "학교 가을 축제",
  eventType: "학교 축제",
  location: "서울시 학교 운동장",
  eventDate: "2026-09-12",
  organizer: "학생회",
  expectedCrowd: 800,
  outdoor: true,
  temporaryStructures: true,
  temporaryElectricity: true,
  foodService: true,
};

const originalExtended = process.env.EXTENDED_TOOLS;
const originalStorePath = process.env.EVENT_STORE_PATH;

async function mcpRequest(baseUrl: string, body: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
  return JSON.parse(dataLine ? dataLine.slice(5).trim() : text);
}

async function withServer(callback: (baseUrl: string) => Promise<void>): Promise<void> {
  let server: Server | undefined;
  try {
    server = await startServer({ port: 0, host: "127.0.0.1" });
    const address = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server) await closeHttpServer(server);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(async () => {
  restoreEnv("EXTENDED_TOOLS", originalExtended);
  restoreEnv("EVENT_STORE_PATH", originalStorePath);
  await reloadChecklistStore();
});

describe("extended tool registration", () => {
  test("flag off lists six tools", async () => {
    delete process.env.EXTENDED_TOOLS;
    await withServer(async (baseUrl) => {
      const listed = await mcpRequest(baseUrl, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      expect(listed.result.tools).toHaveLength(6);
    });
  });

  test("flag on lists twelve tools with per-tool annotations", async () => {
    process.env.EXTENDED_TOOLS = "1";
    await withServer(async (baseUrl) => {
      const health = await (await fetch(`${baseUrl}/health`)).json() as any;
      expect(health).toMatchObject({ tools: 12, extended: true });
      const listed = await mcpRequest(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      expect(listed.result.tools).toHaveLength(12);
      const additions = listed.result.tools.slice(6);
      expect(additions.map((tool: any) => tool.name)).toEqual([
        "create_event_checklist",
        "update_checklist_item",
        "get_event_checklist",
        "export_event_documents",
        "add_event_to_calendar",
        "get_event_day_conditions",
      ]);
      for (const tool of additions) {
        expect(tool.annotations.destructiveHint).toBe(false);
        expect(tool.annotations.openWorldHint).toBe(tool.name === "get_event_day_conditions");
      }
      expect(additions[0].annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
      expect(additions[1].annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
      expect(additions[2].annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
      expect(additions[5].annotations).toMatchObject({ readOnlyHint: true, idempotentHint: false });
    });
  });
});

describe("extended checklist workflow", () => {
  test("create, update, get, and share a checklist", async () => {
    delete process.env.EVENT_STORE_PATH;
    await clearChecklistStore();
    const created = await createEventChecklistTool.handler(extendedInput);
    const eventKey = String(created.structuredContent?.eventKey);
    const itemCount = Number(created.structuredContent?.itemCount);
    const widget = created.structuredContent?.widget as any;
    expect(itemCount).toBeGreaterThan(0);
    expect(widget.items).toHaveLength(itemCount);
    expect(widget.items.every((item: any) => ["문서", "위험통제", "사전협의", "당일운영"].includes(item.category))).toBe(true);

    const itemId = widget.items[0].id;
    const updated = await updateChecklistItemTool.handler({ eventKey, itemId, status: "done", assignee: "안전팀" });
    expect((updated.structuredContent?.item as any).status).toBe("done");
    expect((updated.structuredContent?.item as any).assignee).toBe("안전팀");
    expect((updated.structuredContent?.progress as any).percent).toBe(Math.round(100 / itemCount));

    const fetched = await getEventChecklistTool.handler({ eventKey, format: "share" });
    expect((fetched.structuredContent?.checklist as any).items[0]).toMatchObject({ status: "done", assignee: "안전팀" });
    expect(fetched.content[0]?.text).toContain("담당자별 현황");
  });

  test("unknown event and item are guidance responses, not errors", async () => {
    const missingEvent = await updateChecklistItemTool.handler({ eventKey: "missing", itemId: "missing", status: "done" });
    expect(missingEvent.isError).not.toBe(true);
    expect(missingEvent.content[0]?.text).toContain("찾지 못했습니다");

    const created = await createEventChecklistTool.handler(extendedInput);
    const missingItem = await updateChecklistItemTool.handler({ eventKey: created.structuredContent?.eventKey, itemId: "missing", status: "done" });
    expect(missingItem.isError).not.toBe(true);
    expect((missingItem.structuredContent?.items as unknown[]).length).toBeGreaterThan(0);
  });

  test("EVENT_STORE_PATH survives an in-process reload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "event-checklist-store-"));
    try {
      process.env.EVENT_STORE_PATH = join(directory, "events.json");
      await reloadChecklistStore();
      await clearChecklistStore();
      const created = await createEventChecklistTool.handler(extendedInput);
      const eventKey = String(created.structuredContent?.eventKey);
      await reloadChecklistStore();
      expect((await getEventChecklist(eventKey))?.eventName).toBe(extendedInput.eventName);
    } finally {
      delete process.env.EVENT_STORE_PATH;
      await reloadChecklistStore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("extended response-only tools", () => {
  test("calendar output is RFC 5545 shaped and UID is deterministic", async () => {
    const first = await addEventToCalendarTool.handler({ eventName: "학교 축제", eventDate: "2026-09-12" });
    const second = await addEventToCalendarTool.handler({ eventName: "학교 축제", eventDate: "2026-09-12" });
    const ics = String(first.structuredContent?.ics);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("BEGIN:VALARM");
    expect(first.structuredContent?.uid).toBe(second.structuredContent?.uid);
  });

  test("document export returns plan and checklist without output files", async () => {
    delete process.env.EVENT_STORE_PATH;
    const directory = await mkdtemp(join(tmpdir(), "event-document-export-"));
    try {
      const before = await readdir(directory);
      const result = await exportEventDocumentsTool.handler(extendedInput);
      const documents = result.structuredContent?.documents as Array<{ id: string }>;
      expect(documents.map((document) => document.id)).toEqual(["safety-plan", "checklist", "sources"]);
      expect(await readdir(directory)).toEqual(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("event-day conditions fall back offline when keys are unset", async () => {
    const saved = Object.fromEntries(["KOPIS_SERVICE_KEY", "TOUR_API_SERVICE_KEY", "NEMC_SERVICE_KEY"].map((key) => [key, process.env[key]]));
    try {
      for (const key of Object.keys(saved)) delete process.env[key];
      const result = await getEventDayConditionsTool.handler({ eventDate: "2026-09-12", location: "서울" });
      expect(result.isError).not.toBe(true);
      expect(result.content[0]?.text).toContain("KOPIS_SERVICE_KEY / TOUR_API_SERVICE_KEY / NEMC_SERVICE_KEY");
      expect(JSON.stringify(result.structuredContent?.offlineControls)).toContain("severe_weather");
    } finally {
      for (const [key, value] of Object.entries(saved)) restoreEnv(key, value);
    }
  });
});
