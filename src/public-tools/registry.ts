import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";
import type { McpToolResult, ToolDefinition } from "../lib/types.js";
import { PUBLIC_RESPONSE_META } from "../config/public-version.js";
import { assessEventSafetyTool } from "./assess-event-safety.js";
import { createEventSafetyPlanTool } from "./create-event-safety-plan.js";
import { reviewEventSafetyPlanTool } from "./review-event-safety-plan.js";
import { searchEventVenuesTool } from "./search-event-venues.js";
import { getEventVenueRulesTool } from "./get-event-venue-rules.js";
import { getEventRiskControlsTool } from "./get-event-risk-controls.js";
import { createEventChecklistTool } from "./create-event-checklist.js";
import { updateChecklistItemTool } from "./update-checklist-item.js";
import { getEventChecklistTool } from "./get-event-checklist.js";
import { exportEventDocumentsTool } from "./export-event-documents.js";
import { addEventToCalendarTool } from "./add-event-to-calendar.js";
import { getEventDayConditionsTool } from "./get-event-day-conditions.js";

export const PUBLIC_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const PUBLIC_TOOLS: readonly ToolDefinition[] = Object.freeze([
  assessEventSafetyTool,
  createEventSafetyPlanTool,
  reviewEventSafetyPlanTool,
  searchEventVenuesTool,
  getEventVenueRulesTool,
  getEventRiskControlsTool,
]);

export const EXTENDED_TOOLS_SET: readonly ToolDefinition[] = Object.freeze([
  createEventChecklistTool,
  updateChecklistItemTool,
  getEventChecklistTool,
  exportEventDocumentsTool,
  addEventToCalendarTool,
  getEventDayConditionsTool,
]);

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

const EXTENDED_TOOL_ANNOTATIONS: Readonly<Record<string, ToolAnnotations>> = Object.freeze({
  create_event_checklist: Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }),
  update_checklist_item: Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }),
  get_event_checklist: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
  export_event_documents: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
  add_event_to_calendar: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
  get_event_day_conditions: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }),
});

export function extendedToolsEnabled(): boolean {
  // 확장 도구는 기본 노출. EXTENDED_TOOLS=0으로만 핵심 6개로 제한할 수 있다.
  return process.env.EXTENDED_TOOLS !== "0";
}

export function registeredPublicTools(): readonly ToolDefinition[] {
  return extendedToolsEnabled() ? [...PUBLIC_TOOLS, ...EXTENDED_TOOLS_SET] : PUBLIC_TOOLS;
}

function extractRawShape(schema: unknown): z.ZodRawShape {
  if (schema && typeof schema === "object" && "shape" in schema) return (schema as { shape: z.ZodRawShape }).shape;
  return {};
}

function inputError(error: ZodError): string {
  const field = error.issues[0]?.path.join(".") || "입력값";
  return `입력값을 확인해 주세요: ${field}`;
}

function safeErrorResult(error: unknown): McpToolResult {
  const message = error instanceof ZodError ? inputError(error) : "요청을 처리하지 못했습니다. 입력값을 확인해 주세요.";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message, meta: PUBLIC_RESPONSE_META },
  };
}

export function registerPublicTools(server: McpServer): void {
  for (const tool of registeredPublicTools()) {
    const annotations = EXTENDED_TOOL_ANNOTATIONS[tool.name] ?? PUBLIC_TOOL_ANNOTATIONS;
    server.registerTool(tool.name, {
      title: tool.title ?? tool.name,
      description: tool.description,
      inputSchema: extractRawShape(tool.inputSchema),
      annotations,
    }, async (input: unknown) => {
      try {
        return await tool.handler(input);
      } catch (error) {
        return safeErrorResult(error);
      }
    });
  }
}
