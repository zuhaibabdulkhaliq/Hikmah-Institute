import { z } from "zod";
// ISO dates are compared as dates, without browser/host timezone conversion.
const date = z.iso.date();
const common = {
  sectionIds: z.array(z.uuid()).min(1).max(100),
  from: date,
  through: date,
  reason: z.string().trim().min(5).max(1000),
};
export const calendarChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("WEEKLY"),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  }),
  z.object({
    ...common,
    kind: z.literal("EXCEPTION"),
    dayType: z.enum(["HOLIDAY", "TEACHING", "NO_ATTENDANCE"]),
    note: z.string().trim().min(1).max(200),
  }),
  z.object({ ...common, kind: z.literal("RESTORE") }),
]);
export const calendarApplySchema = calendarChangeSchema.and(
  z.object({
    previewHash: z.string().length(64),
    acknowledgeRecordedChanges: z.boolean().default(false),
  }),
);
export type CalendarChange = z.infer<typeof calendarChangeSchema>;
export type CalendarSection = {
  id: string;
  name: string;
  code: string;
  academic_year_id: string;
  program_id: string;
  level_id: string;
  year_label: string;
  year_state: string;
  year_start: string;
  year_end: string;
  program_name: string;
  level_name: string;
  calendar_version: number;
  configured_days: number;
  patterns: CalendarPattern[];
};
export type CalendarPattern = {
  id: string;
  starts_on: string;
  ends_on: string;
  weekdays: number[];
};
export type CalendarDate = {
  date: string;
  isInstructional: boolean;
  countsForAttendance: boolean;
  note: string;
  source: "EXCEPTION" | "WEEKLY" | "EXISTING" | "UNCONFIGURED";
  sheetState: string | null;
};
export type AcademicCalendar = {
  version: number;
  patterns: CalendarPattern[];
  days: CalendarDate[];
};
export type CalendarPreview = {
  hash: string;
  from: string;
  through: string;
  sections: {
    id: string;
    name: string;
    version: number;
    academicDays: number;
    changedDates: number;
    addedAcademicDays: number;
    removedAcademicDays: number;
    preservedExceptions: number;
    recordedDatesAffected: number;
  }[];
};
