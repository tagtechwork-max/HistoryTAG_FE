import api from "./client";

/**
 * User Analytics API — list + summary (Super Admin).
 * Backend: GET /api/v1/superadmin/user-analytics/...
 * Enable from FE with VITE_USE_USER_ANALYTICS_API=true.
 */

const BASE = "/api/v1/superadmin/user-analytics";

export type EngagementStatusApi =
  | "high"
  | "view_only"
  | "low"
  | "inactive";

/** KPI card value with trend vs previous period of same length */
export type MetricWithTrend = {
  value: number;
  changePercent: number;
};

export type UserAnalyticsSummaryDTO = {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  activeUsers: MetricWithTrend;
  totalLogins: MetricWithTrend;
  totalEvents: MetricWithTrend;
  averageEngagementScore: MetricWithTrend & { max: number };
};

export type UserAnalyticsRowDTO = {
  id: string;
  name: string;
  email: string;
  department: string;
  engagementStatus: EngagementStatusApi;
  activeDays: number;
  logins: number;
  score: number;
  avatarUrl?: string | null;
};

export type PageUserAnalyticsDTO = {
  content: UserAnalyticsRowDTO[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
};

export type UserAnalyticsListParams = {
  periodDays?: number;
  /** Department labels or codes — align with backend after Phase 1 */
  department?: string | string[];
  engagementStatus?: EngagementStatusApi | "all";
  sortBy?: "score" | "logins" | "activeDays" | "name";
  sortDir?: "asc" | "desc";
  page?: number;
  size?: number;
};

/**
 * GET /api/v1/superadmin/user-analytics/summary
 */
export async function fetchUserAnalyticsSummary(
  params?: Pick<UserAnalyticsListParams, "periodDays">
): Promise<UserAnalyticsSummaryDTO> {
  const { data } = await api.get<UserAnalyticsSummaryDTO>(`${BASE}/summary`, {
    params: { periodDays: params?.periodDays },
  });
  return data;
}

/**
 * GET /api/v1/superadmin/user-analytics/users
 */
export async function fetchUserAnalyticsUsers(
  params?: UserAnalyticsListParams
): Promise<PageUserAnalyticsDTO> {
  const { department, ...rest } = params ?? {};
  const { data } = await api.get<PageUserAnalyticsDTO>(`${BASE}/users`, {
    params: {
      ...rest,
      department: Array.isArray(department)
        ? department.join(",")
        : department,
    },
  });
  return data;
}

/**
 * GET .../export/users — same filters as list, no pagination; capped on server.
 */
export async function downloadUserAnalyticsUsersExport(
  params?: Omit<UserAnalyticsListParams, "page" | "size">
): Promise<Blob> {
  const { department, ...rest } = params ?? {};
  const { data } = await api.get<Blob>(`${BASE}/export/users`, {
    params: {
      ...rest,
      department: Array.isArray(department)
        ? department.join(",")
        : department,
    },
    responseType: "blob",
  });
  return data;
}
