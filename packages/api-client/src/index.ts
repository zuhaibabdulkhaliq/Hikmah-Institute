export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
    const response = await fetch(base + path, {
      ...options,
      credentials: token ? "omit" : "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...options.headers,
      },
    });
    const result = await response.json();
    if (!response.ok) {
      if (
        response.status === 401 ||
        (response.status === 403 &&
          result.message === "Account disabled or not invited")
      )
        onSessionInvalid?.();
      throw new ApiError(response.status, result.message ?? "Request failed");
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
