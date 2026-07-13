import { z } from "zod";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { checklistMarkdown, checklistProgress, checklistWidget } from "../lib-public/checklist-view.js";
import { CHECKLIST_STATUSES, getEventChecklist, updateStoredChecklistItem } from "../lib-public/checklist-store.js";
import type { ToolDefinition } from "../lib/types.js";

export const updateChecklistItemInputSchema = z.object({
  eventKey: z.string().min(1).describe("체크리스트를 만들 때 받은 행사 키"),
  itemId: z.string().min(1).describe("변경할 체크리스트 항목 ID"),
  status: z.enum(CHECKLIST_STATUSES).optional().describe("할 일, 진행 중, 완료 또는 해당 없음 상태"),
  assignee: z.string().min(1).max(100).optional().describe("담당자 이름 또는 팀"),
  dueBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("완료 기한(YYYY-MM-DD)"),
  note: z.string().max(1000).optional().describe("항목 메모"),
});

async function handler(rawInput: unknown) {
  const input = updateChecklistItemInputSchema.parse(rawInput ?? {});
  const current = await getEventChecklist(input.eventKey);
  if (!current) {
    const message = `행사 키 '${input.eventKey}'를 찾지 못했습니다. create_event_checklist로 먼저 체크리스트를 만드세요.`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { eventKey: input.eventKey, updated: false, items: [], message, meta: PUBLIC_RESPONSE_META },
    };
  }
  if (!current.items.some((item) => item.id === input.itemId)) {
    const message = `항목 ID '${input.itemId}'를 찾지 못했습니다. 현재 항목 목록을 확인하세요.`;
    return {
      content: [{ type: "text" as const, text: `${message}\n\n${checklistMarkdown(current, "summary")}` }],
      structuredContent: { eventKey: input.eventKey, updated: false, items: current.items, message, widget: checklistWidget(current), meta: PUBLIC_RESPONSE_META },
    };
  }
  const updated = await updateStoredChecklistItem(input.eventKey, input.itemId, {
    status: input.status,
    assignee: input.assignee,
    dueBy: input.dueBy,
    note: input.note,
  });
  if (!updated) throw new Error("체크리스트 갱신 중 행사 키가 사라졌습니다.");
  return {
    content: [{ type: "text" as const, text: checklistMarkdown(updated, "summary") }],
    structuredContent: {
      eventKey: updated.eventKey,
      updated: true,
      item: updated.items.find((item) => item.id === input.itemId),
      progress: checklistProgress(updated),
      widget: checklistWidget(updated),
      meta: PUBLIC_RESPONSE_META,
    },
  };
}

export const updateChecklistItemTool: ToolDefinition = {
  name: "update_checklist_item",
  title: "체크리스트 항목 변경",
  description: `Updates status, assignment, due date, or notes for a stored ${SERVICE_NAME} checklist item.`,
  inputSchema: updateChecklistItemInputSchema,
  handler,
};
