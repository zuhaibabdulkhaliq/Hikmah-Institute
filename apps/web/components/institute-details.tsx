"use client";
import { useEffect, useState } from "react";
import { createClient } from "@hikmah/api-client";
import { useI18n } from "./language";
export function InstituteDetails() {
  const { t } = useI18n();
  const [data, setData] = useState<{
      name: string;
      timezone: string;
      name_ur: string | null;
      official_display_name: string | null;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    void createClient("")<NonNullable<typeof data>>("/v1/institute")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <details className="panel">
      <summary>{t("Institute details")}</summary>
      <p>
        {t(
          "These names appear on future result sheets. Existing published reports keep their original names.",
        )}
      </p>
      {error && (
        <p role="alert" className="notice error">
          {t(error)}
        </p>
      )}
      {data && (
        <form
          className="gridform"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              await createClient("")("/v1/institute", {
                method: "PATCH",
                body: JSON.stringify(data),
              });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("Institute name in English")}
            <input
              required
              maxLength={200}
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label>
            {t("Institute name in Urdu")}
            <input
              required
              dir="rtl"
              maxLength={200}
              value={data.name_ur ?? ""}
              onChange={(e) => setData({ ...data, name_ur: e.target.value })}
            />
          </label>
          <label>
            {t("Official display name")}
            <input
              maxLength={200}
              required
              value={data.official_display_name ?? ""}
              onChange={(e) =>
                setData({ ...data, official_display_name: e.target.value })
              }
            />
          </label>
          <button disabled={busy}>
            {t(busy ? "Working…" : "Save changes")}
          </button>
        </form>
      )}
      {saved && (
        <p role="status" className="notice success">
          {t("Institute details saved.")}
        </p>
      )}
    </details>
  );
}
