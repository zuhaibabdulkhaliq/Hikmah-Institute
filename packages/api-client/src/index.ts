export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function createClient(
  base: string,
  token?: () => Promise<string | null>,
  onSessionInvalid?: () => void,
) {
  return async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const bearer = await token?.();
    let response: Response;
    try {
      response = await fetch(base + path, {
        ...options,
        credentials: token ? "omit" : "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...options.headers,
        },
      });
    } catch (e) {
      if (options.signal?.aborted || (e as Error).name === "AbortError")
        throw e;
      throw new ApiError(
        0,
        "Cannot reach the institute server. Check your connection and try again.",
      );
    }
    let result: any = null;
    const text = await response.text();
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok)
        throw new ApiError(
          502,
          "The server returned an unexpected response. Try again or contact an administrator.",
        );
    }
    if (!response.ok) {
      if (
        response.status === 401 ||
        (response.status === 403 &&
          result?.message === "Account disabled or not invited")
      )
        onSessionInvalid?.();
      const header = response.headers.get("Retry-After");
      const retryAfter =
        header && /^\d+$/.test(header)
          ? Math.min(3600, Number(header))
          : undefined;
      const message =
        typeof result?.message === "string"
          ? result.message
          : response.status === 429
            ? "Too many requests. Please wait a moment and try again."
            : "The server is temporarily unavailable. Please try again shortly.";
      throw new ApiError(response.status, message, retryAfter);
    }
    return result as T;
  };
}
export type Section = {
  id: string;
  name: string;
  code: string;
  academic_year_id?: string;
  year_label?: string;
  year_state?: string;
  program_name?: string;
  level_name?: string;
};
export type Enrollment = {
  id: string;
  student_number: string;
  full_name: string;
  roll_number: string;
  student_id: string;
};
export type Sheet = {
  version: number;
  status: string;
  roster: Enrollment[];
  records: { enrollmentId: string; status: string }[];
};
export type Identity = {
  userId: string;
  today: string;
  timezone: string;
  name: string;
  roles: string[];
  accessVersion: string;
  managedSections: string[];
  attendanceSections: string[];
  teachingSections: string[];
  sectionAssignments: { sectionId: string; role: string }[];
};

export function normalizeServerURL(
  value: string,
  allowLocalHTTP = false,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Enter the institute server address, for example https://school.example.org",
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Use only the server address, without a page path, password or query.",
    );
  const host = url.hostname;
  const ip = /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ? host.split(".").map(Number)
    : null;
  const privateIP =
    !!ip &&
    ip.every((n) => n <= 255) &&
    (ip[0] === 10 ||
      ip[0] === 127 ||
      (ip[0] === 192 && ip[1] === 168) ||
      (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31));
  const local = host === "localhost" || host === "[::1]" || privateIP;
  if (
    url.protocol !== "https:" &&
    !(allowLocalHTTP && url.protocol === "http:" && local)
  )
    throw new Error(
      "Use HTTPS for the institute server. Local HTTP is available only during development.",
    );
  return url.origin;
}
