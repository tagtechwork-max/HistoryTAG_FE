import type {
  UserAnalyticsListParams,
  UserAnalyticsRowDTO,
  UserAnalyticsSummaryDTO,
} from "../../api/userAnalytics.api";
import type { EngagementStatus, UserRow } from "./userAnalyticsMock";

export type AppliedDeptState = {
  all: boolean;
  tech: boolean;
  design: boolean;
  ops: boolean;
};

/** Same department string list as API list requests (comma-joined on the wire). */
export function departmentsFromApplied(
  applied: AppliedDeptState
): string[] | undefined {
  if (applied.all) return undefined;
  const list: string[] = [];
  if (applied.tech) list.push("Kỹ thuật");
  if (applied.design) list.push("Thiết kế");
  if (applied.ops) list.push("Vận hành");
  return list.length ? list : undefined;
}

/** Query params aligned with list API (no pagination). */
export function buildUserAnalyticsListExportParams(
  appliedDept: AppliedDeptState,
  statusFilter: EngagementStatus | "all",
  sortBy: string
): Omit<UserAnalyticsListParams, "page" | "size"> {
  const dept = departmentsFromApplied(appliedDept);
  const params: Omit<UserAnalyticsListParams, "page" | "size"> = {
    periodDays: 30,
    sortBy: sortBy as UserAnalyticsListParams["sortBy"],
    sortDir: sortBy === "name" ? "asc" : "desc",
  };
  if (statusFilter !== "all") {
    params.engagementStatus = statusFilter;
  }
  if (dept?.length) {
    params.department = dept;
  }
  return params;
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Client-side CSV for mock list export (UTF-8 BOM), same column layout as backend. */
export function buildMockUserListCsvBlob(rows: UserRow[]): Blob {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  const ps = start.toISOString().slice(0, 10);
  const pe = end.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(
    `period_start,${csvCell(ps)},period_end,${csvCell(pe)}`
  );
  lines.push(
    "id,name,email,department,engagement_status,active_days,logins,score"
  );
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.name,
        r.email,
        r.department,
        r.status,
        r.activeDays,
        r.logins,
        r.score,
      ]
        .map((c) => csvCell(c))
        .join(",")
    );
  }
  const bom = "\uFEFF";
  return new Blob([bom + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Map API summary DTO to MetricCard props (defensive: older/partial API may omit nested fields). */
export function summaryDtoToCardState(dto: UserAnalyticsSummaryDTO) {
  const scoreBlock = dto.averageEngagementScore ?? {
    value: 0,
    changePercent: 0,
    max: 100,
  };
  const max = scoreBlock.max ?? 100;
  const avg = Number(scoreBlock.value ?? 0);

  const activeUsers = dto.activeUsers ?? { value: 0, changePercent: 0 };
  const totalLogins = dto.totalLogins ?? { value: 0, changePercent: 0 };
  const totalEvents = dto.totalEvents ?? { value: 0, changePercent: 0 };

  return {
    activeUsers: Number(activeUsers.value ?? 0).toLocaleString("vi-VN"),
    totalLogins: Number(totalLogins.value ?? 0).toLocaleString("vi-VN"),
    totalEvents: Number(totalEvents.value ?? 0).toLocaleString("vi-VN"),
    avgScore: `${avg.toFixed(1)}/${max}`,
    trends: {
      active: Number(activeUsers.changePercent ?? 0),
      logins: Number(totalLogins.changePercent ?? 0),
      events: Number(totalEvents.changePercent ?? 0),
      score: Number(scoreBlock.changePercent ?? 0),
    },
  };
}

export function rowDtoToUserRow(r: UserAnalyticsRowDTO): UserRow {
  return {
    id: String(r.id),
    name: r.name,
    email: r.email,
    department: r.department,
    status: r.engagementStatus,
    activeDays: r.activeDays,
    logins: r.logins,
    score: r.score,
    avatarUrl: r.avatarUrl ?? undefined,
  };
}

/** Build visible page numbers (1-based) around current page */
export function getVisiblePages(
  currentPage: number,
  totalPages: number,
  maxButtons = 5
): number[] {
  if (totalPages <= 0) return [1];
  const tp = Math.max(1, totalPages);
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(tp, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
