import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const CHECKLIST_CATEGORIES = ["문서", "위험통제", "사전협의", "당일운영"] as const;
export const CHECKLIST_STATUSES = ["todo", "in_progress", "done", "not_applicable"] as const;

export type ChecklistCategory = typeof CHECKLIST_CATEGORIES[number];
export type ChecklistStatus = typeof CHECKLIST_STATUSES[number];
export type ChecklistBasisType = "법정 의무 후보" | "지자체 조례" | "행사장 규정" | "권장";

export interface ChecklistItem {
  id: string;
  title: string;
  category: ChecklistCategory;
  basisType: ChecklistBasisType;
  sourceRef?: string;
  status: ChecklistStatus;
  assignee?: string;
  dueBy?: string;
  note?: string;
  updatedAt: string;
}

export interface EventChecklist {
  eventKey: string;
  eventName: string;
  eventDate?: string;
  organizer?: string;
  createdAt: string;
  updatedAt: string;
  profile: Record<string, unknown>;
  items: ChecklistItem[];
}

const MAX_EVENTS = 200;
const events = new Map<string, EventChecklist>();
let loadedPath: string | null | undefined;

function storePath(): string | null {
  const value = process.env.EVENT_STORE_PATH?.trim();
  return value ? value : null;
}

function copyChecklist(checklist: EventChecklist): EventChecklist {
  return structuredClone(checklist);
}

function validChecklist(value: unknown): value is EventChecklist {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EventChecklist>;
  return typeof item.eventKey === "string"
    && typeof item.eventName === "string"
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string"
    && Array.isArray(item.items);
}

function touch(eventKey: string): void {
  const checklist = events.get(eventKey);
  if (!checklist) return;
  events.delete(eventKey);
  events.set(eventKey, checklist);
}

function enforceLimit(): void {
  while (events.size > MAX_EVENTS) {
    const oldestKey = events.keys().next().value as string | undefined;
    if (!oldestKey) return;
    events.delete(oldestKey);
  }
}

async function ensureLoaded(): Promise<void> {
  const path = storePath();
  if (loadedPath === path) return;
  events.clear();
  loadedPath = path;
  if (!path) return;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { events?: unknown[] } | unknown[];
    const storedEvents = Array.isArray(parsed) ? parsed : parsed.events ?? [];
    for (const checklist of storedEvents) {
      if (validChecklist(checklist)) events.set(checklist.eventKey, copyChecklist(checklist));
    }
    enforceLimit();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function persist(): Promise<void> {
  const path = storePath();
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ events: Array.from(events.values()) }, null, 2);
  await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

function slugPart(text: string): string {
  return text.normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createEventKey(eventName: string, eventDate?: string): string {
  const slug = slugPart(eventName) || "event";
  const date = eventDate ?? "date-tbd";
  const hash = createHash("sha256").update(`${eventName}\u0000${date}`).digest("hex").slice(0, 4);
  const base = `${slug}-${date}-${hash}`;
  if (!events.has(base)) return base;
  let suffix = 2;
  while (events.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function saveEventChecklist(input: Omit<EventChecklist, "eventKey" | "createdAt" | "updatedAt">): Promise<EventChecklist> {
  await ensureLoaded();
  const timestamp = new Date().toISOString();
  const checklist: EventChecklist = {
    ...copyChecklist(input as EventChecklist),
    eventKey: createEventKey(input.eventName, input.eventDate),
    createdAt: timestamp,
    updatedAt: timestamp,
    items: input.items.map((item) => ({ ...item, updatedAt: item.updatedAt || timestamp })),
  };
  events.set(checklist.eventKey, checklist);
  enforceLimit();
  await persist();
  return copyChecklist(checklist);
}

export async function getEventChecklist(eventKey: string): Promise<EventChecklist | undefined> {
  await ensureLoaded();
  const checklist = events.get(eventKey);
  if (!checklist) return undefined;
  touch(eventKey);
  return copyChecklist(checklist);
}

export async function updateStoredChecklistItem(
  eventKey: string,
  itemId: string,
  patch: Partial<Pick<ChecklistItem, "status" | "assignee" | "dueBy" | "note">>,
): Promise<EventChecklist | undefined> {
  await ensureLoaded();
  const checklist = events.get(eventKey);
  if (!checklist) return undefined;
  const item = checklist.items.find((candidate) => candidate.id === itemId);
  if (!item) return copyChecklist(checklist);
  const timestamp = new Date().toISOString();
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) Object.assign(item, { [key]: value });
  }
  item.updatedAt = timestamp;
  checklist.updatedAt = timestamp;
  touch(eventKey);
  await persist();
  return copyChecklist(checklist);
}

export async function reloadChecklistStore(): Promise<void> {
  loadedPath = undefined;
  await ensureLoaded();
}

export async function clearChecklistStore(): Promise<void> {
  await ensureLoaded();
  events.clear();
  await persist();
}

export function checklistStoreSize(): number {
  return events.size;
}
