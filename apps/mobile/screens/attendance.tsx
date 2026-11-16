import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { colors } from "@hikmah/ui-tokens";
import type { Sheet } from "@hikmah/api-client";
import { Text, useI18n } from "../components/language";
import {
  Button,
  Card,
  Disclosure,
  Empty,
  Field,
  Notice,
  Toggle,
  ui,
} from "../components/ui";
import {
  Form,
  RecordList,
  ResourceStatus,
  useResource,
  useWorkspace,
  write,
} from "../components/workspace";
import { NativeAttendanceTotals } from "../components/academic-reports";
import { api } from "../components/connection";
import { shareFile } from "../lib/files";
export const attendanceStatuses = ["PRESENT", "ABSENT", "HALF", "LEAVE"];
export function AttendanceStatus({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={[ui.row, { marginTop: 10 }]}>
      {attendanceStatuses.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="radio"
          accessibilityLabel={`${name} ${t(({ PRESENT: "Present", ABSENT: "Absent", HALF: "Half", LEAVE: "Leave" } as Record<string, string>)[s])}`}
          accessibilityState={{ selected: value === s, disabled }}
          disabled={disabled}
          onPress={() => onChange(s)}
          style={({ pressed }) => ({
            minHeight: 46,
            minWidth: 66,
            paddingHorizontal: 11,
            paddingVertical: 12,
            borderRadius: 15,
            backgroundColor:
              value === s
                ? s === "ABSENT"
                  ? colors.danger
                  : colors.primary
                : colors.secondary,
            opacity: disabled || pressed ? 0.55 : 1,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text
            style={{
              fontWeight: "600",
              fontSize: 12,
              color: value === s ? "white" : colors.primary,
            }}
          >
            {t(s)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Attendance() {
  const { me, section, sections, run, busy, setDirty } = useWorkspace();
  const [date, setDate] = useState(me.today),
    [records, setRecords] = useState<Record<string, string>>({}),
    [remarks, setRemarks] = useState<Record<string, string>>({});
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const resource = useResource<Sheet | null>(
      section && valid ? `/v1/sections/${section}/attendance/${date}` : null,
      null,
    ),
    calendar = useResource<any[]>(
      section && valid
        ? `/v1/sections/${section}/calendar?from=${date}&through=${date}`
        : null,
      [],
    ),
    permission = useResource<any>("/v1/attendance-permissions", null);
  const { t } = useI18n();
  const canManage =
    me.roles.includes("ADMIN") || me.managedSections.includes(section);
  const historicalAllowed =
    canManage ||
    date === me.today ||
    (permission.data?.days != null &&
      (Date.parse(me.today) - Date.parse(date)) / 86400000 <=
        permission.data.days);
  const instructional = calendar.data.some(
    (d) => d.counts_for_attendance && d.is_instructional,
  );
  const editable =
    !!resource.data &&
    resource.data.status === "DRAFT" &&
    instructional &&
    date <= me.today &&
    historicalAllowed &&
    sections.find((s) => s.id === section)?.year_state === "ACTIVE";
  useEffect(() => {
    setRecords(
      Object.fromEntries(
        (resource.data?.records ?? []).map((r) => [r.enrollmentId, r.status]),
      ),
    );
    setRemarks(
      Object.fromEntries(
        (resource.data?.records ?? []).map((r) => [
          r.enrollmentId,
          (r as any).remark ?? "",
        ]),
      ),
    );
  }, [resource.data]);
  const payload = () => ({
    records: (resource.data?.roster ?? [])
      .filter((r) => records[r.id])
      .map((r) => ({
        enrollmentId: r.id,
        status: records[r.id],
        remark: remarks[r.id] ?? "",
      })),
  });
  return (
    <>
      <Card
        title="Daily attendance"
        description="Only academic days count. Present 1 · Half 0.5 · Absent 0 · Leave excluded."
      >
        <Field
          label="Attendance date"
          type="date"
          value={date}
          onChange={setDate}
        />
        <ResourceStatus resource={resource} />
        {!section && <Empty text="Choose an assigned section to continue." />}
        {resource.data && (
          <>
            <Notice
              text={
                instructional
                  ? `${t("Status")}: ${t(resource.data.status)} · ${Object.keys(records).length}/${resource.data.roster.length} ${t("marked")}`
                  : "This is not an attendance-counting academic day."
              }
            />
            {!editable && (
              <Notice
                text={
                  resource.data.status !== "DRAFT"
                    ? "Submitted attendance is read-only. A Mushrif or administrator can reopen it with a reason."
                    : "Attendance entry is unavailable for this date or academic year. Check the calendar and edit permissions."
                }
              />
            )}
            <Button
              title="Mark all present"
              secondary
              disabled={busy || !editable}
              onPress={() => {
                setDirty(true);
                setRecords(
                  Object.fromEntries(
                    resource.data!.roster.map((r) => [r.id, "PRESENT"]),
                  ),
                );
              }}
            />
            <RecordList
              rows={resource.data.roster}
              render={(r) => (
                <View
                  key={r.id}
                  style={{
                    paddingVertical: 17,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Text style={ui.label}>
                    {r.roll_number} · {r.full_name_ur ?? r.full_name}
                  </Text>
                  <Text style={ui.muted}>{r.student_number}</Text>
                  <AttendanceStatus
                    name={r.student_number}
                    value={records[r.id] ?? ""}
                    disabled={busy || !editable}
                    onChange={(v) => {
                      setDirty(true);
                      setRecords({ ...records, [r.id]: v });
                    }}
                  />
                  <Disclosure title="Attendance remark">
                    <Field
                      label={`Remark ${r.student_number}`}
                      value={remarks[r.id] ?? ""}
                      disabled={busy || !editable}
                      onChange={(v) => {
                        setDirty(true);
                        setRemarks({ ...remarks, [r.id]: v });
                      }}
                    />
                  </Disclosure>
                </View>
              )}
            />
            <Button
              title="Save draft"
              disabled={busy || !editable}
              onPress={() =>
                void run(async () => {
                  await write(
                    `/v1/sections/${section}/attendance/${date}`,
                    payload(),
                    "PUT",
                    { "If-Match": String(resource.data!.version) },
                  );
                  resource.refresh();
                }, "Attendance draft saved.")
              }
            />
            <Button
              title="Submit complete roster"
              secondary
              disabled={busy || !editable}
              onPress={() =>
                void run(async () => {
                  await write(
                    `/v1/sections/${section}/attendance/${date}/submit`,
                    {},
                    "POST",
                    { "If-Match": String(resource.data!.version) },
                  );
                  resource.refresh();
                }, "Attendance submitted.")
              }
            />
            {canManage && resource.data.status !== "DRAFT" && (
              <Form
                fields={[
                  { key: "reason", label: "Correction reason", required: true },
                ]}
                title="Reopen attendance"
                onSubmit={(d) =>
                  run(async () => {
                    await write(
                      `/v1/sections/${section}/attendance/${date}/reopen`,
                      d,
                    );
                    resource.refresh();
                  }, "Attendance reopened with an audit record.")
                }
              />
            )}
            <Button
              title="Export attendance CSV"
              secondary
              icon="download-outline"
              disabled={busy}
              onPress={() =>
                void run(() =>
                  shareFile(
                    `/v1/sections/${section}/attendance.csv?from=${date}&through=${date}`,
                    "attendance.csv",
                    "text/csv",
                  ),
                )
              }
            />
          </>
        )}
      </Card>
      {!!section && (
        <>
          <NativeAttendanceTotals
            section={section}
            request={api}
            run={async (fn) => {
              await run(fn);
            }}
            refreshKey={resource.data?.version}
          />
          <Disclosure title="Attendance grid">
            <AttendanceGrid key={section} section={section} />
          </Disclosure>
          <Disclosure title="Request historical correction">
            <Form
              fields={[
                {
                  key: "schoolDate",
                  label: "Attendance date",
                  type: "date",
                  value: date,
                  required: true,
                },
                { key: "reason", label: "Correction reason", required: true },
              ]}
              title="Request correction"
              onSubmit={(d) =>
                run(async () => {
                  await write(`/v1/sections/${section}/corrections`, d);
                }, "Correction request sent.")
              }
            />
          </Disclosure>
        </>
      )}
    </>
  );
}
function AttendanceGrid({ section }: { section: string }) {
  const { me, run, busy } = useWorkspace();
  const { t } = useI18n();
  const [from, setFrom] = useState(me.today),
    [through, setThrough] = useState(me.today),
    [days, setDays] = useState<any[]>([]),
    [ack, setAck] = useState(false);
  const invalidate = () => {
    setDays([]);
    setAck(false);
  };
  const load = async () => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(through) ||
      from > through ||
      (Date.parse(through) - Date.parse(from)) / 86400000 > 30
    )
      throw Error("Choose a valid date range of at most 31 days.");
    const c = await api<any[]>(
      `/v1/sections/${section}/calendar?from=${from}&through=${through}`,
    );
    setDays(
      await Promise.all(
        c
          .filter((d) => d.counts_for_attendance)
          .map((d) =>
            api(
              `/v1/sections/${section}/attendance/${String(d.school_date).slice(0, 10)}`,
            ),
          ),
      ),
    );
    setAck(false);
  };
  return (
    <>
      <Field
        label="From"
        type="date"
        value={from}
        onChange={(v) => {
          setFrom(v);
          invalidate();
        }}
      />
      <Field
        label="Through"
        type="date"
        value={through}
        onChange={(v) => {
          setThrough(v);
          invalidate();
        }}
      />
      <Button
        title="Load attendance grid"
        disabled={busy}
        onPress={() => void run(load)}
      />
      {days.map((day, i) => (
        <Disclosure
          key={day.schoolDate}
          title={`${day.schoolDate} · ${t(day.status)}`}
        >
          {day.roster.map((r: any) => (
            <View key={r.id} style={{ marginBottom: 15 }}>
              <Text style={ui.label}>
                {r.roll_number} · {r.full_name}
              </Text>
              <AttendanceStatus
                name={`${day.schoolDate} ${r.student_number}`}
                value={
                  day.records.find((v: any) => v.enrollmentId === r.id)
                    ?.status ?? ""
                }
                disabled={
                  busy || day.status !== "DRAFT" || day.schoolDate > me.today
                }
                onChange={(status) => {
                  setDays(
                    days.map((d, n) =>
                      n === i
                        ? {
                            ...d,
                            records: [
                              ...d.records.filter(
                                (v: any) => v.enrollmentId !== r.id,
                              ),
                              { enrollmentId: r.id, status },
                            ],
                          }
                        : d,
                    ),
                  );
                  setAck(false);
                }}
              />
            </View>
          ))}
        </Disclosure>
      ))}
      {!!days.length && (
        <>
          <Toggle
            label="Confirm saving all editable dates"
            value={ack}
            onChange={setAck}
          />
          <Button
            title="Save grid atomically"
            disabled={busy || !ack || !days.some((d) => d.status === "DRAFT")}
            onPress={() =>
              void run(async () => {
                await write(
                  `/v1/sections/${section}/attendance/bulk`,
                  {
                    days: days
                      .filter((d) => d.status === "DRAFT")
                      .map((d) => ({
                        schoolDate: d.schoolDate,
                        version: d.version,
                        records: d.records,
                      })),
                  },
                  "POST",
                  {
                    "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  },
                );
                await load();
              }, "Attendance grid saved.")
            }
          />
        </>
      )}
    </>
  );
}
