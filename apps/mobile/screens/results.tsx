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
  RecordList,
  ResourceStatus,
  useResource,
  useWorkspace,
  write,
} from "../components/workspace";
import { CSVImport } from "../components/csv-import";
import { NativePerformance } from "../components/academic-reports";
import { shareFile } from "../lib/files";
import { api } from "../components/connection";
export function Results() {
  const { section, cycle, me, run, busy } = useWorkspace();
  const { t } = useI18n();
  const [source, setSource] = useState("AUTO"),
    [preflight, setPreflight] = useState<any>(null),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [performanceKey, setPerformanceKey] = useState(0);
  const path = `/v1/exam-cycles/${cycle}/sections/${section}`,
    sheet = useResource<any>(
      section && cycle ? path + `/result-sheet?source=${source}` : null,
      null,
    ),
    archive = useResource<any[]>("/v1/results", []);
  useEffect(() => {
    setPreflight(null);
    setReason("");
    setAck(false);
  }, [section, cycle]);
  const refreshed = () => {
    sheet.refresh();
    archive.refresh();
    setPreflight(null);
    setPerformanceKey((n) => n + 1);
  };
  return !section || !cycle ? (
    <Notice text="Choose a class and exam session to continue." />
  ) : (
    <>
      <Card title="Session results sheet">
        <Choice
          label="Result source"
          value={source}
          options={[
            { value: "AUTO", label: "Latest available" },
            { value: "LIVE", label: "Working marks" },
            { value: "PUBLISHED", label: "Published revision" },
          ]}
          onChange={setSource}
        />
        <ResourceStatus resource={sheet} />
        {sheet.data && (
          <>
            <Notice
              text={
                sheet.data.source === "PUBLISHED"
                  ? "Published snapshot. Later mark changes do not alter this revision."
                  : "Working marks preview. Official results require approved policies and completed review."
              }
            />
            {sheet.data.blockingErrors.map((e: string, i: number) => (
              <Notice key={i} error text={e} />
            ))}
            <Button
              title="Share session result PDF"
              icon="share-outline"
              disabled={busy}
              onPress={() =>
                void run(() =>
                  shareFile(
                    path + `/result-sheet.pdf?source=${source}`,
                    "session-results.pdf",
                  ),
                )
              }
            />
            <Button
              title="Download session result CSV"
              secondary
              icon="download-outline"
              disabled={busy}
              onPress={() =>
                void run(() =>
                  shareFile(
                    path + `/result-sheet.csv?source=${source}`,
                    "session-results.csv",
                    "text/csv",
                  ),
                )
              }
            />
            <RecordList
              rows={sheet.data.snapshot.students}
              render={(s) => (
                <Disclosure
                  key={s.enrollmentId}
                  title={`${s.roll} · ${s.name}`}
                >
                  <Text style={ui.title}>
                    {s.total} / {s.possible} · {s.displayPercent ?? "—"}%
                  </Text>
                  <Text style={ui.muted}>
                    {t("Grade")}: {t(s.grade ?? "Policy required")} ·{" "}
                    {t("Position")}: {s.rank ?? "—"}
                  </Text>
                  <Text style={ui.muted}>
                    {t("Attendance")}: {s.attendance?.displayPercent ?? "—"}%
                  </Text>
                  {sheet.data.snapshot.scheme.papers.map((p: any) => (
                    <View key={p.id} style={{ paddingVertical: 8 }}>
                      <Text style={ui.label}>
                        {p.code} · {p.label}
                      </Text>
                      <Text style={ui.muted}>
                        {s.marks[p.code]?.state === "GRADED"
                          ? s.marks[p.code]?.awarded
                          : t(s.marks[p.code]?.state ?? "PENDING")}{" "}
                        / {p.max}
                      </Text>
                    </View>
                  ))}
                </Disclosure>
              )}
            />
          </>
        )}
      </Card>
      <Disclosure title="Upload class marks">
        <CSVImport
          key={section + cycle}
          mode="session"
          section={section}
          cycle={cycle}
          onApplied={refreshed}
        />
      </Disclosure>
      <NativePerformance
        key={section + performanceKey}
        section={section}
        request={api}
        run={async (fn) => {
          await run(fn);
        }}
      />
      <Card
        title="Preflight & publication"
        description="Publication creates an immutable result revision and stable PDFs."
      >
        <Button
          title="Validate & preview"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              setPreflight(
                await write(`/v1/results/${cycle}/${section}/validate`, {}),
              );
              setAck(false);
            })
          }
        />
        {preflight && (
          <>
            <Notice
              text={
                preflight.canPublish
                  ? "All publication checks passed."
                  : "Resolve all blocking issues before official publication."
              }
              error={!preflight.canPublish}
            />
            {preflight.blockingErrors.map((e: string, i: number) => (
              <Notice key={i} error text={e} />
            ))}
            {preflight.snapshot.students.map((s: any) => (
              <View key={s.enrollmentId} style={{ paddingVertical: 10 }}>
                <Text style={ui.label}>{s.name}</Text>
                <Text style={ui.muted}>
                  {s.total} / {s.possible} · {s.displayPercent ?? "—"}% ·{" "}
                  {t(s.grade ?? "Policy required")}
                </Text>
              </View>
            ))}
            {me.roles.includes("ADMIN") && (
              <>
                <Field
                  label="Reason for correction revision"
                  value={reason}
                  onChange={(v) => {
                    setReason(v);
                    setAck(false);
                  }}
                />
                <Toggle
                  label="I reviewed and approve official publication"
                  value={ack}
                  onChange={setAck}
                />
                <Button
                  title="Publish result revision"
                  disabled={busy || !preflight.canPublish || !ack}
                  onPress={() =>
                    void run(async () => {
                      await write(
                        `/v1/results/${cycle}/${section}/publish`,
                        {
                          validationHash: preflight.validationHash,
                          ...(reason ? { correctionReason: reason } : {}),
                        },
                        "POST",
                        {
                          "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        },
                      );
                      refreshed();
                    }, "Immutable result revision and PDFs published.")
                  }
                />
              </>
            )}
          </>
        )}
      </Card>
      <Card title="Publication archive">
        <ResourceStatus resource={archive} />
        <RecordList
          search={false}
          rows={archive.data.filter(
            (r) => r.section_id === section && r.exam_cycle_id === cycle,
          )}
          render={(r) => (
            <Disclosure
              key={r.id}
              title={`${t("Revision")} ${r.revision} · ${t(r.state)}`}
            >
              <Button
                title="Share class PDF"
                secondary
                onPress={() =>
                  void run(() =>
                    shareFile(
                      `/v1/results/${r.id}/sectionsheet.pdf`,
                      "published-class-result.pdf",
                    ),
                  )
                }
              />
              <Button
                title="Download published CSV"
                secondary
                onPress={() =>
                  void run(() =>
                    shareFile(
                      `/v1/results/${r.id}/export.csv`,
                      "published-results.csv",
                      "text/csv",
                    ),
                  )
                }
              />
              {r.students?.map((s: any) => (
                <Button
                  key={s.enrollmentId}
                  title={`${s.name} · PDF`}
                  secondary
                  onPress={() =>
                    void run(() =>
                      shareFile(
                        `/v1/results/${r.id}/students/${s.enrollmentId}.pdf`,
                        "published-student-result.pdf",
                      ),
                    )
                  }
                />
              ))}
            </Disclosure>
          )}
        />
      </Card>
    </>
  );
}
