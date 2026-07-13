import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { closeHttpServer, startServer } from "../src/server/http.js";

let server: Server;
let baseUrl: string;

async function mcpRequest(body: unknown): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
  return { status: response.status, data: JSON.parse(dataLine ? dataLine.slice(5).trim() : text) };
}

describe("stateless HTTP MCP server", () => {
  beforeAll(async () => {
    server = await startServer({ port: 0, host: "127.0.0.1" });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await closeHttpServer(server);
  });

  test("GET /health reports service status", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "event-safety-check-mcp",
      version: "0.1.0",
      tools: 6,
      dataDate: "2026-05-31",
    });
  });

  test("initialize and tools/list expose exactly six annotated tools", async () => {
    const initialized = await mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test-client", version: "1.0.0" } },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.data.result.protocolVersion).toBe("2025-11-25");

    const listed = await mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listed.status).toBe(200);
    expect(listed.data.result.tools).toHaveLength(6);
    expect(listed.data.result.tools.map((tool: any) => tool.name)).toEqual([
      "assess_event_safety",
      "create_event_safety_plan",
      "review_event_safety_plan",
      "search_event_venues",
      "get_event_venue_rules",
      "get_event_risk_controls",
    ]);
    for (const tool of listed.data.result.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  test("POST body over 256 KiB returns 413", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(300 * 1024) }),
    });
    expect(response.status).toBe(413);
  });
});
