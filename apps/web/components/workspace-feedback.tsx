"use client";
import { useEffect } from "react";
import { useI18n } from "./language";
export function WorkspaceFeedback({
  error,
  message,
  onDismiss,
}: {
  error: string;
  message: string;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!message || error) return;
    const timer = setTimeout(onDismiss, 10000);
    return () => clearTimeout(timer);
  }, [error, message, onDismiss]);
  if (!error && !message) return null;
  return (
    <div
      className={"workspace-feedback notice " + (error ? "error" : "success")}
      role={error ? "alert" : "status"}
    >
      <span>{t(error || message)}</span>
      <button
        type="button"
        className="secondary"
        onClick={onDismiss}
        aria-label={t("Dismiss message")}
      >
        ×
      </button>
    </div>
  );
}
