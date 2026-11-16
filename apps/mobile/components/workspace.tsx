import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Identity, Section } from "@hikmah/api-client";
import { api } from "./connection";
import {
  Button,
  Choice,
  Empty,
  Field,
  Notice,
  Toggle,
  type Option,
} from "./ui";
export type Workspace = {
  me: Identity;
  sections: Section[];
  section: string;
  setSection: (id: string) => void;
  cycles: any[];
  cycle: string;
  setCycle: (id: string) => void;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  navigate: (view: string) => void;
  epoch: number;
  setDirty: (value: boolean) => void;
  guard: (action: () => void) => void;
};
const Context = createContext<Workspace | null>(null);
export const WorkspaceProvider = Context.Provider;
export function useWorkspace() {
  const c = useContext(Context);
  if (!c) throw Error("Workspace unavailable");
  return c;
}
export function useResource<T = any>(path: string | null, initial: T) {
  const [data, setData] = useState<T>(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const version = useRef(0);
  const [responseKey, setResponseKey] = useState("");
  const requestKey = JSON.stringify([path, revision]);
  useEffect(() => {
    const v = ++version.current;
    if (!path) {
      setData(initial);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(initial);
    void api<T>(path, { signal: controller.signal })
      .then((d) => {
        if (version.current === v) {
          setData(d);
          setResponseKey(requestKey);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError" && version.current === v) {
          setError(e.message);
          setResponseKey(requestKey);
        }
      })
      .finally(() => {
        if (version.current === v) setLoading(false);
      });
    return () => {
      version.current++;
      controller.abort();
    };
  }, [path, revision]);
  return {
    data: responseKey === requestKey ? data : initial,
    setData,
    error: responseKey === requestKey ? error : "",
    loading: !!path && (responseKey !== requestKey || loading),
    refresh: () => setRevision((n) => n + 1),
  };
}
export type FormField = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "password"
    | "multiline"
    | "email"
    | "url"
    | "boolean";
  required?: boolean;
  options?: Option[];
  value?: any;
  hint?: string;
};
export function Form({
  fields,
  title = "Save changes",
  onSubmit,
  initial = {},
  children,
  resetOnSuccess = false,
}: {
  fields: FormField[];
  resetOnSuccess?: boolean;
  title?: string;
  onSubmit: (data: any) => Promise<boolean | void>;
  initial?: Record<string, any>;
  children?: ReactNode;
}) {
  const { busy, setDirty } = useWorkspace();
  const [values, setValues] = useState<Record<string, any>>({}),
    [error, setError] = useState("");
  const val = (f: FormField) =>
    values[f.key] ??
    initial[f.key] ??
    f.value ??
    (f.type === "boolean" ? false : "");
  return (
    <>
      {fields.map((f) =>
        f.options ? (
          <Choice
            key={f.key}
            label={f.label}
            value={String(val(f))}
            options={f.options}
            disabled={busy}
            onChange={(v) => {
              setValues({ ...values, [f.key]: v });
              setDirty(true);
            }}
          />
        ) : f.type === "boolean" ? (
          <Toggle
            key={f.key}
            label={f.label}
            value={!!val(f)}
            disabled={busy}
            onChange={(v) => {
              setValues({ ...values, [f.key]: v });
              setDirty(true);
            }}
          />
        ) : (
          <Field
            key={f.key}
            label={f.label}
            value={String(val(f))}
            type={f.type}
            required={f.required}
            hint={f.hint}
            disabled={busy}
            onChange={(v) => {
              setValues({ ...values, [f.key]: v });
              setDirty(true);
            }}
          />
        ),
      )}
      {!!error && <Notice error text={error} />}
      <Button
        title={title}
        disabled={busy}
        onPress={() => {
          const missing = fields.find(
            (f) => f.required && String(val(f)).trim() === "",
          );
          if (missing) {
            setError("Complete the required fields before saving.");
            return;
          }
          const payload: Record<string, any> = {};
          for (const f of fields) {
            const v = val(f);
            if (v === "" && !f.required) continue;
            payload[f.key] = f.type === "number" ? Number(v) : v;
          }
          setError("");
          void (async () => {
            const result = await onSubmit(payload);
            if (result !== false) {
              if (resetOnSuccess) {
                setValues({});
                setDirty(false);
                return;
              }
              setValues((v) => ({
                ...v,
                ...Object.fromEntries(
                  fields
                    .filter((f) => f.type === "password")
                    .map((f) => [f.key, ""]),
                ),
              }));
            }
          })();
        }}
      />
      {children}
    </>
  );
}
export function ResourceStatus({
  resource,
}: {
  resource: { error: string; loading: boolean; refresh: () => void };
}) {
  return resource.error ? (
    <>
      <Notice error text={resource.error} />
      <Button title="Try again" secondary onPress={resource.refresh} />
    </>
  ) : resource.loading ? (
    <Notice text="Loading…" />
  ) : null;
}
export function RecordList({
  rows,
  render,
  search = true,
}: {
  rows: any[];
  render: (row: any) => ReactNode;
  search?: boolean;
}) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);
  const selected = rows.filter((r) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(r).filter(([k]) => !k.endsWith("_id") && k !== "id"),
      ),
    )
      .toLocaleLowerCase()
      .includes(q.toLocaleLowerCase()),
  );
  return (
    <>
      {search && rows.length > 5 && (
        <Field
          label="Search"
          value={q}
          onChange={(v) => {
            setQ(v);
            setLimit(20);
          }}
        />
      )}
      {selected.slice(0, limit).map(render)}
      {!selected.length && <Empty />}
      {selected.length > limit && (
        <Button
          title="Show more"
          secondary
          onPress={() => setLimit(limit + 20)}
        />
      )}
    </>
  );
}
export const options = (rows: any[], label: (r: any) => string): Option[] =>
  rows.map((r) => ({ value: r.id, label: label(r), raw: true }));
const choiceLabels: Record<string, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
  MUSHRIF: "Mushrif",
  AMEER: "Ameer",
  ATTENDANCE_ASSISTANT: "Attendance assistant",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Completed",
  WRITTEN: "Written",
  ORAL: "Oral",
  PRACTICAL: "Practical",
  OTHER: "Other",
  PENDING: "Pending",
  GRADED: "Graded",
  ABSENT: "Absent",
  EXEMPT: "Exempt",
  WITHHELD: "Withheld",
  NOT_APPLICABLE: "Not applicable",
  UNKNOWN_LEGACY_BLANK: "Unclear legacy blank",
  BLOCK: "Block until resolved",
  SHOW_NA: "Show not applicable",
  ZERO: "Count as zero with full maximum",
  EXCLUDE: "Exclude from the denominator",
  ACTIVE_AT_WINDOW_END: "Enrolled on attendance-window end date",
  ANY_ENROLLED_IN_WINDOW: "Enrolled at any point in the attendance window",
  COMPETITION: "Shared ranks with gaps (1, 1, 3)",
  DENSE: "Shared ranks without gaps (1, 1, 2)",
  HALF_UP: "Round half up",
  HALF_EVEN: "Round half to even",
  DOWN: "Round down",
};
export const choices = (values: string[]): Option[] =>
  values.map((value) => ({ value, label: choiceLabels[value] ?? value }));
export const write = (
  path: string,
  body: unknown,
  method = "POST",
  headers?: Record<string, string>,
) => api<any>(path, { method, headers, body: JSON.stringify(body) });
