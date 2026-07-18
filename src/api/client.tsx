// src/api/client.tsx
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { refreshAccessToken } from "./tokenRefresh";

const REFRESH_FAIL_COOLDOWN_MS = 120_000;
const REFRESH_COOLDOWN_KEY = "tagweb_refresh_cooldown_until";

function refreshCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  return Number(sessionStorage.getItem(REFRESH_COOLDOWN_KEY) || "0");
}

function armRefreshCooldown() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    REFRESH_COOLDOWN_KEY,
    String(Date.now() + REFRESH_FAIL_COOLDOWN_MS)
  );
}

/** Call after successful login or successful refresh — allows retries again. */
export function clearRefreshFailureCooldown() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(REFRESH_COOLDOWN_KEY);
  }
}

export const AUTH_TOKEN_REFRESHED_EVENT = "auth:token-refreshed";

function getCookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

/**
 * Read access token from storage/cookie without expiry check.
 * Prefer localStorage/sessionStorage over legacy access_token cookie — after refresh,
 * only storage is updated; a stale cookie would otherwise shadow the new JWT.
 */
export function getStoredAccessToken(): string | null {
  const candidates = [
    localStorage.getItem("access_token"),
    sessionStorage.getItem("access_token"),
    localStorage.getItem("token"),
    getCookie("access_token"),
  ].filter((t): t is string => !!t);

  if (candidates.length === 0) return null;

  const valid = candidates.find((t) => !isTokenExpired(t));
  return valid ?? candidates[0];
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    const exp = payload.exp;

    if (!exp) return false;

    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Sync roles from JWT v1/v2 into the same storage as access_token. */
export function syncRolesFromAccessToken(token: string, preferredStorage?: Storage) {
  const payload = parseJwtPayload(token);
  if (!payload) return;

  const roles: string[] = [];
  const globalRole = payload.globalRole;
  if (typeof globalRole === "string" && globalRole.trim()) {
    roles.push(globalRole.trim());
  }
  const fromArray =
    payload.roles || payload.authorities || payload.role || [];
  if (Array.isArray(fromArray)) {
    for (const r of fromArray) {
      if (typeof r === "string" && r.trim()) roles.push(r.trim());
      else if (r && typeof r === "object") {
        const rr = r as Record<string, unknown>;
        const rn = rr.roleName ?? rr.role_name ?? rr.role ?? rr.name ?? rr.authority;
        if (typeof rn === "string" && rn.trim()) roles.push(rn.trim());
      }
    }
  }

  const unique = [...new Set(roles.map((r) => r.toUpperCase()))];
  if (unique.length === 0) return;

  const storage =
    preferredStorage ||
    (localStorage.getItem("access_token") ? localStorage : sessionStorage);
  try {
    storage.setItem("roles", JSON.stringify(unique));
  } catch {
    // ignore
  }
}

let isRedirecting = false;

export function persistAccessToken(token: string, preferredStorage?: Storage) {
  clearRefreshFailureCooldown();
  isRedirecting = false;

  const storage =
    preferredStorage ||
    (localStorage.getItem("access_token")
      ? localStorage
      : sessionStorage.getItem("access_token")
        ? sessionStorage
        : localStorage);

  storage.setItem("access_token", token);
  syncRolesFromAccessToken(token, storage);
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  // Legacy: remove stale access_token cookie so it cannot shadow storage after refresh
  document.cookie =
    "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  document.cookie =
    "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=qlcvtagtech.com;";

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, { detail: { accessToken: token } })
    );
  }
}

export function clearAllAuthData() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("roles");
  localStorage.removeItem("userId");
  localStorage.removeItem("user");

  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("roles");
  sessionStorage.removeItem("userId");
  sessionStorage.removeItem("user");

  document.cookie =
    "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  document.cookie =
    "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=qlcvtagtech.com;";

  delete api.defaults.headers.common["Authorization"];
}

/**
 * Valid access token, or null if missing/expired (does not redirect).
 * Use tryRefreshAccessToken() before giving up on expired sessions.
 */
export function getAuthToken(): string | null {
  const raw = getStoredAccessToken();
  if (!raw) return null;
  if (isTokenExpired(raw)) return null;
  return raw;
}

function isAuthPagePath(path: string) {
  return (
    path === "/signin" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password"
  );
}

export function redirectToSignIn() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (isAuthPagePath(path)) return;
  if (isRedirecting) return;

  isRedirecting = true;
  clearAllAuthData();
  window.location.href = "/signin";
}

/** Reset redirect guard after manual navigation to sign-in (e.g. logout). */
export function resetRedirectGuard() {
  isRedirecting = false;
}

let refreshPromise: Promise<string | null> | null = null;

/** Single-flight refresh using httpOnly refresh_token cookie. */
export async function tryRefreshAccessToken(): Promise<string | null> {
  if (typeof window !== "undefined" && Date.now() < refreshCooldownUntil()) {
    return null;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshAccessToken()
    .then((data) => {
      if (data?.accessToken) {
        persistAccessToken(data.accessToken);
        return data.accessToken;
      }
      return null;
    })
    .catch((err: unknown) => {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // 404 = server chưa có /public/refresh (deploy BE). 401 = cookie hết/không có.
      if (
        status === 404 ||
        status === 401 ||
        status === 405 ||
        status === 501
      ) {
        armRefreshCooldown();
      }
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Obtain a valid access JWT, refreshing via httpOnly cookie when missing/expired. */
export async function ensureAccessToken(): Promise<string | null> {
  let token = getAuthToken();
  if (token) return token;
  token = await tryRefreshAccessToken();
  return token ? getAuthToken() ?? token : null;
}

function mergeFetchHeaders(
  init: RequestInit | undefined,
  token: string | null
): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  return headers;
}

/**
 * fetch() wrapper for pages that bypass the axios client.
 * Ensures refresh before the request and retries once on 401.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await ensureAccessToken();
  let res = await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: mergeFetchHeaders(init, token),
  });

  if (res.status === 401) {
    const newToken = await tryRefreshAccessToken();
    if (newToken) {
      res = await fetch(input, {
        ...init,
        credentials: init?.credentials ?? "include",
        headers: mergeFetchHeaders(init, getAuthToken() ?? newToken),
      });
    } else if (typeof window !== "undefined" && !isAuthPagePath(window.location.pathname)) {
      redirectToSignIn();
    }
  }

  return res;
}

function isPublicPath(url?: string) {
  return !!url?.startsWith("/api/v1/public/");
}

/** sign-in and refresh need credentials to send/receive refresh_token cookie. */
function isPublicPathWithCredentials(url?: string) {
  if (!url) return false;
  return (
    url.includes("/api/v1/public/sign-in") ||
    url.includes("/api/v1/public/refresh")
  );
}

function isAuthRefreshExcludedUrl(url?: string) {
  if (!url) return true;
  if (url.includes("/api/v1/public/sign-in")) return true;
  if (url.includes("/api/v1/public/refresh")) return true;
  if (url.includes("/api/v1/public/sign-up")) return true;
  if (url.includes("/api/v1/public/forgot-password")) return true;
  if (url.includes("/api/v1/public/reset-password")) return true;
  return false;
}

function isSuperAdminRole(value: unknown): boolean {
  if (value == null) return false;
  const raw = String(value).toUpperCase().trim();
  const compact = raw.replace(/^ROLE[_\s-]*/i, "").replace(/[_\s-]/g, "");
  return compact === "SUPERADMIN" || compact.includes("SUPERADMIN");
}

function isSuperAdminUser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.pathname.startsWith("/superadmin")) return true;

    const rolesStr =
      localStorage.getItem("roles") || sessionStorage.getItem("roles");
    if (rolesStr) {
      const roles = JSON.parse(rolesStr);
      if (
        Array.isArray(roles) &&
        roles.some((r: unknown) => {
          if (typeof r === "string") return isSuperAdminRole(r);
          if (r && typeof r === "object") {
            const rr = r as Record<string, unknown>;
            const rn =
              rr.roleName ?? rr.role_name ?? rr.role ?? rr.name ?? rr.authority;
            return isSuperAdminRole(rn);
          }
          return false;
        })
      ) {
        return true;
      }
    }

    const token = getStoredAccessToken();
    if (token) {
      const payload = parseJwtPayload(token);
      if (payload) {
        if (isSuperAdminRole(payload.globalRole)) return true;
        const maybeRoles =
          payload.roles ||
          payload.authorities ||
          payload.role ||
          (payload.realm_access as { roles?: unknown })?.roles;
        if (
          Array.isArray(maybeRoles) &&
          maybeRoles.some((r: unknown) => {
            if (typeof r === "string") return isSuperAdminRole(r);
            if (r && typeof r === "object") {
              const rr = r as Record<string, unknown>;
              const rn =
                rr.roleName ?? rr.role_name ?? rr.role ?? rr.name ?? rr.authority;
              return isSuperAdminRole(rn);
            }
            return false;
          })
        ) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  try {
    const token = getStoredAccessToken();
    if (token) {
      const rolesStr =
        localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (!rolesStr) syncRolesFromAccessToken(token);
    }
  } catch {
    // ignore
  }

  const isSuperAdminAPI = config.url?.includes("/api/v1/superadmin/");
  const isOTApprovalAPI = config.url?.includes("/api/v1/superadmin/ot");
  if (isSuperAdminAPI && !isSuperAdminUser()) {
    if (!isOTApprovalAPI) {
      return Promise.reject({
        message: "FORBIDDEN_CLIENT: ADMIN users cannot access SUPERADMIN endpoints",
        config,
        silent: true,
      });
    }
  }

  const publicPath = isPublicPath(config.url);
  const publicWithCreds = isPublicPathWithCredentials(config.url);

  if (publicPath && !publicWithCreds) {
    config.withCredentials = false;
  } else {
    if (publicWithCreds) {
      config.withCredentials = true;
    }
    if (!publicPath) {
      let token: string | null = getStoredAccessToken();
      if (token && isTokenExpired(token)) {
        token = await tryRefreshAccessToken();
      }
      if (token && !isTokenExpired(token)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.status >= 200 && response.status < 300) {
      clearRefreshFailureCooldown();
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && config && !config._retry && !isAuthRefreshExcludedUrl(config.url)) {
      config._retry = true;
      const newToken = await tryRefreshAccessToken();
      if (newToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }

      const currentPath = window.location.pathname;
      if (!isAuthPagePath(currentPath) && !isRedirecting) {
        redirectToSignIn();
      }

      const isNotificationAPI = config.url?.includes("/auth/notifications");
      if (isNotificationAPI && isAuthPagePath(currentPath)) {
        return Promise.reject({ ...error, silent: true });
      }
    }

    if (status === 403) {
      console.warn(
        "403 Forbidden:",
        (error.response?.data as { message?: string })?.message || error.message
      );
    }

    return Promise.reject(error);
  }
);

export default api;
