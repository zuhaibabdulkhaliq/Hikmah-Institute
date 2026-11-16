import { useEffect, useState } from "react";
import { View } from "react-native";
import { sectionLabel, validSchoolDate } from "@hikmah/api-client";
import { Text, useI18n } from "../components/language";
import {
  Card,
  Choice,
  Field,
  Button,
  Toggle,
  Notice,
  Empty,
  Disclosure,
  ui,
} from "../components/ui";
import {
  useWorkspace,
  useResource,
  ResourceStatus,
  options,
  write,
} from "../components/workspace";
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function AcademicCalendar() {
  const { me, run, busy, section, setSection } = useWorkspace(),
    { t } = useI18n();
  const resource = useResource<any[]>("/v1/calendars", []);
  const [year, setYear] = useState(""),
    [program, setProgram] = useState(""),
    [level, setLevel] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [from, setFrom] = useState(me.today),
    [through, setThrough] = useState(me.today),
    [kind, setKind] = useState("WEEKLY"),
    [days, setDays] = useState<number[]>([]),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(""),
    [dayType, setDayType] = useState("HOLIDAY"),
    [preview, setPreview] = useState<any>(null),
    [ack, setAck] = useState(false);
  const invalidate = () => {
    setPreview(null);
    setAck(false);
  };
  const unique = (key: string, label: string) =>
    Array.from(
      new Map(
        resource.data.map((r) => [r[key], { value: r[key], label: r[label] }]),
      ).values(),
    );
  const filtered = resource.data.filter(
    (s) =>
      (!year || s.academic_year_id === year) &&
      (!program || s.program_id === program) &&
      (!level || s.level_id === level),
  );
  const active = resource.data.find((s) => s.id === section);
  useEffect(() => {
    if (resource.data.length && !active) setSection(resource.data[0].id);
  }, [resource.data]);
  useEffect(() => {
    if (active) {
      setFrom(active.year_start);
      setThrough(active.year_end);
      setIds([active.id]);
      setYear(active.academic_year_id);
      invalidate();
    }
  }, [section, active?.year_start]);
  const payload = {
    sectionIds: ids,
    from,
    through,
    reason,
    kind,
    ...(kind === "WEEKLY"
      ? { weekdays: days }
      : kind === "EXCEPTION"
        ? { dayType, note }
        : {}),
  };
  const viewFrom = from;
  const viewThrough = validSchoolDate(from)
    ? new Date(
        Math.min(
          validSchoolDate(through) ? Date.parse(through) : Date.parse(from),
          Date.parse(from) + 30 * 86400000,
        ),
      )
        .toISOString()
        .slice(0, 10)
    : through;
  const calendar = useResource<any>(
    section && validSchoolDate(viewFrom) && validSchoolDate(viewThrough)
      ? `/v1/sections/${section}/academic-calendar?from=${viewFrom}&through=${viewThrough}`
      : null,
    null,
  );
  return (
    <>
      <Card
        title="Flexible academic calendar"
        description="Set a teaching week for each class. Holidays and extra classes take priority over weekly schedules."
      >
        <ResourceStatus resource={resource} />
        <Choice
          label="View section"
          value={section}
          options={options(resource.data, sectionLabel)}
          onChange={setSection}
        />
        <Choice
          label="Academic year"
          value={year}
          options={[
            { value: "", label: "All years" },
            ...unique("academic_year_id", "year_label"),
          ]}
          onChange={(v) => {
            setYear(v);
            setIds([]);
            invalidate();
          }}
        />
        <Choice
          label="Program"
          value={program}
          options={[
            { value: "", label: "All programs" },
            ...unique("program_id", "program_name"),
          ]}
          onChange={(v) => {
            setProgram(v);
            setIds([]);
            invalidate();
          }}
        />
        <Choice
          label="Class level"
          value={level}
          options={[
            { value: "", label: "All levels" },
            ...unique("level_id", "level_name"),
          ]}
          onChange={(v) => {
            setLevel(v);
            setIds([]);
            invalidate();
          }}
        />
        <Button
          title="Select matching classes"
          secondary
          onPress={() => {
            setIds(
              filtered
                .filter(
                  (s) =>
                    s.year_state === "ACTIVE" || s.year_state === "PLANNED",
                )
                .map((s) => s.id),
            );
            invalidate();
          }}
        />
        {filtered.map((s) => (
          <Toggle
            key={s.id}
            disabled={!["ACTIVE", "PLANNED"].includes(s.year_state)}
            label={sectionLabel(s)}
            value={ids.includes(s.id)}
            onChange={(v) => {
              setIds(v ? [...ids, s.id] : ids.filter((id) => id !== s.id));
              invalidate();
            }}
          />
        ))}
      </Card>
      <Card title="Schedule change">
        <Choice
          label="Change type"
          value={kind}
          options={[
            { value: "WEEKLY", label: "Weekly schedule" },
            { value: "EXCEPTION", label: "Holiday or extra class" },
            { value: "RESTORE", label: "Restore weekly schedule" },
          ]}
          onChange={(v) => {
            setKind(v);
            invalidate();
          }}
        />
        <Field
          label="Effective from"
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
        {kind === "WEEKLY" && (
          <>
            <Choice
              label="Copy a saved schedule"
              value=""
              options={[
                { value: "", label: "Choose a schedule to copy…" },
                ...resource.data.flatMap((s) =>
                  s.patterns.map((p: any) => ({
                    value: s.id + ":" + p.id,
                    label: `${sectionLabel(s)} · ${p.weekdays.map((d: number) => t(weekdays[d])).join(", ")}`,
                  })),
                ),
              ]}
              onChange={(v) => {
                const [sid, pid] = v.split(":");
                const p = resource.data
                  .find((s) => s.id === sid)
                  ?.patterns.find((p: any) => p.id === pid);
                if (p) {
                  setDays(p.weekdays);
                  invalidate();
                }
              }}
            />
            <View style={ui.row}>
              <Button
                title="All seven days"
                secondary
                onPress={() => {
                  setDays([0, 1, 2, 3, 4, 5, 6]);
                  invalidate();
                }}
              />
              <Button
                title="Clear weekdays"
                secondary
                onPress={() => {
                  setDays([]);
                  invalidate();
                }}
              />
            </View>
            {weekdays.map((day, i) => (
              <Toggle
                key={day}
                label={day}
                value={days.includes(i)}
                onChange={(v) => {
                  setDays(v ? [...days, i] : days.filter((d) => d !== i));
                  invalidate();
                }}
              />
            ))}
          </>
        )}
        {kind === "EXCEPTION" && (
          <>
            <Choice
              label="Day type"
              value={dayType}
              options={[
                { value: "HOLIDAY", label: "Holiday" },
                { value: "TEACHING", label: "Extra teaching day" },
                {
                  value: "NO_ATTENDANCE",
                  label: "Teaching without attendance",
                },
              ]}
              onChange={(v) => {
                setDayType(v);
                invalidate();
              }}
            />
            <Field
              label="Holiday or exception name"
              value={note}
              onChange={(v) => {
                setNote(v);
                invalidate();
              }}
            />
          </>
        )}
        <Field
          label="Reason for change"
          value={reason}
          onChange={(v) => {
            setReason(v);
            invalidate();
          }}
        />
        <Button
          title="Preview changes"
          disabled={busy || !ids.length}
          onPress={() =>
            void run(async () => {
              setPreview(await write("/v1/calendars/preview", payload));
              setAck(false);
            })
          }
        />
      </Card>
      {preview && (
        <Card title="Calendar change preview">
          {preview.sections.map((s: any) => (
            <View key={s.id} style={{ marginBottom: 15 }}>
              <Text style={ui.label}>{s.name}</Text>
              <Text style={ui.muted}>
                {t("Academic days")}: {s.academicDays} · {t("Changed dates")}:{" "}
                {s.changedDates}
              </Text>
              <Text style={ui.muted}>
                {t("Recorded dates affected")}: {s.recordedDatesAffected}
              </Text>
            </View>
          ))}
          <Notice text="Existing attendance records are preserved. Review changes affecting recorded dates before applying." />
          <Toggle
            label="I reviewed and approve these changes"
            value={ack}
            onChange={setAck}
          />
          <Button
            title="Apply calendar changes"
            disabled={busy || !ack}
            onPress={() =>
              void run(async () => {
                await write("/v1/calendars/apply", {
                  ...payload,
                  previewHash: preview.hash,
                  acknowledgeRecordedChanges: ack,
                });
                invalidate();
                resource.refresh();
                calendar.refresh();
              }, "Academic calendar updated.")
            }
          />
        </Card>
      )}
      <Disclosure title="Academic dates preview">
        <ResourceStatus resource={calendar} />
        {calendar.data?.days.map((d: any) => (
          <View
            key={d.date}
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: "#dce8f2",
            }}
          >
            <Text style={ui.label}>
              {d.date} ·{" "}
              {t(d.countsForAttendance ? "Academic day" : "No attendance")}
            </Text>
            <Text style={ui.muted}>
              {t(d.note)}
              {d.sheetState ? ` · ${t(d.sheetState)}` : ""}
            </Text>
          </View>
        ))}
        {!calendar.data?.days.length && <Empty />}
      </Disclosure>
    </>
  );
}
