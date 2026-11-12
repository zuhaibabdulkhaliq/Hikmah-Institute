import {
  api,
  configureServer,
  initialServer,
  serverURL,
} from "../components/connection";
import { AccountSettings } from "../components/account-settings";
import {
  Text,
  TextInput,
  LanguageSwitch,
  useI18n,
} from "../components/language";
import {
  NativeAttendanceTotals,
  NativePerformance,
} from "../components/academic-reports";
import { useState, useEffect, useRef, type ComponentRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii } from "@hikmah/ui-tokens";
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  AppState,
} from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  type Identity,
  type Section,
  type Sheet,
} from "@hikmah/api-client";
const statuses = ["PRESENT", "ABSENT", "HALF", "LEAVE"];
export default function Home() {
  const { t, language } = useI18n();

  const insets = useSafeAreaInsets();
  const accessVersion = useRef("");
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const [server, setServer] = useState(initialServer);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [me, setMe] = useState<Identity | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [sections, setSections] = useState<Section[]>([]),
    [section, setSection] = useState(""),
    [date, setDate] = useState(
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }),
    ),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [records, setRecords] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState("attendance"),
    [papers, setPapers] = useState<any[]>([]),
    [paper, setPaper] = useState(""),
    [marks, setMarks] = useState<any>(null),
    [runs, setRuns] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [reason, setReason] = useState("");
  useEffect(() => {
    if (error) scroll.current?.scrollTo({ y: 0, animated: true });
  }, [error]);
  const canAttend =
    !!me && (me.roles.includes("ADMIN") || me.attendanceSections.length > 0);
  const canManage =
    !!me && (me.roles.includes("ADMIN") || me.managedSections.length > 0);
  const canMarks = canManage || !!me?.teachingSections.length;
  const ameer = canAttend && !canMarks;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.status === 401 ||
          (e.status === 403 && e.message === "Account disabled or not invited"))
      ) {
        await SecureStore.deleteItemAsync("hikmah-session");
        setMe(null);
        setPage("attendance");
        setSections([]);
        setSheet(null);
        setMarks(null);
        setHistory([]);
        setRuns([]);
        setRecords({});
        setPapers([]);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const m = await api<Identity>("/v1/me");
    if (accessVersion.current && accessVersion.current !== m.accessVersion) {
      setSheet(null);
      setRecords({});
      setMarks(null);
      setPaper("");
      setPapers([]);
      setRuns([]);
      setHistory([]);
      setPage(
        m.roles.includes("ADMIN") || m.attendanceSections.length
          ? "attendance"
          : "marks",
      );
    }
    accessVersion.current = m.accessVersion;
    setMe(m);
    setDate(m.today);
    const s = await api<Section[]>("/v1/sections");
    setSections(s);
    const attending =
      m.roles.includes("ADMIN") || m.attendanceSections.length > 0;
    const selected = s.find((x) =>
      attending
        ? m.roles.includes("ADMIN") || m.attendanceSections.includes(x.id)
        : m.teachingSections.includes(x.id),
    );
    setSection(selected?.id ?? s[0]?.id ?? "");
    if (!attending) {
      setPage("marks");
      setPapers(await api<any[]>("/v1/assessments"));
    }
  }
  useEffect(() => {
    void serverURL()
      .then(setServer)
      .catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void SecureStore.getItemAsync("hikmah-session").then((t) => {
          if (t) void run(load);
        });
    });
    void SecureStore.getItemAsync("hikmah-session").then((t) => {
      if (t) void run(load);
    });
    return () => subscription.remove();
  }, []);
  async function loadSheet() {
    const s = await api<Sheet>(`/v1/sections/${section}/attendance/${date}`);
    setSheet(s);
    setRecords(
      Object.fromEntries(s.records.map((r) => [r.enrollmentId, r.status])),
    );
  }
  useEffect(() => {
    if (
      canAttend &&
      section &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      page === "attendance"
    )
      void run(loadSheet);
  }, [section, date, page]);
  const button = (title: string, onPress: () => void, secondary = false) => (
    <Pressable
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (busy || pressed) && styles.dimmed,
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.primary : "white",
          fontWeight: "600",
        }}
      >
        {t(title)}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      ref={scroll}
      style={[styles.screen, { direction: language === "ur" ? "rtl" : "ltr" }]}
      contentContainerStyle={{
        padding: 22,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <LanguageSwitch />
      <View style={styles.brandMark}>
        <Text style={styles.brandGlyph}>{t("علم")}</Text>
      </View>
      <Text style={styles.overline}>{t("HIKMAH INSTITUTE")}</Text>
      <Text style={styles.heading}>
        {t(me ? "Your class, at a glance" : "Welcome back")}
      </Text>
      <Text style={styles.subtitle}>
        {me
          ? `${me.name} · ${t(ameer ? "Class Ameer" : canManage ? "Mushrif / administrator" : "Subject teacher")}`
          : t("Sign in to your staff workspace")}
      </Text>
      {busy && (
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel={t("Working")}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(error)}
        </Text>
      )}
      {passwordChanged && (
        <Text accessibilityRole="alert">
          {t("Password changed. Sign in again with your new password.")}
        </Text>
      )}
      {!me ? (
        <>
          <Text style={styles.subtitle}>
            {t(
              "Enter your institute’s server address once. It will be remembered on this phone.",
            )}
          </Text>
          <TextInput
            style={styles.input}
            accessibilityLabel={t("Server address")}
            placeholder="https://school.example.org"
            autoCapitalize="none"
            keyboardType="url"
            value={server}
            onChangeText={setServer}
          />
          <TextInput
            style={styles.input}
            placeholder={t("Email")}
            accessibilityLabel={t("Email address")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder={t("Password")}
            accessibilityLabel={t("Password")}
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {button(
            "Sign in",
            () =>
              void run(async () => {
                await configureServer(server);
                const r = await api<{ token: string }>(
                  "/api/auth/sign-in/email",
                  { method: "POST", body: JSON.stringify({ email, password }) },
                );
                await SecureStore.setItemAsync("hikmah-session", r.token);
                setPasswordChanged(false);
                setPassword("");
                await load();
              }),
          )}
        </>
      ) : (
        <>
          <View style={styles.row}>
            {canAttend &&
              button(
                "Attendance",
                () => setPage("attendance"),
                page !== "attendance",
              )}
            {canManage &&
              button(
                "Reports",
                () =>
                  void run(async () => {
                    setPage("reports");
                    setRuns(await api<any[]>("/v1/results"));
                  }),
                page !== "reports",
              )}
            {canMarks &&
              button(
                "My papers",
                () =>
                  void run(async () => {
                    setPage("marks");
                    setPapers(await api<any[]>("/v1/assessments"));
                  }),
                page !== "marks",
              )}
          </View>
          {page === "history" ? (
            <>
              {history.map((r: any, i) => (
                <View style={styles.card} key={i}>
                  <Text style={styles.name}>{r.action}</Text>
                  <Text>
                    {t(new Date(r.event_at).toLocaleString())} {t(" ·")}{" "}
                    {r.reason ?? r.object_type}
                  </Text>
                </View>
              ))}
            </>
          ) : page === "reports" ? (
            <>
              <ScrollView horizontal>
                {sections
                  .filter(
                    (s) =>
                      me.roles.includes("ADMIN") ||
                      me.managedSections.includes(s.id),
                  )
                  .map((s) =>
                    button(s.name, () => setSection(s.id), s.id !== section),
                  )}
              </ScrollView>
              {section && (
                <NativePerformance section={section} request={api} run={run} />
              )}
              {runs.map((r) => (
                <View style={styles.card} key={r.id}>
                  <Text style={styles.name}>
                    {t("Revision ")}
                    {r.revision} {t(" · ")}
                    {t(r.state)}
                  </Text>
                  {button(
                    "Download class PDF",
                    () =>
                      void run(async () => {
                        const token =
                          await SecureStore.getItemAsync("hikmah-session");
                        const response = await fetch(
                          `${await serverURL()}/v1/results/${r.id}/sectionsheet.pdf`,
                          { headers: { Authorization: `Bearer ${token}` } },
                        );
                        if (!response.ok) throw new Error("Download denied");
                        const file = new File(
                          Paths.cache,
                          `hikmah-${r.id}.pdf`,
                        );
                        file.write(
                          new Uint8Array(await response.arrayBuffer()),
                        );
                        try {
                          await Sharing.shareAsync(file.uri, {
                            mimeType: "application/pdf",
                          });
                        } finally {
                          file.delete();
                        }
                      }),
                  )}
                </View>
              ))}
            </>
          ) : page === "attendance" ? (
            <>
              {section && (
                <NativeAttendanceTotals
                  section={section}
                  request={api}
                  run={run}
                  refreshKey={sheet?.version}
                />
              )}
              <Text style={styles.label}>{t("ASSIGNED SECTIONS")}</Text>
              {sections
                .filter(
                  (s) =>
                    me.roles.includes("ADMIN") ||
                    me.attendanceSections.includes(s.id),
                )
                .map((s) => (
                  <View key={s.id}>
                    {button(s.name, () => setSection(s.id), section !== s.id)}
                  </View>
                ))}
              <Text style={styles.label}>{t("SCHOOL DATE · YYYY-MM-DD")}</Text>
              <View style={styles.row}>
                {[-1, 1].map((delta) => (
                  <View key={delta}>
                    {button(
                      delta < 0 ? "Previous day" : "Next day",
                      () => {
                        const parsed = Date.parse(date);
                        if (Number.isFinite(parsed))
                          setDate(
                            new Date(parsed + delta * 86400000)
                              .toISOString()
                              .slice(0, 10),
                          );
                      },
                      true,
                    )}
                  </View>
                ))}
              </View>
              <TextInput
                accessibilityLabel={t("School date")}
                style={styles.input}
                value={date}
                onChangeText={setDate}
              />
              <Text style={styles.subtitle}>
                {t(sheet?.status)} {t(" · ")}
                {t(Object.keys(records).length)}
                {t("/")}
                {t(sheet?.roster.length ?? 0)} {t(" marked")}
              </Text>
              {button(
                "Mark all present",
                () =>
                  setRecords(
                    Object.fromEntries(
                      (sheet?.roster ?? []).map((r) => [r.id, "PRESENT"]),
                    ),
                  ),
                true,
              )}
              {sheet?.roster.map((r) => (
                <View style={styles.card} key={r.id}>
                  <Text style={styles.name}>
                    {r.roll_number} {t(" · ")}
                    {r.full_name}
                  </Text>
                  <View style={styles.row}>
                    {statuses.map((status) => (
                      <Pressable
                        key={status}
                        disabled={busy || sheet.status !== "DRAFT"}
                        accessibilityLabel={`${r.full_name} ${t(status)}`}
                        onPress={() =>
                          setRecords({ ...records, [r.id]: status })
                        }
                        style={[
                          styles.status,
                          records[r.id] === status && styles.selected,
                        ]}
                      >
                        <Text
                          style={{
                            color:
                              records[r.id] === status
                                ? "white"
                                : colors.primary,
                          }}
                        >
                          {t(
                            status === "PRESENT"
                              ? "P"
                              : status === "ABSENT"
                                ? "A"
                                : status === "HALF"
                                  ? "L"
                                  : "Leave",
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              {button(
                "Save draft",
                () =>
                  void run(async () => {
                    await api(`/v1/sections/${section}/attendance/${date}`, {
                      method: "PUT",
                      headers: { "If-Match": String(sheet?.version ?? 0) },
                      body: JSON.stringify({
                        records: Object.entries(records)
                          .filter(([, s]) => s)
                          .map(([enrollmentId, status]) => ({
                            enrollmentId,
                            status,
                          })),
                      }),
                    });
                    await loadSheet();
                  }),
              )}
              {button(
                "Submit complete roster",
                () =>
                  void run(async () => {
                    await api(
                      `/v1/sections/${section}/attendance/${date}/submit`,
                      {
                        method: "POST",
                        headers: { "If-Match": String(sheet?.version) },
                        body: "{}",
                      },
                    );
                    await loadSheet();
                  }),
                true,
              )}
              <NativeGrid section={section} run={run} />
              <TextInput
                accessibilityLabel={t("Correction reason")}
                style={styles.input}
                placeholder={t("Reason to request a historical correction")}
                value={reason}
                onChangeText={setReason}
              />
              {button(
                "Request correction",
                () =>
                  void run(async () => {
                    await api(`/v1/sections/${section}/corrections`, {
                      method: "POST",
                      body: JSON.stringify({ schoolDate: date, reason }),
                    });
                    setReason("");
                  }),
                true,
              )}
            </>
          ) : (
            <>
              {papers.map((p) => (
                <View key={p.id}>
                  {button(
                    `${p.paper_code} · ${p.title}`,
                    () =>
                      void run(async () => {
                        setPaper(p.id);
                        setMarks(
                          await api("/v1/assessments/" + p.id + "/marks"),
                        );
                      }),
                    paper !== p.id,
                  )}
                </View>
              ))}
              {marks?.entries.map((m: any, i: number) => (
                <View key={m.enrollmentId} style={styles.card}>
                  <Text style={styles.name}>{m.full_name}</Text>
                  <Text style={styles.subtitle}>{t(m.state ?? "PENDING")}</Text>
                  <ScrollView horizontal>
                    {[
                      "PENDING",
                      "GRADED",
                      "ABSENT",
                      "EXEMPT",
                      "WITHHELD",
                      "NOT_APPLICABLE",
                      "UNKNOWN_LEGACY_BLANK",
                    ].map((state) => (
                      <Pressable
                        key={state}
                        style={[
                          styles.status,
                          (m.state ?? "PENDING") === state && styles.selected,
                        ]}
                        accessibilityLabel={`${m.full_name} ${t(state)}`}
                        onPress={() => {
                          const entries = [...marks.entries];
                          entries[i] = {
                            ...m,
                            state,
                            awarded:
                              state === "GRADED" ? (m.awarded ?? null) : null,
                          };
                          setMarks({ ...marks, entries });
                        }}
                      >
                        <Text
                          style={{
                            color:
                              (m.state ?? "PENDING") === state
                                ? "white"
                                : colors.primary,
                          }}
                        >
                          {t(state)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.row}>
                    {(
                      [
                        ["onLeave", "Exam leave"],
                        ["onTime", "Given on time"],
                      ] as const
                    ).map(([key, title]) => (
                      <Pressable
                        key={key}
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${title} ${m.full_name}`}
                        accessibilityState={{
                          checked: m[key] === true,
                          disabled: key === "onTime" && m.onLeave,
                        }}
                        disabled={key === "onTime" && m.onLeave}
                        style={styles.status}
                        onPress={() => {
                          const entries = [...marks.entries];
                          entries[i] = {
                            ...m,
                            [key]: !m[key],
                            ...(key === "onLeave" && !m.onLeave
                              ? { onTime: false }
                              : {}),
                          };
                          setMarks({ ...marks, entries });
                        }}
                      >
                        <Text style={{ color: colors.primary }}>
                          {t(m[key] === true ? "☑" : "☐")} {t(title)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    accessibilityLabel={`Marks for ${m.full_name}`}
                    placeholder={t("Unmarked")}
                    keyboardType="decimal-pad"
                    value={m.awarded == null ? "" : String(m.awarded)}
                    onChangeText={(v) => {
                      const entries = [...marks.entries];
                      entries[i] = {
                        ...m,
                        state: v === "" ? "PENDING" : "GRADED",
                        awarded: v === "" ? null : Number(v),
                      };
                      setMarks({ ...marks, entries });
                    }}
                  />
                </View>
              ))}
              {marks && (
                <>
                  {button(
                    "Save marks",
                    () =>
                      void run(async () => {
                        await api(`/v1/assessments/${paper}/marks/bulk`, {
                          method: "PUT",
                          body: JSON.stringify({
                            entries: marks.entries.map((e: any) => ({
                              enrollmentId: e.enrollmentId,
                              state: e.state ?? "PENDING",
                              awarded:
                                e.awarded == null ? null : Number(e.awarded),
                              version: e.version ?? 0,
                              onLeave: e.onLeave ?? false,
                              onTime: e.onTime ?? null,
                            })),
                          }),
                        });
                        setMarks(await api(`/v1/assessments/${paper}/marks`));
                      }),
                  )}
                  {button(
                    "Submit for review",
                    () =>
                      void run(async () => {
                        await api(`/v1/assessments/${paper}/submit`, {
                          method: "POST",
                          body: "{}",
                        });
                      }),
                    true,
                  )}
                  {(me.roles.includes("ADMIN") ||
                    me.managedSections.includes(marks.paper.section_id)) && (
                    <>
                      {button(
                        "Approve marks",
                        () =>
                          void run(async () => {
                            await api(`/v1/assessments/${paper}/approve`, {
                              method: "POST",
                              body: "{}",
                            });
                            setMarks(
                              await api(`/v1/assessments/${paper}/marks`),
                            );
                          }),
                      )}
                      <TextInput
                        style={styles.input}
                        placeholder={t("Reason to reopen marks")}
                        value={reason}
                        onChangeText={setReason}
                      />
                      {button(
                        "Reopen marks with reason",
                        () =>
                          void run(async () => {
                            await api(`/v1/assessments/${paper}/reopen`, {
                              method: "POST",
                              body: JSON.stringify({ reason }),
                            });
                            setReason("");
                            setMarks(
                              await api(`/v1/assessments/${paper}/marks`),
                            );
                          }),
                        true,
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
          <AccountSettings
            request={api}
            onChanged={async () => {
              await SecureStore.deleteItemAsync("hikmah-session");
              setMe(null);
              setPassword("");
              setPasswordChanged(true);
              setSheet(null);
              setMarks(null);
              setRecords({});
              setHistory([]);
              setRuns([]);
            }}
          />
          {button(
            "Sign out",
            () =>
              void run(async () => {
                try {
                  await api("/api/auth/sign-out", {
                    method: "POST",
                    body: "{}",
                  });
                } finally {
                  await SecureStore.deleteItemAsync("hikmah-session");
                  setMe(null);
                  setPage("attendance");
                  setSheet(null);
                  setMarks(null);
                  setRecords({});
                  setHistory([]);
                  setRuns([]);
                  setSections([]);
                  setPapers([]);
                }
              }),
            true,
          )}
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  brandMark: {
    width: 52,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  brandGlyph: { color: colors.primary, fontSize: 25 },
  overline: {
    fontSize: 11,
    letterSpacing: 3,
    color: colors.primary,
    marginBottom: 14,
  },
  heading: {
    fontSize: 32,
    letterSpacing: -0.8,
    color: colors.ink,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginVertical: 14,
    lineHeight: 21,
  },
  label: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    color: colors.ink,
    padding: 14,
    marginBottom: 14,
    minHeight: 48,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: radii.control,
    minHeight: 48,
    alignItems: "center",
    marginBottom: 10,
  },
  secondary: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dimmed: { opacity: 0.55 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  card: {
    backgroundColor: colors.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: "white",
    borderRadius: radii.card,
    boxShadow: "0 5px 20px rgba(39, 94, 139, 0.06)",
    marginBottom: 12,
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
  },
  status: {
    minWidth: 52,
    minHeight: 48,
    padding: 14,
    borderRadius: radii.control,
    backgroundColor: colors.secondary,
    alignItems: "center",
  },
  selected: { backgroundColor: colors.primary },
  error: {
    backgroundColor: colors.dangerSurface,
    color: colors.danger,
    borderRadius: radii.control,
    padding: 14,
    marginVertical: 12,
  },
});
function NativeGrid({
  section,
  run,
}: {
  section: string;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useI18n();

  const [days, setDays] = useState<(Sheet & { schoolDate: string })[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [open, setOpen] = useState(false);
  async function load() {
    const end = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Karachi",
      }),
      start = new Date(Date.parse(end) - 2 * 86400000)
        .toISOString()
        .slice(0, 10);
    const calendar = await api<any[]>(
      `/v1/sections/${section}/calendar?from=${start}&through=${end}`,
    );
    setDays(
      await Promise.all(
        calendar
          .filter((d) => d.counts_for_attendance)
          .map((d) =>
            api<Sheet & { schoolDate: string }>(
              `/v1/sections/${section}/attendance/${String(d.school_date).slice(0, 10)}`,
            ),
          ),
      ),
    );
    setOpen(true);
    setConfirmed(false);
  }
  return (
    <View style={styles.card}>
      <Pressable style={styles.button} onPress={() => void run(load)}>
        <Text style={{ color: "white" }}>{t("Recent three-day grid")}</Text>
      </Pressable>
      {open && (
        <>
          {days.map((day, i) => (
            <View key={day.schoolDate}>
              <Text style={styles.name}>
                {day.schoolDate} {t(" · ")}
                {t(day.status)}
              </Text>
              {day.roster.map((r) => {
                const current =
                  day.records.find((v) => v.enrollmentId === r.id)?.status ??
                  "UNMARKED";
                return (
                  <View key={r.id} style={styles.row}>
                    <Text style={styles.subtitle}>{r.full_name}</Text>
                    <Pressable
                      style={styles.status}
                      disabled={day.status !== "DRAFT"}
                      onPress={() => {
                        const index = statuses.indexOf(current);
                        const status = statuses[(index + 1) % statuses.length];
                        const copy = [...days];
                        copy[i] = {
                          ...day,
                          records: [
                            ...day.records.filter(
                              (v) => v.enrollmentId !== r.id,
                            ),
                            { enrollmentId: r.id, status },
                          ],
                        };
                        setDays(copy);
                        setConfirmed(false);
                      }}
                    >
                      <Text>{t(current)}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
          {!days.length && (
            <Text>{t("No instructional calendar dates in this window.")}</Text>
          )}
          <Pressable
            style={styles.status}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed(!confirmed)}
          >
            <Text>
              {t(confirmed ? "✓ " : "")}
              {t("Confirm saving all editable dates")}
            </Text>
          </Pressable>
          <Pressable
            style={styles.button}
            disabled={!confirmed || !days.some((d) => d.status === "DRAFT")}
            onPress={() =>
              void run(async () => {
                await api(`/v1/sections/${section}/attendance/bulk`, {
                  method: "POST",
                  headers: {
                    "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  },
                  body: JSON.stringify({
                    days: days
                      .filter((d) => d.status === "DRAFT")
                      .map((d) => ({
                        schoolDate: d.schoolDate,
                        version: d.version,
                        records: d.records,
                      })),
                  }),
                });
                await load();
              })
            }
          >
            <Text style={{ color: "white" }}>{t("Save grid atomically")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
