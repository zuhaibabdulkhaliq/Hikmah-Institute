import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
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
  createClient,
  ApiError,
  type Identity,
  type Section,
  type Sheet,
} from "@hikmah/api-client";
const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const api = createClient(base, () =>
  SecureStore.getItemAsync("hikmah-session"),
);
const statuses = ["PRESENT", "ABSENT", "LATE", "LEAVE"];
export default function Home() {
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
  const ameer =
    me?.sectionAssignments.some((s) => s.role === "AMEER") &&
    !me.roles.includes("ADMIN") &&
    !me.sectionAssignments.some((s) => s.role === "CLASS_TEACHER");
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
    setMe(m);
    setDate(m.today);
    const s = await api<Section[]>("/v1/sections");
    setSections(s);
    setSection(s[0]?.id ?? "");
  }
  useEffect(() => {
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
    if (section && /^\d{4}-\d{2}-\d{2}$/.test(date) && page === "attendance")
      void run(loadSheet);
  }, [section, date, page]);
  const button = (title: string, onPress: () => void, secondary = false) => (
    <Pressable
      disabled={busy}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary]}
    >
      <Text
        style={{ color: secondary ? "#185941" : "white", fontWeight: "600" }}
      >
        {title}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 24, paddingTop: 64 }}
    >
      <Text style={styles.overline}>HIKMAH INSTITUTE</Text>
      <Text style={styles.heading}>
        {me ? "Your class, at a glance" : "Welcome back"}
      </Text>
      <Text style={styles.subtitle}>
        {me
          ? `${me.name} · ${ameer ? "Class Ameer" : "Teaching staff"}`
          : "Sign in to your staff workspace"}
      </Text>
      {busy && <ActivityIndicator color="#185941" />}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!me ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {button(
            "Sign in",
            () =>
              void run(async () => {
                const r = await api<{ token: string }>(
                  "/api/auth/sign-in/email",
                  { method: "POST", body: JSON.stringify({ email, password }) },
                );
                await SecureStore.setItemAsync("hikmah-session", r.token);
                setPassword("");
                await load();
              }),
          )}
        </>
      ) : (
        <>
          <View style={styles.row}>
            {button(
              "Attendance",
              () => setPage("attendance"),
              page !== "attendance",
            )}
            {button(
              "My history",
              () =>
                void run(async () => {
                  setPage("history");
                  setHistory(await api<any[]>("/v1/me/history"));
                }),
              page !== "history",
            )}
            {!ameer &&
              button(
                "Reports",
                () =>
                  void run(async () => {
                    setPage("reports");
                    setRuns(await api<any[]>("/v1/results"));
                  }),
                page !== "reports",
              )}
            {!ameer &&
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
                    {new Date(r.event_at).toLocaleString()} ·{" "}
                    {r.reason ?? r.object_type}
                  </Text>
                </View>
              ))}
            </>
          ) : page === "reports" ? (
            <>
              {runs.map((r) => (
                <View style={styles.card} key={r.id}>
                  <Text style={styles.name}>
                    Revision {r.revision} · {r.state}
                  </Text>
                  {button(
                    "Download class PDF",
                    () =>
                      void run(async () => {
                        const token =
                          await SecureStore.getItemAsync("hikmah-session");
                        const response = await fetch(
                          `${base}/v1/results/${r.id}/sectionsheet.pdf`,
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
              <Text style={styles.label}>ASSIGNED SECTIONS</Text>
              {sections.map((s) => (
                <View key={s.id}>
                  {button(s.name, () => setSection(s.id), section !== s.id)}
                </View>
              ))}
              <Text style={styles.label}>SCHOOL DATE · YYYY-MM-DD</Text>
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
                accessibilityLabel="School date"
                style={styles.input}
                value={date}
                onChangeText={setDate}
              />
              <Text style={styles.subtitle}>
                {sheet?.status} · {Object.keys(records).length}/
                {sheet?.roster.length ?? 0} marked
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
                    {r.roll_number} · {r.full_name}
                  </Text>
                  <View style={styles.row}>
                    {statuses.map((status) => (
                      <Pressable
                        key={status}
                        disabled={busy || sheet.status !== "DRAFT"}
                        accessibilityLabel={`${r.full_name} ${status}`}
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
                              records[r.id] === status ? "white" : "#185941",
                          }}
                        >
                          {status === "PRESENT"
                            ? "P"
                            : status === "ABSENT"
                              ? "A"
                              : status === "LATE"
                                ? "L"
                                : "Leave"}
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
                accessibilityLabel="Correction reason"
                style={styles.input}
                placeholder="Reason to request a historical correction"
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
                  <Text style={styles.subtitle}>{m.state ?? "PENDING"}</Text>
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
                        accessibilityLabel={`${m.full_name} ${state}`}
                        onPress={() => {
                          const entries = [...marks.entries];
                          entries[i] = {
                            ...m,
                            state,
                            awarded:
                              state === "GRADED" ? (m.awarded ?? 0) : null,
                          };
                          setMarks({ ...marks, entries });
                        }}
                      >
                        <Text
                          style={{
                            color:
                              (m.state ?? "PENDING") === state
                                ? "white"
                                : "#185941",
                          }}
                        >
                          {state}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.input}
                    accessibilityLabel={`Marks for ${m.full_name}`}
                    placeholder="Unmarked"
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
                </>
              )}
            </>
          )}
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
  screen: { flex: 1, backgroundColor: "#f4f5ef" },
  overline: {
    fontSize: 11,
    letterSpacing: 3,
    color: "#96723f",
    marginBottom: 14,
  },
  heading: { fontSize: 30, color: "#193a30", fontWeight: "600" },
  subtitle: {
    fontSize: 13,
    color: "#6b7c74",
    marginVertical: 14,
    lineHeight: 21,
  },
  label: {
    fontSize: 11,
    color: "#6b7c74",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#cbd7cd",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    minHeight: 48,
  },
  button: {
    backgroundColor: "#185941",
    padding: 15,
    borderRadius: 8,
    minHeight: 48,
    alignItems: "center",
    marginBottom: 10,
  },
  secondary: { backgroundColor: "#e3ebdf" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  card: {
    backgroundColor: "white",
    padding: 18,
    borderWidth: 1,
    borderColor: "#dce3dc",
    borderRadius: 10,
    marginBottom: 12,
  },
  name: { color: "#193a30", fontSize: 16, marginBottom: 14 },
  status: {
    minWidth: 52,
    minHeight: 48,
    padding: 14,
    borderRadius: 6,
    backgroundColor: "#edf1e9",
    alignItems: "center",
  },
  selected: { backgroundColor: "#185941" },
  error: {
    backgroundColor: "#f7e3df",
    color: "#943f34",
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
        <Text style={{ color: "white" }}>Recent three-day grid</Text>
      </Pressable>
      {open && (
        <>
          {days.map((day, i) => (
            <View key={day.schoolDate}>
              <Text style={styles.name}>
                {day.schoolDate} · {day.status}
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
                      <Text>{current}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
          {!days.length && (
            <Text>No instructional calendar dates in this window.</Text>
          )}
          <Pressable
            style={styles.status}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed(!confirmed)}
          >
            <Text>
              {confirmed ? "✓ " : ""}Confirm saving all editable dates
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
            <Text style={{ color: "white" }}>Save grid atomically</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
