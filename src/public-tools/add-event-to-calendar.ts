import { createHash } from "node:crypto";
import { z } from "zod";
import { PUBLIC_RESPONSE_META, SERVICE_NAME } from "../config/public-version.js";
import type { ToolDefinition } from "../lib/types.js";

export const addEventToCalendarInputSchema = z.object({
  eventName: z.string().min(1).describe("캘린더에 표시할 행사 이름"),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("행사일(YYYY-MM-DD)"),
  location: z.string().min(1).optional().describe("행사 장소"),
  eventKey: z.string().min(1).optional().describe("체크리스트 행사 키"),
  reminders: z.array(z.number().int().min(0).max(365)).max(20).default([7, 1]).describe("행사 며칠 전 알림을 받을지 지정"),
});

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

export function calendarUid(input: { eventName: string; eventDate: string; eventKey?: string }): string {
  const seed = input.eventKey ?? `${input.eventName}\u0000${input.eventDate}`;
  return `${createHash("sha256").update(seed).digest("hex").slice(0, 24)}@event-safety-check-mcp`;
}

async function handler(rawInput: unknown) {
  const input = addEventToCalendarInputSchema.parse(rawInput ?? {});
  const uid = calendarUid(input);
  const reminders = Array.from(new Set(input.reminders)).sort((a, b) => b - a);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Event Safety Check//Event Calendar//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${compactDate(input.eventDate)}T000000Z`,
    `DTSTART;VALUE=DATE:${compactDate(input.eventDate)}`,
    `SUMMARY:${escapeIcs(input.eventName)}`,
    ...(input.location ? [`LOCATION:${escapeIcs(input.location)}`] : []),
    `DESCRIPTION:${escapeIcs("행사 안전 체크리스트와 준비 상태를 확인하세요.")}`,
    ...reminders.flatMap((days) => [
      "BEGIN:VALARM",
      `TRIGGER:-P${days}D`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(`${input.eventName} 준비 마감 D-${days}`)}`,
      "END:VALARM",
    ]),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  const ics = lines.join("\r\n");
  const markdown = [
    `# ${input.eventName} 캘린더 등록`,
    `- 행사일: ${input.eventDate}`,
    `- 알림: ${reminders.map((days) => `D-${days}`).join(", ") || "없음"}`,
    "- 아래 내용을 .ics 파일로 저장해 캘린더에 등록하세요.",
    "",
    "```ics",
    ics.trimEnd(),
    "```",
  ].join("\n");
  return { content: [{ type: "text" as const, text: markdown }], structuredContent: { uid, ics, meta: PUBLIC_RESPONSE_META } };
}

export const addEventToCalendarTool: ToolDefinition = {
  name: "add_event_to_calendar",
  title: "행사 일정 캘린더 데이터 만들기",
  description: `Creates deterministic RFC 5545 calendar text and reminders for an event using ${SERVICE_NAME}.`,
  inputSchema: addEventToCalendarInputSchema,
  handler,
};
