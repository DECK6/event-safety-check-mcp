import type { EventSafetyResult } from "../adapters/event-result-adapter.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { checklistItemsFromAssessment, checklistMarkdown, checklistWidget } from "../lib-public/checklist-view.js";
import { saveEventChecklist } from "../lib-public/checklist-store.js";
import type { ToolDefinition } from "../lib/types.js";
import { assessEventSafetyTool } from "./assess-event-safety.js";
import { createEventSafetyPlanInputSchema } from "./create-event-safety-plan.js";

async function handler(rawInput: unknown) {
  const input = createEventSafetyPlanInputSchema.parse(rawInput ?? {});
  const assessed = await assessEventSafetyTool.handler(input);
  const assessment = assessed.structuredContent as unknown as EventSafetyResult;
  const checklist = await saveEventChecklist({
    eventName: input.eventName ?? "행사명 미정",
    eventDate: input.eventDate,
    organizer: input.organizer,
    profile: { conditions: assessment.eventProfile.conditions, attentionLevel: assessment.attentionLevel },
    items: checklistItemsFromAssessment(assessment),
  });
  const widget = checklistWidget(checklist);
  const markdown = checklistMarkdown(checklist, "full");
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: { eventKey: checklist.eventKey, itemCount: checklist.items.length, widget, meta: PUBLIC_RESPONSE_META },
  };
}

export const createEventChecklistTool: ToolDefinition = {
  name: "create_event_checklist",
  title: "행사 안전 체크리스트 만들기",
  description: `Creates and stores an assignable event safety checklist using ${SERVICE_NAME}.`,
  inputSchema: createEventSafetyPlanInputSchema,
  handler,
};
