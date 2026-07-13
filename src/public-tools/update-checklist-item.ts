import { z } from "zod";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { checklistMarkdown, checklistProgress, checklistWidget } from "../lib-public/checklist-view.js";
import { CHECKLIST_STATUSES, getEventChecklist, updateStoredChecklistItem, type ChecklistItem } from "../lib-public/checklist-store.js";
import type { ToolDefinition } from "../lib/types.js";

export const updateChecklistItemInputSchema = z.object({
  eventKey: z.string().min(1).describe("이전 create_event_checklist 응답에서 받은 행사 키. 사용자에게 다시 묻지 말고 대화 맥락의 값을 사용합니다"),
  itemId: z.string().min(1).optional().describe("내부 항목 ID. 이미 알고 있을 때만 사용합니다"),
  itemNumber: z.number().int().min(1).optional().describe("화면에 표시된 1부터 시작하는 항목 번호. '1번' 또는 '첫 번째'에는 1을 사용합니다"),
  itemTitle: z.string().min(1).max(300).optional().describe("사용자가 이름으로 지칭한 항목의 전체 또는 일부 제목"),
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
  let target: ChecklistItem | undefined;
  let selectionMessage: string | undefined;
  if (input.itemId) {
    target = current.items.find((item) => item.id === input.itemId);
    if (!target) selectionMessage = `항목 ID '${input.itemId}'를 찾지 못했습니다.`;
  } else if (input.itemNumber !== undefined) {
    target = current.items[input.itemNumber - 1];
    if (!target) selectionMessage = `${input.itemNumber}번 항목을 찾지 못했습니다.`;
  } else if (input.itemTitle) {
    const query = input.itemTitle.trim().toLocaleLowerCase();
    const exactMatches = current.items.filter((item) => item.title.toLocaleLowerCase() === query);
    if (exactMatches.length === 1) target = exactMatches[0];
    else if (exactMatches.length > 1) selectionMessage = `'${input.itemTitle}'와 이름이 같은 항목이 여러 개입니다. 번호로 지정해 주세요.`;
    else {
      const partialMatches = current.items.filter((item) => item.title.toLocaleLowerCase().includes(query));
      if (partialMatches.length === 1) target = partialMatches[0];
      else if (partialMatches.length > 1) selectionMessage = `'${input.itemTitle}'와 일치하는 항목이 여러 개입니다. 번호로 지정해 주세요.`;
      else selectionMessage = `'${input.itemTitle}'와 일치하는 항목을 찾지 못했습니다.`;
    }
  } else {
    selectionMessage = "변경할 항목의 번호나 이름을 알려주세요.";
  }
  if (!target) {
    const message = `${selectionMessage ?? "변경할 항목을 찾지 못했습니다."} 현재 번호 목록을 확인하세요.`;
    return {
      content: [{ type: "text" as const, text: `${message}\n\n${checklistMarkdown(current, "full")}` }],
      structuredContent: { eventKey: input.eventKey, updated: false, items: current.items, message, widget: checklistWidget(current), meta: PUBLIC_RESPONSE_META },
    };
  }
  const updated = await updateStoredChecklistItem(input.eventKey, target.id, {
    status: input.status,
    assignee: input.assignee,
    dueBy: input.dueBy,
    note: input.note,
  });
  if (!updated) throw new Error("체크리스트 갱신 중 행사 키가 사라졌습니다.");
  const updatedItem = updated.items.find((item) => item.id === target.id);
  if (!updatedItem) throw new Error("갱신한 체크리스트 항목을 찾지 못했습니다.");
  const statusLabel = updatedItem.status === "done" ? "완료"
    : updatedItem.status === "in_progress" ? "진행 중"
      : updatedItem.status === "not_applicable" ? "해당 없음" : "할 일";
  const number = updated.items.findIndex((item) => item.id === updatedItem.id) + 1;
  const confirmation = [
    "# 체크리스트 항목 변경 완료",
    `- 항목: ${number}번 ${updatedItem.title}`,
    `- 상태: ${statusLabel}`,
    `- 담당자: ${updatedItem.assignee ?? "미배정"}`,
  ].join("\n");
  return {
    content: [{ type: "text" as const, text: `${confirmation}\n\n${checklistMarkdown(updated, "summary")}` }],
    structuredContent: {
      eventKey: updated.eventKey,
      updated: true,
      item: updatedItem,
      progress: checklistProgress(updated),
      widget: checklistWidget(updated),
      meta: PUBLIC_RESPONSE_META,
    },
  };
}

export const updateChecklistItemTool: ToolDefinition = {
  name: "update_checklist_item",
  title: "체크리스트 항목 변경",
  description: `Updates status, assignment, due date, or notes for a stored ${SERVICE_NAME} checklist item. Reuse eventKey from the earlier create_event_checklist result without asking the user. For phrases such as 'first item' or 'item 1', set itemNumber to 1. For a named item, use itemTitle. The user never needs to provide an internal item ID.`,
  inputSchema: updateChecklistItemInputSchema,
  handler,
};
