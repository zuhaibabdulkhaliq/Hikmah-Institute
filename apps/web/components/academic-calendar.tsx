"use client";

import { useI18n } from "./language";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@hikmah/api-client";
import type {
  AcademicCalendar,
  CalendarChange,
  CalendarPreview,
  CalendarSection,
  CalendarDate,
} from "@hikmah/domain";
const api = createClient("", undefined, () =>
  window.dispatchEvent(new Event("hikmah-session-ended")),
);
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const labelDate = (language: string, date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString(
    language === "ur" ? "ur-PK" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );
const dayClass = (day: CalendarDate) =>
  day.source === "UNCONFIGURED"
    ? "unconfigured"
    : day.countsForAttendance
      ? "teaching"
      : day.isInstructional
        ? "no-attendance"
        : "holiday";

export function AcademicCalendarPage({
  today,
  onAttendance,
}: {
  today: string;
  onAttendance: (section: string) => void;
}) {
  const { t, language } = useI18n();

  const [sections, setSections] = useState<CalendarSection[]>([]);
  const [year, setYear] = useState("");
  const [program, setProgram] = useState("");
  const [level, setLevel] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [viewSection, setViewSection] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [calendar, setCalendar] = useState<AcademicCalendar | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<CalendarChange["kind"]>("WEEKLY");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [confirmClosed, setConfirmClosed] = useState(false);
  const [dayType, setDayType] = useState<
    "HOLIDAY" | "TEACHING" | "NO_ATTENDANCE"
  >("HOLIDAY");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{
    data: CalendarPreview;
    change: CalendarChange;
    key: string;
  } | null>(null);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<CalendarSection[]>("/v1/calendars", { signal: controller.signal })
      .then((s) => {
        setSections(s);
        setYear((current) =>
          s.some((x) => x.academic_year_id === current)
            ? current
            : ((s.find((x) => x.year_state === "ACTIVE") ?? s[0])
                ?.academic_year_id ?? ""),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  const yearSections = sections.filter((s) => s.academic_year_id === year);
  const filtered = useMemo(
    () =>
      sections.filter(
        (s) =>
          s.academic_year_id === year &&
          (!program || s.program_id === program) &&
          (!level || s.level_id === level),
      ),
    [sections, year, program, level],
  );
  const filterKey = filtered.map((s) => s.id).join(",");
  const yearInfo = yearSections[0];
  const editable =
    yearInfo && ["ACTIVE", "PLANNED"].includes(yearInfo.year_state);
  const viewed = sections.find((s) => s.id === viewSection);
  useEffect(() => {
    setSelected(
      filtered
        .filter((s) => ["ACTIVE", "PLANNED"].includes(s.year_state))
        .map((s) => s.id),
    );
    setViewSection((current) =>
      filtered.some((s) => s.id === current)
        ? current
        : (filtered[0]?.id ?? ""),
    );
    const patterns = filtered.map(
      (s) =>
        s.patterns.find(
          (p) =>
            p.starts_on <= (from || s.year_start) &&
            p.ends_on >= (from || s.year_start),
        )?.weekdays,
    );
    setDays(
      patterns.length &&
        patterns[0] &&
        patterns.every((p) => JSON.stringify(p) === JSON.stringify(patterns[0]))
        ? patterns[0]
        : [],
    );
  }, [filterKey]);
  useEffect(() => setConfirmClosed(false), [days.join(","), filterKey]);
  useEffect(() => {
    if (!yearInfo) return;
    setFrom(yearInfo.year_start);
    setThrough(yearInfo.year_end);
    const date =
      today < yearInfo.year_start
        ? yearInfo.year_start
        : today > yearInfo.year_end
          ? yearInfo.year_end
          : today;
    setMonth(date.slice(0, 7));
  }, [year, yearInfo?.year_start, yearInfo?.year_end, today]);
  useEffect(() => {
    if (!viewed || !month) return;
    const controller = new AbortController();
    const [y, m] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const start =
      month + "-01" > viewed.year_start ? month + "-01" : viewed.year_start;
    const end = monthEnd < viewed.year_end ? monthEnd : viewed.year_end;
    setCalendar(null);
    if (start > end) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<AcademicCalendar>(
      `/v1/sections/${viewed.id}/academic-calendar?from=${start}&through=${end}`,
      { signal: controller.signal },
    )
      .then(setCalendar)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [viewSection, month, reload, viewed?.year_start, viewed?.year_end]);
  const change: CalendarChange =
    kind === "WEEKLY"
      ? { kind, sectionIds: selected, from, through, weekdays: days, reason }
      : kind === "EXCEPTION"
        ? { kind, sectionIds: selected, from, through, dayType, note, reason }
        : { kind, sectionIds: selected, from, through, reason };
  const changeKey = JSON.stringify(change);
  const currentPreview = preview?.key === changeKey ? preview : null;
  const recorded =
    currentPreview?.data.sections.reduce(
      (n, s) => n + s.recordedDatesAffected,
      0,
    ) ?? 0;
  async function previewChange() {
    setError("");
    setMessage("");
    setBusy(true);
    setAck(false);
    setPreview(null);
    try {
      if (!selected.length)
        throw new Error("Select at least one section to update.");
      if (selected.length > 100)
        throw new Error("Apply to at most 100 sections at a time.");
      if (!from || !through || from > through)
        throw new Error("Choose a valid start and end date.");
      if (reason.trim().length < 5)
        throw new Error("Enter a change reason of at least five characters.");
      if (kind === "WEEKLY" && !days.length && !confirmClosed)
        throw new Error(
          "Select teaching weekdays, or confirm this range has no ordinary teaching days.",
        );
      if (kind === "EXCEPTION" && !note.trim())
        throw new Error("Give the holiday or exception a name.");
      const data = await api<CalendarPreview>("/v1/calendars/preview", {
        method: "POST",
        body: JSON.stringify(change),
      });
      setPreview({ data, change, key: changeKey });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!currentPreview) return;
    setBusy(true);
    setError("");
    try {
      await api("/v1/calendars/apply", {
        method: "POST",
        body: JSON.stringify({
          ...currentPreview.change,
          previewHash: currentPreview.data.hash,
          acknowledgeRecordedChanges: ack,
        }),
      });
      setMessage(
        `Calendar updated for ${currentPreview.data.sections.length} section(s). Attendance records and published reports were retained.`,
      );
      setPreview(null);
      setAck(false);
      setReload((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectDate(day: CalendarDate) {
    setKind("EXCEPTION");
    setFrom(day.date);
    setThrough(day.date);
    setDayType(
      day.source === "UNCONFIGURED" || !day.isInstructional
        ? "HOLIDAY"
        : day.countsForAttendance
          ? "TEACHING"
          : "NO_ATTENDANCE",
    );
    setNote(day.source === "EXCEPTION" ? day.note : "");
    setPreview(null);
    setAck(false);
  }
  function moveMonth(amount: number) {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + amount, 1))
      .toISOString()
      .slice(0, 7);
    if (
      viewed &&
      next >= viewed.year_start.slice(0, 7) &&
      next <= viewed.year_end.slice(0, 7)
    )
      setMonth(next);
  }
  const monthDates = useMemo(() => {
    if (!month) return [];
    const [y, m] = month.split("-").map(Number),
      start = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [
      ...Array.from({ length: start }, () => null),
      ...Array.from(
        { length },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      ),
    ];
  }, [month]);
  const dayMap = new Map(calendar?.days.map((d) => [d.date, d]) ?? []);
  const unique = (
    list: CalendarSection[],
    key: "academic_year_id" | "program_id" | "level_id",
  ) => [...new Map(list.map((s) => [s[key], s])).values()];
  return (
    <div className="academic-calendar-page">
      <section className="panel calendar-intro">
        <div>
          <span className="eyebrow">{t("EVERY CLASS HAS ITS OWN RHYTHM")}</span>
          <h2>{t("Plan the days that count.")}</h2>
          <p>
            {t(
              "Set any combination of teaching weekdays for each program, level and section. Add holidays, vacations and extra classes without losing your weekly schedule.",
            )}
          </p>
        </div>
        <div className="calendar-intro-badge">
          <strong>{t("0–7")}</strong>
          <span>{t("teaching days per week")}</span>
        </div>
      </section>
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
      <section className="panel">
        <div className="panelhead">
          <h2>{t("Choose your classes")}</h2>
          <span className="tag">
            {t(selected.length)} {t(" selected")}
          </span>
        </div>
        <div className="calendar-filters">
          <label>
            {t("Academic year")}
            <select
              aria-label={t("Academic year")}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setProgram("");
                setLevel("");
              }}
            >
              {unique(sections, "academic_year_id").map((s) => (
                <option key={s.academic_year_id} value={s.academic_year_id}>
                  {s.year_label} {t(" · ")}
                  {t(s.year_state)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Program")}
            <select
              aria-label={t("Program")}
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                setLevel("");
              }}
            >
              <option value="">{t("All programs")}</option>
              {unique(yearSections, "program_id").map((s) => (
                <option key={s.program_id} value={s.program_id}>
                  {s.program_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Class level")}
            <select
              aria-label={t("Class level")}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">{t("All levels")}</option>
              {unique(
                yearSections.filter(
                  (s) => !program || s.program_id === program,
                ),
                "level_id",
              ).map((s) => (
                <option key={s.level_id} value={s.level_id}>
                  {s.level_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="tiny">
          {t(
            "Filters select the matching sections below. Uncheck any section that should keep a different schedule. New sections are configured explicitly.",
          )}
        </p>
        {!!filtered.length && (
          <div className="toolbar">
            <button
              type="button"
              className="secondary"
              disabled={!editable}
              onClick={() => setSelected(filtered.map((s) => s.id))}
            >
              {t("Select all shown")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected([])}
            >
              {t("Clear selection")}
            </button>
          </div>
        )}
        <div className="calendar-sections">
          {filtered.map((s) => {
            const pattern = s.patterns.find(
              (p) => p.starts_on <= from && p.ends_on >= from,
            );
            return (
              <label
                key={s.id}
                className={`calendar-section-card ${selected.includes(s.id) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={`Apply changes to ${s.name} ${s.code}`}
                  disabled={!editable}
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>
                  <strong>
                    {s.name} {t(" · ")}
                    {s.code}
                  </strong>
                  <small>
                    {s.program_name} {t(" · ")}
                    {s.level_name}
                  </small>
                  <small>
                    {t(
                      pattern
                        ? pattern.weekdays.length
                          ? pattern.weekdays.map((d) => weekdays[d]).join(" · ")
                          : "No teaching weekdays"
                        : s.configured_days
                          ? "Existing calendar · weekly schedule not saved"
                          : "Calendar not configured",
                    )}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        {!filtered.length && (
          <p>
            {t(
              "No sections match these filters. Create sections in Academic setup first.",
            )}
          </p>
        )}
        {yearInfo && !editable && (
          <p className="notice">
            {t("This academic year is ")}
            {t(yearInfo.year_state.toLowerCase())}
            {t(
              ". Its calendar is available for viewing; an administrator must reopen the year before editing.",
            )}
          </p>
        )}
      </section>
      {!!filtered.length && (
        <div className="calendar-workspace">
          <section className="panel calendar-month-panel">
            <div className="panelhead">
              <h2>{t("Calendar at a glance")}</h2>
              {viewed && (
                <button
                  className="secondary"
                  onClick={() => onAttendance(viewed.id)}
                >
                  {t("Take attendance")}
                </button>
              )}
            </div>
            <label>
              {t("View section")}
              <select
                aria-label={t("View section")}
                value={viewSection}
                onChange={(e) => setViewSection(e.target.value)}
              >
                {filtered.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {t(" · ")}
                    {s.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="calendar-month-controls">
              <button
                className="secondary"
                aria-label={t("Previous calendar month")}
                disabled={!viewed || month <= viewed.year_start.slice(0, 7)}
                onClick={() => moveMonth(-1)}
              >
                {t("←")}
              </button>
              <label>
                {t("Month")}
                <input
                  type="month"
                  value={month}
                  min={viewed?.year_start.slice(0, 7)}
                  max={viewed?.year_end.slice(0, 7)}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </label>
              <button
                className="secondary"
                aria-label={t("Next calendar month")}
                disabled={!viewed || month >= viewed.year_end.slice(0, 7)}
                onClick={() => moveMonth(1)}
              >
                {t("→")}
              </button>
            </div>
            <div className="calendar-legend">
              <span className="teaching">{t("Academic day")}</span>
              <span className="holiday">{t("Day off / holiday")}</span>
              <span className="no-attendance">{t("No attendance")}</span>
              <span className="unconfigured">{t("Not configured")}</span>
            </div>
            {loading && <p role="status">{t("Loading calendar…")}</p>}
            <div
              className="calendar-month-grid"
              aria-label={t("Monthly academic calendar")}
            >
              {weekdays.map((d) => (
                <span key={d} className="calendar-week-heading">
                  {t(d)}
                </span>
              ))}
              {monthDates.map((date, i) => {
                if (!date) return <span key={`blank${i}`} />;
                const day = dayMap.get(date);
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!day || !editable || loading}
                    className={`calendar-day ${day ? dayClass(day) : "outside-year"} ${date === today ? "today" : ""}`}
                    aria-label={t(
                      `${labelDate(language, date)}: ${day?.note ?? "Outside academic year"}`,
                    )}
                    title={t(
                      day
                        ? `${day.note}${day.sheetState ? ` · ${day.sheetState}` : ""}`
                        : "Outside academic year",
                    )}
                    onClick={() => day && selectDate(day)}
                  >
                    <strong>{t(Number(date.slice(8)))}</strong>
                    {day?.source === "EXCEPTION" && (
                      <span
                        className="calendar-exception-dot"
                        aria-label={t("Exception")}
                      >
                        {t("•")}
                      </span>
                    )}
                    {day?.sheetState && (
                      <small aria-label={t("Attendance saved")}>{t("✓")}</small>
                    )}
                  </button>
                );
              })}
            </div>
            {calendar && (
              <p className="tiny">
                {t(calendar.days.filter((d) => d.countsForAttendance).length)}{" "}
                {t("academic days ·")}{" "}
                {t(
                  calendar.days.filter((d) => d.source === "UNCONFIGURED")
                    .length,
                )}{" "}
                {t(
                  "unconfigured dates in this month. Click a date to prepare an exception; the selected class checkboxes control where it is applied.",
                )}
              </p>
            )}
            {!!calendar?.patterns.length && (
              <details>
                <summary>{t("Saved weekly schedules for this month")}</summary>
                {calendar.patterns.map((p) => (
                  <div className="calendar-saved-rule" key={p.id}>
                    <span>
                      <strong>
                        {t(
                          p.weekdays.length
                            ? p.weekdays.map((d) => weekdays[d]).join(", ")
                            : "No teaching weekdays",
                        )}
                      </strong>
                      <small>
                        {t(labelDate(language, p.starts_on))} {t(" – ")}
                        {t(labelDate(language, p.ends_on))}
                      </small>
                    </span>
                    <button
                      className="secondary"
                      disabled={!editable}
                      onClick={() => {
                        setKind("WEEKLY");
                        setFrom(p.starts_on);
                        setThrough(p.ends_on);
                        setDays(p.weekdays);
                      }}
                    >
                      {t("Edit schedule")}
                    </button>
                  </div>
                ))}
              </details>
            )}
            {!!calendar?.days.some((d) => d.source === "EXCEPTION") && (
              <details>
                <summary>{t("Holidays & exceptions this month")}</summary>
                <div className="calendar-exception-list">
                  {calendar.days
                    .filter((d) => d.source === "EXCEPTION")
                    .map((d) => (
                      <div className="calendar-saved-rule" key={d.date}>
                        <span>
                          <strong>{t(d.note)}</strong>
                          <small>{t(labelDate(language, d.date))}</small>
                        </span>
                        <button
                          className="secondary"
                          disabled={!editable}
                          aria-label={t(
                            `Restore weekly schedule for ${d.date}`,
                          )}
                          onClick={() => {
                            setKind("RESTORE");
                            setFrom(d.date);
                            setThrough(d.date);
                          }}
                        >
                          {t("Restore")}
                        </button>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </section>
          <section className="panel calendar-editor">
            <div className="panelhead">
              <h2>{t("Edit selected calendars")}</h2>
              <span className="tag">
                {t(selected.length)} {t(" section(s)")}
              </span>
            </div>
            <div
              className="calendar-modes"
              role="group"
              aria-label={t("Calendar change type")}
            >
              {(
                [
                  ["WEEKLY", "Weekly schedule"],
                  ["EXCEPTION", "Holiday / extra day"],
                  ["RESTORE", "Restore schedule"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  className={kind === value ? "active" : "secondary"}
                  onClick={() => setKind(value)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void previewChange();
              }}
            >
              <fieldset disabled={!editable || busy}>
                <legend>
                  {t(
                    kind === "WEEKLY"
                      ? "Choose the teaching week"
                      : kind === "EXCEPTION"
                        ? "One date or a whole vacation"
                        : "Remove exceptions in this range",
                  )}
                </legend>
                <div className="calendar-date-range">
                  <label>
                    {t("Effective from")}
                    <input
                      type="date"
                      value={from}
                      min={yearInfo?.year_start}
                      max={yearInfo?.year_end}
                      required
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Through")}
                    <input
                      type="date"
                      value={through}
                      min={from || yearInfo?.year_start}
                      max={yearInfo?.year_end}
                      required
                      onChange={(e) => setThrough(e.target.value)}
                    />
                  </label>
                </div>
                {kind === "WEEKLY" && (
                  <>
                    <label>
                      {t("Copy a saved schedule")}
                      <select
                        aria-label={t("Copy a saved schedule")}
                        defaultValue=""
                        onChange={(e) => {
                          const [sid, pid] = e.target.value.split(":");
                          const p = sections
                            .find((s) => s.id === sid)
                            ?.patterns.find((p) => p.id === pid);
                          if (p) setDays(p.weekdays);
                          e.target.value = "";
                        }}
                      >
                        <option value="">
                          {t("Choose a schedule to copy…")}
                        </option>
                        {sections.flatMap((s) =>
                          s.patterns.map((p) => (
                            <option key={p.id} value={`${s.id}:${p.id}`}>
                              {s.program_name} {t(" · ")}
                              {s.level_name} {t(" · ")}
                              {s.code}
                              {t(":")}{" "}
                              {t(
                                p.weekdays.map((d) => weekdays[d]).join(", ") ||
                                  "Closed",
                              )}{" "}
                              {t("(")}
                              {t(p.starts_on)} {t(" – ")}
                              {t(p.ends_on)}
                              {t(")")}
                            </option>
                          )),
                        )}
                      </select>
                    </label>
                    <div
                      className="calendar-weekdays"
                      role="group"
                      aria-label={t("Teaching weekdays")}
                    >
                      {longDays.map((name, i) => (
                        <label
                          key={name}
                          className={days.includes(i) ? "chosen" : ""}
                        >
                          <input
                            type="checkbox"
                            aria-label={t(name)}
                            checked={days.includes(i)}
                            onChange={(e) =>
                              setDays((values) =>
                                e.target.checked
                                  ? [...values, i].sort()
                                  : values.filter((d) => d !== i),
                              )
                            }
                          />
                          <span>{t(weekdays[i])}</span>
                        </label>
                      ))}
                    </div>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
                      >
                        {t("All seven days")}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDays([])}
                      >
                        {t("Clear weekdays")}
                      </button>
                      <span className="tag">
                        {t(days.length)} {t(" days / week")}
                      </span>
                    </div>
                    <p className="tiny">
                      {t(
                        "The schedule changes only this date range. Saved holidays and extra days stay in place. Zero selected weekdays closes the range except explicit extra teaching days.",
                      )}
                    </p>
                    {!days.length && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={confirmClosed}
                          onChange={(e) => setConfirmClosed(e.target.checked)}
                        />
                        {t(
                          "No ordinary teaching days in this range; keep only explicit extra teaching days.",
                        )}
                      </label>
                    )}
                  </>
                )}
                {kind === "EXCEPTION" && (
                  <>
                    <label>
                      {t("Day type")}
                      <select
                        aria-label={t("Day type")}
                        value={dayType}
                        onChange={(e) =>
                          setDayType(e.target.value as typeof dayType)
                        }
                      >
                        <option value="HOLIDAY">
                          {t("Holiday / closed — no attendance")}
                        </option>
                        <option value="TEACHING">
                          {t("Extra teaching day — attendance counts")}
                        </option>
                        <option value="NO_ATTENDANCE">
                          {t("Teaching / event — attendance not counted")}
                        </option>
                      </select>
                    </label>
                    <label>
                      {t("Holiday or exception name")}
                      <input
                        value={note}
                        maxLength={200}
                        required
                        placeholder={t(
                          "For example, winter vacation or make-up class",
                        )}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <p className="tiny">
                      {t(
                        "The exception takes priority over the weekly schedule for every date in this range.",
                      )}
                    </p>
                  </>
                )}
                {kind === "RESTORE" && (
                  <p>
                    {t(
                      "Remove holiday or extra-day exceptions in this range and return to the saved weekly schedule. A weekly schedule must exist for each exception being restored.",
                    )}
                  </p>
                )}
                <label>
                  {t("Reason for change")}
                  <input
                    value={reason}
                    required
                    minLength={5}
                    maxLength={1000}
                    placeholder={t("For example, revised Shaam timetable")}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="login-submit"
                  disabled={!selected.length || busy}
                >
                  {t(busy ? "Working…" : "Preview changes")}
                </button>
              </fieldset>
            </form>
            <p className="tiny">
              {t(
                "Calendar changes affect live attendance totals. Student attendance entries and previously published reports are retained.",
              )}
            </p>
          </section>
        </div>
      )}
      {currentPreview && (
        <section
          className="panel calendar-preview"
          aria-label={t("Calendar change preview")}
        >
          <div className="panelhead">
            <h2>{t("Review before applying")}</h2>
            <span className="tag">
              {t(labelDate(language, currentPreview.data.from))} {t(" –")}{" "}
              {t(labelDate(language, currentPreview.data.through))}
            </span>
          </div>
          <p>
            {t(
              "Planned academic days cover the selected range, including future dates. Attendance percentages still count only eligible days through today.",
            )}
          </p>
          <div className="tablewrap" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  {[
                    "Section",
                    "Academic days",
                    "Dates changed",
                    "Days added",
                    "Days removed",
                    "Exceptions kept",
                    "Recorded dates affected",
                  ].map((heading) => (
                    <th key={heading}>{t(heading)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentPreview.data.sections.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{t(s.academicDays)}</td>
                    <td>{t(s.changedDates)}</td>
                    <td>{t(s.addedAcademicDays)}</td>
                    <td>{t(s.removedAcademicDays)}</td>
                    <td>{t(s.preservedExceptions)}</td>
                    <td>{t(s.recordedDatesAffected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recorded > 0 && (
            <label className="check-label calendar-impact">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              {t("I reviewed the ")}
              {t(recorded)}{" "}
              {t(
                " date(s) with saved attendance whose counting status will change. Live totals may change; existing published reports remain unchanged.",
              )}
            </label>
          )}
          <button
            disabled={busy || (recorded > 0 && !ack)}
            onClick={() => void apply()}
          >
            {t(
              busy
                ? "Applying…"
                : `Apply to ${currentPreview.data.sections.length} section(s)`,
            )}
          </button>
        </section>
      )}
    </div>
  );
}
