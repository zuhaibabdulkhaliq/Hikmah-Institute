"use client";
import { useRef, useState } from "react";
import { createClient } from "@hikmah/api-client";
import { useI18n } from "./language";
export function AccountSettings({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="secondary"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        {t("My account")}
      </button>
      <dialog
        ref={dialog}
        className="account-dialog"
        aria-label={t("Account settings")}
      >
        <div className="panelhead">
          <h2>{t("Change my password")}</h2>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            {t("Close")}
          </button>
        </div>
        <p>
          {t(
            "Use 12–128 characters. Changing your password signs you out on every device.",
          )}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = e.currentTarget,
              data = new FormData(form);
            if (data.get("password") !== data.get("confirm")) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await createClient("")("/v1/me/password", {
                method: "PUT",
                body: JSON.stringify({
                  currentPassword: data.get("currentPassword"),
                  password: data.get("password"),
                }),
              });
              form.reset();
              dialog.current?.close();
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("Current password")}
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          <label>
            {t("New password")}
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            {t("Confirm new password")}
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p role="alert" className="notice error">
              {t(error)}
            </p>
          )}
          <button disabled={busy}>
            {t(busy ? "Saving password…" : "Change password")}
          </button>
        </form>
      </dialog>
    </>
  );
}
