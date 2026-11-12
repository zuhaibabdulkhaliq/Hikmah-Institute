"use client";
import { useMemo, useState } from "react";
import type { Section } from "@hikmah/api-client";
import { useI18n } from "./language";
export function OverviewSections({
  sections,
  admin,
  onOpen,
  onSetup,
}: {
  sections: Section[];
  admin: boolean;
  onOpen: (id: string) => void;
  onSetup: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState(""),
    [includePast, setIncludePast] = useState(false),
    [all, setAll] = useState(false);
  const filtered = useMemo(
    () =>
      sections.filter(
        (s) =>
          (includePast ||
            !["CLOSED", "ARCHIVED"].includes(s.year_state ?? "")) &&
          [s.name, s.code, s.year_label, s.program_name, s.level_name]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
      ),
    [sections, search, includePast],
  );
  const shown = all ? filtered : filtered.slice(0, 8);
  return (
    <div className="panel overview-sections">
      <div className="panelhead">
        <h2>{t("Your sections")}</h2>
        <span className="tag">
          {filtered.length} {t("sections")}
        </span>
      </div>
      {!!sections.length && (
        <>
          <label>
            {t("Find a class")}
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAll(false);
              }}
              placeholder={t("Search class, program or academic year")}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => {
                setIncludePast(e.target.checked);
                setAll(false);
              }}
            />
            {t("Include previous years")}
          </label>
        </>
      )}
      <div className="overview-class-list">
        {shown.map((s) => (
          <div className="overview-class" key={s.id}>
            <div>
              <strong>
                {s.name} · {s.code}
              </strong>
              <span className="tiny">
                {[s.year_label, s.program_name, s.level_name]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button className="secondary" onClick={() => onOpen(s.id)}>
              {t("Open class")}
            </button>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <p className="empty">
          {t(
            !sections.length
              ? admin
                ? "Start by creating an academic year and class section."
                : "No assigned sections. An administrator can assign your access."
              : "No matching classes. Try another search or include previous years.",
          )}
        </p>
      )}
      {!sections.length && admin && (
        <button onClick={onSetup}>{t("Open academic setup")}</button>
      )}
      {filtered.length > 8 && (
        <button className="secondary" onClick={() => setAll(!all)}>
          {t(all ? "Show fewer classes" : "Show all classes")}
        </button>
      )}
    </div>
  );
}
