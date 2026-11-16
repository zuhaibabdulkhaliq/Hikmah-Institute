import { useState } from "react";
import { View } from "react-native";
import { Text, useI18n } from "./language";
import { Button, Card, Field, Notice, Toggle, ui } from "./ui";
import { useWorkspace, write } from "./workspace";
import { pickCSV, shareFile } from "../lib/files";
export function CSVImport({
  mode,
  section,
  cycle = "",
  paper = "",
  onApplied,
}: {
  mode: "students" | "session" | "paper";
  section: string;
  cycle?: string;
  paper?: string;
  onApplied: () => void;
}) {
  const { run, busy } = useWorkspace(),
    { t } = useI18n();
  const [csv, setCSV] = useState(""),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [ack, setAck] = useState(false),
    [timing, setTiming] = useState(false),
    [applied, setApplied] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({});
  const path =
    mode === "students"
      ? `/v1/sections/${section}/import/preview`
      : mode === "session"
        ? `/v1/exam-cycles/${cycle}/sections/${section}/marks/import/preview`
        : `/v1/assessments/${paper}/marks/import/preview`;
  const change = () => {
    setPreview(null);
    setAck(false);
  };
  return (
    <Card
      title={
        mode === "students"
          ? "Import students from CSV"
          : "Import marks from CSV"
      }
      description={
        mode === "students"
          ? "Columns: student_number, full_name, roll_number, joined_on. Review every row before importing."
          : "Download the template, enter marks, then validate and review before applying."
      }
    >
      {mode === "session" && (
        <>
          <Toggle
            label="Include exam leave and on-time columns"
            value={timing}
            onChange={setTiming}
          />
          <Button
            title="Download blank marks CSV"
            secondary
            icon="download-outline"
            disabled={busy}
            onPress={() =>
              void run(() =>
                shareFile(
                  `/v1/exam-cycles/${cycle}/sections/${section}/marks/template.csv?timing=${timing ? "include" : "preserve"}`,
                  "marks-entry-template.csv",
                  "text/csv",
                ),
              )
            }
          />
        </>
      )}
      <Button
        title="Choose CSV file"
        secondary
        icon="document-attach-outline"
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const text = await pickCSV();
            if (text !== null) {
              setCSV(text);
              setMapping({});
              change();
            }
          })
        }
      />
      <Field
        label="CSV data"
        type="multiline"
        value={csv}
        disabled={busy}
        onChange={(v) => {
          setCSV(v);
          change();
        }}
      />
      {mode === "students" && (
        <>
          <Notice text="Canonical headers work without mapping. For other headers, map all four columns below." />
          {["student_number", "full_name", "roll_number", "joined_on"].map(
            (key) => (
              <Field
                key={key}
                label={`Source column for ${key}`}
                value={mapping[key] ?? ""}
                disabled={busy}
                onChange={(v) => {
                  setMapping({ ...mapping, [key]: v });
                  change();
                }}
              />
            ),
          )}
        </>
      )}
      {mode !== "students" && (
        <Field
          label="Change or import reason"
          value={reason}
          disabled={busy}
          onChange={(v) => {
            setReason(v);
            change();
          }}
        />
      )}
      <Button
        title="Validate CSV"
        icon="checkmark-circle-outline"
        disabled={busy || !csv}
        onPress={() =>
          void run(async () => {
            if (mode !== "students" && reason.trim().length < 5)
              throw Error("Enter a reason with at least five characters.");
            const mapped = Object.values(mapping).some(Boolean);
            if (
              mode === "students" &&
              mapped &&
              ["student_number", "full_name", "roll_number", "joined_on"].some(
                (k) => !mapping[k]?.trim(),
              )
            )
              throw Error("Map all four source columns or leave them blank.");
            setPreview(
              await write(path, {
                csv,
                ...(mode !== "students"
                  ? { reason }
                  : mapped
                    ? { columnMapping: mapping }
                    : {}),
              }),
            );
            setAck(false);
          }, "CSV validation completed. Review the preview below.")
        }
      />
      {preview && (
        <View accessibilityLabel={t("Import preview")}>
          <Notice
            text={
              preview.canApply
                ? "Validation passed. Review the proposed changes before applying."
                : "Resolve the validation issues and validate again."
            }
            error={!preview.canApply}
          />
          {(preview.errors ?? []).map((e: any, i: number) => (
            <Notice
              key={i}
              error
              text={[
                e.row && `${t("Row")} ${e.row}`,
                e.studentNumber,
                e.paperCode,
                e.message,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
          {(preview.warnings ?? []).map((w: string, i: number) => (
            <Notice key={i} text={w} />
          ))}
          {preview.summary &&
            Object.entries(preview.summary).map(([k, v]) => (
              <Text key={k} style={ui.muted}>
                {t(k)}: {String(v)}
              </Text>
            ))}
          {(preview.changes ?? preview.rows ?? preview.entries ?? [])
            .slice(0, 200)
            .map((r: any, i: number) => (
              <View
                key={i}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: "#dce8f2",
                }}
              >
                <Text style={ui.label}>
                  {r.name ?? r.full_name ?? r.student_number ?? r.studentNumber}{" "}
                  {r.paperCode ?? ""}
                </Text>
                <Text style={ui.muted}>
                  {r.before && `${t("Before")}: ${r.before} → `}
                  {r.after ?? r.awarded ?? r.roll_number ?? ""}
                </Text>
              </View>
            ))}
          {preview.canApply && (
            <>
              <Toggle
                label="I reviewed and approve these changes"
                value={ack}
                onChange={setAck}
              />
              <Button
                title="Apply previewed import"
                disabled={busy || !ack}
                onPress={() =>
                  void run(async () => {
                    if (mode === "session")
                      await write(
                        `/v1/session-mark-imports/${preview.batchId}/apply`,
                        { acknowledgeOverwrite: ack },
                      );
                    else if (mode === "students") {
                      await write(`/v1/imports/${preview.jobId}/apply`, {});
                      setApplied(preview.jobId);
                    } else
                      await write(
                        `/v1/assessments/${paper}/marks/bulk`,
                        { entries: preview.entries },
                        "PUT",
                      );
                    setCSV("");
                    setPreview(null);
                    onApplied();
                  }, "Import applied successfully.")
                }
              />
            </>
          )}
        </View>
      )}
      {!!applied && (
        <>
          <Field label="Rollback reason" value={reason} onChange={setReason} />
          <Button
            title="Roll back student import"
            danger
            disabled={busy || reason.trim().length < 5}
            onPress={() =>
              void run(async () => {
                await write(`/v1/imports/${applied}/rollback`, { reason });
                setApplied("");
                onApplied();
              }, "Import rolled back.")
            }
          />
        </>
      )}
    </Card>
  );
}
