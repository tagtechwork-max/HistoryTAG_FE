import axios from "axios";

export type TokenRefreshResponse = {
  accessToken: string;
  typeToken: string;
  expiresIn: number;
};

/**
 * Exchange httpOnly refresh_token cookie for a new access JWT.
 * Uses standalone axios (not api client) to avoid interceptor loops.
 */
export async function refreshAccessToken(): Promise<TokenRefreshResponse> {
  const baseURL = import.meta.env.VITE_API_URL;
  const { data } = await axios.post<TokenRefreshResponse>(
    `${baseURL}/api/v1/public/refresh`,
    {},
    {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    }
  );
  return data;
}
