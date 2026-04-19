import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { downloadUserAnalyticsUsersExport } from "../../api/userAnalytics.api";
import {
  HiArrowLeft,
  HiArrowRight,
  HiLightningBolt,
  HiChartBar,
  HiChevronDown,
  HiLogin,
  HiUserGroup,
} from "react-icons/hi";
import {
  STATUS_META,
  type EngagementStatus,
} from "./userAnalyticsMock";
import {
  buildMockUserListCsvBlob,
  buildUserAnalyticsListExportParams,
  getVisiblePages,
  triggerBlobDownload,
} from "./userAnalyticsHelpers";
import UserAnalyticsAvatar from "./UserAnalyticsAvatar";
import { useUserAnalyticsListData } from "./useUserAnalyticsListData";

function TrendPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`text-xs font-semibold ${
        positive ? "text-emerald-600" : "text-red-600"
      }`}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function ScoreBar({ score, barClass }: { score: number; barClass: string }) {
  const width = Math.min(100, Math.max(0, score));
  return (
    <div className="mt-1.5 h-1.5 w-full max-w-full overflow-hidden rounded-full bg-slate-100 sm:max-w-[120px]">
      <div
        className={`h-full rounded-full transition-all ${barClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  trend,
  icon: Icon,
  iconWrapClass,
}: {
  title: string;
  value: string;
  trend: number;
  icon: typeof HiUserGroup;
  iconWrapClass: string;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="absolute right-4 top-4">
        <TrendPill value={trend} />
      </div>
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconWrapClass}`}
      >
        <Icon className="h-6 w-6 text-white" aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}

export default function ListActivity() {
  const [deptAll, setDeptAll] = useState(true);
  const [deptTech, setDeptTech] = useState(false);
  const [deptDesign, setDeptDesign] = useState(false);
  const [deptOps, setDeptOps] = useState(false);

  const [statusFilter, setStatusFilter] = useState<EngagementStatus | "all">(
    "all"
  );

  const [sortBy, setSortBy] = useState("score");
  const [page, setPage] = useState(1);
  const [appliedDept, setAppliedDept] = useState<{
    all: boolean;
    tech: boolean;
    design: boolean;
    ops: boolean;
  }>({ all: true, tech: false, design: false, ops: false });

  const [exporting, setExporting] = useState(false);

  const {
    liveApi,
    summary,
    loading,
    error,
    reload,
    pageRows,
    totalUsers,
    totalPages,
    safePage,
    loadingSummary,
    loadingTable,
    mockRowsForExport,
  } = useUserAnalyticsListData(appliedDept, statusFilter, sortBy, page);

  async function handleExportList() {
    setExporting(true);
    try {
      if (liveApi) {
        const blob = await downloadUserAnalyticsUsersExport(
          buildUserAnalyticsListExportParams(
            appliedDept,
            statusFilter,
            sortBy
          )
        );
        triggerBlobDownload(blob, "user-analytics-users.csv");
        toast.success("Đã tải file CSV.");
      } else {
        const rows = mockRowsForExport ?? [];
        const blob = buildMockUserListCsvBlob(rows);
        triggerBlobDownload(blob, "user-analytics-users-mock.csv");
        toast.success("Đã xuất CSV (dữ liệu mẫu).");
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Không xuất được CSV.";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [statusFilter, appliedDept, sortBy]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  function toggleDeptAll() {
    const next = !deptAll;
    setDeptAll(next);
    if (next) {
      setDeptTech(false);
      setDeptDesign(false);
      setDeptOps(false);
    }
  }

  return (
    <section className="min-h-screen min-w-0 overflow-x-hidden bg-[#F8F9FA] text-slate-900">
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Phân tích người dùng
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi mức độ đăng nhập và tương tác trên hệ thống (Super Admin).
          </p>
          {!liveApi && (
            <p className="mt-2 text-xs text-amber-700">
              Đang dùng dữ liệu mẫu. Bật API:{" "}
              <code className="rounded bg-amber-100 px-1">VITE_USE_USER_ANALYTICS_API=true</code>{" "}
              khi backend đã triển khai.
            </p>
          )}
        </div>

        {liveApi && error && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => reload()}
              className="rounded-lg bg-red-100 px-3 py-1.5 font-semibold text-red-900 hover:bg-red-200"
            >
              Thử lại
            </button>
          </div>
        )}

        <div
          className={`mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 ${
            liveApi && loadingSummary ? "opacity-60" : ""
          }`}
        >
          <MetricCard
            title="Người dùng hoạt động"
            value={summary.activeUsers}
            trend={summary.trends.active}
            icon={HiUserGroup}
            iconWrapClass="bg-blue-600 shadow-sm shadow-blue-600/25"
          />
          <MetricCard
            title="Tổng lượt đăng nhập"
            value={summary.totalLogins}
            trend={summary.trends.logins}
            icon={HiLogin}
            iconWrapClass="bg-sky-600 shadow-sm shadow-sky-600/25"
          />
          <MetricCard
            title="Tổng sự kiện"
            value={summary.totalEvents}
            trend={summary.trends.events}
            icon={HiLightningBolt}
            iconWrapClass="bg-indigo-600 shadow-sm shadow-indigo-600/25"
          />
          <MetricCard
            title="Điểm tương tác TB"
            value={summary.avgScore}
            trend={summary.trends.score}
            icon={HiChartBar}
            iconWrapClass="bg-violet-600 shadow-sm shadow-violet-600/25"
          />
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Filters sidebar */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold tracking-wide text-slate-400">
                BỘ LỌC DỮ LIỆU
              </p>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800">
                  Phòng ban
                </p>
                <div className="mt-3 space-y-2.5 text-sm text-slate-700">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={deptAll}
                      onChange={toggleDeptAll}
                    />
                    Tất cả
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={deptTech}
                      disabled={deptAll}
                      onChange={(e) => setDeptTech(e.target.checked)}
                    />
                    Kỹ thuật
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={deptDesign}
                      disabled={deptAll}
                      onChange={(e) => setDeptDesign(e.target.checked)}
                    />
                    Kinh doanh
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={deptOps}
                      disabled={deptAll}
                      onChange={(e) => setDeptOps(e.target.checked)}
                    />
                    Vận hành
                  </label>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-6">
                <p className="text-sm font-semibold text-slate-800">
                  Trạng thái
                </p>
                <div className="mt-3 space-y-2.5 text-sm text-slate-700">
                  {(
                    [
                      ["all", "Tất cả"],
                      ["high", "Tương tác cao"],
                      ["view_only", "Chỉ xem"],
                      ["low", "Tần suất thấp"],
                      ["inactive", "Không hoạt động"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <input
                        type="radio"
                        name="engagement-status"
                        className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={statusFilter === value}
                        onChange={() => setStatusFilter(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAppliedDept({
                    all: deptAll,
                    tech: deptTech,
                    design: deptDesign,
                    ops: deptOps,
                  })
                }
                className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Áp dụng lọc
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-900 p-5 text-white shadow-md">
              <p className="text-xs font-semibold tracking-wide text-slate-400">
                XUẤT BÁO CÁO
              </p>
              <p className="mt-2 text-sm text-slate-200">
                Phân tích người dùng hàng tháng đã sẵn sàng.
              </p>
              <button
                type="button"
                onClick={() => void handleExportList()}
                disabled={exporting || loading}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? "Đang xuất…" : "Export Data"}
                <span aria-hidden>→</span>
              </button>
            </div>
          </aside>

          {/* Main table */}
          <div className="min-w-0 flex-1">
            <div
              className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
                liveApi && loadingTable ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                  Danh sách người dùng chuyên sâu
                </h2>
                <div className="relative flex w-full min-w-0 flex-col gap-2 sm:inline-flex sm:w-auto sm:flex-row sm:items-center">
                  <span className="shrink-0 text-sm text-slate-500">Sắp xếp theo:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full min-w-0 appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-auto"
                  >
                    <option value="score">Điểm tương tác</option>
                    <option value="logins">Lượt đăng nhập</option>
                    <option value="activeDays">Ngày hoạt động</option>
                    <option value="name">Tên</option>
                  </select>
                  <HiChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                </div>
              </div>

              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[720px] w-full divide-y divide-slate-100 text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="whitespace-nowrap px-3 py-3 sm:px-5">Người dùng</th>
                      <th className="whitespace-nowrap px-3 py-3 sm:px-5">Phòng ban</th>
                      <th className="whitespace-nowrap px-3 py-3 sm:px-5">Trạng thái</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right sm:px-5">
                        Ngày hoạt động
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-right sm:px-5">
                        Đăng nhập
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 sm:px-5">Điểm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pageRows.map((user) => {
                      const meta = STATUS_META[user.status];
                      return (
                        <tr
                          key={user.id}
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer hover:bg-slate-50/80 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                          onClick={() =>
                            navigate(`/superadmin/user-analytics/${user.id}`)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/superadmin/user-analytics/${user.id}`);
                            }
                          }}
                        >
                          <td className="px-3 py-4 sm:px-5">
                            <div className="flex items-center gap-3">
                              <UserAnalyticsAvatar
                                name={user.name}
                                avatarUrl={user.avatarUrl}
                                className="h-10 w-10"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {user.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 text-slate-700 sm:px-5">
                            {user.department}
                          </td>
                          <td className="px-3 py-4 sm:px-5">
                            <span
                              className={`inline-flex max-w-[9rem] flex-wrap rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide sm:max-w-none sm:text-[11px] ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-right font-medium tabular-nums text-slate-800 sm:px-5">
                            {user.activeDays}
                          </td>
                          <td className="px-3 py-4 text-right font-medium tabular-nums text-slate-800 sm:px-5">
                            {user.logins}
                          </td>
                          <td className="min-w-[5.5rem] px-3 py-4 sm:px-5">
                            <div className="font-semibold tabular-nums text-slate-900">
                              {user.score.toFixed(1)}
                            </div>
                            <ScoreBar
                              score={user.score}
                              barClass={meta.barClass}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-center text-sm text-slate-500 sm:text-left">
                  Đang hiển thị{" "}
                  <span className="font-semibold text-slate-800">
                    {pageRows.length}
                  </span>{" "}
                  trên{" "}
                  <span className="font-semibold text-slate-800">
                    {totalUsers.toLocaleString("vi-VN")}
                  </span>{" "}
                  người dùng
                </p>
                <nav
                  className="flex flex-wrap items-center justify-center gap-1 sm:justify-end"
                  aria-label="Phân trang"
                >
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1 || loading}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Trang trước"
                  >
                    <HiArrowLeft className="h-4 w-4" />
                  </button>
                  {getVisiblePages(safePage, totalPages, 5).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      disabled={loading}
                      className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg px-2 text-sm font-semibold ${
                        safePage === n
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={safePage >= totalPages || loading}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Trang sau"
                  >
                    <HiArrowRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
