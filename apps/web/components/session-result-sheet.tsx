"use client";

import { useI18n } from "./language";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@hikmah/api-client";
import {
  sheetCSV,
  orderedSheetStudents,
  sheetAttendance,
  sumMarks,
  type ResultSheetData,
  type SessionImportPreview,
} from "@hikmah/domain";
const api = createClient("", undefined, () =>
  window.dispatchEvent(new Event("hikmah-session-ended")),
);
const markLabel = (mark: { state: string; onLeave?: boolean } | undefined) =>
  mark?.onLeave
    ? "رخصت"
    : ((
        {
          ABSENT: "غائب",
          PENDING: "نامکمل",
          WITHHELD: "محفوظ",
          EXEMPT: "مستثنیٰ",
          UNKNOWN_LEGACY_BLANK: "غیر واضح",
        } as Record<string, string>
      )[mark?.state ?? "PENDING"] ?? "نامکمل");
export function SessionResultSheet({
  section,
  cycle,
  onImported,
}: {
  section: string;
  cycle: string;
  onImported: () => void;
}) {
  const { t } = useI18n();

  const [sheet, setSheet] = useState<ResultSheetData | null>(null),
    [source, setSource] = useState("AUTO"),
    [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [sheetError, setSheetError] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [csv, setCSV] = useState(""),
    [fileName, setFileName] = useState(""),
    [reason, setReason] = useState(""),
    [timing, setTiming] = useState(false),
    [ack, setAck] = useState(false);
  const [preview, setPreview] = useState<{
    data: SessionImportPreview;
    key: string;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    context = useRef(section + cycle);
  const operation = useRef(0),
    fileRead = useRef(0);
  const feedback = useRef<HTMLDivElement>(null),
    previewRegion = useRef<HTMLElement>(null);
  const path = `/v1/exam-cycles/${cycle}/sections/${section}`;
  const inputKey = JSON.stringify([section, cycle, csv, reason]);
  const current = preview?.key === inputKey ? preview.data : null;
  useEffect(() => {
    context.current = section + cycle;
    operation.current++;
    fileRead.current++;
    setBusy(false);
    setSource("AUTO");
    setCSV("");
    setFileName("");
    setReason("");
    setPreview(null);
    setAck(false);
    setError("");
    setSheetError("");
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }, [section, cycle]);
  useEffect(() => {
    if (!section || !cycle) return;
    const controller = new AbortController();
    setLoading(true);
    setSheetError("");
    setSheet(null);
    void api<ResultSheetData>(path + `/result-sheet?source=${source}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setSheet(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setSheetError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [section, cycle, source, refresh]);
  useEffect(() => {
    const target =
      error || message
        ? feedback.current
        : current
          ? previewRegion.current
          : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }, [error, message, current]);
  async function readFile(file: File | undefined) {
    const token = ++fileRead.current;
    setPreview(null);
    setCSV("");
    setAck(false);
    setError("");
    setMessage("");
    setFileName(file?.name ?? "");
    if (!file) return;
    const target = section + cycle;
    try {
      if (file.size > 500000)
        throw new Error("Choose a CSV file of at most 500 KB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (text.includes("\0"))
        throw new Error(
          "Save the spreadsheet as CSV UTF-8. Excel workbooks and UTF-16 files cannot be uploaded here.",
        );
      if (context.current === target && fileRead.current === token)
        setCSV(text);
    } catch (e) {
      if (context.current === target && fileRead.current === token)
        setError(
          (e as Error).message || "File could not be read as UTF-8 CSV.",
        );
    }
  }
  async function validate() {
    const request = ++operation.current;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setAck(false);
    try {
      if (!csv) throw new Error("Choose the completed marks CSV first.");
      if (reason.trim().length < 5)
        throw new Error("Enter a reason of at least five characters.");
      const data = await api<SessionImportPreview>(
        path + "/marks/import/preview",
        { method: "POST", body: JSON.stringify({ csv, reason }) },
      );
      if (operation.current === request) setPreview({ data, key: inputKey });
    } catch (e) {
      if (operation.current === request) setError((e as Error).message);
    } finally {
      if (operation.current === request) setBusy(false);
    }
  }
  async function apply() {
    if (!current) return;
    const request = ++operation.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ summary: { changedCells: number } }>(
        `/v1/session-mark-imports/${current.batchId}/apply`,
        { method: "POST", body: JSON.stringify({ acknowledgeOverwrite: ack }) },
      );
      if (operation.current !== request) return;
      setMessage(
        `${result.summary.changedCells} mark entries saved together. Review the working sheet, confirm exam timing, then submit and approve each paper before publication.`,
      );
      setPreview(null);
      setCSV("");
      setFileName("");
      setAck(false);
      if (fileInput.current) fileInput.current.value = "";
      setSource("LIVE");
      setRefresh((n) => n + 1);
      onImported();
    } catch (e) {
      if (operation.current === request) setError((e as Error).message);
    } finally {
      if (operation.current === request) setBusy(false);
    }
  }
  function downloadErrors() {
    if (!current) return;
    const text = sheetCSV([
      ["CSV row", "Paper", "Student number", "Issue"],
      ...current.errors.map((e) => [
        e.row || "File",
        e.column ?? "",
        e.studentNumber ?? "",
        e.message,
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "marks-validation-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  const snapshot = sheet?.snapshot;
  return (
    <section
      className="panel session-results-panel"
      aria-label={t("Session results sheet")}
    >
      <div className="panelhead">
        <div>
          <h2>{t("Session results sheet")}</h2>
          <p className="tiny">
            {t(
              "A complete class sheet with one column per paper, matching the institute’s Urdu report layout.",
            )}
          </p>
        </div>
        <span className="tag">
          {t(
            sheet?.source === "PUBLISHED"
              ? `Published · revision ${sheet.publication?.revision}`
              : "Working marks · draft",
          )}
        </span>
      </div>
      <div className="toolbar">
        <label>
          {t("Sheet source")}
          <select
            aria-label={t("Sheet source")}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setSheetError("");
            }}
          >
            <option value="AUTO">
              {t("Latest published, otherwise working marks")}
            </option>
            <option value="LIVE">{t("Working marks — draft")}</option>
            <option value="PUBLISHED">{t("Latest published revision")}</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => {
            setRefresh((v) => v + 1);
            setSheetError("");
          }}
        >
          {t("Refresh sheet")}
        </button>
        {sheet && (
          <>
            <a
              className="action-link"
              href={path + `/result-sheet.pdf?source=${sheet.source}`}
            >
              {t("Download session sheet PDF")}
            </a>
            <a
              className="action-link"
              href={path + `/result-sheet.csv?source=${sheet.source}`}
            >
              {t("Download session sheet CSV")}
            </a>
          </>
        )}
      </div>
      {sheetError && (
        <p role="alert" className="notice error">
          {t(sheetError)}
        </p>
      )}
      {loading && <p role="status">{t("Loading session sheet…")}</p>}
      {snapshot && (
        <>
          {sheet.source === "LIVE" && (
            <p className="notice">
              {t(
                "Draft — not an official result. Blank or unresolved marks remain distinct from zero. Publication still requires approved policies, a complete scheme, submitted attendance and reviewed papers.",
              )}
            </p>
          )}
          {sheet.source === "PUBLISHED" && (
            <p className="tiny">
              {t("These are the frozen marks from revision")}{" "}
              {t(sheet.publication?.revision)}
              {t(
                ". Working-mark changes appear under “Working marks — draft”. The",
              )}{" "}
              <a href={`/v1/results/${sheet.publication?.id}/sectionsheet.pdf`}>
                {t("original archived PDF")}
              </a>{" "}
              {t("remains available.")}
            </p>
          )}
          {sheet.source === "LIVE" && !!sheet.blockingErrors.length && (
            <details>
              <summary>
                {t("Publication checks (")}
                {t(sheet.blockingErrors.length)}
                {t(")")}
              </summary>
              <ul>
                {sheet.blockingErrors.map((error) => (
                  <li key={error}>{t(error)}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="session-sheet-title" dir="rtl">
            <strong>
              {snapshot.institute.name_ur ||
                snapshot.institute.official_display_name ||
                snapshot.institute.name}
            </strong>
            <span>
              {t("کشف الدرجات — ")}
              {snapshot.cycle.title} {t(" ·")}{" "}
              {t(snapshot.year.hijri_label || snapshot.year.label)}
            </span>
            <span>
              {snapshot.level?.name_ur ||
                snapshot.level?.name_en ||
                snapshot.section.name}{" "}
              {snapshot.program?.name && `(${snapshot.program.name})`} {t(" ·")}{" "}
              {snapshot.section.code}
            </span>
          </div>
          <div
            className="tablewrap session-sheet-scroll"
            dir="rtl"
            tabIndex={0}
            aria-label={t(
              "Urdu class result sheet. Scroll horizontally to see every paper.",
            )}
          >
            <table className="session-sheet-table" dir="rtl">
              <thead>
                <tr>
                  <th rowSpan={2} className="identity">
                    {t("نمبر شمار")}
                  </th>
                  <th rowSpan={2} className="identity">
                    {t("نام طالب علم")}
                  </th>
                  <th>{t("حاضری")}</th>
                  {snapshot.scheme.papers.map((p) => (
                    <th key={p.code}>
                      {t(p.label)}
                      <small dir="ltr">{p.code}</small>
                    </th>
                  ))}
                  <th>{t("مجموعہ")}</th>
                  <th>{t("فیصد")}</th>
                  <th rowSpan={2}>{t("تقدیر")}</th>
                  <th rowSpan={2}>{t("پوزیشن")}</th>
                </tr>
                <tr>
                  <th dir="ltr">{t("100%")}</th>
                  {snapshot.scheme.papers.map((p) => (
                    <th key={p.code} dir="ltr">
                      {t(p.max)}
                    </th>
                  ))}
                  <th dir="ltr">
                    {t(sumMarks(snapshot.scheme.papers.map((p) => p.max)))}
                  </th>
                  <th dir="ltr">{t("100%")}</th>
                </tr>
              </thead>
              <tbody>
                {orderedSheetStudents(snapshot.students).map((s) => {
                  const incomplete = !!s.errors?.length;
                  return (
                    <tr key={s.enrollmentId}>
                      <td dir="ltr">{s.roll}</td>
                      <td className="student-name">
                        {s.name}
                        <small dir="ltr">{s.studentNumber}</small>
                      </td>
                      <td dir="ltr">{t(sheetAttendance(s.attendance))}</td>
                      {snapshot.scheme.papers.map((p) => {
                        const m = s.marks[p.code],
                          graded = m?.state === "GRADED" && m.awarded != null;
                        return (
                          <td
                            key={p.code}
                            className={graded ? "" : "unresolved"}
                          >
                            {graded ? <bdi>{t(m.awarded)}</bdi> : markLabel(m)}
                          </td>
                        );
                      })}
                      <td>
                        <bdi>{t(s.total)}</bdi>
                        {incomplete && <small>{t("جزوی / Partial")}</small>}
                      </td>
                      <td className="derived">
                        <bdi>
                          {t(incomplete ? "—" : (s.displayPercent ?? "—"))}
                        </bdi>
                      </td>
                      <td className="derived">
                        {t(incomplete ? "—" : (s.grade ?? "—"))}
                      </td>
                      <td>
                        {t(
                          incomplete
                            ? "—"
                            : s.rank === 1
                              ? "اول"
                              : s.rank === 2
                                ? "دوم"
                                : s.rank === 3
                                  ? "سوم"
                                  : (s.rank ?? "—"),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tiny">
            {t(
              "Red cells show explicit missing/absence/leave states. A numeric zero is a graded score. Attendance is listed separately from exam marks. Grades and positions follow approved institute policies.",
            )}
          </p>
        </>
      )}
      <details className="session-import" open>
        <summary>{t("Upload class marks from CSV")}</summary>
        <p>
          {t(
            "Download this class/session’s template, enter marks in its paper columns, save as ",
          )}
          <strong>{t("CSV UTF-8")}</strong>
          {t(
            ", then upload it here. Students, roll numbers and attendance are already filled in. Leave reference rows, names and paper headings unchanged.",
          )}
        </p>
        <div className="toolbar">
          <a
            className="action-link"
            href={
              path +
              `/marks/template.csv?timing=${timing ? "include" : "preserve"}`
            }
          >
            {t("Download blank marks CSV")}
          </a>
          <label className="check-label">
            <input
              type="checkbox"
              checked={timing}
              onChange={(e) => setTiming(e.target.checked)}
            />
            {t("Include exam leave and on-time columns")}
          </label>
        </div>
        <p className="tiny">
          {t(
            "Blank marks keep existing values. Use 0 for an actual zero. Allowed status words: ABSENT, PENDING, WITHHELD, EXEMPT, LEAVE. Timing is preserved unless included and explicitly edited; new marks do not automatically count as on time. Total, percentage, grade and position are always calculated by the system.",
          )}
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void validate();
          }}
        >
          <div className="gridform">
            <label>
              {t("Completed marks CSV")}
              <input
                ref={fileInput}
                aria-label={t("Completed marks CSV")}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </label>
            <label>
              {t("Import reason")}
              <input
                value={reason}
                disabled={busy}
                minLength={5}
                maxLength={1000}
                required
                placeholder={t("For example, reviewed Shash Mahi marks entry")}
                onChange={(e) => {
                  setReason(e.target.value);
                  setAck(false);
                }}
              />
            </label>
          </div>
          {fileName && (
            <p className="tiny">
              {t("Selected file: ")}
              {t(fileName)} {t(" · Maximum 500 KB")}
            </p>
          )}
          <button disabled={busy || !csv}>
            {t(busy ? "Working…" : "Validate uploaded CSV")}
          </button>
        </form>
        <div ref={feedback} tabIndex={-1}>
          {error && (
            <p role="alert" className="notice error">
              {t(error)}
            </p>
          )}
          {message && (
            <p role="status" className="notice success">
              {t(message)}
            </p>
          )}
          {busy && <p role="status">{t("Working… please wait.")}</p>}
        </div>
        {current && (
          <section
            ref={previewRegion}
            tabIndex={-1}
            className="session-import-preview"
            aria-label={t("Marks import preview")}
          >
            <h3>
              {t(
                current.canApply
                  ? "Ready for your review"
                  : "Fix the validation issues before importing",
              )}
            </h3>
            <div className="toolbar">
              <span className="tag">
                {t(current.summary.changedCells)} {t(" changed entries")}
              </span>
              <span className="tag">
                {t(current.summary.students)} {t(" students")}
              </span>
              <span className="tag">
                {t(current.summary.papers)} {t(" papers")}
              </span>
              <span className="tag">
                {t(current.summary.overwrites)}{" "}
                {t(" existing entries replaced")}
              </span>
              <span className="tag">
                {t(current.summary.blankCells)} {t(" blank cells preserved")}
              </span>
            </div>
            {!!current.errors.length && (
              <>
                <div className="notice error">
                  <ul>
                    {current.errors.slice(0, 100).map((e, i) => (
                      <li key={i}>
                        {t(e.row ? `Row ${e.row}` : "File")}
                        {e.studentNumber ? ` · ${e.studentNumber}` : ""}
                        {t(e.column ? ` · ${e.column}` : "")}
                        {t(": ")}
                        {t(e.message)}
                      </li>
                    ))}
                  </ul>
                  {current.errors.length > 100 && (
                    <p>
                      {t(
                        "Showing the first 100 issues. Download the complete error list.",
                      )}
                    </p>
                  )}
                </div>
                <button className="secondary" onClick={downloadErrors}>
                  {t("Download validation errors CSV")}
                </button>
              </>
            )}
            {!!current.warnings.length && (
              <ul className="tiny">
                {current.warnings.map((w) => (
                  <li key={w}>{t(w)}</li>
                ))}
              </ul>
            )}
            {!!current.changes.length && (
              <div className="tablewrap" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>{t("Student")}</th>
                      <th>{t("Paper")}</th>
                      <th>{t("Before")}</th>
                      <th>{t("After")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.changes.map((c, i) => (
                      <tr key={i}>
                        <td>
                          {c.name}
                          <small>{c.studentNumber}</small>
                        </td>
                        <td>{t(c.paperCode)}</td>
                        <td>{t(c.before)}</td>
                        <td>{t(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {current.summary.changedCells > current.changes.length && (
                  <p className="tiny">
                    {t("Showing the first ")}
                    {t(current.changes.length)} {t(" of")}{" "}
                    {t(current.summary.changedCells)}{" "}
                    {t(
                      " changes. Every validated change is included when applying.",
                    )}
                  </p>
                )}
              </div>
            )}
            {current.summary.overwrites > 0 && (
              <label className="check-label session-import-ack">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                {t("I reviewed and approve replacing the")}{" "}
                {t(current.summary.overwrites)}{" "}
                {t(" existing mark entries shown in this preview.")}
              </label>
            )}
            <button
              disabled={
                busy ||
                !current.canApply ||
                (current.summary.overwrites > 0 && !ack)
              }
              onClick={() => void apply()}
            >
              {t(busy ? "Applying…" : "Apply validated marks")}
            </button>
            <p className="tiny">
              {t(
                "All validated changes save together. Importing does not submit papers, approve marks or publish results.",
              )}
            </p>
          </section>
        )}
      </details>
    </section>
  );
}
