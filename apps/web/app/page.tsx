"use client";

import { InstituteDetails } from "../components/institute-details";
import { AccountSettings } from "../components/account-settings";
import { LanguageSwitch, useI18n } from "../components/language";
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
  const { t, language } = useI18n();

  const [passwordChanged, setPasswordChanged] = useState(false);
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
        <span>{t("Opening your workspace…")}</span>
      </div>
    );
  if (!me)
    return (
      <AuthFrame>
        <div className="eyebrow">{t("YOUR ACADEMIC WORKSPACE")}</div>
        <h2 className="login-title">{t("Welcome back.")}</h2>
        <p className="login-intro">
          {t("A little clarity for your busy day.")}
          <br />
          {t("Sign in to continue to Hikmah.")}
        </p>
        {passwordChanged && (
          <p role="status" className="notice success">
            {t("Password changed. Sign in again with your new password.")}
          </p>
        )}
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
              setPasswordChanged(false);
              await load();
            });
          }}
        >
          <label>
            {t("Email address")}
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder={t("you@institute.edu")}
            />
          </label>
          <label>
            {t("Password")}
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder={t("Enter your password")}
            />
          </label>
          {error && (
            <p role="alert" className="notice error">
              {t(error)}
            </p>
          )}
          <button className="login-submit" disabled={busy}>
            {t(busy ? "Signing in…" : "Sign in")}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="tiny" style={{ marginTop: 24 }}>
          {t(
            "Forgot your password? Contact an administrator for a private recovery link. Access is limited to assigned classes.",
          )}
        </p>
      </AuthFrame>
    );
  const common = { section, cycle, run, busy, setMessage };
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        {t("Skip to content")}
      </a>
      <aside>
        <Brand subtitle={t("ACADEMIC OFFICE")} />
        <div className="nav-caption">{t("WORKSPACE")}</div>
        <nav aria-label={t("Main navigation")}>
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
                <span>{t(v)}</span>
              </button>
            ))}
        </nav>
        <footer>
          <span className="footer-symbol" aria-hidden="true">
            {t("✧")}
          </span>
          <strong>{t("Learning with purpose.")}</strong>
          <span lang="ur" dir="rtl">
            {t("علم، عمل، حکمت")}
          </span>
          <span className="tiny">{t("Hikmah staff workspace")}</span>
        </footer>
      </aside>
      <div className="workspace">
        <header>
          <span className="breadcrumb">
            {t("Workspace ")}
            <span aria-hidden="true">{t("/")}</span> <strong>{t(view)}</strong>
          </span>
          <div className="account">
            <LanguageSwitch />
            <AccountSettings
              onChanged={() => {
                setMe(null);
                setPasswordChanged(true);
                setError("");
              }}
            />
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
                {t(
                  admin
                    ? "Administrator"
                    : me.managedSections.length
                      ? "Mushrif"
                      : me.teachingSections.length
                        ? "Subject teacher"
                        : "Ameer",
                )}
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
              <span>{t("Sign out")}</span>
            </button>
          </div>
        </header>
        <main key={me.accessVersion} id="main-content" tabIndex={-1}>
          <div className={view === "Overview" ? "top overview-top" : "top"}>
            <div>
              <div className="eyebrow">
                {t(
                  view === "Overview"
                    ? "A LITTLE CLARITY, EVERY DAY"
                    : "HIKMAH ACADEMIC MANAGEMENT",
                )}
              </div>
              <h1>
                {t(
                  view === "Overview" ? "A clear view of your institute" : view,
                )}
              </h1>
              <p>
                {t(
                  view === "Overview"
                    ? "Your classes, your people, your next steps. All in one place."
                    : "Your assigned records, kept accurate and accountable.",
                )}
              </p>
            </div>
            <span className="tag date-tag">
              <Icon name="Attendance" />
              {t(
                new Date().toLocaleDateString(
                  language === "ur" ? "ur-PK" : "en-GB",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Karachi",
                  },
                ),
              )}
            </span>
          </div>
          {error && (
            <div role="alert" className="notice error message">
              {t(error)}
            </div>
          )}
          {message && (
            <div role="status" className="notice success message">
              {t(message)}
            </div>
          )}
          {busy && (
            <div role="status" className="tiny">
              {t("Working…")}
            </div>
          )}
          {["Attendance", "Exams & schemes", "Results & reports"].includes(
            view,
          ) && (
            <div className="toolbar">
              <select
                aria-label={t("Section")}
                value={section}
                onChange={(e) => setSection(e.target.value)}
              >
                {allowedSections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name} {t(" · ")}
                    {s.code}
                  </option>
                ))}
              </select>
              {view !== "Attendance" && (
                <select
                  aria-label={t("Exam cycle")}
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
                    <h2>{t("Your sections")}</h2>
                    <span className="tag">
                      {t(sections.length)} {t(" sections")}
                    </span>
                  </div>
                  <div
                    className="tablewrap"
                    tabIndex={0}
                    aria-label={t("Your sections")}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Section")}</th>
                          <th>{t("Academic year / program")}</th>
                          <th>{t("Next action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.name}</strong>
                            </td>
                            <td>
                              {s.year_label} {t(" · ")}
                              {s.program_name}
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
                                {t(
                                  admin || me.attendanceSections.includes(s.id)
                                    ? "Open attendance →"
                                    : "Open assigned papers →",
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!sections.length && (
                    <p className="empty">
                      {t(
                        "No assigned sections. An administrator can assign your access.",
                      )}
                    </p>
                  )}
                </div>
                <div className="panel">
                  <div className="eyebrow">{t("YOUR NEXT STEP")}</div>
                  <h2>{t("Quick actions")}</h2>
                  <p>
                    {t(
                      "Open the tools available for your assigned responsibilities.",
                    )}
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
                          {t(v)}
                          <Icon name="arrow" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "Academic setup" && (
            <>
              <InstituteDetails />
              <Setup {...common} reload={load} sections={sections} />
            </>
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
  const { t } = useI18n();

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
            {t(labels(r))}
          </button>
        ))}
      </div>
      <div className="panel">
        <h2>
          {t(editing ? "Edit" : "Create")} {t(labels(resource))}
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
              {t(labels(k))}
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
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
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
            {t(editing ? "Save changes" : "Create record")}
          </button>
          {editing && (
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              {t("Cancel edit")}
            </button>
          )}
        </form>
        <div
          className="tablewrap"
          tabIndex={0}
          aria-label={t("Scrollable records")}
        >
          <table>
            <thead>
              <tr>
                {fields[resource].map((k) => (
                  <th key={k}>{t(labels(k))}</th>
                ))}
                <th>{t("Record")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {fields[resource].map((k) => (
                    <td key={k}>{t(String(r[k] ?? "—"))}</td>
                  ))}
                  <td>
                    <button className="secondary" onClick={() => setEditing(r)}>
                      {t("Edit")}
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
        <h2>{t("Enroll learners & assign staff")}</h2>
        <label>
          {t("Section")}
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
            <option value="">{t("Choose section")}</option>
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
                {t("Student")}
                <select name="student_id">
                  {refs.students?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.student_number} {t(" · ")}
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Roll number")}
                <input name="roll_number" required />
              </label>
              <label>
                {t("Joined on")}
                <input type="date" name="joined_on" required />
              </label>
              <button>{t("Enroll learner")}</button>
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
                {t("User")}
                <select name="user_id">
                  {refs.users?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Role")}
                <select name="role">
                  {["MUSHRIF", "AMEER"].map((r) => (
                    <option key={r} value={r}>
                      {t(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Starts on")}
                <input type="date" name="starts_on" required />
              </label>
              <label>
                {t("Ameer membership override reason")}
                <input name="ameerOverrideReason" />
              </label>
              <button>{t("Assign staff")}</button>
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
  const { t } = useI18n();

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
        <summary>
          {t("Attendance totals · academic year and exam sessions")}
        </summary>
        <AttendanceTotals
          section={section}
          run={run}
          refreshKey={sheet?.version}
        />
      </details>
      <div className="panel">
        <div className="panelhead">
          <h2>{t("Daily attendance")}</h2>
          <span className="tag">
            {t(sheet?.status ?? "Loading")} {t(" · v")}
            {t(sheet?.version ?? 0)}
          </span>
        </div>
        <div className="toolbar">
          <input
            aria-label={t("School date")}
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
            {t("Mark all present")}
          </button>
          <span className="tiny">
            {t(Object.keys(records).length)} {t(" of ")}
            {t(sheet?.roster.length ?? 0)} {t(" marked")}
          </span>
        </div>
        <div
          className="tablewrap"
          tabIndex={0}
          aria-label={t("Scrollable records")}
        >
          <table>
            <thead>
              <tr>
                <th>{t("Roll")}</th>
                <th>{t("Learner")}</th>
                <th>{t("Status")}</th>
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
                      <option value="">{t("Unmarked")}</option>
                      {records[s.id] === "LATE" && (
                        <option value="LATE" disabled>
                          {t("Legacy Late — review status")}
                        </option>
                      )}
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {t(s)}
                        </option>
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
            {t("Save draft")}
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
            {t("Submit complete roster")}
          </button>
          <button className="secondary" onClick={() => void run(load)}>
            {t("Refresh")}
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
              placeholder={t("Mushrif / administrator correction reason")}
              required
              minLength={5}
            />
            <button className="secondary">{t("Reopen")}</button>
          </form>
        )}
      </div>
      <div className="panel">
        <h2>{t("Multiple-date attendance")}</h2>
        {canManage && (
          <button className="secondary" onClick={onOpenCalendar}>
            {t("Open academic calendar")}
          </button>
        )}
        <p>
          {t(
            "Academic days and holidays are configured on the Academic calendar page before attendance is entered.",
          )}
        </p>
        <AttendancePermissions run={run} />
        <MultiDayGrid section={section} run={run} setMessage={setMessage} />
        <details>
          <summary>{t("Atomic multiple-day entry")}</summary>
          <p>
            {t(
              "Enter a JSON array of days: schoolDate, version, records (enrollmentId, status). All days save together or none do.",
            )}
          </p>
          <textarea
            aria-label={t("Multiple day records")}
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
            {t("Save dates")}
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
  const { t } = useI18n();

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
        {t(
          data?.approval
            ? "Approved scheme. Paper maxima and group membership are locked."
            : "Proposed scheme — approval required before official marks entry.",
        )}
      </div>
      <div className="panel">
        <h2>{t("Paper scheme & result groups")}</h2>
        {admin && (
          <SchemeEditor value={json} onChange={setJson} section={section} />
        )}
        <div
          className="tablewrap"
          tabIndex={0}
          aria-label={t("Scrollable records")}
        >
          <table>
            <thead>
              <tr>
                <th>{t("Code")}</th>
                <th>{t("Paper label (RTL)")}</th>
                <th>{t("Maximum")}</th>
                <th>{t("Type")}</th>
                <th>{t("Scheduled date")}</th>
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
                        <button className="secondary">{t("Save date")}</button>
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
              {g.name}
              {t(": ")}
              {g.paperCodes.join(" + ")} {t(" = ")}
              {g.max}
            </span>
          ))}
        </div>
        {admin && data?.approval && (
          <details>
            <summary>{t("Create a reviewed scheme revision")}</summary>
            <p>
              {t(
                "Earlier papers, marks and reports are retained. Copied marks must fit the new maxima and require fresh submission and approval.",
              )}
            </p>
            <textarea
              aria-label={t("Revised paper scheme")}
              rows={16}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <label>
              {t("Reason")}
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
              {t("Create new draft revision")}
            </button>
          </details>
        )}
        {admin && !data?.approval && (
          <>
            <details>
              <summary>{t("Edit paper definitions & groups")}</summary>
              <p>
                {t(
                  "Every paper uses a section-subject offering ID. Duplicate labels are allowed; codes must remain distinct. Every paper must belong to one complete group.",
                )}
              </p>
              <textarea
                aria-label={t("Paper scheme")}
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
                {t("Save scheme")}
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
              {t("Approve paper scheme")}
            </button>
          </>
        )}
      </div>
      {admin && (
        <div className="panel">
          <h2>{t("Attendance window & exam dates")}</h2>
          <p>
            {t(
              "Attendance and exam periods are configured separately. Existing dates:",
            )}{" "}
            {t(
              data?.window
                ? String(data.window.attendance_from).slice(0, 10) +
                    " — " +
                    String(data.window.attendance_through).slice(0, 10)
                : "Not configured",
            )}
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
              {t("Attendance from")}
              <input type="date" name="from" required />
            </label>
            <label>
              {t("Attendance through")}
              <input type="date" name="through" required />
            </label>
            <label>
              {t("Exam start")}
              <input type="date" name="examStart" />
            </label>
            <label>
              {t("Exam end")}
              <input type="date" name="examEnd" />
            </label>
            <label>
              {t("Acknowledge intentional overlapping windows")}
              <input type="checkbox" name="overlap" />
            </label>
            <button>{t("Save dates")}</button>
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
  const { t } = useI18n();

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
          aria-label={t("Paper")}
          value={paper}
          onChange={(e) => setPaper(e.target.value)}
        >
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.section_name ?? ""} {t(" · ")}
              {p.cycle_title ?? ""} {t(" · ")}
              {p.paper_code} {t(" ·")} {p.title} {t(" / ")}
              {p.max_marks}
            </option>
          ))}
        </select>
        <span className="tag">
          {t(data?.paper.state)} {t(" ·")}{" "}
          {t(data?.paper.submitted_at ? "Submitted" : "Draft marks")}
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
              {t("Import a full class CSV / open session sheet")}
            </button>
          )}
          <label>
            {t("Change or import reason")}
            <input
              value={markReason}
              onChange={(e) => setMarkReason(e.target.value)}
              minLength={5}
            />
          </label>
          <details>
            <summary>{t("Import assigned-paper marks from CSV")}</summary>
            <p>
              {t(
                "Use student_number and the paper code as column headers. Other paper columns are ignored. Empty cells remain unknown; numeric zero is a graded score.",
              )}
            </p>
            <textarea
              aria-label={t("Marks CSV")}
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
              {t("Preview marks import")}
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
                  {t("Apply previewed marks")}
                </button>
              </>
            )}
          </details>
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label={t("Scrollable records")}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("Learner")}</th>
                  <th>{t("State")}</th>
                  <th>
                    {t("Awarded / ")}
                    {data.paper.max_marks}
                  </th>
                  <th>{t("Exam leave")}</th>
                  <th>{t("Given on time")}</th>
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
                          <option key={s} value={s}>
                            {t(s)}
                          </option>
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
                        {t("Leave / concession")}
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
                        {t("On time")}
                      </label>
                      {e.onTime == null && <small>{t("Not confirmed")}</small>}
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
              {t("Save marks")}
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
              {t("Submit paper")}
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
                {t("Approve marks")}
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
                placeholder={t("Correction reason")}
                required
                minLength={5}
              />
              <button className="secondary">{t("Reopen paper")}</button>
            </form>
          )}
        </>
      )}
      {!papers.length && <p className="empty">{t("No papers assigned.")}</p>}
    </div>
  );
}
function Policies({ run, setMessage }: Common) {
  const { t } = useI18n();

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
      <h2>{t("Academic policy approval")}</h2>
      <div className="notice">
        {t(
          data?.config.approvedPolicy
            ? "An approved policy exists. Saving a draft removes approval until reviewed again."
            : "Unapproved. No official grade, attendance percentage or ranking will be published.",
        )}
      </div>
      <p>
        {t(
          "The institutional pass minimum is 40%. Positions require more than 80%, every paper on time, no exam leave, and a top-three shared position. Present earns 1, Half earns 0.5, Absent earns 0 and Leave is excluded. Review the remaining configuration, a backdate window, contiguous grade bands covering 0–100 (exclusive final bound 101), eligibility (ACTIVE_AT_WINDOW_END or ANY_ENROLLED_IN_WINDOW), COMPETITION or DENSE ranking, missing mark resolutions (ABSENT: BLOCK/ZERO; EXEMPT: BLOCK/EXCLUDE), pass rules, and rounding (HALF_UP/HALF_EVEN/DOWN). No thresholds have been inferred.",
        )}
      </p>
      <PolicyEditor value={policy} onChange={setPolicy} />
      <details>
        <summary>{t("Advanced policy data")}</summary>
        <textarea
          aria-label={t("Academic policy")}
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
            {t(approve ? "Approve institute policy" : "Save unapproved draft")}
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
  const { t } = useI18n();

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
        <h2>{t("Preflight & publication")}</h2>
        <p>
          {t(
            "Every counting attendance day must be submitted and all marks resolved. Publication creates stable PDFs and an immutable revision.",
          )}
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
          {t("Validate & preview")}
        </button>
        {report && (
          <>
            <div
              className={"notice " + (report.canPublish ? "success" : "error")}
            >
              {t(
                report.canPublish
                  ? "All publication checks passed."
                  : `${report.blockingErrors.length} blocking issues`,
              )}
              <ul>
                {report.blockingErrors.map((e: string) => (
                  <li key={e}>{t(e)}</li>
                ))}
              </ul>
            </div>
            <div
              className="tablewrap"
              tabIndex={0}
              aria-label={t("Scrollable records")}
            >
              <table>
                <thead>
                  <tr>
                    <th>{t("Student")}</th>
                    <th>{t("Groups")}</th>
                    <th>{t("Total")}</th>
                    <th>{t("Percent")}</th>
                    <th>{t("Grade")}</th>
                    <th>{t("Rank")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.snapshot.students.map((s: any) => (
                    <tr key={s.enrollmentId}>
                      <td>{s.name}</td>
                      <td>{s.groups.map((g: any) => g.awarded).join(" / ")}</td>
                      <td>
                        {s.total} {t(" / ")}
                        {s.possible}
                      </td>
                      <td>{s.displayPercent}</td>
                      <td>{t(s.grade ?? "Policy required")}</td>
                      <td>{s.rank ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {admin && (
              <div className="toolbar" style={{ marginTop: 20 }}>
                <input
                  placeholder={t("Reason for correction revision")}
                  aria-label={t("Correction reason")}
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
                  {t("Publish result revision")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="panel">
        <h2>{t("Publication archive")}</h2>
        {selectedRuns.map((r) => (
          <div key={r.id} className="toolbar">
            <span className="tag">
              {t("Revision ")}
              {r.revision} {t(" · ")}
              {t(r.state)}
            </span>
            <a href={`/v1/results/${r.id}/sectionsheet.pdf`}>
              {t("Class PDF ↓")}
            </a>
            <a href={`/v1/results/${r.id}/export.csv`}>{t("CSV ↓")}</a>
            <details>
              <summary>{t("Individual report cards")}</summary>
              {r.students?.map((s: any) => (
                <p key={s.enrollmentId}>
                  <a
                    href={`/v1/results/${r.id}/students/${s.enrollmentId}.pdf`}
                  >
                    {s.name} {t(" · A4 PDF ↓")}
                  </a>
                </p>
              ))}
            </details>
          </div>
        ))}
        {!selectedRuns.length && (
          <p className="empty">
            {t("No published results for this class and exam session yet.")}
          </p>
        )}
      </div>
    </>
  );
}
function People({ run, setMessage }: Common) {
  const { t } = useI18n();

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
      <h2>{t("Staff access")}</h2>
      <CreateAccount run={run} onSaved={load} />
      <ChangePassword run={run} users={users} />
      <Invite run={run} />
      <details>
        <summary>{t("Administrator-assisted password recovery")}</summary>
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
            {t("Staff account")}
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
            {t("Recovery reason")}
            <input name="reason" minLength={5} required />
          </label>
          <button>{t("Create private recovery link")}</button>
        </form>
        {recoveryLink && (
          <div className="notice">
            {t(
              "Deliver this single-use link privately after verifying staff identity. It expires in two hours and using it revokes existing sessions.",
            )}
            <br />
            <a href={recoveryLink}>{t(recoveryLink)}</a>
          </div>
        )}
      </details>
      <p>
        {t(
          "Changes revoke existing sessions immediately. The last active administrator cannot be removed.",
        )}
      </p>
      <div
        className="tablewrap"
        tabIndex={0}
        aria-label={t("Scrollable records")}
      >
        <table>
          <thead>
            <tr>
              <th>{t("Name")}</th>
              <th>{t("Email")}</th>
              <th>{t("Role")}</th>
              <th>{t("Status")}</th>
              <th>{t("Access")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name}</td>
                <td>{u.email}</td>
                <td>{u.roles.join(", ") || "Assigned staff"}</td>
                <td>{t(u.active ? "Active" : "Disabled")}</td>
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
                    {t(u.active ? "Disable" : "Activate")}
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
                    {t(
                      u.roles.includes("ADMIN")
                        ? "Revoke admin"
                        : "Grant admin",
                    )}
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
  const { t } = useI18n();

  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void api<any[]>("/v1/audit").then(setRows);
  }, []);
  return (
    <div className="panel">
      <h2>{t("Audit history")}</h2>
      <p>{t("Most recent 200 events. Audit rows are append-only.")}</p>
      <div
        className="tablewrap"
        tabIndex={0}
        aria-label={t("Scrollable records")}
      >
        <table>
          <thead>
            <tr>
              <th>{t("When")}</th>
              <th>{t("Action")}</th>
              <th>{t("Object")}</th>
              <th>{t("Reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{t(new Date(r.event_at).toLocaleString())}</td>
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
  const { t } = useI18n();

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
          {t("Staff name")}
          <input name="name" required />
        </label>
        <label>
          {t("Email")}
          <input type="email" name="email" required />
        </label>
        <button>{t("Create private invitation")}</button>
      </form>
      {url && (
        <div className="notice">
          {t(
            "Deliver this single-use link privately to the invited staff member. It expires in 48 hours.",
          )}
          <br />
          <a href={url}>{t(url)}</a>
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
  const { t } = useI18n();

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
      <h3>{t("Subject offerings & teachers")}</h3>
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
          {t("Subject")}
          <select name="subject_id">
            {refs.subjects?.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name_ur ?? s.name_en}
              </option>
            ))}
          </select>
        </label>
        <button>{t("Offer subject")}</button>
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
          {t("Offering")}
          <select name="offering">
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name_ur ?? o.name_en} {t(" · ")}
                {o.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Teacher")}
          <select name="teacher">
            {refs.users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Assignment starts")}
          <input name="starts_on" type="date" required />
        </label>
        <button>{t("Assign subject teacher")}</button>
      </form>
      <details>
        <summary>{t("Student CSV import · preview before applying")}</summary>
        <p>
          {t(
            "Map your source columns to student number, learner name, roll number and joining date. Canonical headers work without a mapping. UTF-8 Urdu is supported. Duplicate IDs and spreadsheet formulas are rejected. Each apply is atomic.",
          )}
        </p>
        <textarea
          aria-label={t("Student import CSV")}
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
                {t("Source column for ")}
                {t(labels(field))}
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
          {t("Preview CSV")}
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
              {t("Apply validated import")}
            </button>
          </>
        )}
      </details>
      <PromotionPicker section={section} run={run} />
    </>
  );
}
function Corrections({ run }: { run: Common["run"] }) {
  const { t } = useI18n();

  const [requests, setRequests] = useState<any[]>([]);
  async function load() {
    setRequests(await api<any[]>("/v1/corrections"));
  }
  useEffect(() => {
    void run(load);
  }, []);
  return (
    <div className="panel">
      <h2>{t("Historical attendance corrections")}</h2>
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
            {r.name} {t(" · ")}
            {String(r.school_date).slice(0, 10)}
          </h3>
          <p>
            {r.display_name}
            {t(": ")}
            {r.reason}
          </p>
          <span className="tag">{t(r.status)}</span>
          {r.status === "OPEN" && (
            <div className="toolbar">
              <select aria-label={t("Decision")} name="decision">
                <option value="approve">{t("Approve & reopen")}</option>
                <option value="reject">{t("Reject")}</option>
              </select>
              <input
                aria-label={t("Review reason")}
                name="reason"
                placeholder={t("Review reason")}
                minLength={5}
                required
              />
              <button>{t("Record decision")}</button>
            </div>
          )}
        </form>
      ))}
      {!requests.length && <p>{t("No correction requests.")}</p>}
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
  const { t } = useI18n();

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
      <summary>{t("Attendance grid · up to 31 dates")}</summary>
      <div className="toolbar">
        <label>
          {t("From")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("Through")}
          <input
            type="date"
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </label>
        <button onClick={() => void run(load)}>{t("Load date grid")}</button>
      </div>
      {days.length > 0 && (
        <>
          <p>
            {t(
              "Submitted and locked days are read-only. Saving requires explicit confirmation and applies every editable date in one transaction.",
            )}
          </p>
          <div
            className="tablewrap"
            tabIndex={0}
            aria-label={t("Scrollable records")}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("Learner")}</th>
                  {days.map((d) => (
                    <th key={d.schoolDate}>
                      {d.schoolDate}
                      <br />
                      {t(d.status)}
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
                            <option value="">{t("Unmarked")}</option>
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {t(s)}
                              </option>
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
              <input type="checkbox" required />
              {t("I confirm saving the selected editable dates.")}
            </label>
            <button>{t("Save all editable dates")}</button>
          </form>
        </>
      )}
      {days.length === 0 && <p>{t("No dates loaded.")}</p>}
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
  const { t } = useI18n();

  let p: any;
  try {
    p = JSON.parse(value);
  } catch {
    return (
      <p>{t("Correct the advanced policy data to continue with the form.")}</p>
    );
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
      {t(label)}
      <input
        aria-label={t(label)}
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
        placeholder={t("Not configured")}
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
      {t(label)}
      <select
        aria-label={t(label)}
        value={val ?? ""}
        onChange={(e) => change((c) => set(c, e.target.value))}
      >
        <option value="">{t("Choose explicitly")}</option>
        {choices.map(([key, text]) => (
          <option key={key} value={key}>
            {t(text)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <h3>{t("Attendance credits & edit permissions")}</h3>
      <p>
        {t(
          "Choose the numerator and denominator credit for each status. These are institute decisions; no values are prefilled.",
        )}
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
      <h3>{t("Grade bands")}</h3>
      <p>
        {t(
          "Enter official labels and contiguous percentage bands. The final exclusive bound is 101 so a score of 100 is included.",
        )}
      </p>
      {p.grades?.map((g: any, i: number) => (
        <div className="gridform" key={i}>
          <label>
            {t("Grade label")}
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
            {t("Remove band")}
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
        {t("Add official grade band")}
      </button>
      <h3 style={{ marginTop: 24 }}>
        {t("Pass rules, missing marks & result eligibility")}
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
      <h3>{t("Ranking")}</h3>
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
  const { t } = useI18n();

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
    return <p>{t("Correct advanced scheme data before editing the table.")}</p>;
  }
  if (!s?.papers) return null;
  const change = (fn: (copy: any) => void) => {
    const copy = structuredClone(s);
    fn(copy);
    onChange(JSON.stringify(copy, null, 2));
  };
  return (
    <details>
      <summary>{t("Configure papers and group membership")}</summary>
      <p>
        {t(
          "Changes remain local until saved as a draft or submitted as a reviewed revision. Repeated labels are allowed. Codes identify distinct papers.",
        )}
      </p>
      <div
        className="tablewrap"
        tabIndex={0}
        aria-label={t("Scrollable records")}
      >
        <table>
          <thead>
            <tr>
              <th>{t("Order")}</th>
              <th>{t("Code")}</th>
              <th>{t("Offering")}</th>
              <th>{t("Urdu label")}</th>
              <th>{t("Max marks")}</th>
              <th>{t("Type")}</th>
              <th>{t("Question pattern")}</th>
              <th>{t("Exam date")}</th>
              <th>{t("Group")}</th>
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
                    {t("↑")}
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
                    {t("↓")}
                  </button>
                </td>
                <td>
                  <input
                    aria-label={t(`Paper ${i + 1} code`)}
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
                    aria-label={t(`Paper ${i + 1} offering`)}
                    value={p.offeringId}
                    onChange={(e) =>
                      change((c) => (c.papers[i].offeringId = e.target.value))
                    }
                  >
                    <option value="">{t("Choose offering")}</option>
                    {offerings.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.name_ur ?? o.name_en}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={t(`Paper ${i + 1} label`)}
                    dir="rtl"
                    value={p.label}
                    onChange={(e) =>
                      change((c) => (c.papers[i].label = e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={t(`Paper ${i + 1} maximum`)}
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
                    aria-label={t(`Paper ${i + 1} type`)}
                    onChange={(e) =>
                      change((c) => (c.papers[i].type = e.target.value))
                    }
                  >
                    {["WRITTEN", "ORAL", "PRACTICAL", "OTHER"].map(
                      (paperType) => (
                        <option key={paperType} value={paperType}>
                          {t(paperType)}
                        </option>
                      ),
                    )}
                  </select>
                </td>
                <td>
                  <input
                    value={p.pattern ?? ""}
                    aria-label={t(`Paper ${i + 1} question pattern`)}
                    onChange={(e) =>
                      change((c) => (c.papers[i].pattern = e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={p.date ?? ""}
                    aria-label={t(`Paper ${i + 1} exam date`)}
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
                    aria-label={t(`Paper ${i + 1} group`)}
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
                    <option value={-1}>{t("Unassigned")}</option>
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
        {t("Add paper")}
      </button>
      <h3 style={{ marginTop: 20 }}>{t("Group maxima")}</h3>
      {s.groups.map((g: any, i: number) => {
        const actual = sumMarks(
          s.papers
            .filter((p: any) => g.paperCodes.includes(p.code))
            .map((p: any) => p.max ?? 0),
        );
        return (
          <div className="toolbar" key={i}>
            <label>
              {t("Group name")}
              <input
                value={g.name}
                onChange={(e) =>
                  change((c) => (c.groups[i].name = e.target.value))
                }
              />
            </label>
            <label>
              {t("Declared maximum")}
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
              {t("Paper maxima: ")}
              {t(actual)} {t(" / ")}
              {g.max}
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
        {t("Add proposed group")}
      </button>
    </details>
  );
}
function AttendancePermissions({ run }: { run: Common["run"] }) {
  const { t } = useI18n();

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
      <summary>{t("Historical edit permissions")}</summary>
      <p>
        {t(
          "Assigned staff can record today without an approved grading policy. Historical edits require a separately approved window. Current window:",
        )}{" "}
        {t(data?.days === null ? "Not approved" : `${data?.days} days`)}
        {t(".")}
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
            {t(
              "Authorized backdate days (blank revokes historical permission)",
            )}
            <input
              type="number"
              min="0"
              max="366"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <label>
            {t("Approval or revocation reason")}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
            />
          </label>
          <button>{t("Record permission decision")}</button>
        </form>
      )}
    </details>
  );
}
