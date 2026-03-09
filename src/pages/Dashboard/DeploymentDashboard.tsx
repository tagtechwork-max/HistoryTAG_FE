import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import {
  KPIStatCard,
  DeploymentPhaseChart,
  HealthStatusChart,
  AttentionTable,
  PMWorkloadTable,
  type PhaseCount,
  type HealthCount,
  type AttentionRow,
  type PMWorkloadRow,
} from "../../components/deployment-dashboard";
import {
  TaskIcon,
  CheckCircleIcon,
  AlertIcon,
  CalenderIcon,
  ErrorHexaIcon,
  DocsIcon,
  ChevronDownIcon,
  UserIcon,
  HorizontaLDots,
} from "../../icons";
import {
  fetchDeploymentDashboardSummary,
  fetchDeploymentDashboardByPhase,
  fetchUserDeploymentOptions,
  type DeploymentDashboardSummary,
  type UserDeploymentOption,
} from "../../api/api";

// ---------------------------------------------------------------------------
// Mock data (replace with API later where not yet implemented)
// ---------------------------------------------------------------------------

/** Default KPI when API has not loaded yet (all zeros) */
const DEFAULT_KPI: DeploymentDashboardSummary = {
  totalTasks: 0,
  totalInProgress: 0,
  totalTransferredToMaintenance: 0,
  completedTotal: 0,
  completedThisMonth: 0,
  atRisk: 0,
  blocked: 0,
  reportDeadlineSoon: 0,
  goLiveDeadlineSoon: 0,
  goLiveOverdue: 0,
  totalBlockedTasks: 0,
};

const MOCK_PHASE_DATA: PhaseCount[] = [
  { phase: 1, label: "GĐ 1", count: 8, fullLabel: "GĐ 1: Thu thập thông tin (8 dự án)" },
  { phase: 2, label: "GĐ 2", count: 6, fullLabel: "GĐ 2: Lắp đặt cơ bản (6 dự án)" },
  { phase: 3, label: "GĐ 3", count: 7, fullLabel: "GĐ 3: Giám sát & khắc phục (7 dự án)" },
  { phase: 4, label: "GĐ 4", count: 3, fullLabel: "GĐ 4: Nghiệm thu & vận hành (3 dự án)" },
];

/** Default phase data when API has not loaded (all zeros). */
const DEFAULT_PHASE_DATA: PhaseCount[] = [1, 2, 3, 4].map((p) => ({
  phase: p,
  label: `GĐ ${p}`,
  count: 0,
  fullLabel: `GĐ ${p} (0 dự án)`,
}));

const MOCK_HEALTH_DATA: HealthCount[] = [
  { status: "in_progress", label: "Đang thực hiện", count: 12, color: "#22c55e" },
  { status: "at_risk", label: "Rủi ro", count: 5, color: "#f59e0b" },
  { status: "blocked", label: "Bị chặn", count: 2, color: "#ef4444" },
  { status: "completed", label: "Hoàn thành", count: 5, color: "#3b82f6" },
];

const MOCK_ATTENTION: AttentionRow[] = [
  {
    id: 1,
    hospitalName: "BV Đa khoa Xanh Pôn",
    projectCode: "XP-2023-01",
    pmName: "Nguyễn Văn A",
    phase: 3,
    phaseLabel: "Giai đoạn 3",
    reportDeadline: "Hôm nay",
    goLiveDeadline: "15/12/2023",
    health: "at_risk",
    healthLabel: "Rủi ro",
  },
  {
    id: 2,
    hospitalName: "BV Nhi Trung Ương",
    projectCode: "NTU-2023-04",
    pmName: "Trần Thị B",
    phase: 2,
    phaseLabel: "Giai đoạn 2",
    reportDeadline: "10/12/2023",
    goLiveDeadline: "Quá hạn 2 ngày",
    health: "blocked",
    healthLabel: "Bị chặn",
  },
  {
    id: 3,
    hospitalName: "BV Bạch Mai",
    projectCode: "BM-2023-09",
    pmName: "Lê Văn C",
    phase: 4,
    phaseLabel: "Giai đoạn 4",
    reportDeadline: "12/12/2023",
    goLiveDeadline: "20/12/2023",
    health: "in_progress",
    healthLabel: "Đang triển khai",
  },
  {
    id: 4,
    hospitalName: "Trung tâm Y tế TP Thủ Đức",
    projectCode: "TD-2023-11",
    pmName: "Nguyễn Văn A",
    phase: 1,
    phaseLabel: "Giai đoạn 1",
    reportDeadline: "15/12/2023",
    goLiveDeadline: "30/01/2024",
    health: "in_progress",
    healthLabel: "Đang triển khai",
  },
];

const MOCK_PM_WORKLOAD: PMWorkloadRow[] = [
  { pmUserId: 1, pmName: "Nguyễn Văn A", roleLabel: "Senior PM", projectCount: 8, atRiskCount: 2, deadlineSoonCount: 3 },
  { pmUserId: 2, pmName: "Trần Thị B", roleLabel: "PM", projectCount: 5, atRiskCount: 1, deadlineSoonCount: 1 },
  { pmUserId: 3, pmName: "Lê Văn C", roleLabel: "PM", projectCount: 6, atRiskCount: 0, deadlineSoonCount: 2 },
  { pmUserId: 4, pmName: "Phạm Minh D", roleLabel: "Junior PM", projectCount: 5, atRiskCount: 2, deadlineSoonCount: 2 },
];

// ---------------------------------------------------------------------------
// Month options for filter
// ---------------------------------------------------------------------------
const MONTH_ALL_VALUE = "all";

function getMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [{ value: MONTH_ALL_VALUE, label: "Tất cả" }];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

export default function DeploymentDashboard() {
  const location = useLocation();
  const isSuperAdmin = location.pathname.startsWith("/superadmin");
  const basePath = isSuperAdmin ? "/superadmin/implementation-tasks-new" : "/implementation-tasks-new";
  const viewAllHref = basePath;

  const [monthValue, setMonthValue] = useState(() => MONTH_ALL_VALUE);
  const [pmFilter, setPmFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kpiSummary, setKpiSummary] = useState<DeploymentDashboardSummary | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [pmOptions, setPmOptions] = useState<UserDeploymentOption[]>([]);
  const [phaseData, setPhaseData] = useState<PhaseCount[]>(DEFAULT_PHASE_DATA);

  // Load PM options (real list) once on mount
  useEffect(() => {
    fetchUserDeploymentOptions()
      .then(setPmOptions)
      .catch(() => setPmOptions([]));
  }, []);

  // Load KPI summary when month or PM filter changes
  useEffect(() => {
    let cancelled = false;
    setKpiError(null);
    setKpiLoading(true);
    fetchDeploymentDashboardSummary({
      month: monthValue === MONTH_ALL_VALUE ? undefined : monthValue,
      pmUserId: pmFilter === "all" ? undefined : Number(pmFilter),
    })
      .then((data) => {
        if (!cancelled) setKpiSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setKpiError(err?.message ?? "Không tải được dữ liệu KPI");
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthValue, pmFilter]);

  // Load phase chart data when month or PM filter changes
  useEffect(() => {
    let cancelled = false;
    fetchDeploymentDashboardByPhase({
      month: monthValue === MONTH_ALL_VALUE ? undefined : monthValue,
      pmUserId: pmFilter === "all" ? undefined : Number(pmFilter),
    })
      .then((data) => {
        if (!cancelled) setPhaseData(Array.isArray(data) ? data : DEFAULT_PHASE_DATA);
      })
      .catch(() => {
        if (!cancelled) setPhaseData(DEFAULT_PHASE_DATA);
      });
    return () => {
      cancelled = true;
    };
  }, [monthValue, pmFilter]);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const currentMonthLabel = useMemo(() => {
    if (monthValue === MONTH_ALL_VALUE) return "";
    const opt = monthOptions.find((o) => o.value === monthValue);
    return opt?.label ?? "";
  }, [monthValue, monthOptions]);

  const kpi = kpiSummary ?? DEFAULT_KPI;
  const atRiskBlocked = kpi.atRisk + kpi.blocked;
  const goLiveTrend = (kpi.goLiveOverdue ?? 0) > 0 ? `${kpi.goLiveOverdue} trễ` : undefined;
  const totalTransferred = kpi.totalTransferredToMaintenance ?? 0;
  const firstCardTrend =
    kpiLoading
      ? "..."
      : [ kpi.totalInProgress > 0 && `${kpi.totalInProgress} đang triển khai`]
          .filter(Boolean)
          .join(", ") || "—";

  return (
    <>
      <PageMeta
        title="Thống kê triển khai | TAGTECH"
        description="Dashboard thống kê triển khai bệnh viện"
      />
      <div className="space-y-6">
        {/* Breadcrumb */}
        {/* <nav className="text-sm text-gray-500 dark:text-gray-400">
          <Link to="/home" className="hover:text-gray-700 dark:hover:text-gray-300">
            Trang chủ
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 dark:text-gray-200">Thống kê triển khai</span>
        </nav> */}

        {/* Title + Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Thống kê triển khai
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <CalenderIcon className="ml-3 size-4 text-gray-500 dark:text-gray-400" />
              <select
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="w-full min-w-[140px] appearance-none bg-transparent py-2 pl-9 pr-8 text-sm text-gray-700 dark:text-gray-200"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 size-4 text-gray-500" />
            </div>
            <div className="relative flex items-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <UserIcon className="ml-3 size-4 text-gray-500 dark:text-gray-400" />
              <select
                value={pmFilter}
                onChange={(e) => setPmFilter(e.target.value)}
                className="w-full min-w-[140px] appearance-none bg-transparent py-2 pl-9 pr-8 text-sm text-gray-700 dark:text-gray-200"
              >
                <option value="all">Tất cả phụ trách</option>
                {pmOptions.map((pm) => (
                  <option key={pm.id} value={String(pm.id)}>
                    {pm.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 size-4 text-gray-500" />
            </div>
            {/* <div className="relative flex items-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <HorizontaLDots className="ml-3 size-4 text-gray-500 dark:text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full min-w-[160px] appearance-none bg-transparent py-2 pl-9 pr-8 text-sm text-gray-700 dark:text-gray-200"
              >
                <option value="all">Trạng thái: Tất cả</option>
                <option value="in_progress">Đang triển khai</option>
                <option value="at_risk">Rủi ro</option>
                <option value="blocked">Bị chặn</option>
                <option value="completed">Hoàn thành</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-2 size-4 text-gray-500" />
            </div> */}
          </div>
        </div>

        {/* Section 1 — KPI Cards */}
        <div className="space-y-2">
          {kpiError && (
            <p className="text-sm text-red-600 dark:text-red-400">{kpiError}</p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 md:gap-6">
            <KPIStatCard
              icon={<TaskIcon />}
              label="Tổng số dự án"
              value={kpi.totalTasks ?? kpi.totalInProgress}
              trend={firstCardTrend}
              variant="normal"
            />
            <KPIStatCard
              icon={<CheckCircleIcon />}
              label="Đã hoàn thành"
              value={
                monthValue === MONTH_ALL_VALUE
                  ? (kpi.completedTotal ?? kpi.completedThisMonth)
                  : (kpi.completedThisMonth ?? 0)
              }
              variant="normal"
            />
          {/* <KPIStatCard
            icon={<AlertIcon />}
            label="Có rủi ro / Bị chặn"
            value={atRiskBlocked}
            trend="+2"
            variant="warning"
          /> */}
          <KPIStatCard
            icon={<CalenderIcon />}
            label="Sắp đến hạn báo cáo"
            value={kpi.reportDeadlineSoon}
            variant="normal"
          />
          <KPIStatCard
            icon={<ErrorHexaIcon />}
            label="Sắp / Quá hạn go-live"
            value={kpi.goLiveDeadlineSoon + (kpi.goLiveOverdue ?? 0)}
            trend={goLiveTrend}
            variant="danger"
          />
          <KPIStatCard
            icon={<DocsIcon />}
            label="Tổng task đang bị chặn"
            value={kpi.totalBlockedTasks}
            variant="danger"
          />
        </div>
        </div>

        {/* Section 2 — Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DeploymentPhaseChart data={phaseData} />
          <HealthStatusChart data={MOCK_HEALTH_DATA} totalLabel="TỔNG SỐ" />
        </div>

        {/* Section 3 — Attention Table */}
        <AttentionTable
          rows={MOCK_ATTENTION.map((r) => ({ ...r, basePath }))}
          viewAllHref={viewAllHref}
          basePath={basePath}
        />

        {/* Section 4 — PM Workload */}
        <PMWorkloadTable rows={MOCK_PM_WORKLOAD} />
      </div>
    </>
  );
}
