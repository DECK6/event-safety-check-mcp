import { z } from "zod";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import { checklistMarkdown, checklistProgress, checklistWidget } from "../lib-public/checklist-view.js";
import { getEventChecklist } from "../lib-public/checklist-store.js";
import type { ToolDefinition } from "../lib/types.js";

export const getEventChecklistInputSchema = z.object({
  eventKey: z.string().min(1).describe("체크리스트를 만들 때 받은 행사 키"),
  format: z.enum(["summary", "full", "share"]).default("summary").describe("요약, 전체 또는 팀 공유 형식"),
});

async function handler(rawInput: unknown) {
  const input = getEventChecklistInputSchema.parse(rawInput ?? {});
  const checklist = await getEventChecklist(input.eventKey);
  if (!checklist) {
    const message = `행사 키 '${input.eventKey}'를 찾지 못했습니다. create_event_checklist로 먼저 체크리스트를 만드세요.`;
    return {
      content: [{ type: "text" as const, text: message }],
      structuredContent: { eventKey: input.eventKey, found: false, items: [], message, meta: PUBLIC_RESPONSE_META },
    };
  }
  return {
    content: [{ type: "text" as const, text: checklistMarkdown(checklist, input.format) }],
    structuredContent: {
      eventKey: checklist.eventKey,
      found: true,
      format: input.format,
      checklist,
      progress: checklistProgress(checklist),
      widget: checklistWidget(checklist),
      meta: PUBLIC_RESPONSE_META,
    },
  };
}

export const getEventChecklistTool: ToolDefinition = {
  name: "get_event_checklist",
  title: "행사 체크리스트 조회·공유",
  description: `Returns summary, full, or team-share views of a stored ${SERVICE_NAME} checklist.`,
  inputSchema: getEventChecklistInputSchema,
  handler,
};
