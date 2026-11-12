"use client";
import { useEffect, useState } from "react";
import {
  AttendanceTotals,
  CurriculumPanel,
  StudentPerformance,
  CreateAccount,
  ChangePassword,
  PromotionPicker,
} from "../components/academic-tools";
import { sumMarks, institutePolicy } from "@hikmah/domain";
import { AuthFrame, Brand, Icon } from "../components/workspace-ui";
import { AcademicCalendarPage } from "../components/academic-calendar";
import { SessionResultSheet } from "../components/session-result-sheet";
import {
  createClient,
  type Identity,
  type Section,
  type Sheet,
} from "@hikmah/api-client";
const api = createClient("", undefined, () => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("hikmah-session-ended"));
});
const navigation = [
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
];
const statuses = ["PRESENT", "ABSENT", "HALF", "LEAVE"];
function canView(me: Identity | null, view: string) {
  if (!me) return false;
  if (me.roles.includes("ADMIN") || view === "Overview") return true;
  if (view === "Attendance") return me.attendanceSections.length > 0;
  if (view === "Academic calendar") return me.managedSections.length > 0;
  if (view === "Marks entry")
    return me.teachingSections.length > 0 || me.managedSections.length > 0;
  if (["Exams & schemes", "Results & reports"].includes(view))
    return me.managedSections.length > 0;
  return false;
}
const fields: Record<string, string[]> = {
  "academic-years": ["label", "hijri_label", "start_date", "end_date", "state"],
  programs: ["name", "code"],
  levels: ["ordinal", "name_en", "name_ur"],
  sections: ["academic_year_id", "program_id", "level_id", "code", "name"],
  students: ["student_number", "full_name", "full_name_ur", "guardian_contact"],
  subjects: ["code", "name_en", "name_ur"],
};
const labels = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export default function Home() {
  const [me, setMe] = useState<Identity | null>(null),
    [checkingSession, setCheckingSession] = useState(true),
    [view, setView] = useState("Overview"),
    [sections, setSections] = useState<Section[]>([]),
    [section, setSection] = useState(""),
    [cycles, setCycles] = useState<any[]>([]),
    [cycle, setCycle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    try {
      const identity = await api<Identity>("/v1/me");
      setMe(identity);
      const s = await api<Section[]>("/v1/sections");
      setSections(s);
      setSection((v) => (s.some((item) => item.id === v) ? v : s[0]?.id || ""));
      const c =
        identity.roles.includes("ADMIN") ||
        identity.managedSections.length ||
        identity.teachingSections.length
          ? await api<any[]>("/v1/exam-cycles")
          : [];
      setCycles(c);
      setCycle(
        (v) =>
          (c.some((item) => item.id === v) ? v : "") ||
          c.find((c) => c.code === "SHASH_MAHI")?.id ||
          c[0]?.id ||
          "",
      );
    } catch {
      setMe(null);
    } finally {
      setCheckingSession(false);
    }
  }
  useEffect(() => {
    const clear = () => {
      setMe(null);
      setSections([]);
      setSection("");
      setCycles([]);
      setCycle("");
      setMessage("");
    };
    window.addEventListener("hikmah-session-ended", clear);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    void load();
    return () => {
      window.removeEventListener("hikmah-session-ended", clear);
      window.removeEventListener("focus", focus);
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const admin = me?.roles.includes("ADMIN");
  const allowedSections = sections.filter(
    (s) =>
      !me ||
      admin ||
      view === "Overview" ||
      view === "Marks entry" ||
      (view === "Attendance"
        ? me.attendanceSections.includes(s.id)
        : me.managedSections.includes(s.id)),
  );
  const visibleCycles = cycles.filter(
    (c) =>
      !section ||
      !sections.find((s) => s.id === section)?.academic_year_id ||
      c.academic_year_id ===
        sections.find((s) => s.id === section)?.academic_year_id,
  );
  useEffect(() => {
    if (!me) return;
    if (!canView(me, view)) setView("Overview");
    if (!allowedSections.some((s) => s.id === section))
      setSection(allowedSections[0]?.id ?? "");
  }, [me, view, sections, section]);
  useEffect(() => {
    if (!visibleCycles.some((c) => c.id === cycle))
      setCycle(
        visibleCycles.find((c) => c.code === "SHASH_MAHI")?.id ??
          visibleCycles[0]?.id ??
          "",
      );
  }, [section, cycles, cycle]);
  if (checkingSession)
    return (
      <div className="session-loading" role="status">
        <Brand />
        <span>Opening your workspace…</span>
      </div>
    );
  if (!me)
    return (
      <AuthFrame>
        <div className="eyebrow">YOUR ACADEMIC WORKSPACE</div>
        <h2 className="login-title">Welcome back.</h2>
        <p className="login-intro">
          A little clarity for your busy day.
          <br />
          Sign in to continue to Hikmah.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await api("/api/auth/sign-in/email", {
                method: "POST",
                body: JSON.stringify({
                  email: f.get("email"),
                  password: f.get("password"),
                }),
              });
              setView("Overview");
              await load();
            });
          }}
        >
          <label>
            Email address
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder="you@institute.edu"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="tiny" style={{ marginTop: 24 }}>
          Forgot your password? Contact an administrator for a private recovery
          link. Access is limited to assigned classes.
        </p>
      </AuthFrame>
    );
  const common = { section, cycle, run, busy, setMessage };
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside>
        <Brand subtitle="ACADEMIC OFFICE" />
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation
            .filter((v) => canView(me, v))
            .map((v) => (
              <button
                key={v}
                className={v === view ? "active" : ""}
                aria-current={v === view ? "page" : undefined}
                onClick={() => {
                  setView(v);
                  setError("");
                  setMessage("");
                }}
              >
                <Icon name={v} />
                <span>{v}</span>
              </button>
            ))}
        </nav>
        <footer>
          <span className="footer-symbol" aria-hidden="true">
            ✧
          </span>
          <strong>Learning with purpose.</strong>
          <span lang="ur" dir="rtl">
            علم، عمل، حکمت
          </span>
          <span className="tiny">Hikmah staff workspace</span>
        </footer>
      </aside>
      <div className="workspace">
        <header>
          <span className="breadcrumb">
            Workspace <span aria-hidden="true">/</span> <strong>{view}</strong>
          </span>
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {me.name
                .split(/\s+/)
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="account-name">
              {me.name}
              <small>
                {admin
                  ? "Administrator"
                  : me.managedSections.length
                    ? "Mushrif"
                    : me.teachingSections.length
                      ? "Subject teacher"
                      : "Ameer"}
              </small>
            </span>
            <button
              className="secondary signout"
              onClick={() =>
                void run(async () => {
                  await api("/api/auth/sign-out", {
                    method: "POST",
                    body: "{}",
                  });
                  setMe(null);
                  setSections([]);
                  setSection("");
                  setCycles([]);
                  setCycle("");
                  setView("Overview");
                })
              }
            >
              <Icon name="logout" />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <main key={me.accessVersion} id="main-content" tabIndex={-1}>
          <div className={view === "Overview" ? "top overview-top" : "top"}>
            <div>
              <div className="eyebrow">
                {view === "Overview"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : "HIKMAH ACADEMIC MANAGEMENT"}
              </div>
              <h1>
                {view === "Overview" ? "A clear view of your institute" : view}
              </h1>
              <p>
                {view === "Overview"
                  ? "Your classes, your people, your next steps. All in one place."
                  : "Your assigned records, kept accurate and accountable."}
              </p>
            </div>
            <span className="tag date-tag">
              <Icon name="Attendance" />
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Karachi",
              })}
            </span>
          </div>
          {error && (
            <div role="alert" className="notice error message">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="notice success message">
              {message}
            </div>
          )}
          {busy && (
            <div role="status" className="tiny">
              Working…
            </div>
          )}
          {["Attendance", "Exams & schemes", "Results & reports"].includes(
            view,
          ) && (
            <div className="toolbar">
              <select
                aria-label="Section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {allowedSections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name} · {s.code}
                  </option>
                ))}
              </select>
              {view !== "Attendance" && (
                <select
                  aria-label="Exam cycle"
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                >
                  {visibleCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {view === "Overview" && (
            <>
              <div className="split">
                <div className="panel">
                  <div className="panelhead">
                    <h2>Your sections</h2>
                    <span className="tag">{sections.length} sections</span>
                  </div>
                  <div
                    className="tablewrap"
                    tabIndex={0}
                    aria-label="Your sections"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Academic year / program</th>
                          <th>Next action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.name}</strong>
                            </td>
                            <td>
                              {s.year_label} · {s.program_name}
                            </td>
                            <td>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setSection(s.id);
                                  setView(
                                    admin ||
                                      me.attendanceSections.includes(s.id)
                                      ? "Attendance"
                                      : "Marks entry",
                                  );
                                }}
                              >
                                {admin || me.attendanceSections.includes(s.id)
                                  ? "Open attendance →"
                                  : "Open assigned papers →"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!sections.length && (
                    <p className="empty">
                      No assigned sections. An administrator can assign your
                      access.
                    </p>
                  )}
                </div>
                <div className="panel">
                  <div className="eyebrow">YOUR NEXT STEP</div>
                  <h2>Quick actions</h2>
                  <p>
                    Open the tools available for your assigned responsibilities.
                  </p>
                  <div className="quick-actions">
                    {navigation
                      .filter((v) => v !== "Overview" && canView(me, v))
                      .map((v) => (
                        <button
                          className="secondary"
                          key={v}
                          onClick={() => setView(v)}
                        >
                          <Icon name={v} />
                          {v}
                          <Icon name="arrow" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "Academic setup" && (
            <Setup {...common} reload={load} sections={sections} />
          )}
          {view === "Academic calendar" && (
            <AcademicCalendarPage
              today={me.today}
              onAttendance={(id) => {
                setSection(id);
                setView("Attendance");
              }}
            />
          )}
          {view === "Attendance" &&
            section &&
            allowedSections.some((s) => s.id === section) && (
              <Attendance
                {...common}
                canManage={!!admin || me.managedSections.includes(section)}
                onOpenCalendar={() => setView("Academic calendar")}
              />
            )}
          {view === "Exams & schemes" &&
            section &&
            cycle &&
            allowedSections.some((s) => s.id === section) && (
              <Exams
                {...common}
                admin={!!admin || me.managedSections.includes(section)}
              />
            )}
          {view === "Marks entry" && (
            <Marks
              {...common}
              admin={!!admin}
              managedSections={me.managedSections}
              onSessionImport={(classId, sessionId) => {
                setSection(classId);
                setCycle(sessionId);
                setView("Results & reports");
              }}
            />
          )}
          {view === "Policies" && <Policies {...common} />}
          {view === "Results & reports" &&
            section &&
            cycle &&
            allowedSections.some((s) => s.id === section) && (
              <Results
                {...common}
                admin={!!admin || me.managedSections.includes(section)}
              />
            )}
          {view === "People & access" && <People {...common} />}
          {view === "Audit history" && <Audit />}
          {view === "Correction requests" && <Corrections run={run} />}
        </main>
      </div>
    </div>
  );
}
type Common = {
  section: string;
  cycle: string;
  run: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
  setMessage: (s: string) => void;
};
function Setup({
  run,
  busy,
  setMessage,
  reload,
  sections,
}: Common & { reload: () => Promise<void>; sections: Section[] }) {
  const [resource, setResource] = useState("academic-years"),
    [rows, setRows] = useState<any[]>([]),
    [refs, setRefs] = useState<Record<string, any[]>>({}),
    [selected, setSelected] = useState(""),
    [enrollments, setEnrollments] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(null);
  const load = async () => {
    setRows(await api<any[]>("/v1/" + resource));
    const entries = await Promise.all(
      [
        "academic-years",
        "programs",
        "levels",
        "students",
        "subjects",
        "users",
      ].map(async (k) => [k, await api<any[]>("/v1/" + k)]),
    );
    setRefs(Object.fromEntries(entries));
  };
  useEffect(() => {
    void run(load);
  }, [resource]);
  const fk: Record<string, string> = {
    academic_year_id: "academic-years",
    program_id: "programs",
    level_id: "levels",
  };
  return (
    <>
      <div className="toolbar">
        {Object.keys(fields).map((r) => (
          <button
            className={resource === r ? "" : "secondary"}
            key={r}
            onClick={() => {
              setResource(r);
              setEditing(null);
            }}
          >
            {labels(r)}
          </button>
        ))}
      </div>
      <div className="panel">
        <h2>
          {editing ? "Edit" : "Create"} {labels(resource)}
        </h2>
        <form
          className="gridform"
          key={resource + (editing?.id ?? "new")}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = Object.fromEntries(new FormData(form));
            if (resource === "levels") f.ordinal = Number(f.ordinal) as any;
            void run(async () => {
              await api("/v1/" + resource + (editing ? "/" + editing.id : ""), {
                method: editing ? "PATCH" : "POST",
                body: JSON.stringify(
                  Object.fromEntries(
                    Object.entries(f).filter(([, v]) => v !== ""),
                  ),
                ),
              });
              await load();
              await reload();
              setEditing(null);
              form.reset();
              setMessage("Record saved.");
            });
          }}
        >
          {fields[resource].map((k) => (
            <label key={k}>
              {labels(k)}
              {fk[k] ? (
                <select name={k} required defaultValue={editing?.[k] ?? ""}>
                  {refs[fk[k]]?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label ?? r.name ?? r.name_en}
                    </option>
                  ))}
                </select>
              ) : k === "state" ? (
                <select name={k} defaultValue={editing?.[k] ?? "PLANNED"}>
                  {["PLANNED", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  name={k}
                  defaultValue={
                    editing?.[k]
                      ? String(editing[k]).slice(
                          0,
                          k.endsWith("_date") ? 10 : 500,
                        )
                      : ""
                  }
                  type={
                    k.endsWith("_date")
                      ? "date"
                      : k === "ordinal"
                        ? "number"
                        : "text"
                  }
                  required={
                    ![
                      "hijri_label",
                      "name_ur",
                      "full_name_ur",
                      "guardian_contact",
                    ].includes(k)
                  }
                />
              )}
            </label>
          ))}
          <button disabled={busy}>
            {editing ? "Save changes" : "Create record"}
          </button>
          {editing && (
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel edit
            </button>
          )}
        </form>
        <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
          <table>
            <thead>
              <tr>
                {fields[resource].map((k) => (
                  <th key={k}>{labels(k)}</th>
                ))}
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {fields[resource].map((k) => (
                    <td key={k}>{String(r[k] ?? "—")}</td>
                  ))}
                  <td>
                    <button className="secondary" onClick={() => setEditing(r)}>
                      Edit
                    </button>
                    <br />
                    <code className="tiny">{r.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h2>Enroll learners & assign staff</h2>
        <label>
          Section
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              void run(async () =>
                setEnrollments(
                  await api<any[]>(
                    "/v1/sections/" + e.target.value + "/enrollments",
                  ),
                ),
              );
            }}
          >
            <option value="">Choose section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <form
              className="gridform"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                void run(async () => {
                  await api(`/v1/sections/${selected}/enrollments`, {
                    method: "POST",
                    body: JSON.stringify(f),
                  });
                  setEnrollments(
                    await api<any[]>(`/v1/sections/${selected}/enrollments`),
                  );
                  setMessage("Learner enrolled.");
                });
              }}
            >
              <label>
                Student
                <select name="student_id">
                  {refs.students?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.student_number} · {s.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Roll number
                <input name="roll_number" required />
              </label>
              <label>
                Joined on
                <input type="date" name="joined_on" required />
              </label>
              <button>Enroll learner</button>
            </form>
            <p>
              {enrollments.map((e) => e.full_name).join(" · ") ||
                "No enrollments"}
            </p>
            <form
              className="gridform"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                void run(async () => {
                  await api(`/v1/sections/${selected}/staff`, {
                    method: "POST",
                    body: JSON.stringify(
                      Object.fromEntries(
                        Object.entries(f).filter(([, v]) => v !== ""),
                      ),
                    ),
                  });
                  setMessage("Staff assignment saved.");
                });
              }}
            >
              <label>
                User
                <select name="user_id">
                  {refs.users?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select name="role">
                  {["MUSHRIF", "AMEER"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Starts on
                <input type="date" name="starts_on" required />
              </label>
              <label>
                Ameer membership override reason
                <input name="ameerOverrideReason" />
              </label>
              <button>Assign staff</button>
            </form>
            <SectionTools
              section={selected}
              refs={refs}
              run={run}
              setMessage={setMessage}
            />
          </>
        )}
      </div>
    </>
  );
}
function Attendance({
  section,
  run,
  busy,
  setMessage,
  canManage,
  onOpenCalendar,
}: Common & { canManage: boolean; onOpenCalendar: () => void }) {
  const [date, setDate] = useState(
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
    ),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [records, setRecords] = useState<Record<string, string>>({}),
    [bulk, setBulk] = useState("");
  async function load() {
    const s = await api<Sheet>(`/v1/sections/${section}/attendance/${date}`);
    setSheet(s);
    setRecords(
      Object.fromEntries(s.records.map((r) => [r.enrollmentId, r.status])),
    );
  }
  useEffect(() => {
    void run(load);
  }, [section, date]);
  return (
    <>
      <details className="panel">
        <summary>Attendance totals · academic year and exam sessions</summary>
        <AttendanceTotals
          section={section}
          run={run}
          refreshKey={sheet?.version}
        />
      </details>
      <div className="panel">
        <div className="panelhead">
          <h2>Daily attendance</h2>
          <span className="tag">
            {sheet?.status ?? "Loading"} · v{sheet?.version ?? 0}
          </span>
        </div>
        <div className="toolbar">
          <input
            aria-label="School date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() =>
              setRecords(
                Object.fromEntries(
                  (sheet?.roster ?? []).map((s) => [s.id, "PRESENT"]),
                ),
              )
            }
          >
            Mark all present
          </button>
          <span className="tiny">
            {Object.keys(records).length} of {sheet?.roster.length ?? 0} marked
          </span>
        </div>
        <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
          <table>
            <thead>
              <tr>
                <th>Roll</th>
                <th>Learner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sheet?.roster.map((s) => (
                <tr key={s.id}>
                  <td>{s.roll_number}</td>
                  <td>
                    <strong>{s.full_name}</strong>
                    <br />
                    <span className="tiny">{s.student_number}</span>
                  </td>
                  <td>
                    <select
                      aria-label={`Status for ${s.full_name}`}
                      disabled={sheet.status !== "DRAFT"}
                      value={records[s.id] ?? ""}
                      onChange={(e) =>
                        setRecords({ ...records, [s.id]: e.target.value })
                      }
                    >
                      <option value="">Unmarked</option>
                      {records[s.id] === "LATE" && (
                        <option value="LATE" disabled>
                          Legacy Late — review status
                        </option>
                      )}
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 20 }}>
          <button
            disabled={busy || sheet?.status !== "DRAFT"}
            onClick={() =>
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/${date}`, {
                  method: "PUT",
                  headers: { "If-Match": String(sheet?.version ?? 0) },
                  body: JSON.stringify({
                    records: Object.entries(records)
                      .filter(([, status]) => status)
                      .map(([enrollmentId, status]) => ({
                        enrollmentId,
                        status,
                      })),
                  }),
                });
                await load();
                setMessage("Attendance draft saved.");
              })
            }
          >
            Save draft
          </button>
          <button
            disabled={busy || sheet?.status !== "DRAFT"}
            onClick={() =>
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/${date}/submit`, {
                  method: "POST",
                  headers: { "If-Match": String(sheet?.version) },
                  body: "{}",
                });
                await load();
                setMessage("Complete roster submitted.");
              })
            }
          >
            Submit complete roster
          </button>
          <button className="secondary" onClick={() => void run(load)}>
            Refresh
          </button>
        </div>
        {canManage && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/${date}/reopen`, {
                  method: "POST",
                  body: JSON.stringify({ reason }),
                });
                await load();
              });
            }}
          >
            <input
              name="reason"
              placeholder="Mushrif / administrator correction reason"
              required
              minLength={5}
            />
            <button className="secondary">Reopen</button>
          </form>
        )}
      </div>
      <div className="panel">
        <h2>Multiple-date attendance</h2>
        {canManage && (
          <button className="secondary" onClick={onOpenCalendar}>
            Open academic calendar
          </button>
        )}
        <p>
          Academic days and holidays are configured on the Academic calendar
          page before attendance is entered.
        </p>
        <AttendancePermissions run={run} />
        <MultiDayGrid section={section} run={run} setMessage={setMessage} />
        <details>
          <summary>Atomic multiple-day entry</summary>
          <p>
            Enter a JSON array of days: schoolDate, version, records
            (enrollmentId, status). All days save together or none do.
          </p>
          <textarea
            aria-label="Multiple day records"
            rows={8}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <button
            onClick={() =>
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/bulk`, {
                  method: "POST",
                  headers: { "Idempotency-Key": crypto.randomUUID() },
                  body: JSON.stringify({ days: JSON.parse(bulk) }),
                });
                await load();
                setMessage("All dates saved atomically.");
              })
            }
          >
            Save dates
          </button>
        </details>
      </div>
    </>
  );
}
function Exams({
  section,
  cycle,
  run,
  admin,
  setMessage,
}: Common & { admin: boolean }) {
  const [data, setData] = useState<any>(null),
    [json, setJson] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const path = `/v1/exam-cycles/${cycle}/sections/${section}`;
  async function load() {
    const d = await api<any>(path + "/scheme");
    setData(d);
    setJson(JSON.stringify(d.scheme, null, 2));
  }
  useEffect(() => {
    void run(load);
  }, [section, cycle]);
  return (
    <>
      {admin && (
        <CurriculumPanel
          section={section}
          cycle={cycle}
          run={run}
          onApplied={load}
        />
      )}
      <div className="notice">
        {data?.approval
          ? "Approved scheme. Paper maxima and group membership are locked."
          : "Proposed scheme — approval required before official marks entry."}
      </div>
      <div className="panel">
        <h2>Paper scheme & result groups</h2>
        {admin && (
          <SchemeEditor value={json} onChange={setJson} section={section} />
        )}
        <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Paper label (RTL)</th>
                <th>Maximum</th>
                <th>Type</th>
                <th>Scheduled date</th>
              </tr>
            </thead>
            <tbody>
              {data?.scheme.papers.map((p: any) => (
                <tr key={p.code}>
                  <td>{p.code}</td>
                  <td dir="rtl">{p.label}</td>
                  <td>{p.max}</td>
                  <td>{p.type}</td>
                  <td>
                    {admin && p.id ? (
                      <form
                        className="row"
                        key={p.id + String(p.date)}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const date = new FormData(e.currentTarget).get(
                            "date",
                          );
                          void run(async () => {
                            await api(`/v1/assessments/${p.id}/schedule`, {
                              method: "PUT",
                              body: JSON.stringify({ date }),
                            });
                            await load();
                            setMessage("Paper date saved.");
                          });
                        }}
                      >
                        <input
                          type="date"
                          name="date"
                          aria-label={`Schedule ${p.code}`}
                          defaultValue={p.date ?? ""}
                          required
                        />
                        <button className="secondary">Save date</button>
                      </form>
                    ) : (
                      (p.date ?? "Not scheduled")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 18 }}>
          {data?.scheme.groups.map((g: any) => (
            <span className="tag" key={g.name}>
              {g.name}: {g.paperCodes.join(" + ")} = {g.max}
            </span>
          ))}
        </div>
        {admin && data?.approval && (
          <details>
            <summary>Create a reviewed scheme revision</summary>
            <p>
              Earlier papers, marks and reports are retained. Copied marks must
              fit the new maxima and require fresh submission and approval.
            </p>
            <textarea
              aria-label="Revised paper scheme"
              rows={16}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <label>
              Reason
              <input
                minLength={5}
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                void run(async () => {
                  await api(path + "/scheme/revise", {
                    method: "POST",
                    body: JSON.stringify({
                      scheme: JSON.parse(json),
                      reason: revisionReason,
                      copyMarks: true,
                    }),
                  });
                  await load();
                  setMessage(
                    "New draft scheme revision created. Review and approve it before marks entry.",
                  );
                })
              }
            >
              Create new draft revision
            </button>
          </details>
        )}
        {admin && !data?.approval && (
          <>
            <details>
              <summary>Edit paper definitions & groups</summary>
              <p>
                Every paper uses a section-subject offering ID. Duplicate labels
                are allowed; codes must remain distinct. Every paper must belong
                to one complete group.
              </p>
              <textarea
                aria-label="Paper scheme"
                rows={18}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
              <button
                onClick={() =>
                  void run(async () => {
                    await api(path + "/scheme", { method: "PUT", body: json });
                    await load();
                    setMessage("Draft scheme saved.");
                  })
                }
              >
                Save scheme
              </button>
            </details>
            <button
              onClick={() =>
                void run(async () => {
                  await api(path + "/scheme/approve", {
                    method: "POST",
                    body: "{}",
                  });
                  await load();
                  setMessage("Scheme approved.");
                })
              }
            >
              Approve paper scheme
            </button>
          </>
        )}
      </div>
      {admin && (
        <div className="panel">
          <h2>Attendance window & exam dates</h2>
          <p>
            Attendance and exam periods are configured separately. Existing
            dates:{" "}
            {data?.window
              ? String(data.window.attendance_from).slice(0, 10) +
                " — " +
                String(data.window.attendance_through).slice(0, 10)
              : "Not configured"}
          </p>
          <form
            className="gridform"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api(path + "/window", {
                  method: "PUT",
                  body: JSON.stringify({
                    attendanceFrom: f.get("from"),
                    attendanceThrough: f.get("through"),
                    examStart: f.get("examStart") || null,
                    examEnd: f.get("examEnd") || null,
                    acknowledgeOverlap: f.get("overlap") === "on",
                  }),
                });
                await load();
                setMessage("Window saved.");
              });
            }}
          >
            <label>
              Attendance from
              <input type="date" name="from" required />
            </label>
            <label>
              Attendance through
              <input type="date" name="through" required />
            </label>
            <label>
              Exam start
              <input type="date" name="examStart" />
            </label>
            <label>
              Exam end
              <input type="date" name="examEnd" />
            </label>
            <label>
              Acknowledge intentional overlapping windows
              <input type="checkbox" name="overlap" />
            </label>
            <button>Save dates</button>
          </form>
        </div>
      )}
    </>
  );
}
function Marks({
  run,
  admin,
  setMessage,
  managedSections,
  onSessionImport,
}: Common & {
  admin: boolean;
  managedSections: string[];
  onSessionImport: (section: string, cycle: string) => void;
}) {
  const [markReason, setMarkReason] = useState("");
  const [csv, setCsv] = useState("");
  const [imported, setImported] = useState<any>(null);
  const [papers, setPapers] = useState<any[]>([]),
    [paper, setPaper] = useState(""),
    [data, setData] = useState<any>(null);
  useEffect(() => {
    void run(async () => {
      const p = await api<any[]>("/v1/assessments");
      setPapers(p);
      setPaper(p[0]?.id ?? "");
    });
  }, []);
  async function load() {
    if (paper) setData(await api("/v1/assessments/" + paper + "/marks"));
  }
  useEffect(() => {
    void run(load);
  }, [paper]);
  const canManage = admin || managedSections.includes(data?.paper.section_id);
  return (
    <div className="panel">
      <div className="toolbar">
        <select
          aria-label="Paper"
          value={paper}
          onChange={(e) => setPaper(e.target.value)}
        >
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.section_name ?? ""} · {p.cycle_title ?? ""} · {p.paper_code} ·{" "}
              {p.title} / {p.max_marks}
            </option>
          ))}
        </select>
        <span className="tag">
          {data?.paper.state} ·{" "}
          {data?.paper.submitted_at ? "Submitted" : "Draft marks"}
        </span>
      </div>
      {data && (
        <>
          {canManage && (
            <button
              className="secondary"
              onClick={() =>
                onSessionImport(data.paper.section_id, data.paper.exam_cycle_id)
              }
            >
              Import a full class CSV / open session sheet
            </button>
          )}
          <label>
            Change or import reason
            <input
              value={markReason}
              onChange={(e) => setMarkReason(e.target.value)}
              minLength={5}
            />
          </label>
          <details>
            <summary>Import assigned-paper marks from CSV</summary>
            <p>
              Use student_number and the paper code as column headers. Other
              paper columns are ignored. Empty cells remain unknown; numeric
              zero is a graded score.
            </p>
            <textarea
              aria-label="Marks CSV"
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setImported(null);
              }}
            />
            <button
              onClick={() =>
                void run(async () =>
                  setImported(
                    await api(`/v1/assessments/${paper}/marks/import/preview`, {
                      method: "POST",
                      body: JSON.stringify({ csv, reason: markReason }),
                    }),
                  ),
                )
              }
            >
              Preview marks import
            </button>
            {imported && (
              <>
                <pre>{JSON.stringify(imported, null, 2)}</pre>
                <button
                  disabled={!imported.canApply}
                  onClick={() =>
                    void run(async () => {
                      await api(`/v1/assessments/${paper}/marks/bulk`, {
                        method: "PUT",
                        body: JSON.stringify({ entries: imported.entries }),
                      });
                      await load();
                      setImported(null);
                      setMessage("Assigned-paper marks imported.");
                    })
                  }
                >
                  Apply previewed marks
                </button>
              </>
            )}
          </details>
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label="Scrollable records"
          >
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>State</th>
                  <th>Awarded / {data.paper.max_marks}</th>
                  <th>Exam leave</th>
                  <th>Given on time</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e: any, i: number) => (
                  <tr key={e.enrollmentId}>
                    <td>
                      {e.full_name}
                      <br />
                      <span className="tiny">{e.student_number}</span>
                    </td>
                    <td>
                      <select
                        aria-label={`Mark state ${e.student_number}`}
                        value={e.state ?? "PENDING"}
                        onChange={(event) => {
                          const entries = [...data.entries];
                          entries[i] = {
                            ...e,
                            state: event.target.value,
                            awarded:
                              event.target.value === "GRADED"
                                ? (e.awarded ?? null)
                                : null,
                          };
                          setData({ ...data, entries });
                        }}
                      >
                        {[
                          "PENDING",
                          "GRADED",
                          "ABSENT",
                          "EXEMPT",
                          "WITHHELD",
                          "NOT_APPLICABLE",
                          "UNKNOWN_LEGACY_BLANK",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Awarded ${e.student_number}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={data.paper.max_marks}
                        value={e.awarded ?? ""}
                        disabled={e.state !== "GRADED"}
                        onChange={(event) => {
                          const entries = [...data.entries];
                          entries[i] = {
                            ...e,
                            awarded:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          };
                          setData({ ...data, entries });
                        }}
                      />
                    </td>
                    <td>
                      <label className="check-label">
                        <input
                          aria-label={`Exam leave ${e.student_number}`}
                          type="checkbox"
                          checked={!!e.onLeave}
                          onChange={(event) => {
                            const entries = [...data.entries];
                            entries[i] = {
                              ...e,
                              onLeave: event.target.checked,
                              onTime: event.target.checked ? false : e.onTime,
                            };
                            setData({ ...data, entries });
                          }}
                        />
                        Leave / concession
                      </label>
                    </td>
                    <td>
                      <label className="check-label">
                        <input
                          aria-label={`Given on time ${e.student_number}`}
                          type="checkbox"
                          checked={e.onTime === true}
                          disabled={e.onLeave}
                          onChange={(event) => {
                            const entries = [...data.entries];
                            entries[i] = { ...e, onTime: event.target.checked };
                            setData({ ...data, entries });
                          }}
                        />
                        On time
                      </label>
                      {e.onTime == null && <small>Not confirmed</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="toolbar" style={{ marginTop: 20 }}>
            <button
              onClick={() =>
                void run(async () => {
                  await api(`/v1/assessments/${paper}/marks/bulk`, {
                    method: "PUT",
                    body: JSON.stringify({
                      entries: data.entries.map((e: any) => ({
                        enrollmentId: e.enrollmentId,
                        state: e.state ?? "PENDING",
                        awarded:
                          e.state === "GRADED" &&
                          e.awarded != null &&
                          e.awarded !== ""
                            ? Number(e.awarded)
                            : null,
                        version: e.version ?? 0,
                        onLeave: e.onLeave ?? false,
                        onTime: e.onTime ?? null,
                        ...(markReason ? { reason: markReason } : {}),
                      })),
                    }),
                  });
                  await load();
                  setMessage("Marks saved.");
                })
              }
            >
              Save marks
            </button>
            <button
              className="secondary"
              onClick={() =>
                void run(async () => {
                  await api(`/v1/assessments/${paper}/submit`, {
                    method: "POST",
                    body: "{}",
                  });
                  await load();
                  setMessage("Paper submitted for review.");
                })
              }
            >
              Submit paper
            </button>
            {canManage && (
              <button
                onClick={() =>
                  void run(async () => {
                    await api(`/v1/assessments/${paper}/approve`, {
                      method: "POST",
                      body: "{}",
                    });
                    await load();
                    setMessage("Marks approved.");
                  })
                }
              >
                Approve marks
              </button>
            )}
          </div>
          {canManage && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const reason = new FormData(e.currentTarget).get("reason");
                void run(async () => {
                  await api(`/v1/assessments/${paper}/reopen`, {
                    method: "POST",
                    body: JSON.stringify({ reason }),
                  });
                  await load();
                });
              }}
            >
              <input
                name="reason"
                placeholder="Correction reason"
                required
                minLength={5}
              />
              <button className="secondary">Reopen paper</button>
            </form>
          )}
        </>
      )}
      {!papers.length && <p className="empty">No papers assigned.</p>}
    </div>
  );
}
function Policies({ run, setMessage }: Common) {
  const [data, setData] = useState<any>(null),
    [policy, setPolicy] = useState("");
  async function load() {
    const d = await api<any>("/v1/policies");
    setData(d);
    setPolicy(JSON.stringify(d.config.draftPolicy ?? institutePolicy, null, 2));
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <div className="panel">
      <h2>Academic policy approval</h2>
      <div className="notice">
        {data?.config.approvedPolicy
          ? "An approved policy exists. Saving a draft removes approval until reviewed again."
          : "Unapproved. No official grade, attendance percentage or ranking will be published."}
      </div>
      <p>
        The institutional pass minimum is 40%. Positions require more than 80%,
        every paper on time, no exam leave, and a top-three shared position.
        Present earns 1, Half earns 0.5, Absent earns 0 and Leave is excluded.
        Review the remaining configuration, a backdate window, contiguous grade
        bands covering 0–100 (exclusive final bound 101), eligibility
        (ACTIVE_AT_WINDOW_END or ANY_ENROLLED_IN_WINDOW), COMPETITION or DENSE
        ranking, missing mark resolutions (ABSENT: BLOCK/ZERO; EXEMPT:
        BLOCK/EXCLUDE), pass rules, and rounding (HALF_UP/HALF_EVEN/DOWN). No
        thresholds have been inferred.
      </p>
      <PolicyEditor value={policy} onChange={setPolicy} />
      <details>
        <summary>Advanced policy data</summary>
        <textarea
          aria-label="Academic policy"
          rows={25}
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
        />
      </details>
      <div className="toolbar" style={{ marginTop: 16 }}>
        {[false, true].map((approve) => (
          <button
            key={String(approve)}
            className={approve ? "" : "secondary"}
            onClick={() =>
              void run(async () => {
                await api("/v1/policies", {
                  method: "PUT",
                  body: JSON.stringify({
                    policy: JSON.parse(policy),
                    approve,
                    version: data.version,
                  }),
                });
                await load();
                setMessage(
                  approve
                    ? "Policy explicitly approved."
                    : "Unapproved draft saved.",
                );
              })
            }
          >
            {approve ? "Approve institute policy" : "Save unapproved draft"}
          </button>
        ))}
      </div>
    </div>
  );
}
function Results({
  section,
  cycle,
  run,
  admin,
  setMessage,
}: Common & { admin: boolean }) {
  const [performanceRefresh, setPerformanceRefresh] = useState(0);
  const [publishedRefresh, setPublishedRefresh] = useState(0);
  const [report, setReport] = useState<any>(null),
    [runs, setRuns] = useState<any[]>([]),
    [reason, setReason] = useState("");
  async function load() {
    setRuns(await api<any[]>("/v1/results"));
    setReport(null);
  }
  useEffect(() => {
    void run(load);
  }, [section, cycle]);
  const selectedRuns = runs.filter(
    (r) => r.section_id === section && r.exam_cycle_id === cycle,
  );
  return (
    <>
      <SessionResultSheet
        key={publishedRefresh}
        section={section}
        cycle={cycle}
        onImported={() => {
          setReport(null);
          setPerformanceRefresh((n) => n + 1);
        }}
      />
      <StudentPerformance
        key={performanceRefresh}
        section={section}
        cycle={cycle}
        run={run}
      />
      <div className="panel">
        <h2>Preflight & publication</h2>
        <p>
          Every counting attendance day must be submitted and all marks
          resolved. Publication creates stable PDFs and an immutable revision.
        </p>
        <button
          onClick={() =>
            void run(async () =>
              setReport(
                await api(`/v1/results/${cycle}/${section}/validate`, {
                  method: "POST",
                  body: "{}",
                }),
              ),
            )
          }
        >
          Validate & preview
        </button>
        {report && (
          <>
            <div
              className={"notice " + (report.canPublish ? "success" : "error")}
            >
              {report.canPublish
                ? "All publication checks passed."
                : `${report.blockingErrors.length} blocking issues`}
              <ul>
                {report.blockingErrors.map((e: string) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
            <div
              className="tablewrap"
              tabIndex={0}
              aria-label="Scrollable records"
            >
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Groups</th>
                    <th>Total</th>
                    <th>Percent</th>
                    <th>Grade</th>
                    <th>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {report.snapshot.students.map((s: any) => (
                    <tr key={s.enrollmentId}>
                      <td>{s.name}</td>
                      <td>{s.groups.map((g: any) => g.awarded).join(" / ")}</td>
                      <td>
                        {s.total} / {s.possible}
                      </td>
                      <td>{s.displayPercent}</td>
                      <td>{s.grade ?? "Policy required"}</td>
                      <td>{s.rank ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {admin && (
              <div className="toolbar" style={{ marginTop: 20 }}>
                <input
                  placeholder="Reason for correction revision"
                  aria-label="Correction reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  disabled={!report.canPublish}
                  onClick={() =>
                    void run(async () => {
                      await api(`/v1/results/${cycle}/${section}/publish`, {
                        method: "POST",
                        headers: { "Idempotency-Key": crypto.randomUUID() },
                        body: JSON.stringify({
                          validationHash: report.validationHash,
                          ...(reason ? { correctionReason: reason } : {}),
                        }),
                      });
                      await load();
                      setPublishedRefresh((n) => n + 1);
                      setPerformanceRefresh((n) => n + 1);
                      setMessage(
                        "Immutable result revision and PDFs published.",
                      );
                    })
                  }
                >
                  Publish result revision
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="panel">
        <h2>Publication archive</h2>
        {selectedRuns.map((r) => (
          <div key={r.id} className="toolbar">
            <span className="tag">
              Revision {r.revision} · {r.state}
            </span>
            <a href={`/v1/results/${r.id}/sectionsheet.pdf`}>Class PDF ↓</a>
            <a href={`/v1/results/${r.id}/export.csv`}>CSV ↓</a>
            <details>
              <summary>Individual report cards</summary>
              {r.students?.map((s: any) => (
                <p key={s.enrollmentId}>
                  <a
                    href={`/v1/results/${r.id}/students/${s.enrollmentId}.pdf`}
                  >
                    {s.name} · A4 PDF ↓
                  </a>
                </p>
              ))}
            </details>
          </div>
        ))}
        {!selectedRuns.length && (
          <p className="empty">
            No published results for this class and exam session yet.
          </p>
        )}
      </div>
    </>
  );
}
function People({ run, setMessage }: Common) {
  const [users, setUsers] = useState<any[]>([]);
  const [recoveryLink, setRecoveryLink] = useState("");
  async function load() {
    setUsers(await api<any[]>("/v1/users"));
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <div className="panel">
      <h2>Staff access</h2>
      <CreateAccount run={run} onSaved={load} />
      <ChangePassword run={run} users={users} />
      <Invite run={run} />
      <details>
        <summary>Administrator-assisted password recovery</summary>
        <form
          className="gridform"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              const result = await api<{ activationUrl: string }>(
                `/v1/users/${f.get("user")}/reset-password`,
                {
                  method: "POST",
                  body: JSON.stringify({ reason: f.get("reason") }),
                },
              );
              setRecoveryLink(result.activationUrl);
            });
          }}
        >
          <label>
            Staff account
            <select name="user">
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Recovery reason
            <input name="reason" minLength={5} required />
          </label>
          <button>Create private recovery link</button>
        </form>
        {recoveryLink && (
          <div className="notice">
            Deliver this single-use link privately after verifying staff
            identity. It expires in two hours and using it revokes existing
            sessions.
            <br />
            <a href={recoveryLink}>{recoveryLink}</a>
          </div>
        )}
      </details>
      <p>
        Changes revoke existing sessions immediately. The last active
        administrator cannot be removed.
      </p>
      <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name}</td>
                <td>{u.email}</td>
                <td>{u.roles.join(", ") || "Assigned staff"}</td>
                <td>{u.active ? "Active" : "Disabled"}</td>
                <td>
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await api("/v1/users/" + u.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            active: !u.active,
                            admin: u.roles.includes("ADMIN"),
                          }),
                        });
                        await load();
                        setMessage("Access updated; sessions revoked.");
                      })
                    }
                  >
                    {u.active ? "Disable" : "Activate"}
                  </button>{" "}
                  <button
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await api("/v1/users/" + u.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            active: u.active,
                            admin: !u.roles.includes("ADMIN"),
                          }),
                        });
                        await load();
                        setMessage("Role updated; sessions revoked.");
                      })
                    }
                  >
                    {u.roles.includes("ADMIN") ? "Revoke admin" : "Grant admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void api<any[]>("/v1/audit").then(setRows);
  }, []);
  return (
    <div className="panel">
      <h2>Audit history</h2>
      <p>Most recent 200 events. Audit rows are append-only.</p>
      <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Object</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.event_at).toLocaleString()}</td>
                <td>{r.action}</td>
                <td>{r.object_type}</td>
                <td>{r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Invite({ run }: { run: Common["run"] }) {
  const [url, setUrl] = useState("");
  return (
    <>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          void run(async () => {
            const r = await api<{ activationUrl: string }>("/v1/invitations", {
              method: "POST",
              body: JSON.stringify(f),
            });
            setUrl(r.activationUrl);
          });
        }}
      >
        <label>
          Staff name
          <input name="name" required />
        </label>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <button>Create private invitation</button>
      </form>
      {url && (
        <div className="notice">
          Deliver this single-use link privately to the invited staff member. It
          expires in 48 hours.
          <br />
          <a href={url}>{url}</a>
        </div>
      )}
    </>
  );
}
function SectionTools({
  section,
  refs,
  run,
  setMessage,
}: {
  section: string;
  refs: Record<string, any[]>;
  run: Common["run"];
  setMessage: (s: string) => void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [offerings, setOfferings] = useState<any[]>([]),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<any>(null);
  async function load() {
    setOfferings(await api<any[]>(`/v1/sections/${section}/subjects`));
  }
  useEffect(() => {
    void run(load);
  }, [section]);
  return (
    <>
      <h3>Subject offerings & teachers</h3>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const subject_id = new FormData(e.currentTarget).get("subject_id");
          void run(async () => {
            await api(`/v1/sections/${section}/subjects`, {
              method: "POST",
              body: JSON.stringify({ subject_id }),
            });
            await load();
            setMessage("Subject offered to section.");
          });
        }}
      >
        <label>
          Subject
          <select name="subject_id">
            {refs.subjects?.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name_ur ?? s.name_en}
              </option>
            ))}
          </select>
        </label>
        <button>Offer subject</button>
      </form>
      <form
        className="gridform"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            await api(`/v1/offerings/${f.get("offering")}/teachers`, {
              method: "POST",
              body: JSON.stringify({
                teacher_user_id: f.get("teacher"),
                starts_on: f.get("starts_on"),
              }),
            });
            setMessage("Teacher assigned to subject offering.");
          });
        }}
      >
        <label>
          Offering
          <select name="offering">
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name_ur ?? o.name_en} · {o.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Teacher
          <select name="teacher">
            {refs.users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignment starts
          <input name="starts_on" type="date" required />
        </label>
        <button>Assign subject teacher</button>
      </form>
      <details>
        <summary>Student CSV import · preview before applying</summary>
        <p>
          Map your source columns to student number, learner name, roll number
          and joining date. Canonical headers work without a mapping. UTF-8 Urdu
          is supported. Duplicate IDs and spreadsheet formulas are rejected.
          Each apply is atomic.
        </p>
        <textarea
          aria-label="Student import CSV"
          rows={8}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setMapping({});
            setPreview(null);
          }}
        />
        <div className="gridform">
          {["student_number", "full_name", "roll_number", "joined_on"].map(
            (field) => (
              <label key={field}>
                Source column for {labels(field)}
                <input
                  list="csv-import-headers"
                  value={mapping[field] ?? field}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field]: e.target.value })
                  }
                />
              </label>
            ),
          )}
        </div>
        <datalist id="csv-import-headers">
          {(csv.split(/\r?\n/)[0] ?? "")
            .replace(/^\uFEFF/, "")
            .split(",")
            .map((h, i) => (
              <option key={i} value={h.replace(/^"|"$/g, "")} />
            ))}
        </datalist>
        <button
          onClick={() =>
            void run(async () =>
              setPreview(
                await api(`/v1/sections/${section}/import/preview`, {
                  method: "POST",
                  body: JSON.stringify({
                    csv,
                    columnMapping: Object.fromEntries(
                      [
                        "student_number",
                        "full_name",
                        "roll_number",
                        "joined_on",
                      ].map((k) => [k, mapping[k] ?? k]),
                    ),
                  }),
                }),
              ),
            )
          }
        >
          Preview CSV
        </button>
        {preview && (
          <>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
            <button
              disabled={!preview.canApply}
              onClick={() =>
                void run(async () => {
                  await api(`/v1/imports/${preview.jobId}/apply`, {
                    method: "POST",
                    body: "{}",
                  });
                  setPreview(null);
                  setCsv("");
                  setMessage("Student import applied.");
                })
              }
            >
              Apply validated import
            </button>
          </>
        )}
      </details>
      <PromotionPicker section={section} run={run} />
    </>
  );
}
function Corrections({ run }: { run: Common["run"] }) {
  const [requests, setRequests] = useState<any[]>([]);
  async function load() {
    setRequests(await api<any[]>("/v1/corrections"));
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <div className="panel">
      <h2>Historical attendance corrections</h2>
      {requests.map((r) => (
        <form
          key={r.id}
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await api(`/v1/corrections/${r.id}/review`, {
                method: "POST",
                body: JSON.stringify({
                  approve: f.get("decision") === "approve",
                  reason: f.get("reason"),
                }),
              });
              await load();
            });
          }}
        >
          <h3>
            {r.name} · {String(r.school_date).slice(0, 10)}
          </h3>
          <p>
            {r.display_name}: {r.reason}
          </p>
          <span className="tag">{r.status}</span>
          {r.status === "OPEN" && (
            <div className="toolbar">
              <select aria-label="Decision" name="decision">
                <option value="approve">Approve & reopen</option>
                <option value="reject">Reject</option>
              </select>
              <input
                aria-label="Review reason"
                name="reason"
                placeholder="Review reason"
                minLength={5}
                required
              />
              <button>Record decision</button>
            </div>
          )}
        </form>
      ))}
      {!requests.length && <p>No correction requests.</p>}
    </div>
  );
}
function MultiDayGrid({
  section,
  run,
  setMessage,
}: {
  section: string;
  run: Common["run"];
  setMessage: (s: string) => void;
}) {
  const [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [days, setDays] = useState<(Sheet & { schoolDate: string })[]>([]),
    [values, setValues] = useState<Record<string, Record<string, string>>>({});
  async function load() {
    if (!from || !through || from > through)
      throw new Error("Choose a valid date range");
    const size = (Date.parse(through) - Date.parse(from)) / 86400000 + 1;
    if (size > 31) throw new Error("Choose at most 31 dates");
    const calendar = await api<any[]>(
      `/v1/sections/${section}/calendar?from=${from}&through=${through}`,
    );
    const loaded = await Promise.all(
      calendar
        .filter((c) => c.counts_for_attendance)
        .map((c) =>
          api<Sheet & { schoolDate: string }>(
            `/v1/sections/${section}/attendance/${String(c.school_date).slice(0, 10)}`,
          ),
        ),
    );
    setDays(loaded);
    setValues(
      Object.fromEntries(
        loaded.map((d) => [
          d.schoolDate,
          Object.fromEntries(d.records.map((r) => [r.enrollmentId, r.status])),
        ]),
      ),
    );
  }
  const roster = Array.from(
    new Map(days.flatMap((d) => d.roster).map((r) => [r.id, r])).values(),
  );
  return (
    <details>
      <summary>Attendance grid · up to 31 dates</summary>
      <div className="toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </label>
        <button onClick={() => void run(load)}>Load date grid</button>
      </div>
      {days.length > 0 && (
        <>
          <p>
            Submitted and locked days are read-only. Saving requires explicit
            confirmation and applies every editable date in one transaction.
          </p>
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label="Scrollable records"
          >
            <table>
              <thead>
                <tr>
                  <th>Learner</th>
                  {days.map((d) => (
                    <th key={d.schoolDate}>
                      {d.schoolDate}
                      <br />
                      {d.status}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.id}>
                    <td>{r.full_name}</td>
                    {days.map((d) => (
                      <td key={d.schoolDate}>
                        {d.roster.some((e) => e.id === r.id) ? (
                          <select
                            aria-label={`${r.full_name} ${d.schoolDate}`}
                            disabled={d.status !== "DRAFT"}
                            value={values[d.schoolDate]?.[r.id] ?? ""}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [d.schoolDate]: {
                                  ...values[d.schoolDate],
                                  [r.id]: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Unmarked</option>
                            {statuses.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          "Not enrolled"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/bulk`, {
                  method: "POST",
                  headers: { "Idempotency-Key": crypto.randomUUID() },
                  body: JSON.stringify({
                    days: days
                      .filter((d) => d.status === "DRAFT")
                      .map((d) => ({
                        schoolDate: d.schoolDate,
                        version: d.version,
                        records: Object.entries(values[d.schoolDate])
                          .filter(([, v]) => v)
                          .map(([enrollmentId, status]) => ({
                            enrollmentId,
                            status,
                          })),
                      })),
                  }),
                });
                await load();
                setMessage("Date grid saved atomically.");
              });
            }}
          >
            <label>
              <input type="checkbox" required />I confirm saving the selected
              editable dates.
            </label>
            <button>Save all editable dates</button>
          </form>
        </>
      )}
      {days.length === 0 && <p>No dates loaded.</p>}
    </details>
  );
}
function PolicyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  let p: any;
  try {
    p = JSON.parse(value);
  } catch {
    return <p>Correct the advanced policy data to continue with the form.</p>;
  }
  if (!p?.attendance) return null;
  const change = (fn: (copy: any) => void) => {
    const copy = structuredClone(p);
    fn(copy);
    onChange(JSON.stringify(copy, null, 2));
  };
  const numeric = (
    label: string,
    val: any,
    set: (copy: any, v: number | null) => void,
    min = 0,
    max = 100,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        disabled={
          label.endsWith(": earned credit") ||
          label.endsWith(": possible credit") ||
          label.startsWith("Overall pass minimum") ||
          label.startsWith("Paper pass minimum") ||
          label.startsWith("Show top positions")
        }
        min={min}
        max={max}
        step="0.001"
        value={val ?? ""}
        placeholder="Not configured"
        onChange={(e) =>
          change((c) =>
            set(c, e.target.value === "" ? null : Number(e.target.value)),
          )
        }
      />
    </label>
  );
  const select = (
    label: string,
    val: any,
    choices: [string, string][],
    set: (copy: any, v: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={val ?? ""}
        onChange={(e) => change((c) => set(c, e.target.value))}
      >
        <option value="">Choose explicitly</option>
        {choices.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <h3>Attendance credits & edit permissions</h3>
      <p>
        Choose the numerator and denominator credit for each status. These are
        institute decisions; no values are prefilled.
      </p>
      <div className="gridform">
        {statuses.map((status) => (
          <div key={status}>
            {numeric(
              `${status}: earned credit`,
              p.attendance.credits?.[status]?.earned,
              (c, v) => {
                c.attendance.credits ??= {};
                c.attendance.credits[status] ??= {};
                c.attendance.credits[status].earned = v;
              },
              0,
              999,
            )}
            {numeric(
              `${status}: possible credit`,
              p.attendance.credits?.[status]?.possible,
              (c, v) => {
                c.attendance.credits ??= {};
                c.attendance.credits[status] ??= {};
                c.attendance.credits[status].possible = v;
              },
              0,
              999,
            )}
          </div>
        ))}
        {numeric(
          "Authorized backdate days",
          p.attendance.backdateDays,
          (c, v) => (c.attendance.backdateDays = v),
          0,
          366,
        )}
        {numeric(
          "Attendance display decimal places",
          p.attendance.decimals,
          (c, v) => (c.attendance.decimals = v),
          0,
          4,
        )}
        {select(
          "Zero attendance denominator",
          p.attendance.zeroDenominator,
          [
            ["BLOCK", "Block official publication"],
            ["SHOW_NA", "Show not applicable"],
          ],
          (c, v) => (c.attendance.zeroDenominator = v),
        )}
      </div>
      <h3>Grade bands</h3>
      <p>
        Enter official labels and contiguous percentage bands. The final
        exclusive bound is 101 so a score of 100 is included.
      </p>
      {p.grades?.map((g: any, i: number) => (
        <div className="gridform" key={i}>
          <label>
            Grade label
            <input
              value={g.label ?? ""}
              onChange={(e) =>
                change((c) => (c.grades[i].label = e.target.value))
              }
            />
          </label>
          {numeric(
            "Minimum inclusive percentage",
            g.min,
            (c, v) => (c.grades[i].min = v),
          )}
          {numeric(
            "Maximum exclusive percentage",
            g.max,
            (c, v) => (c.grades[i].max = v),
            0,
            101,
          )}
          {select(
            "Pass status",
            g.pass == null ? "" : String(g.pass),
            [
              ["true", "Passing"],
              ["false", "Failing"],
            ],
            (c, v) => (c.grades[i].pass = v === "true"),
          )}
          <button
            className="secondary"
            onClick={() => change((c) => c.grades.splice(i, 1))}
          >
            Remove band
          </button>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() =>
          change((c) => {
            c.grades ??= [];
            c.grades.push({ label: "", min: null, max: null, pass: null });
          })
        }
      >
        Add official grade band
      </button>
      <h3 style={{ marginTop: 24 }}>
        Pass rules, missing marks & result eligibility
      </h3>
      <div className="gridform">
        {numeric(
          "Overall pass minimum percentage",
          p.passMinimumPercent,
          (c, v) => (c.passMinimumPercent = v),
        )}
        {numeric(
          "Paper pass minimum percentage (blank = no additional minimum)",
          p.paperMinimumPercent,
          (c, v) => (c.paperMinimumPercent = v),
        )}
        {select(
          "Absent paper resolution",
          p.missing?.absent,
          [
            ["BLOCK", "Block until resolved"],
            ["ZERO", "Count as zero with full maximum"],
          ],
          (c, v) => {
            c.missing ??= {};
            c.missing.absent = v;
          },
        )}
        {select(
          "Exempt paper resolution",
          p.missing?.exempt,
          [
            ["BLOCK", "Block until resolved"],
            ["EXCLUDE", "Exclude from the denominator"],
          ],
          (c, v) => {
            c.missing ??= {};
            c.missing.exempt = v;
          },
        )}
        {select(
          "Learners eligible for a result",
          p.eligibility,
          [
            ["ACTIVE_AT_WINDOW_END", "Enrolled on attendance-window end date"],
            [
              "ANY_ENROLLED_IN_WINDOW",
              "Enrolled at any point in the attendance window",
            ],
          ],
          (c, v) => (c.eligibility = v),
        )}
        {select(
          "Display rounding",
          p.rounding,
          [
            ["HALF_UP", "Round half up"],
            ["HALF_EVEN", "Round half to even"],
            ["DOWN", "Round down"],
          ],
          (c, v) => (c.rounding = v),
        )}
      </div>
      <h3>Ranking</h3>
      <div className="gridform">
        {select(
          "Tie strategy",
          p.ranking?.tie,
          [
            ["COMPETITION", "Competition: 1, 1, 3"],
            ["DENSE", "Dense: 1, 1, 2"],
          ],
          (c, v) => {
            c.ranking ??= {};
            c.ranking.tie = v;
          },
        )}
        {select(
          "Who receives positions",
          p.ranking?.onlyPassing == null ? "" : String(p.ranking.onlyPassing),
          [
            ["true", "Passing learners only"],
            ["false", "All eligible learners"],
          ],
          (c, v) => {
            c.ranking ??= {};
            c.ranking.onlyPassing = v === "true";
          },
        )}
        {numeric(
          "Show top positions only (blank = all positions)",
          p.ranking?.topN,
          (c, v) => {
            c.ranking ??= {};
            c.ranking.topN = v;
          },
          1,
          10000,
        )}
      </div>
    </>
  );
}
function SchemeEditor({
  value,
  onChange,
  section,
}: {
  value: string;
  onChange: (s: string) => void;
  section: string;
}) {
  const [offerings, setOfferings] = useState<any[]>([]);
  useEffect(() => {
    void api<any[]>(`/v1/sections/${section}/subjects`)
      .then(setOfferings)
      .catch(() => setOfferings([]));
  }, [section]);
  let s: any;
  try {
    s = JSON.parse(value);
  } catch {
    return <p>Correct advanced scheme data before editing the table.</p>;
  }
  if (!s?.papers) return null;
  const change = (fn: (copy: any) => void) => {
    const copy = structuredClone(s);
    fn(copy);
    onChange(JSON.stringify(copy, null, 2));
  };
  return (
    <details>
      <summary>Configure papers and group membership</summary>
      <p>
        Changes remain local until saved as a draft or submitted as a reviewed
        revision. Repeated labels are allowed. Codes identify distinct papers.
      </p>
      <div className="tablewrap" tabIndex={0} aria-label="Scrollable records">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Code</th>
              <th>Offering</th>
              <th>Urdu label</th>
              <th>Max marks</th>
              <th>Type</th>
              <th>Question pattern</th>
              <th>Exam date</th>
              <th>Group</th>
            </tr>
          </thead>
          <tbody>
            {s.papers.map((p: any, i: number) => (
              <tr key={i}>
                <td>
                  <button
                    className="secondary"
                    disabled={i === 0}
                    onClick={() =>
                      change((c) => {
                        [c.papers[i - 1], c.papers[i]] = [
                          c.papers[i],
                          c.papers[i - 1],
                        ];
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="secondary"
                    disabled={i === s.papers.length - 1}
                    onClick={() =>
                      change((c) => {
                        [c.papers[i], c.papers[i + 1]] = [
                          c.papers[i + 1],
                          c.papers[i],
                        ];
                      })
                    }
                  >
                    ↓
                  </button>
                </td>
                <td>
                  <input
                    aria-label={`Paper ${i + 1} code`}
                    value={p.code}
                    onChange={(e) =>
                      change((c) => {
                        const old = c.papers[i].code;
                        c.papers[i].code = e.target.value;
                        for (const g of c.groups)
                          g.paperCodes = g.paperCodes.map((code: string) =>
                            code === old ? e.target.value : code,
                          );
                      })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label={`Paper ${i + 1} offering`}
                    value={p.offeringId}
                    onChange={(e) =>
                      change((c) => (c.papers[i].offeringId = e.target.value))
                    }
                  >
                    <option value="">Choose offering</option>
                    {offerings.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name_ur ?? o.name_en}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Paper ${i + 1} label`}
                    dir="rtl"
                    value={p.label}
                    onChange={(e) =>
                      change((c) => (c.papers[i].label = e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Paper ${i + 1} maximum`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={p.max ?? ""}
                    onChange={(e) =>
                      change(
                        (c) =>
                          (c.papers[i].max =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)),
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    value={p.type}
                    aria-label={`Paper ${i + 1} type`}
                    onChange={(e) =>
                      change((c) => (c.papers[i].type = e.target.value))
                    }
                  >
                    {["WRITTEN", "ORAL", "PRACTICAL", "OTHER"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={p.pattern ?? ""}
                    aria-label={`Paper ${i + 1} question pattern`}
                    onChange={(e) =>
                      change((c) => (c.papers[i].pattern = e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={p.date ?? ""}
                    aria-label={`Paper ${i + 1} exam date`}
                    onChange={(e) =>
                      change((c) => (c.papers[i].date = e.target.value || null))
                    }
                  />
                </td>
                <td>
                  <select
                    value={s.groups.findIndex((g: any) =>
                      g.paperCodes.includes(p.code),
                    )}
                    aria-label={`Paper ${i + 1} group`}
                    onChange={(e) =>
                      change((c) => {
                        for (const g of c.groups)
                          g.paperCodes = g.paperCodes.filter(
                            (code: string) => code !== p.code,
                          );
                        if (Number(e.target.value) >= 0)
                          c.groups[Number(e.target.value)].paperCodes.push(
                            p.code,
                          );
                      })
                    }
                  >
                    <option value={-1}>Unassigned</option>
                    {s.groups.map((g: any, n: number) => (
                      <option value={n} key={n}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="secondary"
        onClick={() =>
          change((c) =>
            c.papers.push({
              offeringId: "",
              code: `P${c.papers.length + 1}`,
              label: "",
              max: null,
              type: "WRITTEN",
              pattern: "",
              date: null,
            }),
          )
        }
      >
        Add paper
      </button>
      <h3 style={{ marginTop: 20 }}>Group maxima</h3>
      {s.groups.map((g: any, i: number) => {
        const actual = sumMarks(
          s.papers
            .filter((p: any) => g.paperCodes.includes(p.code))
            .map((p: any) => p.max ?? 0),
        );
        return (
          <div className="toolbar" key={i}>
            <label>
              Group name
              <input
                value={g.name}
                onChange={(e) =>
                  change((c) => (c.groups[i].name = e.target.value))
                }
              />
            </label>
            <label>
              Declared maximum
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={g.max}
                onChange={(e) =>
                  change((c) => (c.groups[i].max = Number(e.target.value)))
                }
              />
            </label>
            <span className={"tag " + (actual !== g.max ? "error" : "")}>
              Paper maxima: {actual} / {g.max}
            </span>
          </div>
        );
      })}
      <button
        className="secondary"
        disabled={s.groups.length >= 6}
        onClick={() =>
          change((c) =>
            c.groups.push({
              name: `G${c.groups.length + 1}`,
              max: 100,
              paperCodes: [],
            }),
          )
        }
      >
        Add proposed group
      </button>
    </details>
  );
}
function AttendancePermissions({ run }: { run: Common["run"] }) {
  const [data, setData] = useState<any>(null),
    [days, setDays] = useState(""),
    [reason, setReason] = useState("");
  async function load() {
    const r = await api<any>("/v1/attendance-permissions");
    setData(r);
    setDays(r.days === null ? "" : String(r.days));
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <details>
      <summary>Historical edit permissions</summary>
      <p>
        Assigned staff can record today without an approved grading policy.
        Historical edits require a separately approved window. Current window:{" "}
        {data?.days === null ? "Not approved" : `${data?.days} days`}.
      </p>
      {data?.canConfigure && (
        <form
          className="gridform"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/v1/attendance-permissions", {
                method: "PUT",
                body: JSON.stringify({
                  days: days === "" ? null : Number(days),
                  version: data.version,
                  reason,
                }),
              });
              await load();
            });
          }}
        >
          <label>
            Authorized backdate days (blank revokes historical permission)
            <input
              type="number"
              min="0"
              max="366"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <label>
            Approval or revocation reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
            />
          </label>
          <button>Record permission decision</button>
        </form>
      )}
    </details>
  );
}
