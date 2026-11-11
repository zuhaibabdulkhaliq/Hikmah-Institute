import type { ReactNode } from "react";
import Image from "next/image";

const paths: Record<string, string> = {
  Overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "Academic setup": "M3 10 12 4l9 6-9 6-9-6z M6 12v6l6 3 6-3v-6",
  "Academic calendar":
    "M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M7 13h3 M14 13h3 M7 17h3",
  Attendance:
    "M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M8 14l3 3 5-5",
  "Exams & schemes":
    "M4 4h6a2 2 0 0 1 2 2v15a4 4 0 0 0-4-2H3V4h1z M12 6a2 2 0 0 1 2-2h7v15h-5a4 4 0 0 0-4 2",
  "Marks entry": "m14 5 5 5 M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15v5z",
  Policies: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3z M8 12l3 3 5-5",
  "Results & reports":
    "M5 3h10l4 4v14H5V3z M14 3v5h5 M9 17v-3 M12 17v-6 M15 17v-4",
  "People & access":
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4",
  "Correction requests": "M9 14H4V9 M4 14a8 8 0 1 0 2-8 M12 8v4l3 2",
  "Audit history": "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h5",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  logout: "M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4",
};

export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths["Academic setup"]} />
    </svg>
  );
}

export function Brand({
  subtitle = "ACADEMIC WORKSPACE",
}: {
  subtitle?: string;
}) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        {process.env.NEXT_PUBLIC_HIKMAH_HAS_LOGO === "true" ? (
          <Image
            className="brand-logo"
            src="/hikmah_logo.png"
            alt=""
            width={44}
            height={44}
          />
        ) : (
          <svg viewBox="0 0 40 40" fill="none">
            <path
              d="M20 7C13 13 10 18 10 28h10V7Zm0 9c6-6 10-4 10 12H20V16Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path
              d="M6 32h28M20 28v4"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <div className="brand-name">
        Hikmah Institute<span>{subtitle}</span>
      </div>
    </div>
  );
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story" aria-label="Hikmah Institute">
        <Brand subtitle="LEARNING WITH PURPOSE" />
        <div className="auth-story-copy">
          <span className="story-kicker">KNOWLEDGE. CARE. CLARITY.</span>
          <h1>
            A thoughtful space
            <br />
            for every day
            <br />
            of learning.
          </h1>
          <p>
            Your institute, connected. A calmer way to care for attendance,
            academics and everything in between.
          </p>
          <div className="glass-art" aria-hidden="true">
            <div className="art-arch art-arch-back" />
            <div className="art-arch art-arch-front">
              <span>علم</span>
            </div>
            <div className="art-caption">
              <span className="art-dot" /> Learning with purpose
            </div>
          </div>
        </div>
        <div className="story-footer">
          <span>HIKMAH INSTITUTE</span>
          <span lang="ur" dir="rtl">
            علم، عمل، حکمت
          </span>
        </div>
      </section>
      <section className="auth-content">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="login">{children}</div>
        <p className="auth-footer">Hikmah Institute · Academic management</p>
      </section>
    </div>
  );
}
