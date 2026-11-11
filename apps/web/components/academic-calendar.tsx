"use client";
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
const labelDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
          <span className="eyebrow">EVERY CLASS HAS ITS OWN RHYTHM</span>
          <h2>Plan the days that count.</h2>
          <p>
            Set any combination of teaching weekdays for each program, level and
            section. Add holidays, vacations and extra classes without losing
            your weekly schedule.
          </p>
        </div>
        <div className="calendar-intro-badge">
          <strong>0–7</strong>
          <span>teaching days per week</span>
        </div>
      </section>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      <section className="panel">
        <div className="panelhead">
          <h2>Choose your classes</h2>
          <span className="tag">{selected.length} selected</span>
        </div>
        <div className="calendar-filters">
          <label>
            Academic year
            <select
              aria-label="Academic year"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setProgram("");
                setLevel("");
              }}
            >
              {unique(sections, "academic_year_id").map((s) => (
                <option key={s.academic_year_id} value={s.academic_year_id}>
                  {s.year_label} · {s.year_state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Program
            <select
              aria-label="Program"
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                setLevel("");
              }}
            >
              <option value="">All programs</option>
              {unique(yearSections, "program_id").map((s) => (
                <option key={s.program_id} value={s.program_id}>
                  {s.program_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class level
            <select
              aria-label="Class level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">All levels</option>
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
          Filters select the matching sections below. Uncheck any section that
          should keep a different schedule. New sections are configured
          explicitly.
        </p>
        {!!filtered.length && (
          <div className="toolbar">
            <button
              type="button"
              className="secondary"
              disabled={!editable}
              onClick={() => setSelected(filtered.map((s) => s.id))}
            >
              Select all shown
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected([])}
            >
              Clear selection
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
                    {s.name} · {s.code}
                  </strong>
                  <small>
                    {s.program_name} · {s.level_name}
                  </small>
                  <small>
                    {pattern
                      ? pattern.weekdays.length
                        ? pattern.weekdays.map((d) => weekdays[d]).join(" · ")
                        : "No teaching weekdays"
                      : s.configured_days
                        ? "Existing calendar · weekly schedule not saved"
                        : "Calendar not configured"}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        {!filtered.length && (
          <p>
            No sections match these filters. Create sections in Academic setup
            first.
          </p>
        )}
        {yearInfo && !editable && (
          <p className="notice">
            This academic year is {yearInfo.year_state.toLowerCase()}. Its
            calendar is available for viewing; an administrator must reopen the
            year before editing.
          </p>
        )}
      </section>
      {!!filtered.length && (
        <div className="calendar-workspace">
          <section className="panel calendar-month-panel">
            <div className="panelhead">
              <h2>Calendar at a glance</h2>
              {viewed && (
                <button
                  className="secondary"
                  onClick={() => onAttendance(viewed.id)}
                >
                  Take attendance
                </button>
              )}
            </div>
            <label>
              View section
              <select
                aria-label="View section"
                value={viewSection}
                onChange={(e) => setViewSection(e.target.value)}
              >
                {filtered.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="calendar-month-controls">
              <button
                className="secondary"
                aria-label="Previous calendar month"
                disabled={!viewed || month <= viewed.year_start.slice(0, 7)}
                onClick={() => moveMonth(-1)}
              >
                ←
              </button>
              <label>
                Month
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
                aria-label="Next calendar month"
                disabled={!viewed || month >= viewed.year_end.slice(0, 7)}
                onClick={() => moveMonth(1)}
              >
                →
              </button>
            </div>
            <div className="calendar-legend">
              <span className="teaching">Academic day</span>
              <span className="holiday">Day off / holiday</span>
              <span className="no-attendance">No attendance</span>
              <span className="unconfigured">Not configured</span>
            </div>
            {loading && <p role="status">Loading calendar…</p>}
            <div
              className="calendar-month-grid"
              aria-label="Monthly academic calendar"
            >
              {weekdays.map((d) => (
                <span key={d} className="calendar-week-heading">
                  {d}
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
                    aria-label={`${labelDate(date)}: ${day?.note ?? "Outside academic year"}`}
                    title={
                      day
                        ? `${day.note}${day.sheetState ? ` · ${day.sheetState}` : ""}`
                        : "Outside academic year"
                    }
                    onClick={() => day && selectDate(day)}
                  >
                    <strong>{Number(date.slice(8))}</strong>
                    {day?.source === "EXCEPTION" && (
                      <span
                        className="calendar-exception-dot"
                        aria-label="Exception"
                      >
                        •
                      </span>
                    )}
                    {day?.sheetState && (
                      <small aria-label="Attendance saved">✓</small>
                    )}
                  </button>
                );
              })}
            </div>
            {calendar && (
              <p className="tiny">
                {calendar.days.filter((d) => d.countsForAttendance).length}{" "}
                academic days ·{" "}
                {
                  calendar.days.filter((d) => d.source === "UNCONFIGURED")
                    .length
                }{" "}
                unconfigured dates in this month. Click a date to prepare an
                exception; the selected class checkboxes control where it is
                applied.
              </p>
            )}
            {!!calendar?.patterns.length && (
              <details>
                <summary>Saved weekly schedules for this month</summary>
                {calendar.patterns.map((p) => (
                  <div className="calendar-saved-rule" key={p.id}>
                    <span>
                      <strong>
                        {p.weekdays.length
                          ? p.weekdays.map((d) => weekdays[d]).join(", ")
                          : "No teaching weekdays"}
                      </strong>
                      <small>
                        {labelDate(p.starts_on)} – {labelDate(p.ends_on)}
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
                      Edit schedule
                    </button>
                  </div>
                ))}
              </details>
            )}
            {!!calendar?.days.some((d) => d.source === "EXCEPTION") && (
              <details>
                <summary>Holidays & exceptions this month</summary>
                <div className="calendar-exception-list">
                  {calendar.days
                    .filter((d) => d.source === "EXCEPTION")
                    .map((d) => (
                      <div className="calendar-saved-rule" key={d.date}>
                        <span>
                          <strong>{d.note}</strong>
                          <small>{labelDate(d.date)}</small>
                        </span>
                        <button
                          className="secondary"
                          disabled={!editable}
                          aria-label={`Restore weekly schedule for ${d.date}`}
                          onClick={() => {
                            setKind("RESTORE");
                            setFrom(d.date);
                            setThrough(d.date);
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </section>
          <section className="panel calendar-editor">
            <div className="panelhead">
              <h2>Edit selected calendars</h2>
              <span className="tag">{selected.length} section(s)</span>
            </div>
            <div
              className="calendar-modes"
              role="group"
              aria-label="Calendar change type"
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
                  {label}
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
                  {kind === "WEEKLY"
                    ? "Choose the teaching week"
                    : kind === "EXCEPTION"
                      ? "One date or a whole vacation"
                      : "Remove exceptions in this range"}
                </legend>
                <div className="calendar-date-range">
                  <label>
                    Effective from
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
                    Through
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
                      Copy a saved schedule
                      <select
                        aria-label="Copy a saved schedule"
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
                        <option value="">Choose a schedule to copy…</option>
                        {sections.flatMap((s) =>
                          s.patterns.map((p) => (
                            <option key={p.id} value={`${s.id}:${p.id}`}>
                              {s.program_name} · {s.level_name} · {s.code}:{" "}
                              {p.weekdays.map((d) => weekdays[d]).join(", ") ||
                                "Closed"}{" "}
                              ({p.starts_on} – {p.ends_on})
                            </option>
                          )),
                        )}
                      </select>
                    </label>
                    <div
                      className="calendar-weekdays"
                      role="group"
                      aria-label="Teaching weekdays"
                    >
                      {longDays.map((name, i) => (
                        <label
                          key={name}
                          className={days.includes(i) ? "chosen" : ""}
                        >
                          <input
                            type="checkbox"
                            aria-label={name}
                            checked={days.includes(i)}
                            onChange={(e) =>
                              setDays((values) =>
                                e.target.checked
                                  ? [...values, i].sort()
                                  : values.filter((d) => d !== i),
                              )
                            }
                          />
                          <span>{weekdays[i]}</span>
                        </label>
                      ))}
                    </div>
                    <div className="toolbar">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
                      >
                        All seven days
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setDays([])}
                      >
                        Clear weekdays
                      </button>
                      <span className="tag">{days.length} days / week</span>
                    </div>
                    <p className="tiny">
                      The schedule changes only this date range. Saved holidays
                      and extra days stay in place. Zero selected weekdays
                      closes the range except explicit extra teaching days.
                    </p>
                    {!days.length && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={confirmClosed}
                          onChange={(e) => setConfirmClosed(e.target.checked)}
                        />
                        No ordinary teaching days in this range; keep only
                        explicit extra teaching days.
                      </label>
                    )}
                  </>
                )}
                {kind === "EXCEPTION" && (
                  <>
                    <label>
                      Day type
                      <select
                        aria-label="Day type"
                        value={dayType}
                        onChange={(e) =>
                          setDayType(e.target.value as typeof dayType)
                        }
                      >
                        <option value="HOLIDAY">
                          Holiday / closed — no attendance
                        </option>
                        <option value="TEACHING">
                          Extra teaching day — attendance counts
                        </option>
                        <option value="NO_ATTENDANCE">
                          Teaching / event — attendance not counted
                        </option>
                      </select>
                    </label>
                    <label>
                      Holiday or exception name
                      <input
                        value={note}
                        maxLength={200}
                        required
                        placeholder="For example, winter vacation or make-up class"
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <p className="tiny">
                      The exception takes priority over the weekly schedule for
                      every date in this range.
                    </p>
                  </>
                )}
                {kind === "RESTORE" && (
                  <p>
                    Remove holiday or extra-day exceptions in this range and
                    return to the saved weekly schedule. A weekly schedule must
                    exist for each exception being restored.
                  </p>
                )}
                <label>
                  Reason for change
                  <input
                    value={reason}
                    required
                    minLength={5}
                    maxLength={1000}
                    placeholder="For example, revised Shaam timetable"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="login-submit"
                  disabled={!selected.length || busy}
                >
                  {busy ? "Working…" : "Preview changes"}
                </button>
              </fieldset>
            </form>
            <p className="tiny">
              Calendar changes affect live attendance totals. Student attendance
              entries and previously published reports are retained.
            </p>
          </section>
        </div>
      )}
      {currentPreview && (
        <section
          className="panel calendar-preview"
          aria-label="Calendar change preview"
        >
          <div className="panelhead">
            <h2>Review before applying</h2>
            <span className="tag">
              {labelDate(currentPreview.data.from)} –{" "}
              {labelDate(currentPreview.data.through)}
            </span>
          </div>
          <p>
            Planned academic days cover the selected range, including future
            dates. Attendance percentages still count only eligible days through
            today.
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
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentPreview.data.sections.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.academicDays}</td>
                    <td>{s.changedDates}</td>
                    <td>{s.addedAcademicDays}</td>
                    <td>{s.removedAcademicDays}</td>
                    <td>{s.preservedExceptions}</td>
                    <td>{s.recordedDatesAffected}</td>
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
              I reviewed the {recorded} date(s) with saved attendance whose
              counting status will change. Live totals may change; existing
              published reports remain unchanged.
            </label>
          )}
          <button
            disabled={busy || (recorded > 0 && !ack)}
            onClick={() => void apply()}
          >
            {busy
              ? "Applying…"
              : `Apply to ${currentPreview.data.sections.length} section(s)`}
          </button>
        </section>
      )}
    </div>
  );
}
