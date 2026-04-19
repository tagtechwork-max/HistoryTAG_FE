import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchUserAnalyticsSummary,
  fetchUserAnalyticsUsers,
  type UserAnalyticsListParams,
} from "../../api/userAnalytics.api";
import type { EngagementStatus } from "./userAnalyticsMock";
import { MOCK_USERS } from "./userAnalyticsMock";
import {
  departmentsFromApplied,
  rowDtoToUserRow,
  summaryDtoToCardState,
} from "./userAnalyticsHelpers";
import type { UserRow } from "./userAnalyticsMock";

const PAGE_SIZE = 10;

function useLiveApiFlag(): boolean {
  return import.meta.env.VITE_USE_USER_ANALYTICS_API === "true";
}

type SummaryView = {
  activeUsers: string;
  totalLogins: string;
  totalEvents: string;
  avgScore: string;
  trends: {
    active: number;
    logins: number;
    events: number;
    score: number;
  };
};

const MOCK_SUMMARY: SummaryView = {
  activeUsers: "12,842",
  totalLogins: "84,920",
  totalEvents: "312,481",
  avgScore: "85.4/100",
  trends: { active: 12.5, logins: 5.2, events: -2.4, score: 8.1 },
};

export function useUserAnalyticsListData(
  appliedDept: {
    all: boolean;
    tech: boolean;
    design: boolean;
    ops: boolean;
  },
  statusFilter: EngagementStatus | "all",
  sortBy: string,
  page: number
) {
  const liveApi = useLiveApiFlag();

  const [summary, setSummary] = useState<SummaryView>(MOCK_SUMMARY);
  const [apiRows, setApiRows] = useState<UserRow[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!liveApi) return;
    setLoadingSummary(true);
    setError(null);
    try {
      const dto = await fetchUserAnalyticsSummary({ periodDays: 30 });
      setSummary(summaryDtoToCardState(dto));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Không tải được tổng quan.";
      setError(msg);
    } finally {
      setLoadingSummary(false);
    }
  }, [liveApi]);

  const loadUsers = useCallback(async () => {
    if (!liveApi) return;
    setLoadingTable(true);
    setError(null);
    try {
      const dept = departmentsFromApplied(appliedDept);
      const params: UserAnalyticsListParams = {
        periodDays: 30,
        page: Math.max(0, page - 1),
        size: PAGE_SIZE,
        sortBy: sortBy as UserAnalyticsListParams["sortBy"],
        sortDir: sortBy === "name" ? "asc" : "desc",
      };
      if (statusFilter !== "all") {
        params.engagementStatus = statusFilter;
      }
      if (dept?.length) {
        params.department = dept;
      }
      const pageDto = await fetchUserAnalyticsUsers(params);
      setApiRows(pageDto.content.map(rowDtoToUserRow));
      setTotalElements(pageDto.totalElements);
      setTotalPages(Math.max(1, pageDto.totalPages));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Không tải được danh sách.";
      setError(msg);
      setApiRows([]);
    } finally {
      setLoadingTable(false);
    }
  }, [liveApi, appliedDept, statusFilter, sortBy, page]);

  useEffect(() => {
    if (liveApi) {
      void loadSummary();
    }
  }, [liveApi, loadSummary]);

  useEffect(() => {
    if (liveApi) {
      void loadUsers();
    }
  }, [liveApi, loadUsers]);

  const mockFiltered = useMemo(() => {
    let rows = [...MOCK_USERS];
    if (statusFilter !== "all") {
      rows = rows.filter((u) => u.status === statusFilter);
    }
    if (!appliedDept.all) {
      const allow = new Set<string>();
      if (appliedDept.tech) allow.add("Kỹ thuật");
      if (appliedDept.design) allow.add("Thiết kế");
      if (appliedDept.ops) allow.add("Vận hành");
      if (allow.size > 0) {
        rows = rows.filter((u) => allow.has(u.department));
      }
    }
    rows.sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "logins") return b.logins - a.logins;
      if (sortBy === "activeDays") return b.activeDays - a.activeDays;
      return a.name.localeCompare(b.name, "vi");
    });
    return rows;
  }, [statusFilter, sortBy, appliedDept]);

  const mockTotalPages = Math.max(
    1,
    Math.ceil(mockFiltered.length / PAGE_SIZE)
  );
  const mockPage = Math.min(page, mockTotalPages);
  const mockSlice = mockFiltered.slice(
    (mockPage - 1) * PAGE_SIZE,
    mockPage * PAGE_SIZE
  );

  return {
    liveApi,
    summary,
    loadingSummary,
    loadingTable,
    error,
    reload: () => {
      void loadSummary();
      void loadUsers();
    },
    pageRows: liveApi ? apiRows : mockSlice,
    totalUsers: liveApi ? totalElements : mockFiltered.length,
    totalPages: liveApi ? totalPages : mockTotalPages,
    safePage: liveApi ? Math.min(page, Math.max(1, totalPages)) : mockPage,
    pageSize: PAGE_SIZE,
    loading: liveApi && (loadingSummary || loadingTable),
    /** Full filtered mock rows (same filters/sort as table); undefined when API mode. */
    mockRowsForExport: liveApi ? undefined : mockFiltered,
  };
}
