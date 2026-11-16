import type { Identity } from "./index";
export const workspaceViews = [
  "Overview",
  "Academic setup",
  "Academic calendar",
  "Attendance",
  "Exams & schemes",
  "Marks entry",
  "Policies",
  "Results & reports",
  "People & access",
  "Correction requests",
  "Audit history",
] as const;
export type WorkspaceView = (typeof workspaceViews)[number];
export function workspaceAccess(me: Identity, view: string) {
  const admin = me.roles.includes("ADMIN"),
    managed = me.managedSections.length > 0,
    teaching = me.teachingSections.length > 0;
  if (admin) return workspaceViews.includes(view as WorkspaceView);
  if (view === "Overview") return true;
  if (view === "Attendance") return me.attendanceSections.length > 0;
  if (
    ["Academic calendar", "Exams & schemes", "Results & reports"].includes(view)
  )
    return managed;
  if (view === "Marks entry") return managed || teaching;
  return false;
}
export const sectionLabel = (s: {
  name?: string;
  code?: string;
  year_label?: string;
  program_name?: string;
  level_name?: string;
}) =>
  [s.name, s.code, s.program_name, s.level_name, s.year_label]
    .filter(Boolean)
    .join(" · ");

export function validSchoolDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

export function normalizeNumericInput(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (c) =>
      String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)),
    )
    .replace(/٫/g, ".");
}
