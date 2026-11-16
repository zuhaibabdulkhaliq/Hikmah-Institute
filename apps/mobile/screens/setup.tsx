import { useEffect, useState } from "react";
import { View } from "react-native";
import { sectionLabel } from "@hikmah/api-client";
import { Text, useI18n } from "../components/language";
import {
  Card,
  Choice,
  Disclosure,
  Field,
  Button,
  Toggle,
  ui,
} from "../components/ui";
import {
  Form,
  RecordList,
  ResourceStatus,
  choices,
  options,
  useResource,
  useWorkspace,
  write,
  type FormField,
} from "../components/workspace";
import { CSVImport } from "../components/csv-import";
const fields: Record<string, FormField[]> = {
  "academic-years": [
    { key: "label", label: "Academic year", required: true },
    { key: "hijri_label", label: "Hijri label" },
    { key: "start_date", label: "Start date", type: "date", required: true },
    { key: "end_date", label: "End date", type: "date", required: true },
    {
      key: "state",
      label: "Status",
      options: choices(["PLANNED", "ACTIVE", "CLOSED", "ARCHIVED"]),
      value: "PLANNED",
    },
  ],
  programs: [
    { key: "name", label: "Name", required: true },
    { key: "code", label: "Code", required: true },
  ],
  levels: [
    { key: "ordinal", label: "Level number", type: "number", required: true },
    { key: "name_en", label: "English name", required: true },
    { key: "name_ur", label: "Urdu name" },
  ],
  sections: [
    { key: "academic_year_id", label: "Academic year", required: true },
    { key: "program_id", label: "Program", required: true },
    { key: "level_id", label: "Class level", required: true },
    { key: "code", label: "Section code", required: true },
    { key: "name", label: "Class name", required: true },
  ],
  students: [
    { key: "student_number", label: "Student number", required: true },
    { key: "full_name", label: "Full name", required: true },
    { key: "full_name_ur", label: "Urdu name" },
    { key: "guardian_contact", label: "Guardian contact" },
  ],
  subjects: [
    { key: "code", label: "Subject code", required: true },
    { key: "name_en", label: "English name", required: true },
    { key: "name_ur", label: "Urdu name" },
  ],
};
const labels: Record<string, string> = {
  "academic-years": "Academic years",
  programs: "Programs",
  levels: "Class levels",
  sections: "Class sections",
  students: "Students",
  subjects: "Subjects",
};
export function AcademicSetup() {
  const { run, reload } = useWorkspace();
  const [resource, setResource] = useState("academic-years"),
    [editing, setEditing] = useState<any>(null),
    [catalogVersion, setCatalogVersion] = useState(0);
  const rows = useResource<any[]>(`/v1/${resource}`, []),
    years = useResource<any[]>("/v1/academic-years", []),
    programs = useResource<any[]>("/v1/programs", []),
    levels = useResource<any[]>("/v1/levels", []),
    institute = useResource<any>("/v1/institute", null);
  const refs: Record<string, any[]> = {
    academic_year_id: years.data,
    program_id: programs.data,
    level_id: levels.data,
  };
  const refresh = async () => {
    rows.refresh();
    years.refresh();
    programs.refresh();
    levels.refresh();
    setCatalogVersion((n) => n + 1);
    await reload();
  };
  return (
    <>
      <Disclosure title="Institute details">
        {institute.data && (
          <Form
            key={JSON.stringify(institute.data)}
            initial={institute.data}
            fields={[
              { key: "name", label: "English name", required: true },
              { key: "name_ur", label: "Urdu name", required: true },
              {
                key: "official_display_name",
                label: "Official display name",
                required: true,
              },
              {
                key: "timezone",
                label: "Timezone",
                value: "Asia/Karachi",
                required: true,
              },
            ]}
            onSubmit={(d) =>
              run(async () => {
                await write("/v1/institute", d, "PATCH");
                institute.refresh();
              }, "Institute details saved.")
            }
          />
        )}
      </Disclosure>
      <Card title="Academic records">
        <Choice
          label="Manage"
          value={resource}
          options={Object.keys(fields).map((value) => ({
            value,
            label: labels[value],
          }))}
          onChange={(v) => {
            setResource(v);
            setEditing(null);
          }}
        />
        <ResourceStatus resource={rows} />
        <Form
          key={resource + (editing?.id ?? "new")}
          resetOnSuccess={!editing}
          title={editing ? "Save changes" : "Create record"}
          initial={editing ?? {}}
          fields={fields[resource]
            .map((f) => ({
              ...f,
              ...(refs[f.key]
                ? {
                    options: options(
                      refs[f.key],
                      (r) => r.label ?? r.name ?? r.name_ur ?? r.name_en,
                    ),
                  }
                : {}),
            }))
            .concat(
              editing
                ? ([
                    {
                      key: "active",
                      label: "Active",
                      type: "boolean",
                      value: true,
                    },
                  ].filter(() => resource !== "academic-years") as FormField[])
                : [],
            )}
          onSubmit={(d) =>
            run(async () => {
              await write(
                `/v1/${resource}${editing ? "/" + editing.id : ""}`,
                d,
                editing ? "PATCH" : "POST",
              );
              setEditing(null);
              await refresh();
            }, "Record saved.")
          }
        />
        {editing && (
          <Button
            title="Cancel edit"
            secondary
            onPress={() => setEditing(null)}
          />
        )}
        <View style={ui.divider} />
        <RecordList
          rows={rows.data}
          render={(r) => (
            <View key={r.id} style={{ paddingVertical: 12 }}>
              <Text style={ui.label}>
                {r.full_name_ur ??
                  r.full_name ??
                  r.label ??
                  r.name ??
                  r.name_ur ??
                  r.name_en}
              </Text>
              <Text style={ui.muted}>
                {r.code ?? r.student_number ?? r.state ?? ""}
              </Text>
              <Button
                title="Edit"
                secondary
                onPress={() =>
                  setEditing({
                    ...r,
                    start_date: r.start_date?.slice(0, 10),
                    end_date: r.end_date?.slice(0, 10),
                  })
                }
              />
            </View>
          )}
        />
      </Card>
      <EnrollmentTools refreshVersion={catalogVersion} />
    </>
  );
}
function EnrollmentTools({ refreshVersion }: { refreshVersion: number }) {
  const { section, sections, setSection, run, me, busy, reload } =
    useWorkspace();
  const { t } = useI18n();
  const students = useResource<any[]>("/v1/students", []),
    users = useResource<any[]>("/v1/users", []),
    subjects = useResource<any[]>("/v1/subjects", []),
    enrollments = useResource<any[]>(
      section ? `/v1/sections/${section}/enrollments` : null,
      [],
    ),
    offerings = useResource<any[]>(
      section ? `/v1/sections/${section}/subjects` : null,
      [],
    ),
    staff = useResource<any>(section ? `/v1/sections/${section}/staff` : null, {
      section: [],
      subjects: [],
    });
  useEffect(() => {
    if (refreshVersion) {
      students.refresh();
      users.refresh();
      subjects.refresh();
    }
  }, [refreshVersion]);
  const [selected, setSelected] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [joined, setJoined] = useState(me.today);
  const refresh = async () => {
    enrollments.refresh();
    staff.refresh();
    offerings.refresh();
    await reload();
  };
  return (
    <>
      <Card title="Class membership">
        <Choice
          label="Section"
          value={section}
          options={options(sections, sectionLabel)}
          onChange={(v) => {
            setSection(v);
            setSelected([]);
          }}
        />
        {!section && (
          <Text style={ui.muted}>
            {t("Create a class section to continue.")}
          </Text>
        )}
      </Card>
      {!!section && (
        <>
          <Disclosure title="Enroll learners">
            <Form
              key={section}
              fields={[
                {
                  key: "student_id",
                  label: "Student",
                  options: options(
                    students.data,
                    (r) => `${r.student_number} · ${r.full_name}`,
                  ),
                  required: true,
                },
                { key: "roll_number", label: "Roll number", required: true },
                {
                  key: "joined_on",
                  label: "Joined on",
                  type: "date",
                  value: me.today,
                  required: true,
                },
              ]}
              title="Enroll learner"
              onSubmit={(d) =>
                run(async () => {
                  await write(`/v1/sections/${section}/enrollments`, d);
                  enrollments.refresh();
                }, "Learner enrolled.")
              }
            />
          </Disclosure>
          <Disclosure title="Enrollment history and corrections">
            <ResourceStatus resource={enrollments} />
            <RecordList
              rows={enrollments.data}
              render={(e) => (
                <Disclosure
                  key={e.id}
                  title={`${e.roll_number} · ${e.full_name}`}
                >
                  <Form
                    initial={{
                      rollNumber: e.roll_number,
                      leftOn: e.left_on?.slice(0, 10) ?? "",
                      state: e.state,
                    }}
                    fields={[
                      {
                        key: "rollNumber",
                        label: "Roll number",
                        required: true,
                      },
                      { key: "leftOn", label: "Left on", type: "date" },
                      {
                        key: "state",
                        label: "Status",
                        options: choices([
                          "ACTIVE",
                          "TRANSFERRED",
                          "WITHDRAWN",
                          "COMPLETED",
                        ]),
                        required: true,
                      },
                      {
                        key: "reason",
                        label: "Correction reason",
                        required: true,
                      },
                    ]}
                    onSubmit={(d) =>
                      run(async () => {
                        await write(
                          `/v1/enrollments/${e.id}`,
                          { ...d, leftOn: d.leftOn || null },
                          "PATCH",
                        );
                        enrollments.refresh();
                      }, "Enrollment updated.")
                    }
                  />
                </Disclosure>
              )}
            />
          </Disclosure>
          <Disclosure title="Assign class staff">
            <Form
              key={section}
              fields={[
                {
                  key: "user_id",
                  label: "Staff account",
                  options: options(
                    users.data,
                    (r) => r.display_name + " · " + r.email,
                  ),
                  required: true,
                },
                {
                  key: "role",
                  label: "Role",
                  options: choices([
                    "MUSHRIF",
                    "AMEER",
                    "ATTENDANCE_ASSISTANT",
                  ]),
                  required: true,
                },
                {
                  key: "starts_on",
                  label: "Starts on",
                  type: "date",
                  value: me.today,
                  required: true,
                },
                { key: "ends_on", label: "Ends on", type: "date" },
                {
                  key: "ameerOverrideReason",
                  label: "Ameer membership override reason",
                },
              ]}
              title="Assign staff"
              onSubmit={(d) =>
                run(async () => {
                  await write(`/v1/sections/${section}/staff`, d);
                  await refresh();
                }, "Staff assignment saved.")
              }
            />
            {staff.data.section.map((s: any) => (
              <Disclosure key={s.id} title={`${s.display_name} · ${s.role}`}>
                <Form
                  initial={{
                    active: s.active,
                    endsOn: s.ends_on?.slice(0, 10) ?? "",
                  }}
                  fields={[
                    { key: "active", label: "Active", type: "boolean" },
                    { key: "endsOn", label: "Ends on", type: "date" },
                    {
                      key: "reason",
                      label: "Correction reason",
                      required: true,
                    },
                  ]}
                  onSubmit={(d) =>
                    run(async () => {
                      await write(
                        `/v1/staff/${s.id}`,
                        { ...d, endsOn: d.endsOn || null },
                        "PATCH",
                      );
                      await refresh();
                    }, "Staff scope updated.")
                  }
                />
              </Disclosure>
            ))}
          </Disclosure>
          <Disclosure title="Subjects and teaching assignments">
            <Form
              key={section}
              fields={[
                {
                  key: "subject_id",
                  label: "Subject",
                  options: options(
                    subjects.data,
                    (r) => `${r.code} · ${r.name_ur ?? r.name_en}`,
                  ),
                  required: true,
                },
                {
                  key: "display_order",
                  label: "Display order",
                  type: "number",
                  value: 0,
                },
              ]}
              title="Add subject offering"
              onSubmit={(d) =>
                run(async () => {
                  await write(`/v1/sections/${section}/subjects`, d);
                  offerings.refresh();
                }, "Subject added.")
              }
            />
            <Form
              key={section}
              fields={[
                {
                  key: "offering",
                  label: "Subject offering",
                  options: options(
                    offerings.data,
                    (r) => `${r.code} · ${r.name_ur ?? r.name_en}`,
                  ),
                  required: true,
                },
                {
                  key: "teacher_user_id",
                  label: "Teacher",
                  options: options(users.data, (r) => r.display_name),
                  required: true,
                },
                {
                  key: "starts_on",
                  label: "Starts on",
                  type: "date",
                  value: me.today,
                  required: true,
                },
                { key: "ends_on", label: "Ends on", type: "date" },
              ]}
              title="Assign subject teacher"
              onSubmit={(d) =>
                run(async () => {
                  const { offering, ...body } = d;
                  await write(`/v1/offerings/${offering}/teachers`, body);
                  await refresh();
                }, "Teacher assigned.")
              }
            />
            {staff.data.subjects.map((s: any) => (
              <Disclosure key={s.id} title={s.display_name}>
                <Form
                  fields={[
                    {
                      key: "endsOn",
                      label: "Ends on",
                      type: "date",
                      required: true,
                    },
                    {
                      key: "reason",
                      label: "Correction reason",
                      required: true,
                    },
                  ]}
                  title="End teaching assignment"
                  onSubmit={(d) =>
                    run(async () => {
                      await write(`/v1/teaching/${s.id}`, d, "PATCH");
                      await refresh();
                    }, "Teaching assignment updated.")
                  }
                />
              </Disclosure>
            ))}
          </Disclosure>
          <CSVImport
            key={section}
            mode="students"
            section={section}
            onApplied={() => {
              students.refresh();
              enrollments.refresh();
            }}
          />
          <Disclosure title="Promote students to another section">
            <Choice
              label="Target section"
              value={target}
              options={options(
                sections.filter((s) => s.id !== section),
                sectionLabel,
              )}
              onChange={setTarget}
            />
            <Field
              label="Joined on"
              type="date"
              value={joined}
              onChange={setJoined}
            />
            {enrollments.data.map((e) => (
              <Toggle
                key={e.id}
                label={`${e.roll_number} · ${e.full_name}`}
                value={selected.includes(e.id)}
                onChange={(v) =>
                  setSelected(
                    v
                      ? [...selected, e.id]
                      : selected.filter((id) => id !== e.id),
                  )
                }
              />
            ))}
            <Button
              title="Promote selected students"
              disabled={busy || !target || !selected.length}
              onPress={() =>
                void run(async () => {
                  await write(`/v1/sections/${section}/rollover`, {
                    targetSection: target,
                    joinedOn: joined,
                    enrollmentIds: selected,
                  });
                  setSelected([]);
                  await refresh();
                }, "Students enrolled in the next section. Earlier history is preserved.")
              }
            />
          </Disclosure>
        </>
      )}
    </>
  );
}
