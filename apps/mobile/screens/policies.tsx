import {
  ConfigurationEditor,
  validPolicyShape,
} from "../components/json-editor";
import { useEffect, useState } from "react";
import { Text, useI18n } from "../components/language";
import {
  Card,
  Field,
  Choice,
  Toggle,
  Button,
  Notice,
  Disclosure,
  ui,
} from "../components/ui";
import {
  choices,
  Form,
  ResourceStatus,
  useResource,
  useWorkspace,
  write,
} from "../components/workspace";
export function Policies() {
  const { t } = useI18n();
  const { run, busy, setDirty } = useWorkspace();
  const r = useResource<any>("/v1/policies", null),
    permissions = useResource<any>("/v1/attendance-permissions", null);
  const [p, setP] = useState<any>(null),
    [ack, setAck] = useState(false);
  useEffect(() => {
    setP(r.data?.config.draftPolicy ?? r.data?.config.approvedPolicy ?? null);
    setAck(false);
  }, [r.data]);
  const change = (path: string[], value: any) => {
    const copy = JSON.parse(JSON.stringify(p));
    let target = copy;
    for (const k of path.slice(0, -1)) target = target[k];
    target[path.at(-1)!] = value;
    setP(copy);
    setDirty(true);
    setAck(false);
  };
  const numeric = (label: string, path: string[], value: any) => (
    <Field
      label={label}
      type="number"
      value={value == null ? "" : String(value)}
      onChange={(v) => change(path, v === "" ? null : Number(v))}
    />
  );
  const select = (
    label: string,
    path: string[],
    value: string,
    values: string[],
  ) => (
    <Choice
      label={label}
      value={value ?? ""}
      options={choices(values)}
      onChange={(v) => change(path, v)}
    />
  );
  return (
    <>
      <Card title="Academic policy approval">
        <ResourceStatus resource={r} />
        <Notice
          text={
            r.data?.config.approvedPolicy
              ? "An approved policy exists. Saving a draft removes approval until reviewed again."
              : "Unapproved. Official publication remains blocked until review and approval."
          }
        />
        <Notice text="Overall pass minimum: 40%. Positions: above 80%, all papers on time, no exam leave, top three with shared ties. Attendance: Present 1, Half 0.5, Absent 0, Leave excluded." />
        {validPolicyShape(p) && (
          <>
            <Disclosure title="Attendance and eligibility">
              {numeric(
                "Backdate days",
                ["attendance", "backdateDays"],
                p.attendance.backdateDays,
              )}
              {numeric(
                "Attendance decimals",
                ["attendance", "decimals"],
                p.attendance.decimals,
              )}
              {select(
                "Zero attendance denominator",
                ["attendance", "zeroDenominator"],
                p.attendance.zeroDenominator,
                ["BLOCK", "SHOW_NA"],
              )}
              {select("Result eligibility", ["eligibility"], p.eligibility, [
                "ACTIVE_AT_WINDOW_END",
                "ANY_ENROLLED_IN_WINDOW",
              ])}
            </Disclosure>
            <Disclosure title="Grade bands">
              {p.grades.map((g: any, i: number) => (
                <Card key={i}>
                  <Field
                    label="Grade label"
                    value={g.label}
                    onChange={(v) => change(["grades", String(i), "label"], v)}
                  />
                  {numeric(
                    "Minimum percentage",
                    ["grades", String(i), "min"],
                    g.min,
                  )}
                  {numeric(
                    "Maximum percentage (exclusive)",
                    ["grades", String(i), "max"],
                    g.max,
                  )}
                  <Toggle
                    label="Passing grade"
                    value={g.pass}
                    onChange={(v) => change(["grades", String(i), "pass"], v)}
                  />
                  <Button
                    title="Remove grade band"
                    danger
                    onPress={() =>
                      change(
                        ["grades"],
                        p.grades.filter((_: any, n: number) => n !== i),
                      )
                    }
                  />
                </Card>
              ))}
              <Button
                title="Add grade band"
                secondary
                onPress={() =>
                  change(
                    ["grades"],
                    [
                      ...p.grades,
                      { label: "", min: null, max: null, pass: false },
                    ],
                  )
                }
              />
              <Notice text="Grade bands must cover 0–100 without gaps or overlaps. Use 101 as the final exclusive upper bound." />
            </Disclosure>
            <Disclosure title="Ranking and unresolved marks">
              {select("Tie handling", ["ranking", "tie"], p.ranking.tie, [
                "COMPETITION",
                "DENSE",
              ])}
              {select(
                "Absent exam marks",
                ["missing", "absent"],
                p.missing.absent,
                ["BLOCK", "ZERO"],
              )}
              {select(
                "Exempt exam marks",
                ["missing", "exempt"],
                p.missing.exempt,
                ["BLOCK", "EXCLUDE"],
              )}
              {select("Rounding", ["rounding"], p.rounding, [
                "HALF_UP",
                "HALF_EVEN",
                "DOWN",
              ])}
            </Disclosure>
            <Button
              title="Save unapproved draft"
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await write(
                    "/v1/policies",
                    { policy: p, approve: false, version: r.data.version },
                    "PUT",
                  );
                  r.refresh();
                }, "Unapproved draft saved.")
              }
            />
            <Toggle
              label="I reviewed and approve the institute policy"
              value={ack}
              onChange={setAck}
            />
            <Button
              title="Approve institute policy"
              disabled={busy || !ack}
              onPress={() =>
                void run(async () => {
                  await write(
                    "/v1/policies",
                    { policy: p, approve: true, version: r.data.version },
                    "PUT",
                  );
                  r.refresh();
                }, "Policy explicitly approved.")
              }
            />
          </>
        )}
        <Disclosure title="Advanced policy data">
          <ConfigurationEditor
            label="Academic policy"
            value={p}
            onApply={setP}
            valid={validPolicyShape}
          />
        </Disclosure>
      </Card>
      <Disclosure title="Historical attendance edit permissions">
        <ResourceStatus resource={permissions} />
        {permissions.data && (
          <>
            <Text style={ui.muted}>
              {t("Current days")}: {permissions.data.days ?? t("Unapproved")}
            </Text>
            <Form
              key={permissions.data.version}
              fields={[
                {
                  key: "days",
                  label: "Backdate days",
                  type: "number",
                  value: permissions.data.days ?? "",
                },
                { key: "reason", label: "Approval reason", required: true },
              ]}
              title="Approve attendance edit window"
              onSubmit={(d) =>
                run(async () => {
                  await write(
                    "/v1/attendance-permissions",
                    {
                      days: d.days ?? null,
                      reason: d.reason,
                      version: permissions.data.version,
                    },
                    "PUT",
                  );
                  permissions.refresh();
                  r.refresh();
                }, "Attendance edit permissions updated.")
              }
            />
          </>
        )}
      </Disclosure>
    </>
  );
}
