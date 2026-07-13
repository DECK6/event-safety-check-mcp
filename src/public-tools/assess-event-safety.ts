import type { ToolDefinition } from "../lib/types.js";
import { queryMiceSafetyApplicabilityTool } from "../tools/query-mice-safety-applicability.js";
import { adaptEventInput, publicEventInputSchema } from "../adapters/event-input-adapter.js";
import { adaptApplicabilityResult } from "../adapters/event-result-adapter.js";
import { presentActionSummary } from "../presenters/action-summary.js";
import { SERVICE_NAME } from "../config/public-version.js";

async function handler(rawInput: unknown) {
  const adapted = adaptEventInput(rawInput);
  const internal = await queryMiceSafetyApplicabilityTool.handler(adapted.internalInput);
  const result = adaptApplicabilityResult(adapted, internal.structuredContent ?? {});
  return {
    content: [{ type: "text" as const, text: presentActionSummary(result) }],
    structuredContent: { ...result },
  };
}

export const assessEventSafetyTool: ToolDefinition = {
  name: "assess_event_safety",
  title: "행사 안전 준비 진단",
  description: `Assesses event safety requirements using ${SERVICE_NAME}, an offline Korean event-law, venue-rule, hazard-control, and checklist knowledge base.`,
  inputSchema: publicEventInputSchema,
  handler,
};
