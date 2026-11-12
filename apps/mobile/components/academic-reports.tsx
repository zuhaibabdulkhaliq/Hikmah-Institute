import { serverURL } from "./connection";
import { Text, LocalizedLabel, useI18n } from "./language";
import { useEffect, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import type { createClient } from "@hikmah/api-client";
import { colors, radii } from "@hikmah/ui-tokens";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SecureStore from "expo-secure-store";
type Request = ReturnType<typeof createClient>;
type Run = (fn: () => Promise<void>) => Promise<void>;

async function share(path: string) {
  const token = await SecureStore.getItemAsync("hikmah-session"),
    r = await fetch((await serverURL()) + path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  if (!r.ok) throw new Error("Report download denied");
  const file = new File(Paths.cache, `performance-${Date.now()}.pdf`);
  try {
    file.write(new Uint8Array(await r.arrayBuffer()));
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("File sharing is unavailable on this device");
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf" });
  } finally {
    if (file.exists) file.delete();
  }
}
const action = (label: string, fn: () => void, selected = false) => (
  <Pressable
    key={label}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={fn}
    style={[styles.button, selected && styles.selected]}
  >
    <LocalizedLabel style={{ color: selected ? "white" : colors.primary }}>
      {label}
    </LocalizedLabel>
  </Pressable>
);
export function NativeAttendanceTotals({
  section,
  request,
  run,
  refreshKey,
}: {
  section: string;
  request: Request;
  run: Run;
  refreshKey?: number;
}) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("YEAR"),
    [cycle, setCycle] = useState(""),
    [cycles, setCycles] = useState<any[]>([]),
    [data, setData] = useState<any>(null);
  useEffect(() => {
    setPeriod("YEAR");
    void run(async () => {
      const c = await request<any[]>(
        `/v1/sections/${section}/attendance-periods`,
      );
      setCycles(c);
      setCycle(c.find((x) => x.code === "SHASH_MAHI")?.id ?? c[0]?.id ?? "");
    });
  }, [section]);
  async function load() {
    if (!section || (period !== "YEAR" && !cycle)) return;
    const q = new URLSearchParams({
      period,
      ...(period !== "YEAR" ? { cycleId: cycle } : {}),
    });
    setData(await request(`/v1/sections/${section}/attendance-summary?${q}`));
  }
  useEffect(() => {
    void run(load);
  }, [section, period, cycle, refreshKey]);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("Attendance totals")}</Text>
      <Text style={styles.note}>
        {t(
          "Present 1 · Half 0.5 · Absent 0 · Leave excluded. Only submitted academic days count.",
        )}
      </Text>
      {action(open ? "Hide attendance totals" : "Show attendance totals", () =>
        setOpen(!open),
      )}
      {open && (
        <>
          <ScrollView horizontal>
            {[
              ["YEAR", "Year to date"],
              ["SESSION", "Session"],
              ["PREVIOUS_SESSION", "Previous session"],
            ].map(([key, label]) =>
              action(label, () => setPeriod(key), period === key),
            )}
          </ScrollView>
          {period !== "YEAR" && (
            <ScrollView horizontal>
              {cycles.map((c) =>
                action(c.title, () => setCycle(c.id), cycle === c.id),
              )}
            </ScrollView>
          )}
          {action("Refresh totals", () => void run(load))}
          {data?.students.map((s: any) => (
            <View key={s.enrollmentId} style={styles.record}>
              <Text style={styles.title}>{s.name}</Text>
              <Text style={styles.note}>
                {t("P ")}
                {s.present} {t(" · A ")}
                {s.absent} {t(" · Half ")}
                {s.half} {t(" · Leave ")}
                {s.leave}
              </Text>
              <Text style={styles.note}>
                {s.academicDays} {t(" academic days · ")}
                {s.unmarked} {t(" unmarked ·")}{" "}
                {t(
                  s.displayPercent === null
                    ? "Incomplete / N/A"
                    : s.displayPercent + "%",
                )}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
export function NativePerformance({
  section,
  request,
  run,
}: {
  section: string;
  request: Request;
  run: Run;
}) {
  const { t } = useI18n();

  const [roster, setRoster] = useState<any[]>([]),
    [student, setStudent] = useState(""),
    [data, setData] = useState<any>(null),
    [year, setYear] = useState(""),
    [cycle, setCycle] = useState("");
  useEffect(() => {
    setData(null);
    void run(async () => {
      const r = await request<any[]>(`/v1/sections/${section}/enrollments`);
      setRoster(r);
      setStudent(r[0]?.student_id ?? "");
    });
  }, [section]);
  useEffect(() => {
    if (student)
      void run(async () => {
        const r = await request<any>(`/v1/students/${student}/performance`);
        setData(r);
        setYear("");
        setCycle("");
      });
  }, [student]);
  const years =
    data?.years.filter((y: any) => !year || y.yearId === year) ?? [];
  const q = new URLSearchParams({
    ...(year ? { yearId: year } : {}),
    ...(cycle ? { cycleId: cycle } : {}),
  });
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("Student performance & history")}</Text>
      <ScrollView horizontal>
        {roster.map((s) =>
          action(
            s.full_name,
            () => setStudent(s.student_id),
            student === s.student_id,
          ),
        )}
      </ScrollView>
      <ScrollView horizontal>
        {action(
          "All years",
          () => {
            setYear("");
            setCycle("");
          },
          !year,
        )}
        {data?.years.map((y: any) =>
          action(
            y.year,
            () => {
              setYear(y.yearId);
              setCycle("");
            },
            year === y.yearId,
          ),
        )}
      </ScrollView>
      {data?.academicYears
        ?.filter((y: any) => !year || y.yearId === year)
        .map((y: any) => (
          <View style={styles.record} key={y.yearId}>
            <Text style={styles.title}>
              {t("Whole year · ")}
              {y.year}
            </Text>
            <Text style={styles.note}>
              {t("P ")}
              {y.attendance.present} {t(" · A ")}
              {y.attendance.absent} {t(" · Half")} {y.attendance.half}{" "}
              {t(" · Leave ")}
              {y.attendance.leave} {t(" ·")}{" "}
              {t(y.attendance.displayPercent ?? "Incomplete / N/A")}
              {t("%")}
            </Text>
          </View>
        ))}
      {years.map((y: any) => (
        <View key={y.enrollmentId} style={styles.record}>
          <Text style={styles.title}>
            {y.year} {t(" · ")}
            {y.section}
          </Text>
          <Text style={styles.note}>
            {y.program} {t(" · ")}
            {y.level}
          </Text>
          {y.attendance && (
            <Text style={styles.note}>
              {t("P ")}
              {y.attendance.present} {t(" · A ")}
              {y.attendance.absent} {t(" · Half")} {y.attendance.half}{" "}
              {t(" · Leave ")}
              {y.attendance.leave} {t(" · Attendance")}{" "}
              {t(y.attendance.displayPercent ?? "Incomplete")}
              {t("%")}
            </Text>
          )}
          <ScrollView horizontal>
            {action("All sessions", () => setCycle(""), !cycle)}
            {y.sessions.map((s: any) =>
              action(s.title, () => setCycle(s.cycleId), cycle === s.cycleId),
            )}
          </ScrollView>
          {y.sessions
            .filter((s: any) => !cycle || s.cycleId === cycle)
            .map((s: any) => (
              <View key={s.cycleId} style={styles.record}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.note}>
                  {s.result.total} {t(" / ")}
                  {s.result.possible} {t(" ·")}{" "}
                  {t(
                    s.result.percent === null
                      ? "Pending"
                      : Number(s.result.percent).toFixed(1) + "%",
                  )}{" "}
                  {t("· ")}
                  {t(s.official ? "Published" : "Draft")}
                </Text>
                <Text style={styles.note}>
                  {t("Position ")}
                  {s.result.rank ?? "—"} {t(" ·")}{" "}
                  {t(s.positionReason ?? "Eligible")}
                </Text>
              </View>
            ))}
        </View>
      ))}
      {!!student &&
        action(
          "Share student report PDF",
          () =>
            void run(() =>
              share(`/v1/students/${student}/performance.pdf?${q}`),
            ),
        )}
      {action(
        "Share class report PDF",
        () =>
          void run(() =>
            share(
              `/v1/sections/${section}/performance.pdf${cycle ? "?cycleId=" + cycle : ""}`,
            ),
          ),
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderColor: "white",
    borderWidth: 1,
    marginVertical: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 8,
  },
  note: { color: colors.muted, fontSize: 13, lineHeight: 21, marginBottom: 10 },
  button: {
    padding: 13,
    borderRadius: radii.control,
    backgroundColor: colors.secondary,
    marginRight: 8,
    marginBottom: 10,
    minHeight: 46,
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.primary },
  record: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    marginTop: 8,
  },
});
