import { useEffect, useState } from "react";
import { Button, Field, Notice } from "./ui";
import { useWorkspace } from "./workspace";
export function ConfigurationEditor({
  label,
  value,
  onApply,
  valid,
}: {
  label: string;
  value: any;
  onApply: (v: any) => void;
  valid: (v: any) => boolean;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  const { setDirty } = useWorkspace();
  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value]);
  return (
    <>
      <Field
        label={label}
        type="multiline"
        value={text}
        onChange={(v) => {
          setText(v);
          setDirty(true);
          setError("");
        }}
      />
      {!!error && <Notice error text={error} />}
      <Button
        title="Load configuration into form"
        secondary
        onPress={() => {
          try {
            const parsed = JSON.parse(text);
            if (!valid(parsed))
              throw Error(
                "The configuration structure is incomplete. Check the named fields and arrays.",
              );
            onApply(parsed);
            setDirty(true);
            setError("");
          } catch (e) {
            setError(
              e instanceof SyntaxError
                ? "The configuration is not valid JSON. Check quotes, commas and brackets."
                : (e as Error).message,
            );
          }
        }}
      />
    </>
  );
}
export const validSchemeShape = (s: any) =>
  !!s &&
  Array.isArray(s.papers) &&
  Array.isArray(s.groups) &&
  s.papers.every(
    (p: any) =>
      p &&
      typeof p.code === "string" &&
      typeof p.label === "string" &&
      typeof p.offeringId === "string" &&
      typeof p.type === "string",
  ) &&
  s.groups.every(
    (g: any) =>
      g &&
      typeof g.name === "string" &&
      Array.isArray(g.paperCodes) &&
      g.paperCodes.every((c: any) => typeof c === "string"),
  );
const record = (value: any) =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const validPolicyShape = (p: any) =>
  record(p) &&
  record(p.attendance) &&
  Array.isArray(p.grades) &&
  p.grades.every((g: any) => record(g) && typeof g.label === "string") &&
  record(p.ranking) &&
  record(p.missing);
