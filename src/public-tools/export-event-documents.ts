import { z } from "zod";
import type { EventSafetyResult } from "../adapters/event-result-adapter.js";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { checklistItemsFromAssessment, checklistMarkdown } from "../lib-public/checklist-view.js";
import { getEventChecklist, type EventChecklist } from "../lib-public/checklist-store.js";
import type { ToolDefinition } from "../lib/types.js";
import { assessEventSafetyTool } from "./assess-event-safety.js";
import { createEventSafetyPlanInputSchema, createEventSafetyPlanTool } from "./create-event-safety-plan.js";

export const exportEventDocumentsInputSchema = createEventSafetyPlanInputSchema.extend({
  eventKey: z.string().min(1).optional().describe("저장된 체크리스트를 포함할 때 행사 키"),
});

function sourceMarkdown(assessment: EventSafetyResult): string {
  return [
    "# 근거 자료",
    ...assessment.sources.map((source, index) => `- [S${index + 1}] ${source.title} — ${source.url} (${source.dataDate}, ${source.verificationStatus})`),
  ].join("\n");
}

async function handler(rawInput: unknown) {
  const input = exportEventDocumentsInputSchema.parse(rawInput ?? {});
  const [planned, assessed] = await Promise.all([
    createEventSafetyPlanTool.handler(input),
    assessEventSafetyTool.handler(input),
  ]);
  const assessment = assessed.structuredContent as unknown as EventSafetyResult;
  let checklist = input.eventKey ? await getEventChecklist(input.eventKey) : undefined;
  if (!checklist) {
    const timestamp = new Date().toISOString();
    checklist = {
      eventKey: input.eventKey ?? "preview-not-stored",
      eventName: input.eventName ?? "행사명 미정",
      eventDate: input.eventDate,
      organizer: input.organizer,
      createdAt: timestamp,
      updatedAt: timestamp,
      profile: { conditions: assessment.eventProfile.conditions, attentionLevel: assessment.attentionLevel },
      items: checklistItemsFromAssessment(assessment),
    } satisfies EventChecklist;
  }
  const documents = [
    { id: "safety-plan", title: `${checklist.eventName} 안전관리계획`, markdown: String(planned.structuredContent?.planMarkdown ?? planned.content[0]?.text ?? "") },
    { id: "checklist", title: `${checklist.eventName} 안전 체크리스트`, markdown: checklistMarkdown(checklist, "full") },
    { id: "sources", title: "근거 자료", markdown: sourceMarkdown(assessment) },
  ];
  const markdown = documents.map((document) => document.markdown).join("\n\n---\n\n");
  return {
    content: [{ type: "text" as const, text: markdown }],
    structuredContent: { documents, eventKey: checklist.eventKey, meta: PUBLIC_RESPONSE_META },
  };
}

export const exportEventDocumentsTool: ToolDefinition = {
  name: "export_event_documents",
  title: "행사 안전 문서 묶음 내보내기",
  description: `Returns a safety plan, checklist, and evidence bundle in the response using ${SERVICE_NAME}; it never writes document files.`,
  inputSchema: exportEventDocumentsInputSchema,
  handler,
};
