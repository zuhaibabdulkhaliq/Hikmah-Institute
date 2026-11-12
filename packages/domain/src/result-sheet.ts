import { z } from "zod";
export const sessionMarksPreviewSchema = z.object({
  csv: z.string().min(1).max(500000),
  reason: z.string().trim().min(5).max(1000),
});
export const sessionMarksApplySchema = z.object({
  acknowledgeOverwrite: z.boolean().default(false),
});
export type SheetPaper = {
  id: string;
  code: string;
  label: string;
  max: number;
};
export type SheetStudent = {
  enrollmentId: string;
  studentNumber: string;
  roll: string;
  name: string;
  marks: Record<
    string,
    {
      state: string;
      awarded: number | null;
      onLeave?: boolean;
      onTime?: boolean | null;
    }
  >;
  total: number;
  possible: number;
  displayPercent: string | null;
  grade: string | null;
  rank: number | null;
  passing?: boolean | null;
  errors?: string[];
  attendance: {
    displayPercent?: string | null;
    percent?: string | null;
    complete?: boolean;
    unmarked?: number;
  } | null;
};
export type ResultSheetData = {
  source: "LIVE" | "PUBLISHED";
  publication: { id: string; revision: number } | null;
  blockingErrors: string[];
  snapshot: {
    institute: {
      name: string;
      name_ur?: string;
      official_display_name?: string;
    };
    year: { label: string; hijri_label?: string };
    section: { name: string; code: string };
    program?: { name: string };
    level?: { name_ur?: string; name_en: string };
    cycle: { title: string; code: string };
    scheme: { papers: SheetPaper[] };
    students: SheetStudent[];
    policy: unknown;
    revision?: number;
    publishedAt?: string;
    asOf?: string;
    draft?: boolean;
    formattedCopy?: boolean;
    templateVersion?: string;
  };
};
export type SessionImportPreview = {
  batchId: string;
  canApply: boolean;
  summary: {
    changedCells: number;
    overwrites: number;
    students: number;
    papers: number;
    blankCells: number;
    unchangedCells: number;
  };
  errors: {
    row: number;
    column?: string;
    studentNumber?: string;
    message: string;
  }[];
  warnings: string[];
  changes: {
    studentNumber: string;
    name: string;
    paperCode: string;
    before: string;
    after: string;
  }[];
  publishedRevision: number | null;
};
export const paperHeading = (paper: SheetPaper) =>
  `${paper.label} [${paper.code} / ${paper.max}]`;
export const sheetIdentityHeaders = [
  "student_number",
  "نمبر شمار",
  "نام طالب علم",
  "حاضری %",
];
export const sheetComputedHeaders = ["مجموعہ", "فیصد", "تقدیر", "پوزیشن"];
export function sheetAttendance(attendance: SheetStudent["attendance"]) {
  return (
    attendance?.displayPercent ??
    attendance?.percent ??
    (attendance?.unmarked || attendance?.complete === false
      ? "INCOMPLETE"
      : "N/A")
  );
}
export function orderedSheetStudents(students: SheetStudent[]) {
  const order = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return [...students].sort(
    (a, b) =>
      order.compare(a.roll, b.roll) ||
      order.compare(a.studentNumber, b.studentNumber),
  );
}
// The same escaped text is used to compare protected fields on re-import.
export function spreadsheetText(value: unknown) {
  const s = String(value ?? "");
  return /^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s;
}
export function sheetCSV(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (value) => '"' + spreadsheetText(value).replaceAll('"', '""') + '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function sheetMetadata(snapshot: ResultSheetData["snapshot"]) {
  return [
    [
      "ادارہ / Institute",
      snapshot.institute.name_ur ||
        snapshot.institute.official_display_name ||
        snapshot.institute.name,
    ],
    ["تعلیمی سال / Academic year", snapshot.year.label],
    [
      "درجہ / پروگرام / شعبہ",
      [
        snapshot.level?.name_ur || snapshot.level?.name_en,
        snapshot.program?.name,
        snapshot.section.name,
        snapshot.section.code,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    ["امتحان / Exam session", snapshot.cycle.title],
  ];
}
export function resultSheetCSV(snapshot: ResultSheetData["snapshot"]) {
  const papers = snapshot.scheme.papers;
  return sheetCSV([
    ["HIKMAH_RESULT_SHEET", "2", snapshot.revision ?? "DRAFT"],
    ...sheetMetadata(snapshot),
    [
      "Status",
      snapshot.draft
        ? "DRAFT — not an official publication"
        : "Published snapshot; original archived PDF remains available",
    ],
    [
      ...sheetIdentityHeaders,
      ...papers.map(paperHeading),
      ...sheetComputedHeaders,
    ],
    ...orderedSheetStudents(snapshot.students).map((s) => [
      s.studentNumber,
      s.roll,
      s.name,
      sheetAttendance(s.attendance),
      ...papers.map((p) => {
        const m = s.marks[p.code];
        return m?.state === "GRADED"
          ? m.awarded
          : m?.onLeave
            ? "LEAVE"
            : (m?.state ?? "PENDING");
      }),
      s.total,
      s.errors?.length ? "INCOMPLETE" : (s.displayPercent ?? "N/A"),
      s.errors?.length ? "UNRESOLVED" : (s.grade ?? "UNAPPROVED"),
      s.errors?.length ? "—" : (s.rank ?? "—"),
    ]),
  ]);
}
