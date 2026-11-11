"use client";
import { useEffect, useState } from "react";
import { createClient } from "@hikmah/api-client";
import { sumMarks, type Scheme } from "@hikmah/domain";
const api = createClient("", undefined, () =>
  window.dispatchEvent(new Event("hikmah-session-ended")),
);
export type Run = (fn: () => Promise<void>) => Promise<void>;
export function AttendanceTotals({
  section,
  run,
  refreshKey,
}: {
  section: string;
  run: Run;
  refreshKey?: number;
}) {
  const [period, setPeriod] = useState("YEAR"),
    [cycle, setCycle] = useState(""),
    [cycles, setCycles] = useState<any[]>([]),
    [data, setData] = useState<any>(null);
  async function load() {
    if (!section) return;
    const q = new URLSearchParams({
      period,
      ...(period !== "YEAR" && cycle ? { cycleId: cycle } : {}),
    });
    if (period !== "YEAR" && !cycle) return;
    setData(await api(`/v1/sections/${section}/attendance-summary?${q}`));
  }
  useEffect(() => {
    setData(null);
    setPeriod("YEAR");
    void run(async () => {
      const c = await api<any[]>(`/v1/sections/${section}/attendance-periods`);
      setCycles(c);
      setCycle(c.find((x) => x.code === "SHASH_MAHI")?.id ?? c[0]?.id ?? "");
    });
  }, [section]);
  useEffect(() => {
    void run(load);
  }, [section, period, cycle, refreshKey]);
  return (
    <div className="panel">
      <div className="panelhead">
        <h2>Attendance totals</h2>
        <span className="tag">Academic days only</span>
      </div>
      <p>
        Present = 1 · Half = 0.5 · Absent = 0 · Leave is excluded. Totals run
        through today; unsubmitted days stay unmarked.
      </p>
      <div className="toolbar">
        <label>
          Reporting period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="YEAR">Academic year to date</option>
            <option value="SESSION">Exam session</option>
            <option value="PREVIOUS_SESSION">Previous exam session</option>
          </select>
        </label>
        {period !== "YEAR" && (
          <label>
            Attendance session
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {!c.attendance_from ? " · window not set" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="secondary" onClick={() => void run(load)}>
          Refresh totals
        </button>
      </div>
      {data && (
        <>
          <p className="tiny">
            {data.window.label} · {data.window.from} to {data.window.through}
          </p>
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label="Attendance totals"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Student",
                    "Academic days",
                    "Present",
                    "Absent",
                    "Half",
                    "Leave",
                    "Unmarked",
                    "Attendance %",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s: any) => (
                  <tr key={s.enrollmentId}>
                    <td>
                      {s.name}
                      <br />
                      <small>{s.studentNumber}</small>
                    </td>
                    <td>{s.academicDays}</td>
                    <td>{s.present}</td>
                    <td>{s.absent}</td>
                    <td>{s.half}</td>
                    <td>{s.leave}</td>
                    <td>
                      {s.unmarked}
                      {s.legacyLate > 0 &&
                        ` · ${s.legacyLate} legacy Late to review`}
                    </td>
                    <td>
                      {s.displayPercent !== null
                        ? `${s.displayPercent}%`
                        : s.unmarked || s.legacyLate
                          ? "Incomplete"
                          : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
export function CalendarBuilder({
  section,
  run,
  onSaved,
}: {
  section: string;
  run: Run;
  onSaved: () => Promise<void>;
}) {
  const [days, setDays] = useState<number[]>([]),
    [message, setMessage] = useState("");
  return (
    <details>
      <summary>Build academic calendar & holidays</summary>
      <p>
        Choose the date range and actual teaching weekdays. All other days and
        listed holidays will be non-academic. This updates the selected range;
        stored published reports stay unchanged.
      </p>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            const holidays = String(f.get("holidays") ?? "")
              .split("\n")
              .filter((x) => x.trim())
              .map((x) => {
                const [date, ...note] = x.split(",");
                return {
                  date: date.trim(),
                  note: note.join(",").trim() || "Holiday",
                };
              });
            const r = await api<any>(`/v1/sections/${section}/calendar/range`, {
              method: "PUT",
              body: JSON.stringify({
                from: f.get("from"),
                through: f.get("through"),
                weekdays: days,
                holidays,
              }),
            });
            setMessage(`${r.days} calendar dates saved.`);
            await onSaved();
          });
        }}
      >
        <label>
          Calendar start
          <input type="date" name="from" required />
        </label>
        <label>
          Calendar end
          <input type="date" name="through" required />
        </label>
        <fieldset className="weekday-picker">
          <legend>Academic weekdays</legend>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <label className="check-label" key={d}>
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...days, i]
                      : days.filter((v) => v !== i),
                  )
                }
              />
              {d}
            </label>
          ))}
        </fieldset>
        <label className="wide-field">
          Holidays: one date and label per line
          <textarea
            name="holidays"
            placeholder={"2026-12-25, Holiday"}
            rows={4}
          />
        </label>
        <button disabled={!days.length}>Save academic calendar</button>
      </form>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
    </details>
  );
}
export function CurriculumPanel({
  section,
  cycle,
  run,
  onApplied,
}: {
  section: string;
  cycle: string;
  run: Run;
  onApplied: () => Promise<void>;
}) {
  const [row, setRow] = useState<any>(null),
    [offerings, setOfferings] = useState<any[]>([]),
    [scheme, setScheme] = useState<Scheme | null>(null),
    [message, setMessage] = useState("");
  async function load() {
    const r = await api<any>(`/v1/sections/${section}/curriculum`);
    setRow(r);
    setScheme(
      r.scheme ?? {
        papers: [],
        groups: Array.from({ length: 6 }, (_, i) => ({
          name: `Group ${i + 1}`,
          max: 0,
          paperCodes: [],
        })),
      },
    );
    setOfferings(await api<any[]>(`/v1/sections/${section}/subjects`));
  }
  useEffect(() => {
    void run(load);
  }, [section]);
  function change(fn: (s: Scheme) => void) {
    if (!scheme) return;
    const copy = structuredClone(scheme);
    fn(copy);
    for (const g of copy.groups)
      g.max = sumMarks(
        copy.papers
          .filter((p) => g.paperCodes.includes(p.code))
          .map((p) => Number(p.max || 0)),
      );
    setScheme(copy);
  }
  return (
    <div className="panel">
      <h2>Class subjects & six groups</h2>
      <p>
        Configure this class once and reuse the same subjects, codes and groups
        in every exam session. Schedules and marks remain separate per session.
      </p>
      <details>
        <summary>Manage class subject catalog</summary>
        <form
          className="gridform"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = Object.fromEntries(new FormData(form));
            void run(async () => {
              await api(`/v1/sections/${section}/subject-catalog`, {
                method: "POST",
                body: JSON.stringify(f),
              });
              await load();
              form.reset();
            });
          }}
        >
          <label>
            Subject code
            <input name="code" required maxLength={32} />
          </label>
          <label>
            Subject name
            <input name="name" required />
          </label>
          <button>Add subject to this class</button>
        </form>
      </details>
      {scheme && (
        <details>
          <summary>Edit annual class curriculum</summary>
          {scheme.groups.map((g, i) => (
            <label key={i}>
              Group {i + 1} name
              <input
                value={g.name}
                onChange={(e) =>
                  change((s) => {
                    s.groups[i].name = e.target.value;
                  })
                }
              />
              <small>Maximum: {g.max}</small>
            </label>
          ))}
          <div className="tablewrap" tabIndex={0} aria-label="Class curriculum">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Paper code</th>
                  <th>Display label</th>
                  <th>Maximum</th>
                  <th>Group</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {scheme.papers.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        aria-label={`Curriculum subject ${i + 1}`}
                        value={p.offeringId}
                        onChange={(e) =>
                          change((s) => {
                            s.papers[i].offeringId = e.target.value;
                          })
                        }
                      >
                        <option value="">Choose subject</option>
                        {offerings.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.code} · {o.name_ur ?? o.name_en}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Curriculum code ${i + 1}`}
                        value={p.code}
                        maxLength={32}
                        onChange={(e) =>
                          change((s) => {
                            const old = s.papers[i].code;
                            s.papers[i].code = e.target.value;
                            for (const g of s.groups)
                              g.paperCodes = g.paperCodes.map((c) =>
                                c === old ? e.target.value : c,
                              );
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Curriculum label ${i + 1}`}
                        value={p.label}
                        onChange={(e) =>
                          change((s) => {
                            s.papers[i].label = e.target.value;
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Curriculum maximum ${i + 1}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={p.max}
                        onChange={(e) =>
                          change((s) => {
                            s.papers[i].max = Number(e.target.value);
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Curriculum group ${i + 1}`}
                        value={scheme.groups.findIndex((g) =>
                          g.paperCodes.includes(p.code),
                        )}
                        onChange={(e) =>
                          change((s) => {
                            s.groups.forEach((g) => {
                              g.paperCodes = g.paperCodes.filter(
                                (c) => c !== p.code,
                              );
                            });
                            s.groups[Number(e.target.value)].paperCodes.push(
                              p.code,
                            );
                          })
                        }
                      >
                        <option value={-1} disabled>
                          Choose group
                        </option>
                        {scheme.groups.map((g, j) => (
                          <option key={j} value={j}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() =>
                          change((s) => {
                            s.papers.splice(i, 1);
                            for (const g of s.groups)
                              g.paperCodes = g.paperCodes.filter(
                                (c) => c !== p.code,
                              );
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <button
              className="secondary"
              onClick={() =>
                change((s) => {
                  const code = `P${s.papers.length + 1}`;
                  s.papers.push({
                    code,
                    label: "",
                    max: 100,
                    offeringId: offerings[0]?.id ?? "",
                    type: "WRITTEN",
                    pattern: "",
                    date: null,
                  });
                  s.groups[0].paperCodes.push(code);
                })
              }
            >
              Add curriculum paper
            </button>
            <button
              onClick={() =>
                void run(async () => {
                  const r = await api<any>(
                    `/v1/sections/${section}/curriculum`,
                    {
                      method: "PUT",
                      body: JSON.stringify({ scheme, version: row.version }),
                    },
                  );
                  setRow(r);
                  setMessage(
                    "Class curriculum saved. Existing published schemes were preserved.",
                  );
                })
              }
            >
              Save class curriculum
            </button>
          </div>
        </details>
      )}
      <div className="toolbar">
        <button
          className="secondary"
          onClick={() =>
            void run(async () => {
              await api(
                `/v1/sections/${section}/curriculum/from-session/${cycle}`,
                { method: "POST", body: "{}" },
              );
              await load();
              setMessage("Current session copied into the class curriculum.");
            })
          }
          disabled={!!row?.version}
        >
          Use this session as class curriculum
        </button>
        <button
          disabled={!row?.version}
          onClick={() =>
            void run(async () => {
              await api(
                `/v1/exam-cycles/${cycle}/sections/${section}/from-curriculum`,
                { method: "POST", body: "{}" },
              );
              await onApplied();
              setMessage(
                "Session initialized from the class curriculum; review dates and approve it.",
              );
            })
          }
        >
          Initialize selected session
        </button>
      </div>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
    </div>
  );
}
export function StudentPerformance({
  section,
  cycle,
  run,
}: {
  section: string;
  cycle: string;
  run: Run;
}) {
  const [roster, setRoster] = useState<any[]>([]),
    [student, setStudent] = useState(""),
    [period, setPeriod] = useState("YEAR"),
    [report, setReport] = useState<any>(null),
    [year, setYear] = useState("");
  useEffect(() => {
    setReport(null);
    void run(async () => {
      const r = await api<any[]>(`/v1/sections/${section}/enrollments`);
      setRoster(r);
      setStudent(r[0]?.student_id ?? "");
    });
  }, [section]);
  async function load() {
    if (!student) return;
    const q = new URLSearchParams(
      period === "SESSION" && cycle ? { cycleId: cycle } : {},
    );
    const r = await api<any>(`/v1/students/${student}/performance?${q}`);
    setReport(r);
    if (period === "SESSION") {
      setYear(r.years.find((y: any) => y.sessions.length > 0)?.yearId ?? "");
      return;
    }
    setYear((v) =>
      r.years.some((y: any) => y.yearId === v)
        ? v
        : (r.years.at(-1)?.yearId ?? ""),
    );
  }
  useEffect(() => {
    setReport(null);
    void run(load);
  }, [student, period, cycle]);
  const q = new URLSearchParams({
    ...((period === "YEAR" || period === "SESSION") && year
      ? { yearId: year }
      : {}),
    ...(period === "SESSION" && cycle ? { cycleId: cycle } : {}),
  });
  const years =
    report?.years.filter(
      (y: any) => period === "HISTORY" || y.yearId === year,
    ) ?? [];
  return (
    <div className="panel">
      <h2>Student performance & history</h2>
      <p>
        Review this class's students across exam sessions and previous academic
        years. Published results retain their original values; live incomplete
        marks are labeled draft.
      </p>
      <div className="toolbar">
        <label>
          Student
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            {roster.map((s) => (
              <option key={s.id} value={s.student_id}>
                {s.student_number} · {s.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Performance period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="YEAR">Academic year</option>
            <option value="SESSION">Selected exam session</option>
            <option value="HISTORY">All previous years & current year</option>
          </select>
        </label>
        {period === "YEAR" && (
          <label>
            Academic year
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {Array.from(
                new Map(
                  (report?.years ?? []).map((y: any) => [y.yearId, y.year]),
                ).entries(),
              ).map(([id, label]: any) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="secondary" onClick={() => void run(load)}>
          Refresh performance
        </button>
      </div>
      {student && (
        <div className="toolbar">
          <a
            className="action-link"
            href={`/v1/students/${student}/performance.pdf?${q}`}
          >
            Download student report PDF
          </a>
          <a
            className="action-link"
            href={`/v1/sections/${section}/performance.pdf${period === "SESSION" ? `?cycleId=${cycle}` : ""}`}
          >
            Download class report PDF
          </a>
          <a
            className="action-link"
            href={`/v1/sections/${section}/performance.csv${period === "SESSION" ? `?cycleId=${cycle}` : ""}`}
          >
            Download class report CSV
          </a>
        </div>
      )}
      {report?.academicYears
        ?.filter((y: any) => period === "HISTORY" || y.yearId === year)
        .map((y: any) => (
          <div className="notice" key={y.yearId}>
            <strong>Whole-year summary · {y.year}</strong>
            <p>
              All class enrollments: {y.attendance.academicDays} academic days ·
              Present {y.attendance.present} · Absent {y.attendance.absent} ·
              Half {y.attendance.half} · Leave {y.attendance.leave} · Unmarked{" "}
              {y.attendance.unmarked} · Attendance{" "}
              {y.attendance.displayPercent ?? "Incomplete / N/A"}%
            </p>
            <span>
              Combined recorded marks {y.combined.total} / {y.combined.possible}{" "}
              · {y.combined.percent ?? "Incomplete"}%
            </span>
          </div>
        ))}
      {years.map((y: any) => (
        <div className="panel" key={y.enrollmentId}>
          <h3>
            {y.year} · {y.program} · {y.level} · {y.section}
          </h3>
          {y.attendance && (
            <p>
              Academic days {y.attendance.academicDays} · Present{" "}
              {y.attendance.present} · Absent {y.attendance.absent} · Half{" "}
              {y.attendance.half} · Leave {y.attendance.leave} · Unmarked{" "}
              {y.attendance.unmarked} · Attendance{" "}
              {y.attendance.displayPercent === null
                ? "Incomplete / N/A"
                : `${y.attendance.displayPercent}%`}
            </p>
          )}
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label="Student exam performance"
          >
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Total</th>
                  <th>Percentage</th>
                  <th>Pass status</th>
                  <th>Position</th>
                  <th>Publication</th>
                </tr>
              </thead>
              <tbody>
                {y.sessions.map((x: any) => (
                  <tr key={x.cycleId}>
                    <td>{x.title}</td>
                    <td>
                      {x.result.total} / {x.result.possible}
                    </td>
                    <td>
                      {x.result.percent === null
                        ? "Pending"
                        : `${Number(x.result.percent).toFixed(1)}%`}
                    </td>
                    <td>
                      {!x.complete
                        ? "Incomplete"
                        : x.result.passing
                          ? "Pass"
                          : "Fail"}
                    </td>
                    <td>
                      {x.result.rank ?? "—"}
                      <br />
                      <small>{x.positionReason}</small>
                    </td>
                    <td>
                      {x.official
                        ? `Published · revision ${x.publication.revision}`
                        : "Draft"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny">
            Combined recorded marks: {y.combined.total} / {y.combined.possible}{" "}
            ·{" "}
            {y.combined.percent === null
              ? "Incomplete"
              : `${y.combined.percent}%`}
            . No annual position is inferred.
          </p>
        </div>
      ))}
      {report && !years.length && (
        <p className="empty">No records in this selection.</p>
      )}
    </div>
  );
}
export function CreateAccount({
  run,
  onSaved,
}: {
  run: Run;
  onSaved: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>Create a staff account with an initial password</summary>
      <p>
        New accounts have no class or subject access until you assign it in
        Academic setup. Grant institution administrator access only where
        needed.
      </p>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = Object.fromEntries(new FormData(form));
          void run(async () => {
            await api("/v1/users", { method: "POST", body: JSON.stringify(f) });
            form.reset();
            setMessage(
              "Account created. Assign its class/subject access below or in Academic setup.",
            );
            await onSaved();
          });
        }}
      >
        <label>
          Full name
          <input name="name" required autoComplete="off" />
        </label>
        <label>
          Account email
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label>
          Initial password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        <button>Create staff account</button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
export function ChangePassword({ run, users }: { run: Run; users: any[] }) {
  const [message, setMessage] = useState("");
  return (
    <details>
      <summary>Change a staff password directly</summary>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          void run(async () => {
            await api(`/v1/users/${f.get("user")}/password`, {
              method: "PUT",
              body: JSON.stringify({
                password: f.get("password"),
                reason: f.get("reason"),
              }),
            });
            form.reset();
            setMessage("Password changed and existing sessions revoked.");
          });
        }}
      >
        <label>
          Account
          <select name="user">
            {users
              .filter((u) => u.active)
              .map((u) => (
                <option value={u.id} key={u.id}>
                  {u.display_name} · {u.email}
                </option>
              ))}
          </select>
        </label>
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          Reason
          <input name="reason" minLength={5} required />
        </label>
        <button>Change password & revoke sessions</button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
export function PromotionPicker({
  section,
  run,
}: {
  section: string;
  run: Run;
}) {
  const [sections, setSections] = useState<any[]>([]),
    [roster, setRoster] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    setSelected([]);
    void run(async () => {
      setSections(await api("/v1/sections"));
      setRoster(await api(`/v1/sections/${section}/enrollments`));
    });
  }, [section]);
  return (
    <details>
      <summary>Promote selected learners into a new academic year</summary>
      <p>
        Choose only the learners being promoted. Their student IDs and previous
        marks, attendance and enrollments are retained.
      </p>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            await api(`/v1/sections/${section}/rollover`, {
              method: "POST",
              body: JSON.stringify({
                targetSection: f.get("target"),
                joinedOn: f.get("date"),
                enrollmentIds: selected,
              }),
            });
            setSelected([]);
            setMessage(
              "Selected learners promoted; their complete history is retained.",
            );
          });
        }}
      >
        <label>
          New academic-year class
          <select name="target" required>
            <option value="">Choose target class</option>
            {sections
              .filter(
                (s) =>
                  s.id !== section &&
                  s.academic_year_id !==
                    sections.find((x) => x.id === section)?.academic_year_id,
              )
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.year_label} · {s.program_name} · {s.level_name} · {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          New joining date
          <input name="date" type="date" required />
        </label>
        <fieldset className="wide-field">
          <legend>Learners to promote</legend>
          {roster.map((s) => (
            <label className="check-label" key={s.id}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, s.id]
                      : selected.filter((v) => v !== s.id),
                  )
                }
              />
              {s.student_number} · {s.full_name}
            </label>
          ))}
        </fieldset>
        <button disabled={!selected.length}>
          Promote {selected.length} selected learners
        </button>
      </form>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
    </details>
  );
}
