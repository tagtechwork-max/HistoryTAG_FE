import axios from "axios";

export type TokenRefreshResponse = {
  accessToken: string;
  typeToken: string;
  expiresIn: number;
};

/** Same-origin (Docker/nginx): empty. Cross-origin dev: full API origin. */
function refreshEndpointUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (raw == null || raw === "" || String(raw) === "undefined") {
    return "/api/v1/public/refresh";
  }
  const base = String(raw).replace(/\/+$/, "");
  return `${base}/api/v1/public/refresh`;
}

/**
 * Exchange httpOnly refresh_token cookie for a new access JWT.
 * Uses standalone axios (not api client) to avoid interceptor loops.
 */
export async function refreshAccessToken(): Promise<TokenRefreshResponse> {
  const { data } = await axios.post<TokenRefreshResponse>(
    refreshEndpointUrl(),
    {},
    {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    }
  );
  return data;
}
