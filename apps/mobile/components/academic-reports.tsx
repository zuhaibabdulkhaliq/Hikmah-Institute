import { useEffect, useState } from "react";
import { View } from "react-native";
import type { createClient } from "@hikmah/api-client";
import { Text, useI18n } from "./language";
import { Button, Card, Choice, Disclosure, Notice, ui } from "./ui";
import { RecordList, ResourceStatus, options, useResource } from "./workspace";
import { shareFile } from "../lib/files";
type Request = ReturnType<typeof createClient>;
type Run = (fn: () => Promise<void>) => Promise<void>;
export function NativeAttendanceTotals({
  section,
  run,
  refreshKey,
}: {
  section: string;
  request: Request;
  run: Run;
  refreshKey?: number;
}) {
  const { t } = useI18n();
  const [period, setPeriod] = useState("YEAR"),
    [cycle, setCycle] = useState("");
  const cycles = useResource<any[]>(
    `/v1/sections/${section}/attendance-periods`,
    [],
  );
  useEffect(() => {
    setCycle(
      cycles.data.find((c) => c.code === "SHASH_MAHI")?.id ??
        cycles.data[0]?.id ??
        "",
    );
  }, [cycles.data]);
  const q = new URLSearchParams({
    period,
    ...(period !== "YEAR" ? { cycleId: cycle } : {}),
  });
  const r = useResource<any>(
    period === "YEAR" || cycle
      ? `/v1/sections/${section}/attendance-summary?${q}`
      : null,
    null,
  );
  useEffect(() => r.refresh(), [refreshKey]);
  return (
    <Disclosure title="Attendance totals">
      <Choice
        label="Attendance period"
        value={period}
        options={[
          { value: "YEAR", label: "Year to date" },
          { value: "SESSION", label: "Session" },
          { value: "PREVIOUS_SESSION", label: "Previous session" },
        ]}
        onChange={setPeriod}
      />
      {period !== "YEAR" && (
        <Choice
          label="Exam session"
          value={cycle}
          options={options(cycles.data, (c) => c.title)}
          onChange={setCycle}
        />
      )}
      <ResourceStatus resource={r} />
      <RecordList
        rows={r.data?.students ?? []}
        render={(s) => (
          <View
            key={s.enrollmentId}
            style={{
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: "#dce8f2",
            }}
          >
            <Text style={ui.label}>{s.name}</Text>
            <Text style={ui.muted}>
              {t("Present")}: {s.present} · {t("Absent")}: {s.absent} ·{" "}
              {t("Half")}: {s.half} · {t("Leave")}: {s.leave}
            </Text>
            <Text style={ui.muted}>
              {s.academicDays} {t("academic days")} · {s.unmarked}{" "}
              {t("unmarked")} ·{" "}
              {s.displayPercent == null
                ? t("Incomplete / N/A")
                : s.displayPercent + "%"}
            </Text>
          </View>
        )}
      />
      <Button
        title="Refresh totals"
        secondary
        onPress={() => void run(async () => r.refresh())}
      />
    </Disclosure>
  );
}
export function NativePerformance({
  section,
  run,
}: {
  section: string;
  request: Request;
  run: Run;
}) {
  const { t } = useI18n();
  const [student, setStudent] = useState(""),
    [year, setYear] = useState(""),
    [cycle, setCycle] = useState("");
  const roster = useResource<any[]>(`/v1/sections/${section}/enrollments`, []);
  useEffect(() => setStudent(roster.data[0]?.student_id ?? ""), [roster.data]);
  const report = useResource<any>(
    student ? `/v1/students/${student}/performance` : null,
    null,
  );
  useEffect(() => {
    setYear("");
    setCycle("");
  }, [student]);
  const data = report.data;
  const q = new URLSearchParams({
    ...(year ? { yearId: year } : {}),
    ...(cycle ? { cycleId: cycle } : {}),
  });
  return (
    <Card title="Student performance & history">
      <Choice
        label="Student"
        value={student}
        options={roster.data.map((s) => ({
          value: s.student_id,
          label: `${s.roll_number} · ${s.full_name}`,
        }))}
        onChange={setStudent}
      />
      <ResourceStatus resource={report} />
      {data && (
        <>
          <Choice
            label="Academic year"
            value={year}
            options={[
              { value: "", label: "All years" },
              ...(Array.from(
                new Map(
                  data.years.map((y: any) => [
                    y.yearId,
                    { value: y.yearId, label: y.year },
                  ]),
                ).values(),
              ) as { value: string; label: string }[]),
            ]}
            onChange={(v) => {
              setYear(v);
              setCycle("");
            }}
          />
          <Choice
            label="Exam session"
            value={cycle}
            options={[
              { value: "", label: "All sessions" },
              ...(Array.from(
                new Map(
                  data.years
                    .filter((y: any) => !year || y.yearId === year)
                    .flatMap((y: any) =>
                      y.sessions.map((s: any) => [
                        s.cycleId,
                        { value: s.cycleId, label: s.title },
                      ]),
                    ),
                ).values(),
              ) as { value: string; label: string }[]),
            ]}
            onChange={setCycle}
          />
          {data.academicYears
            ?.filter((y: any) => !year || y.yearId === year)
            .map((y: any) => (
              <Card key={y.yearId} title={y.year}>
                <Text style={ui.muted}>
                  {t("Whole year attendance")}:{" "}
                  {y.attendance.displayPercent ?? t("Incomplete")}%
                </Text>
                <Text style={ui.muted}>
                  {t("Present")}: {y.attendance.present} · {t("Absent")}:{" "}
                  {y.attendance.absent} · {t("Half")}: {y.attendance.half} ·{" "}
                  {t("Leave")}: {y.attendance.leave}
                </Text>
              </Card>
            ))}
          {data.years
            .filter((y: any) => !year || y.yearId === year)
            .map((y: any) => (
              <Disclosure
                key={y.enrollmentId}
                title={`${y.year} · ${y.section}`}
                initial
              >
                <Text style={ui.muted}>
                  {y.program} · {y.level}
                </Text>
                {y.sessions
                  .filter((s: any) => !cycle || s.cycleId === cycle)
                  .map((s: any) => (
                    <View key={s.cycleId} style={{ paddingVertical: 13 }}>
                      <Text style={ui.label}>
                        {s.title} · {t(s.official ? "Published" : "Draft")}
                      </Text>
                      <Text style={ui.muted}>
                        {s.result.total} / {s.result.possible} ·{" "}
                        {s.result.percent == null
                          ? t("Pending")
                          : Number(s.result.percent).toFixed(1) + "%"}
                      </Text>
                      <Text style={ui.muted}>
                        {t("Position")}: {s.result.rank ?? "—"} ·{" "}
                        {t(s.positionReason ?? "Eligible")}
                      </Text>
                    </View>
                  ))}
              </Disclosure>
            ))}
          <Button
            title="Share student report PDF"
            icon="share-outline"
            onPress={() =>
              void run(() =>
                shareFile(
                  `/v1/students/${student}/performance.pdf?${q}`,
                  "student-performance.pdf",
                ),
              )
            }
          />
          <Button
            title="Share class report PDF"
            secondary
            icon="share-outline"
            onPress={() =>
              void run(() =>
                shareFile(
                  `/v1/sections/${section}/performance.pdf${cycle ? "?cycleId=" + cycle : ""}`,
                  "class-performance.pdf",
                ),
              )
            }
          />
          <Button
            title="Download class report CSV"
            secondary
            icon="download-outline"
            onPress={() =>
              void run(() =>
                shareFile(
                  `/v1/sections/${section}/performance.csv${cycle ? "?cycleId=" + cycle : ""}`,
                  "class-performance.csv",
                  "text/csv",
                ),
              )
            }
          />
        </>
      )}
      {!student && (
        <Notice text="Enroll students in this class to see their performance." />
      )}
    </Card>
  );
}
