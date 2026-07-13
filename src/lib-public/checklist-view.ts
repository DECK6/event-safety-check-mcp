import { createHash } from "node:crypto";
import type { EventSafetyResult } from "../adapters/event-result-adapter.js";
import type { ChecklistBasisType, ChecklistCategory, ChecklistItem, EventChecklist } from "./checklist-store.js";

export interface ChecklistWidget {
  type: "checklist";
  title: string;
  eventKey: string;
  items: Array<{
    id: string;
    label: string;
    checked: boolean;
    assignee: string | null;
    dueBy: string | null;
    category: ChecklistCategory;
  }>;
}

function itemId(category: ChecklistCategory, title: string, index: number): string {
  const digest = createHash("sha256").update(`${category}\u0000${title}\u0000${index}`).digest("hex").slice(0, 8);
  return `item-${digest}`;
}

function documentBasis(category: EventSafetyResult["requiredDocuments"][number]["category"]): ChecklistBasisType {
  if (category === "법정 의무 후보") return "법정 의무 후보";
  if (category === "베뉴 제출 문서") return "행사장 규정";
  if (category === "관할기관 확인 필요") return "지자체 조례";
  return "권장";
}

export function checklistItemsFromAssessment(assessment: EventSafetyResult): ChecklistItem[] {
  const now = new Date().toISOString();
  const candidates: Array<Omit<ChecklistItem, "id" | "updatedAt">> = [
    ...assessment.topActions.map((item) => ({
      title: item.action,
      category: "사전협의" as const,
      basisType: item.basisType,
      sourceRef: item.sourceRefs[0],
      status: "todo" as const,
    })),
    ...assessment.requiredDocuments.map((item) => ({
      title: item.name,
      category: "문서" as const,
      basisType: documentBasis(item.category),
      sourceRef: item.sourceRefs[0],
      status: "todo" as const,
    })),
    ...assessment.riskControls.map((item) => ({
      title: `${item.risk}: ${item.controls[0] ?? item.why}`,
      category: "위험통제" as const,
      basisType: "권장" as const,
      sourceRef: item.sourceRefs[0],
      status: "todo" as const,
    })),
  ];
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = `${item.category}\u0000${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item, index) => ({ ...item, id: itemId(item.category, item.title, index), updatedAt: now }));
}

export function checklistWidget(checklist: EventChecklist): ChecklistWidget {
  return {
    type: "checklist",
    title: `${checklist.eventName} 안전 체크리스트`,
    eventKey: checklist.eventKey,
    items: checklist.items.map((item) => ({
      id: item.id,
      label: item.title,
      checked: item.status === "done",
      assignee: item.assignee ?? null,
      dueBy: item.dueBy ?? null,
      category: item.category,
    })),
  };
}

export function checklistProgress(checklist: EventChecklist): { done: number; total: number; percent: number } {
  const done = checklist.items.filter((item) => item.status === "done").length;
  const total = checklist.items.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function statusLabel(status: ChecklistItem["status"]): string {
  if (status === "done") return "완료";
  if (status === "in_progress") return "진행 중";
  if (status === "not_applicable") return "해당 없음";
  return "할 일";
}

export function checklistMarkdown(checklist: EventChecklist, format: "summary" | "full" | "share" = "summary"): string {
  const progress = checklistProgress(checklist);
  const pending = checklist.items.filter((item) => item.status !== "done" && item.status !== "not_applicable");
  const lines = [
    `# ${checklist.eventName} 안전 체크리스트`,
    `- 행사 키: ${checklist.eventKey}`,
    `- 행사일: ${checklist.eventDate ?? "미정"}`,
    `- 완료율: ${progress.percent}% (${progress.done}/${progress.total})`,
  ];

  if (format === "summary") {
    lines.push("", "## 미완료 항목", ...(pending.length > 0
      ? pending.slice(0, 10).map((item) => `- [ ] ${item.title}${item.assignee ? ` — ${item.assignee}` : ""}`)
      : ["- 모든 적용 항목을 완료했습니다."]));
    return lines.join("\n");
  }

  if (format === "share") {
    const assignees = new Map<string, ChecklistItem[]>();
    for (const item of checklist.items) {
      const assignee = item.assignee ?? "미배정";
      assignees.set(assignee, [...(assignees.get(assignee) ?? []), item]);
    }
    lines.push("", "## 미완료 항목", ...(pending.length > 0
      ? pending.map((item) => `- [ ] ${item.title} · ${item.assignee ?? "미배정"}${item.dueBy ? ` · ${item.dueBy}` : ""}`)
      : ["- 모든 적용 항목을 완료했습니다."]), "", "## 담당자별 현황");
    for (const [assignee, items] of assignees) {
      const done = items.filter((item) => item.status === "done").length;
      lines.push(`- ${assignee}: ${done}/${items.length} 완료`);
    }
    return lines.join("\n");
  }

  lines.push("", "## 전체 항목", ...checklist.items.map((item) => [
    `- [${item.status === "done" ? "x" : " "}] ${item.title}`,
    `  - 상태: ${statusLabel(item.status)} · 분류: ${item.category} · 근거 유형: ${item.basisType}`,
    `  - 담당자: ${item.assignee ?? "미배정"} · 기한: ${item.dueBy ?? "미정"}`,
    ...(item.note ? [`  - 메모: ${item.note}`] : []),
  ].join("\n")));
  return lines.join("\n");
}
