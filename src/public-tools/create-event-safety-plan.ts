import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { generateMiceSafetyPlanTool } from "../tools/generate-mice-safety-plan.js";
import { adaptPlanEventInput, publicEventInputSchema } from "../adapters/event-input-adapter.js";
import { adaptApplicabilityResult } from "../adapters/event-result-adapter.js";
import { presentSafetyPlan } from "../presenters/plan-markdown.js";
import { SERVICE_NAME } from "../config/public-version.js";

export const createEventSafetyPlanInputSchema = publicEventInputSchema.extend({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("행사일(YYYY-MM-DD)"),
  organizer: z.string().min(1).optional().describe("주최·주관 기관 또는 담당 조직"),
});

async function handler(rawInput: unknown) {
  const parsed = createEventSafetyPlanInputSchema.parse(rawInput ?? {});
  const adapted = adaptPlanEventInput(parsed);
  const generated = await generateMiceSafetyPlanTool.handler({ ...adapted.internalInput, output: "markdown" });
  const internal = generated.structuredContent ?? {};
  const applicability = (internal.applicability as Record<string, unknown> | undefined) ?? {};
  const assessment = adaptApplicabilityResult(adapted, applicability);
  const documentBundle = (internal.documentBundle as Record<string, unknown> | undefined) ?? {};
  const planMarkdown = presentSafetyPlan({ adapted, assessment, documentBundle });
  return {
    content: [{ type: "text" as const, text: planMarkdown }],
    structuredContent: { ...assessment, planMarkdown },
  };
}

export const createEventSafetyPlanTool: ToolDefinition = {
  name: "create_event_safety_plan",
  title: "행사 안전관리계획 초안 만들기",
  description: `Creates a 13-section event safety plan using ${SERVICE_NAME}, an offline Korean event-law, venue-rule, hazard-control, and checklist knowledge base.`,
  inputSchema: createEventSafetyPlanInputSchema,
  handler,
};
