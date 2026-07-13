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
  for (const tool of PUBLIC_TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title ?? tool.name,
      description: tool.description,
      inputSchema: extractRawShape(tool.inputSchema),
      annotations: PUBLIC_TOOL_ANNOTATIONS,
    }, async (input: unknown) => {
      try {
        return await tool.handler(input);
      } catch (error) {
        return safeErrorResult(error);
      }
    });
  }
}
