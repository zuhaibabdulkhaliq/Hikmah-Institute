import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { pool } from "./db.ts";
if (
  !process.env.BETTER_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET.length < 32
)
  throw new Error("Set BETTER_AUTH_SECRET (32+ characters)");
export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  plugins: [bearer()],
  session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
