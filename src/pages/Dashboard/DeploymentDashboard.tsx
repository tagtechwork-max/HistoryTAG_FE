import { useState, useMemo } from "react";
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

// ---------------------------------------------------------------------------
// Mock data (replace with API later)
// ---------------------------------------------------------------------------

export type DeploymentKPISummary = {
  totalInProgress: number;
  completedThisMonth: number;
  atRisk: number;
  blocked: number;
  reportDeadlineSoon: number;
  goLiveDeadlineSoon: number;
  goLiveOverdue?: number;
  totalBlockedTasks: number;
};

const MOCK_KPI: DeploymentKPISummary = {
  totalInProgress: 24,
  completedThisMonth: 12,
  atRisk: 3,
  blocked: 2,
  reportDeadlineSoon: 8,
  goLiveDeadlineSoon: 2,
  goLiveOverdue: 3,
  totalBlockedTasks: 2,
};

const MOCK_PHASE_DATA: PhaseCount[] = [
  { phase: 1, label: "GĐ 1", count: 8, fullLabel: "GĐ 1: Thu thập thông tin (8 dự án)" },
  { phase: 2, label: "GĐ 2", count: 6, fullLabel: "GĐ 2: Lắp đặt cơ bản (6 dự án)" },
  { phase: 3, label: "GĐ 3", count: 7, fullLabel: "GĐ 3: Giám sát & khắc phục (7 dự án)" },
  { phase: 4, label: "GĐ 4", count: 3, fullLabel: "GĐ 4: Nghiệm thu & vận hành (3 dự án)" },
];

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
function getMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
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

  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [pmFilter, setPmFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const currentMonthLabel = useMemo(() => {
    const opt = monthOptions.find((o) => o.value === monthValue);
    return opt?.label ?? "Tháng hiện tại";
  }, [monthValue, monthOptions]);

  const kpi = MOCK_KPI;
  const atRiskBlocked = kpi.atRisk + kpi.blocked;
  const goLiveTrend = (kpi.goLiveOverdue ?? 0) > 0 ? `${kpi.goLiveOverdue} trễ` : undefined;

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
                {MOCK_PM_WORKLOAD.map((pm) => (
                  <option key={pm.pmUserId} value={String(pm.pmUserId)}>
                    {pm.pmName}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 md:gap-6">
          <KPIStatCard
            icon={<TaskIcon />}
            label="Tổng bệnh viện đang triển khai"
            value={kpi.totalInProgress}
            trend="+12%"
            variant="normal"
          />
          <KPIStatCard
            icon={<CheckCircleIcon />}
            label="Đã hoàn thành (tháng này)"
            value={kpi.completedThisMonth}
            trend="+4"
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

        {/* Section 2 — Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DeploymentPhaseChart data={MOCK_PHASE_DATA} />
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
