"use client";
import { useState } from "react";
import { createClient } from "@hikmah/api-client";
import { AuthFrame } from "../../components/workspace-ui";
export default function Activate() {
  const [message, setMessage] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <AuthFrame>
      <div className="eyebrow">YOUR HIKMAH ACCOUNT</div>
      <h1 className="login-title">Make it yours.</h1>
      <p>
        Your invitation or recovery link is private and single-use. Choose a
        password with at least 12 characters.
      </p>
      {done ? (
        <a href="/">Continue to sign in →</a>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const password = new FormData(e.currentTarget).get("password");
            setBusy(true);
            setMessage("");
            try {
              await createClient("")("/v1/invitations/accept", {
                method: "POST",
                body: JSON.stringify({
                  token: location.hash.slice(1),
                  password,
                }),
              });
              setDone(true);
              history.replaceState(null, "", "/activate");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <button disabled={busy}>
            {busy ? "Saving password…" : "Set password"}
          </button>
        </form>
      )}
      {message && (
        <p role="alert" className="notice error">
          {message}
        </p>
      )}
    </AuthFrame>
  );
}
