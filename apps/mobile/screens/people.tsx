import { useState } from "react";
import { Share, View } from "react-native";
import { Text, useI18n } from "../components/language";
import { Button, Card, Disclosure, Notice, Toggle, ui } from "../components/ui";
import {
  Form,
  RecordList,
  ResourceStatus,
  options,
  useResource,
  useWorkspace,
  write,
} from "../components/workspace";
export function People() {
  const { run, busy, me, reload } = useWorkspace();
  const { t } = useI18n();
  const users = useResource<any[]>("/v1/users", []);
  const [link, setLink] = useState(""),
    [reviewed, setReviewed] = useState<string[]>([]);
  const accountOptions = options(
    users.data,
    (u) => `${u.display_name} · ${u.email}`,
  );
  return (
    <>
      <Disclosure title="Create staff account">
        <Form
          fields={[
            { key: "name", label: "Staff name", required: true },
            {
              key: "email",
              label: "Email address",
              type: "email",
              required: true,
            },
            {
              key: "password",
              label: "Initial password",
              type: "password",
              required: true,
            },
            {
              key: "confirm",
              label: "Confirm password",
              type: "password",
              required: true,
            },
          ]}
          title="Create staff account"
          onSubmit={(d) =>
            run(async () => {
              if (d.password !== d.confirm)
                throw Error("Passwords do not match.");
              if (d.password.length < 12 || d.password.length > 128)
                throw Error("Use a password of 12–128 characters.");
              await write("/v1/users", {
                name: d.name,
                email: d.email.trim(),
                password: d.password,
              });
              users.refresh();
            }, "Staff account created.")
          }
        />
      </Disclosure>
      <Disclosure title="Create private invitation">
        <Form
          fields={[
            { key: "name", label: "Staff name", required: true },
            {
              key: "email",
              label: "Email address",
              type: "email",
              required: true,
            },
          ]}
          title="Create private invitation"
          onSubmit={(d) =>
            run(async () => {
              const r = await write("/v1/invitations", d);
              setLink(r.activationUrl);
            }, "Private invitation created.")
          }
        />
      </Disclosure>
      <Disclosure title="Change a staff password directly">
        <Notice text="Password changes revoke the account’s sessions on every device." />
        <Form
          fields={[
            {
              key: "user",
              label: "Staff account",
              options: accountOptions,
              required: true,
            },
            {
              key: "password",
              label: "New password",
              type: "password",
              required: true,
            },
            {
              key: "confirm",
              label: "Confirm new password",
              type: "password",
              required: true,
            },
            { key: "reason", label: "Correction reason", required: true },
          ]}
          title="Change staff password"
          onSubmit={(d) =>
            run(async () => {
              if (d.password !== d.confirm)
                throw Error("Passwords do not match.");
              await write(
                `/v1/users/${d.user}/password`,
                { password: d.password, reason: d.reason },
                "PUT",
              );
              users.refresh();
              await reload();
            }, "Staff password changed; sessions revoked.")
          }
        />
      </Disclosure>
      <Disclosure title="Administrator-assisted password recovery">
        <Form
          fields={[
            {
              key: "user",
              label: "Staff account",
              options: accountOptions,
              required: true,
            },
            { key: "reason", label: "Recovery reason", required: true },
          ]}
          title="Create private recovery link"
          onSubmit={(d) =>
            run(async () => {
              const r = await write(`/v1/users/${d.user}/reset-password`, {
                reason: d.reason,
              });
              setLink(r.activationUrl);
            }, "Private recovery link created.")
          }
        />
      </Disclosure>
      {!!link && (
        <Card title="Private account link">
          <Notice text="Verify the staff member’s identity and deliver this single-use link privately. Never post it publicly." />
          <Text selectable style={ui.muted}>
            {link}
          </Text>
          <Button
            title="Share private link"
            secondary
            icon="share-outline"
            onPress={() =>
              void run(async () => {
                await Share.share({ message: link });
              })
            }
          />
          <Button
            title="Dismiss private link"
            secondary
            onPress={() => setLink("")}
          />
        </Card>
      )}
      <Card
        title="People & access"
        description="Access changes revoke sessions immediately. The final active administrator is protected."
      >
        <ResourceStatus resource={users} />
        <RecordList
          rows={users.data}
          render={(u) => (
            <View
              key={u.id}
              style={{
                paddingVertical: 18,
                borderBottomWidth: 1,
                borderColor: "#dce8f2",
              }}
            >
              <Text style={ui.title}>{u.display_name}</Text>
              <Text style={ui.muted}>
                {u.email} · {t(u.active ? "Active" : "Disabled")}
              </Text>
              <Text style={ui.muted}>
                {u.roles.map((r: string) => t(r)).join(" · ") ||
                  t("Assigned staff")}
              </Text>
              <Toggle
                label="Confirm access change"
                value={reviewed.includes(u.id)}
                onChange={(v) =>
                  setReviewed(
                    v
                      ? [...reviewed, u.id]
                      : reviewed.filter((id) => id !== u.id),
                  )
                }
              />
              <Button
                title={u.active ? "Disable account" : "Activate account"}
                secondary
                disabled={busy || !reviewed.includes(u.id)}
                onPress={() =>
                  void run(async () => {
                    await write(
                      `/v1/users/${u.id}`,
                      { active: !u.active, admin: u.roles.includes("ADMIN") },
                      "PATCH",
                    );
                    setReviewed([]);
                    users.refresh();
                    if (u.id === me.userId) await reload();
                  }, "Access updated; sessions revoked.")
                }
              />
              <Button
                title={
                  u.roles.includes("ADMIN") ? "Revoke admin" : "Grant admin"
                }
                secondary
                disabled={busy || !reviewed.includes(u.id)}
                onPress={() =>
                  void run(async () => {
                    await write(
                      `/v1/users/${u.id}`,
                      { active: u.active, admin: !u.roles.includes("ADMIN") },
                      "PATCH",
                    );
                    setReviewed([]);
                    users.refresh();
                    if (u.id === me.userId) await reload();
                  }, "Role updated; sessions revoked.")
                }
              />
            </View>
          )}
        />
      </Card>
    </>
  );
}
export function Corrections() {
  const { run } = useWorkspace();
  const resource = useResource<any[]>("/v1/corrections", []);
  const { t } = useI18n();
  return (
    <Card title="Correction requests">
      <ResourceStatus resource={resource} />
      <RecordList
        rows={resource.data}
        render={(r) => (
          <Disclosure
            key={r.id}
            title={`${r.name} · ${String(r.school_date).slice(0, 10)}`}
          >
            <Text style={ui.muted}>
              {r.display_name} · {t(r.status)}
            </Text>
            <Text style={[ui.label, { marginVertical: 12 }]}>{r.reason}</Text>
            {r.status === "OPEN" && (
              <Form
                fields={[
                  { key: "reason", label: "Review reason", required: true },
                  {
                    key: "approve",
                    label: "Approve and reopen attendance",
                    type: "boolean",
                    value: false,
                  },
                ]}
                title="Submit correction review"
                onSubmit={(d) =>
                  run(async () => {
                    await write(`/v1/corrections/${r.id}/review`, d);
                    resource.refresh();
                  }, "Correction reviewed.")
                }
              />
            )}
          </Disclosure>
        )}
      />
    </Card>
  );
}
export function Audit() {
  const resource = useResource<any[]>("/v1/audit", []);
  const { t } = useI18n();
  return (
    <Card
      title="Audit history"
      description="Most recent 200 events. Audit rows are append-only."
    >
      <ResourceStatus resource={resource} />
      <RecordList
        rows={resource.data}
        render={(r) => (
          <Disclosure key={r.id} title={r.action}>
            <Text style={ui.muted}>
              {new Date(r.event_at).toLocaleString()} · {r.object_type}
            </Text>
            <Text style={[ui.label, { marginTop: 12 }]}>{r.reason ?? "—"}</Text>
            {r.before_data && (
              <>
                <Text style={ui.label}>{t("Before")}</Text>
                <Text selectable style={ui.muted}>
                  {JSON.stringify(r.before_data, null, 2)}
                </Text>
              </>
            )}
            {r.after_data && (
              <>
                <Text style={ui.label}>{t("After")}</Text>
                <Text selectable style={ui.muted}>
                  {JSON.stringify(r.after_data, null, 2)}
                </Text>
              </>
            )}
          </Disclosure>
        )}
      />
    </Card>
  );
}
export function Activity() {
  const resource = useResource<any[]>("/v1/me/history", []);
  return (
    <Card title="My activity">
      <ResourceStatus resource={resource} />
      <RecordList
        rows={resource.data}
        render={(r) => (
          <View key={r.id} style={{ paddingVertical: 13 }}>
            <Text style={ui.label}>{r.action}</Text>
            <Text style={ui.muted}>
              {r.reason ?? r.object_type} ·{" "}
              {new Date(r.event_at).toLocaleString()}
            </Text>
          </View>
        )}
      />
    </Card>
  );
}
