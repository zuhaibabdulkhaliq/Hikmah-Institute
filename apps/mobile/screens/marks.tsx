import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text, useI18n } from "../components/language";
import {
  Card,
  Choice,
  Field,
  Button,
  Toggle,
  Notice,
  Disclosure,
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
} from "../components/workspace";
import { CSVImport } from "../components/csv-import";
export function Marks() {
  const { me, run, busy, section, cycle, setDirty, guard } = useWorkspace();
  const { t } = useI18n();
  const papers = useResource<any[]>("/v1/assessments", []);
  const [paper, setPaper] = useState(""),
    [entries, setEntries] = useState<any[]>([]),
    [reason, setReason] = useState("");
  const resource = useResource<any>(
    paper ? `/v1/assessments/${paper}/marks` : null,
    null,
  );
  const visiblePapers = papers.data.filter(
    (p) =>
      (!section || p.section_id === section) &&
      (!cycle || p.exam_cycle_id === cycle),
  );
  useEffect(() => {
    const filtered = papers.data.filter(
      (p) =>
        (!section || p.section_id === section) &&
        (!cycle || p.exam_cycle_id === cycle),
    );
    setPaper(filtered[0]?.id ?? "");
  }, [papers.data, section, cycle]);
  useEffect(() => {
    setEntries(resource.data?.entries ?? []);
    setReason("");
  }, [resource.data]);
  const p = resource.data?.paper;
  const editable =
    p?.year_state === "ACTIVE" && p?.state === "OPEN" && !p?.submitted_at;
  const manage =
    p &&
    (me.roles.includes("ADMIN") || me.managedSections.includes(p.section_id));
  const change = (i: number, values: any) => {
    setDirty(true);
    setEntries(entries.map((e, n) => (n === i ? { ...e, ...values } : e)));
  };
  return (
    <>
      <Card title="Assigned paper">
        <ResourceStatus resource={papers} />
        <Choice
          label="Paper"
          value={paper}
          disabled={busy}
          options={options(visiblePapers, (p) =>
            [
              p.year_label,
              p.program_name,
              p.level_name,
              p.section_name,
              p.cycle_title,
              p.paper_code,
              p.title,
              `/ ${p.max_marks}`,
            ]
              .filter(Boolean)
              .join(" · "),
          )}
          onChange={(value) => guard(() => setPaper(value))}
        />
        <ResourceStatus resource={resource} />
        {p && (
          <Notice
            text={
              !editable
                ? p.year_state !== "ACTIVE"
                  ? "This academic year is read-only."
                  : p.state !== "OPEN"
                    ? "Approve the paper scheme before entering marks."
                    : "This paper is submitted. Reopen it with a correction reason before editing."
                : "Blank marks remain unresolved. Enter numeric zero explicitly when awarded."
            }
          />
        )}
      </Card>
      {p && (
        <>
          <Card title={`${p.paper_code} · ${p.title}`}>
            <Field
              label="Change or import reason"
              value={reason}
              disabled={busy}
              onChange={setReason}
            />
            <RecordList
              rows={entries}
              render={(e) => {
                const i = entries.findIndex(
                  (r) => r.enrollmentId === e.enrollmentId,
                );
                return (
                  <View
                    key={e.enrollmentId}
                    style={{
                      paddingVertical: 18,
                      borderBottomWidth: 1,
                      borderColor: "#d4e4ef",
                    }}
                  >
                    <Text style={ui.title}>{e.full_name}</Text>
                    <Text style={[ui.muted, { marginBottom: 12 }]}>
                      {e.student_number} · {t("Maximum")}: {p.max_marks}
                    </Text>
                    <Choice
                      label={`Mark state ${e.student_number}`}
                      value={e.state ?? "PENDING"}
                      options={choices([
                        "PENDING",
                        "GRADED",
                        "ABSENT",
                        "EXEMPT",
                        "WITHHELD",
                        "NOT_APPLICABLE",
                        "UNKNOWN_LEGACY_BLANK",
                      ])}
                      disabled={busy || !editable}
                      onChange={(state) =>
                        change(i, {
                          state,
                          awarded:
                            state === "GRADED" ? (e.awarded ?? null) : null,
                        })
                      }
                    />
                    <Field
                      label={`Awarded ${e.student_number}`}
                      type="number"
                      value={e.awarded == null ? "" : String(e.awarded)}
                      disabled={
                        busy ||
                        !editable ||
                        !["GRADED", "PENDING", "UNKNOWN_LEGACY_BLANK"].includes(
                          e.state ?? "PENDING",
                        )
                      }
                      onChange={(v) =>
                        change(i, {
                          awarded: v === "" ? null : Number(v),
                          state: v === "" ? "PENDING" : "GRADED",
                        })
                      }
                    />
                    <Toggle
                      label={`Exam leave ${e.student_number}`}
                      value={e.onLeave === true}
                      disabled={busy || !editable}
                      onChange={(v) =>
                        change(i, {
                          onLeave: v,
                          ...(v ? { onTime: false } : {}),
                        })
                      }
                    />
                    <Toggle
                      label={`Given on time ${e.student_number}`}
                      value={e.onTime === true}
                      disabled={busy || !editable || e.onLeave}
                      onChange={(v) => change(i, { onTime: v })}
                    />
                    {e.onTime == null && (
                      <Text style={ui.muted}>
                        {t("Exam timing is not confirmed.")}
                      </Text>
                    )}
                  </View>
                );
              }}
            />
            <Button
              title="Save marks"
              disabled={busy || !editable}
              onPress={() =>
                void run(async () => {
                  await write(
                    `/v1/assessments/${paper}/marks/bulk`,
                    {
                      entries: entries.map((e) => ({
                        enrollmentId: e.enrollmentId,
                        state: e.state ?? "PENDING",
                        awarded:
                          e.state === "GRADED" && e.awarded != null
                            ? Number(e.awarded)
                            : null,
                        version: e.version ?? 0,
                        onLeave: e.onLeave ?? false,
                        onTime: e.onTime ?? null,
                        ...(reason ? { reason } : {}),
                      })),
                    },
                    "PUT",
                  );
                  resource.refresh();
                }, "Marks saved.")
              }
            />
            <Button
              title="Submit paper"
              secondary
              disabled={busy || !editable}
              onPress={() =>
                void run(async () => {
                  await write(`/v1/assessments/${paper}/submit`, {});
                  resource.refresh();
                }, "Paper submitted for review.")
              }
            />
            {manage && (
              <>
                <Button
                  title="Approve marks"
                  disabled={
                    busy ||
                    p.year_state !== "ACTIVE" ||
                    !p.submitted_at ||
                    !!p.approved_by
                  }
                  onPress={() =>
                    void run(async () => {
                      await write(`/v1/assessments/${paper}/approve`, {});
                      resource.refresh();
                    }, "Marks approved.")
                  }
                />
                {!!p.submitted_at && (
                  <Form
                    fields={[
                      {
                        key: "reason",
                        label: "Correction reason",
                        required: true,
                      },
                    ]}
                    title="Reopen paper"
                    onSubmit={(d) =>
                      run(async () => {
                        await write(`/v1/assessments/${paper}/reopen`, d);
                        resource.refresh();
                      }, "Paper reopened with an audit record.")
                    }
                  />
                )}
              </>
            )}
          </Card>
          <Disclosure title="Import assigned-paper marks from CSV">
            <Notice text="Columns: student_number and the paper code. Use the full class template from Results & reports for a class-wide import." />
            {editable ? (
              <CSVImport
                key={paper}
                mode="paper"
                section={p.section_id}
                paper={paper}
                onApplied={resource.refresh}
              />
            ) : (
              <Notice text="Open and reopen the paper before importing marks." />
            )}
          </Disclosure>
        </>
      )}
    </>
  );
}
