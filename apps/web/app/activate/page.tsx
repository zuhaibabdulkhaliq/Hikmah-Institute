"use client";
import { useState } from "react";
import { createClient } from "@hikmah/api-client";
export default function Activate() {
  const [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  return (
    <div className="login">
      <h1>Set your account password</h1>
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
            const password = new FormData(e.currentTarget).get("password");
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
          <button>Set password</button>
        </form>
      )}
      {message && <p className="notice error">{message}</p>}
    </div>
  );
}
