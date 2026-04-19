import api from "./client";

export type LoginPayload = { username: string; password: string };

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  address: string;
  phoneNumber?: string;
};

export type RoleLike =
  | string
  | { roleId?: number; roleName: string }
  | { roleName: string };

export type LoginResponse = {
  userId: number;
  username: string;
  typeToken: string;
  accessToken: string;
  roles: RoleLike[];
};

export type UserResponseDTO = {
  id: number;
  username: string;
  email?: string | null;
  fullname?: string | null;
  status?: boolean;
  phone?: string | null;
  avatar?: string | null;
  address?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  workStatus?: string | null;
  workStatusDate?: string | null;
  department?: string | null;
  team?: string | null;
  roles?: { roleId: number; roleName: string }[];
  /** teamId -> LEADER | MEMBER (for showing "Leader" on profile) */
  teamRoles?: Record<string, string> | null;
  /** Đội chính (main team) - dùng để hiển thị trên profile thay vì đội chọn trước */
  primaryTeam?: string | null;
  /** Danh sách team (từ user_teams) dùng làm fallback khi không có primaryTeam */
  availableTeams?: string[] | null;
  /** Khi true, user (ADMIN) được phép vào trang Phê duyệt OT. */
  canApproveOt?: boolean | null;
};

export type UserUpdateRequestDTO = {
  fullname?: string;
  phone?: string;
  address?: string;
  email?: string;
  avatar?: File | null;
  assignedHospitalIds?: number[];
  workStatus?: string | null;
  workStatusDate?: string | null;
  department?: "IT" | "ACCOUNTING" | null;
  team?: "DEV" | "DEPLOYMENT" | "MAINTENANCE" | null;
};

// ==========================
// 🔹 Lấy thông tin tài khoản
// ==========================
export async function getUserAccount(userId: number) {
  const { data } = await api.get<UserResponseDTO>(`/api/v1/auth/users/${userId}`);
  return data;
}

// =====================================
// 🔹 Cập nhật tài khoản (auto detect file)
// =====================================
export async function updateUserAccount(userId: number, payload: UserUpdateRequestDTO) {
  const url = `/api/v1/auth/users/${userId}`;
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach((v) => formData.append(key, v.toString()));
      } else {
        formData.append(key, value as any);
      }
    }
  });

  const { data } = await api.put<UserResponseDTO>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
}

// =====================================
// 🔹 Đổi mật khẩu
// =====================================
export type ChangePasswordRequestDTO = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export async function changePassword(userId: number, payload: ChangePasswordRequestDTO) {
  const url = `/api/v1/auth/change-password`;
  const { data } = await api.post(url, payload, {
    params: { userId },
    headers: { "Content-Type": "application/json" },
  });
  return data;
}

export function setCookie(
  name: string,
  value: string,
  days = 7,
  sameSite: "Lax" | "None" = window.location.protocol === "https:" ? "None" : "Lax"
) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `; Expires=${d.toUTCString()}`;
  const path = `; Path=/`;
  const secure = sameSite === "None" ? "; Secure" : "";
  const domain =
    window.location.hostname === "localhost"
      ? ""
      : `; Domain=${window.location.hostname}`;
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}${expires}${path}${domain}; SameSite=${sameSite}${secure}`;
}

// ==========================
// Auth APIs
// ==========================
export const signIn = async (data: LoginPayload) => {
  const res = await api.post<LoginResponse>("/api/v1/public/sign-in", data);
  const payload = res.data;

  const token = payload?.accessToken;
  if (token) {
    localStorage.setItem("access_token", token);
    setCookie("access_token", token, 7);
  }

  // 👉 Lưu userId
  if (payload?.userId != null) {
    localStorage.setItem("userId", String(payload.userId));
  }

  localStorage.setItem("username", payload?.username ?? "");
  localStorage.setItem("roles", JSON.stringify(normalizeRoles(payload?.roles)));

  return payload;
};

export const signUp = (data: RegisterPayload) =>
  api.post("/api/v1/public/sign-up", data);

export type ForgotPasswordPayload = { email: string };
export type ResetPasswordPayload = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export async function forgotPassword(data: ForgotPasswordPayload) {
  const res = await api.post("/api/v1/public/forgot-password", data);
  return res.data;
}

export async function resetPassword(data: ResetPasswordPayload) {
  const res = await api.post("/api/v1/public/reset-password", data);
  return res.data;
}

// ==========================
// Clear all user data from storage
// ==========================
export const clearUserStorage = () => {
  // Get userId before clearing (to remove user-specific Tet flag)
  const userId = localStorage.getItem("userId") || sessionStorage.getItem("userId");
  
  // Clear localStorage
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("username");
  localStorage.removeItem("roles");
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  
  // Clear Tet celebration flag for this user (if userId exists)
  if (userId) {
    localStorage.removeItem(`tetCelebrationShown_${userId}`);
  }
  
  // Also clear old format flag (backward compatibility)
  localStorage.removeItem("tetCelebrationShown");
  
  // Clear sessionStorage
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("roles");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("userId");
  
  // Clear cookies
  const name = "access_token";
  const host = window.location.hostname;
  const base = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
  
  // Clear cookies without domain (works for localhost and IP addresses)
  document.cookie = `${base}; Path=/; SameSite=Lax`;
  document.cookie = `${base}; Path=/; SameSite=None; Secure`;
  
  // Clear cookies with domain (only if hostname is not localhost or IP)
  if (host && host !== "localhost" && !host.match(/^127\.\d+\.\d+\.\d+$/) && !host.match(/^192\.168\./) && !host.match(/^10\./)) {
    document.cookie = `${base}; Path=/; Domain=${host}; SameSite=Lax`;
    document.cookie = `${base}; Path=/; Domain=${host}; SameSite=None; Secure`;
  }
};

// ==========================
// Logout
// ==========================
// ==========================
// Team Switching API
// ==========================
export type SwitchTeamRequestDTO = {
  teamId: string;
};

export type SwitchTeamResponseDTO = {
  success: boolean;
  message: string;
  newToken?: string; // Optional new JWT token
};

export async function switchTeam(payload: SwitchTeamRequestDTO): Promise<SwitchTeamResponseDTO> {
  const { data } = await api.post<SwitchTeamResponseDTO>("/api/v1/auth/switch-team", payload);
  return data;
}

export const logout = async () => {
  try {
    await api.get("/api/v1/auth/logout", { withCredentials: true });
  } catch (e) {
    // console.warn("Logout API error:", e);
  } finally {
    clearUserStorage();
    // console.log("User data cleared after logout");
  }
};

// ==========================
// Helpers
// ==========================
export const normalizeRoles = (roles: RoleLike[] = []) =>
  roles.map((r) => (typeof r === "string" ? r : r.roleName));

/**
 * Map axios/API errors to a user-visible string.
 * "Đã xảy ra lỗi" used to appear when `response.data` was missing (network/CORS/offline).
 */
export const pickErrMsg = (err: unknown): string => {
  const e = err as {
    message?: string;
    code?: string;
    response?: { status?: number; data?: unknown };
  };

  if (!e?.response) {
    const m = e?.message;
    if (m === "Network Error" || e?.code === "ERR_NETWORK") {
      return "Không kết nối được máy chủ. Kiểm tra backend ";
    }
    if (typeof m === "string" && m.trim().length > 0 && m !== "Error") {
      return m;
    }
    return "Không có phản hồi HTTP (mạng, CORS hoặc máy chủ tắt). Mở F12 → Network để xem chi tiết.";
  }

  const status = e.response.status ?? 0;
  const raw = e.response.data;

  if (raw == null || raw === "") {
    return `Lỗi ${status}: máy chủ không trả nội dung.`;
  }

  // Spring DataError: { code, message }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { message?: unknown; data?: unknown; error?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    const nested = o.data;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object") {
      const first = Object.values(nested as Record<string, unknown>)[0];
      if (typeof first === "string") return first;
    }
  }
  if (typeof raw === "string") {
    return raw.length > 400 ? raw.slice(0, 400) + "…" : raw;
  }

  return "Yêu cầu không hợp lệ";
};

export const pickFieldErrors = (err: any): Record<string, string> => {
  const d = err?.response?.data;
  if (d?.data && typeof d.data === "object") return d.data as Record<string, string>;
  return {};
};

// ==========================
// Personal Calendar Events APIs
// ==========================

export type PersonalCalendarEventRequestDTO = {
  title: string;
  startDate: string; // ISO date string
  endDate?: string | null; // ISO date string
  color?: string;
  allDay?: boolean;
};

export type PersonalCalendarEventResponseDTO = {
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
  color: string;
  allDay: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
};

export async function createPersonalCalendarEvent(
  payload: PersonalCalendarEventRequestDTO
): Promise<PersonalCalendarEventResponseDTO> {
  const { data } = await api.post<PersonalCalendarEventResponseDTO>(
    "/api/v1/auth/calendar/events",
    payload
  );
  return data;
}

export async function updatePersonalCalendarEvent(
  eventId: number,
  payload: PersonalCalendarEventRequestDTO
): Promise<PersonalCalendarEventResponseDTO> {
  const { data } = await api.put<PersonalCalendarEventResponseDTO>(
    `/api/v1/auth/calendar/events/${eventId}`,
    payload
  );
  return data;
}

export async function deletePersonalCalendarEvent(eventId: number): Promise<void> {
  await api.delete(`/api/v1/auth/calendar/events/${eventId}`);
}

export async function getPersonalCalendarEventById(
  eventId: number
): Promise<PersonalCalendarEventResponseDTO> {
  const { data } = await api.get<PersonalCalendarEventResponseDTO>(
    `/api/v1/auth/calendar/events/${eventId}`
  );
  return data;
}

export async function getAllPersonalCalendarEvents(): Promise<
  PersonalCalendarEventResponseDTO[]
> {
  const { data } = await api.get<PersonalCalendarEventResponseDTO[]>(
    "/api/v1/auth/calendar/events"
  );
  return data;
}

export async function getPersonalCalendarEventsByDateRange(
  startDate: string,
  endDate: string
): Promise<PersonalCalendarEventResponseDTO[]> {
  const { data } = await api.get<PersonalCalendarEventResponseDTO[]>(
    "/api/v1/auth/calendar/events/date-range",
    {
      params: { startDate, endDate },
    }
  );
  return data;
}

// ==========================
// Team Calendar Events APIs
// ==========================

export type TeamCalendarEventRequestDTO = {
  title: string;
  startDate: string; // ISO date string
  endDate?: string | null; // ISO date string
  color?: string;
  allDay?: boolean;
  team: string; // SALES, DEPLOYMENT, MAINTENANCE
  eventType?: string; // team or member
  memberId?: number | null;
};

export type TeamCalendarEventResponseDTO = {
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
  color: string;
  allDay: boolean;
  team: string;
  eventType: string;
  memberId: number | null;
  createdBy: number;
  createdByName: string; // Full name of the user who created the event
  createdAt: string;
  updatedAt: string;
};

export async function createTeamCalendarEvent(
  payload: TeamCalendarEventRequestDTO
): Promise<TeamCalendarEventResponseDTO> {
  const { data } = await api.post<TeamCalendarEventResponseDTO>(
    "/api/v1/auth/team-calendar/events",
    payload
  );
  return data;
}

export async function updateTeamCalendarEvent(
  eventId: number,
  payload: TeamCalendarEventRequestDTO
): Promise<TeamCalendarEventResponseDTO> {
  const { data } = await api.put<TeamCalendarEventResponseDTO>(
    `/api/v1/auth/team-calendar/events/${eventId}`,
    payload
  );
  return data;
}

export async function deleteTeamCalendarEvent(eventId: number): Promise<void> {
  await api.delete(`/api/v1/auth/team-calendar/events/${eventId}`);
}

export async function getTeamCalendarEventById(
  eventId: number
): Promise<TeamCalendarEventResponseDTO> {
  const { data } = await api.get<TeamCalendarEventResponseDTO>(
    `/api/v1/auth/team-calendar/events/${eventId}`
  );
  return data;
}

export async function getTeamCalendarEventsByTeam(
  team: string
): Promise<TeamCalendarEventResponseDTO[]> {
  const { data } = await api.get<TeamCalendarEventResponseDTO[]>(
    "/api/v1/auth/team-calendar/events",
    {
      params: { team },
    }
  );
  return data;
}

export async function getTeamCalendarEventsByTeamAndDateRange(
  team: string,
  startDate: string,
  endDate: string
): Promise<TeamCalendarEventResponseDTO[]> {
  const { data } = await api.get<TeamCalendarEventResponseDTO[]>(
    "/api/v1/auth/team-calendar/events/date-range",
    {
      params: { team, startDate, endDate },
    }
  );
  return data;
}

export async function getTeamCalendarEventsByTeamAndMember(
  team: string,
  memberId: number,
  startDate: string,
  endDate: string
): Promise<TeamCalendarEventResponseDTO[]> {
  const { data } = await api.get<TeamCalendarEventResponseDTO[]>(
    "/api/v1/auth/team-calendar/events/member",
    {
      params: { team, memberId, startDate, endDate },
    }
  );
  return data;
}