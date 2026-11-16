import {
  ConfigurationEditor,
  validSchemeShape,
} from "../components/json-editor";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text, useI18n } from "../components/language";
import {
  Button,
  Card,
  Choice,
  Disclosure,
  Field,
  Notice,
  Toggle,
  ui,
} from "../components/ui";
import {
  Form,
  choices,
  options,
  ResourceStatus,
  useResource,
  useWorkspace,
  write,
} from "../components/workspace";
export function SchemeFields({
  value,
  onChange,
  offerings,
  disabled = false,
}: {
  value: any;
  onChange: (v: any) => void;
  offerings: any[];
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { setDirty } = useWorkspace();
  const changed = (next: any) => {
    setDirty(true);
    onChange(next);
  };
  const scheme = value ?? { papers: [], groups: [] };
  const update = (kind: "papers" | "groups", i: number, key: string, v: any) =>
    changed({
      ...scheme,
      [kind]: scheme[kind].map((p: any, n: number) =>
        n === i ? { ...p, [key]: v } : p,
      ),
    });
  return (
    <>
      {scheme.papers.map((p: any, i: number) => (
        <Disclosure
          key={i}
          title={`${p.code || t("New paper")} · ${p.label || t("Paper")}`}
        >
          <Field
            label="Paper code"
            value={p.code}
            disabled={disabled}
            onChange={(v) => update("papers", i, "code", v)}
          />
          <Field
            label="Paper label (RTL)"
            value={p.label}
            disabled={disabled}
            onChange={(v) => update("papers", i, "label", v)}
          />
          <Choice
            label="Subject offering"
            value={p.offeringId}
            disabled={disabled}
            options={options(
              offerings,
              (o) => `${o.code} · ${o.name_ur ?? o.name_en}`,
            )}
            onChange={(v) => update("papers", i, "offeringId", v)}
          />
          <Field
            label="Maximum marks"
            type="number"
            value={String(p.max ?? "")}
            disabled={disabled}
            onChange={(v) =>
              update("papers", i, "max", v === "" ? null : Number(v))
            }
          />
          <Choice
            label="Assessment type"
            value={p.type}
            disabled={disabled}
            options={choices(["WRITTEN", "ORAL", "PRACTICAL", "OTHER"])}
            onChange={(v) => update("papers", i, "type", v)}
          />
          <Field
            label="Question pattern"
            value={p.pattern ?? ""}
            disabled={disabled}
            onChange={(v) => update("papers", i, "pattern", v)}
          />
          {!disabled && (
            <Button
              title="Remove paper"
              danger
              onPress={() =>
                changed({
                  ...scheme,
                  papers: scheme.papers.filter((_: any, n: number) => n !== i),
                })
              }
            />
          )}
        </Disclosure>
      ))}
      {!disabled && (
        <Button
          title="Add paper"
          secondary
          onPress={() =>
            changed({
              ...scheme,
              papers: [
                ...scheme.papers,
                {
                  code: "",
                  label: "",
                  max: null,
                  offeringId: "",
                  type: "WRITTEN",
                  pattern: "",
                  date: null,
                },
              ],
            })
          }
        />
      )}
      <Text style={[ui.title, { marginTop: 18 }]}>{t("Result groups")}</Text>
      {scheme.groups.map((g: any, i: number) => (
        <Disclosure key={i} title={`${i + 1} · ${g.name || t("New group")}`}>
          <Field
            label="Group name"
            disabled={disabled}
            value={g.name}
            onChange={(v) => update("groups", i, "name", v)}
          />
          <Field
            label="Group maximum"
            type="number"
            disabled={disabled}
            value={String(g.max ?? "")}
            onChange={(v) =>
              update("groups", i, "max", v === "" ? null : Number(v))
            }
          />
          {scheme.papers.map((p: any) => (
            <Toggle
              key={p.code}
              label={`${p.code} · ${p.label}`}
              disabled={disabled}
              value={g.paperCodes.includes(p.code)}
              onChange={(v) =>
                update(
                  "groups",
                  i,
                  "paperCodes",
                  v
                    ? [...g.paperCodes, p.code]
                    : g.paperCodes.filter((code: string) => code !== p.code),
                )
              }
            />
          ))}
          {!disabled && (
            <Button
              title="Remove group"
              danger
              onPress={() =>
                changed({
                  ...scheme,
                  groups: scheme.groups.filter((_: any, n: number) => n !== i),
                })
              }
            />
          )}
        </Disclosure>
      ))}
      {!disabled && scheme.groups.length < 6 && (
        <Button
          title="Add result group"
          secondary
          onPress={() =>
            changed({
              ...scheme,
              groups: [
                ...scheme.groups,
                { name: "", max: null, paperCodes: [] },
              ],
            })
          }
        />
      )}
      <Notice text="Use six complete result groups. Keep each paper code distinct, including papers with the same label." />
    </>
  );
}
export function Exams() {
  const { me, section, cycle, run, reload, busy, sections } = useWorkspace();
  const admin = me.roles.includes("ADMIN"),
    path = `/v1/exam-cycles/${cycle}/sections/${section}`;
  const resource = useResource<any>(
      section && cycle ? path + "/scheme" : null,
      null,
    ),
    offerings = useResource<any[]>(
      section ? `/v1/sections/${section}/subjects` : null,
      [],
    ),
    curriculum = useResource<any>(
      section ? `/v1/sections/${section}/curriculum` : null,
      null,
    );
  const [scheme, setScheme] = useState<any>(null),
    [classScheme, setClassScheme] = useState<any>(null),
    [reason, setReason] = useState(""),
    [copy, setCopy] = useState(false),
    [ack, setAck] = useState(false);
  useEffect(() => {
    setScheme(resource.data?.scheme ?? null);
    setReason("");
    setAck(false);
  }, [resource.data]);
  useEffect(
    () => setClassScheme(curriculum.data?.scheme ?? null),
    [curriculum.data],
  );
  const refresh = async () => {
    resource.refresh();
    curriculum.refresh();
    await reload();
  };
  return (
    <>
      {admin && (
        <Disclosure title="Add exam session">
          <Form
            fields={[
              {
                key: "yearId",
                label: "Academic year",
                required: true,
                options: Array.from(
                  new Map(
                    sections.map((s) => [
                      s.academic_year_id,
                      { value: s.academic_year_id!, label: s.year_label! },
                    ]),
                  ).values(),
                ),
              },
              { key: "code", label: "Code", required: true },
              { key: "title", label: "Session title", required: true },
              {
                key: "order",
                label: "Display order",
                type: "number",
                value: 0,
              },
              {
                key: "attendanceFrom",
                label: "Attendance from",
                type: "date",
                required: true,
              },
              {
                key: "attendanceThrough",
                label: "Attendance through",
                type: "date",
                required: true,
              },
            ]}
            title="Create exam session"
            onSubmit={(d) =>
              run(async () => {
                await write("/v1/exam-cycles", d);
                await reload();
              }, "Exam session created.")
            }
          />
        </Disclosure>
      )}
      {!section || !cycle ? (
        <Notice text="Choose a class and exam session to continue." />
      ) : (
        <>
          <ResourceStatus resource={resource} />
          <Disclosure title="Class curriculum">
            <ResourceStatus resource={curriculum} />
            {classScheme ? (
              <>
                <SchemeFields
                  value={classScheme}
                  onChange={setClassScheme}
                  offerings={offerings.data}
                />
                <Button
                  title="Save class curriculum"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await write(
                        `/v1/sections/${section}/curriculum`,
                        {
                          scheme: classScheme,
                          version: curriculum.data.version,
                        },
                        "PUT",
                      );
                      curriculum.refresh();
                    }, "Class curriculum saved.")
                  }
                />
                <Button
                  title="Use curriculum for this session"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await write(path + "/from-curriculum", {});
                      await refresh();
                    }, "Session scheme created from the class curriculum.")
                  }
                />
              </>
            ) : (
              <Button
                title="Create curriculum from this session"
                disabled={busy || !scheme?.papers.length}
                onPress={() =>
                  void run(async () => {
                    await write(
                      `/v1/sections/${section}/curriculum/from-session/${cycle}`,
                      {},
                    );
                    curriculum.refresh();
                  }, "Class curriculum created.")
                }
              />
            )}
            <Form
              fields={[
                { key: "code", label: "Subject code", required: true },
                { key: "name", label: "Subject name", required: true },
              ]}
              title="Add class subject"
              onSubmit={(d) =>
                run(async () => {
                  await write(`/v1/sections/${section}/subject-catalog`, d);
                  offerings.refresh();
                }, "Class subject added.")
              }
            />
          </Disclosure>
          <Card title="Paper scheme & result groups">
            <Notice
              text={
                resource.data?.approval
                  ? "Approved scheme. Paper maxima and group membership are locked."
                  : "Proposed scheme — approval required before official marks entry."
              }
            />
            {scheme && (
              <>
                <SchemeFields
                  value={scheme}
                  onChange={setScheme}
                  offerings={offerings.data}
                />
                <Disclosure title="Advanced scheme data">
                  <ConfigurationEditor
                    label="Paper scheme"
                    value={scheme}
                    onApply={setScheme}
                    valid={validSchemeShape}
                  />
                </Disclosure>
                {!resource.data?.approval ? (
                  <>
                    <Button
                      title="Save proposed scheme"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await write(path + "/scheme", scheme, "PUT");
                          await refresh();
                        }, "Proposed scheme saved.")
                      }
                    />
                    <Toggle
                      label="I reviewed and approve these changes"
                      value={ack}
                      onChange={setAck}
                    />
                    <Button
                      title="Approve scheme"
                      disabled={busy || !ack}
                      onPress={() =>
                        void run(async () => {
                          await write(path + "/scheme/approve", {});
                          await refresh();
                        }, "Scheme approved.")
                      }
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Reason for correction revision"
                      value={reason}
                      onChange={setReason}
                    />
                    <Toggle
                      label="Copy compatible marks"
                      value={copy}
                      onChange={setCopy}
                    />
                    <Button
                      title="Create a reviewed scheme revision"
                      disabled={busy || reason.trim().length < 5}
                      onPress={() =>
                        void run(async () => {
                          await write(path + "/scheme/revise", {
                            scheme,
                            reason,
                            copyMarks: copy,
                          });
                          await refresh();
                        }, "Reviewed scheme revision created. Previous publications are preserved.")
                      }
                    />
                  </>
                )}
              </>
            )}
          </Card>
          <Disclosure title="Exam dates and attendance window">
            <Form
              key={JSON.stringify(resource.data?.window)}
              initial={{
                attendanceFrom:
                  resource.data?.window?.attendance_from?.slice(0, 10) ?? "",
                attendanceThrough:
                  resource.data?.window?.attendance_through?.slice(0, 10) ?? "",
                examStart:
                  resource.data?.window?.exam_start?.slice(0, 10) ?? "",
                examEnd: resource.data?.window?.exam_end?.slice(0, 10) ?? "",
              }}
              fields={[
                {
                  key: "attendanceFrom",
                  label: "Attendance from",
                  type: "date",
                  required: true,
                },
                {
                  key: "attendanceThrough",
                  label: "Attendance through",
                  type: "date",
                  required: true,
                },
                { key: "examStart", label: "Exam start", type: "date" },
                { key: "examEnd", label: "Exam end", type: "date" },
                {
                  key: "acknowledgeOverlap",
                  label: "Acknowledge intentional window overlap",
                  type: "boolean",
                },
              ]}
              onSubmit={(d) =>
                run(async () => {
                  await write(
                    path + "/window",
                    {
                      ...d,
                      examStart: d.examStart || null,
                      examEnd: d.examEnd || null,
                    },
                    "PUT",
                  );
                  resource.refresh();
                }, "Exam window saved.")
              }
            />
            {resource.data?.scheme.papers.map((p: any) => (
              <View key={p.id} style={{ marginTop: 18 }}>
                <Text style={ui.label}>
                  {p.code} · {p.label}
                </Text>
                <Form
                  initial={{ date: p.date ?? "" }}
                  fields={[
                    {
                      key: "date",
                      label: "Scheduled date",
                      type: "date",
                      required: true,
                    },
                  ]}
                  title="Save paper date"
                  onSubmit={(d) =>
                    run(async () => {
                      await write(`/v1/assessments/${p.id}/schedule`, d, "PUT");
                      resource.refresh();
                    }, "Paper schedule saved.")
                  }
                />
              </View>
            ))}
          </Disclosure>
        </>
      )}
    </>
  );
}
