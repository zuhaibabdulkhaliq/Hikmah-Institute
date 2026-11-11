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
      credentials: "include",
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
