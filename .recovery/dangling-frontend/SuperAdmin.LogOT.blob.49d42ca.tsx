import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import {
  CalenderIcon,
  BoxIconLine,
  EyeIcon,
  UserIcon,
  TimeIcon,
  ListIcon,
  CheckLineIcon,
  CloseLineIcon,
  DocsIcon,
} from "../../icons";
import {
  approveSuperAdminOTRequest,
  bulkApproveSuperAdminOTRequests,
  createOTExportJob,
  downloadOTExportFile,
  exportPeriodToExcel,
  getOTExportJobStatus,
  getSuperAdminOTRequestDetail,
  getSuperAdminOTRequests,
  getSuperAdminOTSummary,
  rejectSuperAdminOTRequest,
  type OTSuperAdminListItemDTO,
  type OTSuperAdminRequestDetailResponseDTO,
} from "../../api/ot.api";

type OTDetailEntry = {
  date: string;
  start: string;
  end: string;
  hours: number;
  otType?: "weekday" | "offday";
  desc: string;
};

type OTRequest = OTSuperAdminListItemDTO & {
  dailyEntries?: OTDetailEntry[];
  monthlyNotes?: string;
};

function buildRecentMonths(count = 12) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(currentYear, currentMonth - index, 1);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const value = `${month}/${year}`;
    return {
      value,
      label: `Tháng ${value}`,
    };
  });
}

const MONTHS = buildRecentMonths(12);

const DEPARTMENTS = [
  { value: "", label: "Tất cả phòng ban" },
  { value: "IT", label: "Kỹ thuật" },
  { value: "BUSINESS", label: "Kinh doanh" },
  { value: "ACCOUNTING", label: "Kế toán" },
];

const DEPT_LABELS: Record<string, string> = {
  IT: "Kỹ thuật",
  BUSINESS: "Kinh doanh",
  ACCOUNTING: "Kế toán",
};

function formatDeptLabel(dept: string | undefined): string {
  if (!dept?.trim()) return dept ?? "";
  return DEPT_LABELS[dept.toUpperCase()] ?? dept;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Bản nháp",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  submitted: {
    label: "Đã gửi",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  approved: {
    label: "Đã phê duyệt",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  rejected: {
    label: "Đã từ chối",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
};

function parseMonthValue(value: string) {
  const [monthStr, yearStr] = value.split("/");
  return {
    month: Number(monthStr),
    year: Number(yearStr),
  };
}

function normalizeDetail(detail: OTSuperAdminRequestDetailResponseDTO): OTRequest {
  return {
    ...detail,
    dailyEntries: (detail.dailyEntries || []).map((entry) => ({
      date: entry.date,
      start: entry.start,
      end: entry.end,
      hours: entry.hours,
      otType: entry.otType,
      desc: entry.desc,
    })),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseFileNameFromDisposition(contentDisposition?: string) {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const normalMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return normalMatch?.[1] || null;
}

export default function SuperAdminLogOT() {
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0]?.value || "01/2026");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"" | "submitted">("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [detailRequest, setDetailRequest] = useState<OTRequest | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkApproveModalOpen, setBulkApproveModalOpen] = useState(false);
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false);
  const [failedReasons, setFailedReasons] = useState<Map<number, string>>(new Map());

  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [totalHoursSum, setTotalHoursSum] = useState(0);
  const [weekdayHours, setWeekdayHours] = useState(0);
  const [offdayHours, setOffdayHours] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [periodExportLoading, setPeriodExportLoading] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const formatDateForReject = (dateStr: string) => {
    const months = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];
    const parts = dateStr.split("/");
    if (parts.length !== 3) return dateStr;
    const [d, m, y] = parts;
    const monthIdx = parseInt(m, 10) - 1;
    return `${d} ${months[monthIdx] || m}, ${y}`;
  };

  const monthParams = useMemo(() => parseMonthValue(selectedMonth), [selectedMonth]);

  const loadData = async () => {
    setLoadingList(true);
    try {
      const [summary, list] = await Promise.all([
        getSuperAdminOTSummary(monthParams.year, monthParams.month),
        getSuperAdminOTRequests({
          year: monthParams.year,
          month: monthParams.month,
          department: selectedDept || undefined,
          search: search.trim() || undefined,
          status: selectedStatus || undefined,
          page: currentPage,
          size: itemsPerPage,
        }),
      ]);

      setPendingCount(summary.pendingCount || 0);
      setApprovedCount(summary.approvedCount || 0);
      setTotalHoursSum(summary.totalHours || 0);
      setWeekdayHours(summary.weekdayHours || 0);
      // Support both { data, pagination } and Spring Page { content, totalElements, totalPages }
      const rawItems = Array.isArray(list.data) ? list.data : (list as { content?: OTRequest[] }).content ?? [];
      // Exclude draft when "Tất cả trạng thái" so only submitted/approved/rejected show (approval screen)
      const items =
        selectedStatus === ""
          ? rawItems.filter((r) => (r.status || "").toLowerCase() !== "draft")
          : rawItems;
      const total = list.pagination?.totalItems ?? (list as { totalElements?: number }).totalElements ?? 0;
      const pages = list.pagination?.totalPages ?? (list as { totalPages?: number }).totalPages ?? 1;
      setRequests(items as OTRequest[]);
      setTotalItems(total);
      setTotalPages(Math.max(1, pages));
    } catch (error) {
      console.error("Load OT data failed", error);
      toast.error("Không tải được danh sách OT. Kiểm tra kết nối hoặc quyền truy cập.");
      setRequests([]);
      setTotalItems(0);
      setTotalPages(1);
      setPendingCount(0);
      setApprovedCount(0);
      setTotalHoursSum(0);
      setWeekdayHours(0);
      setOffdayHours(0);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedDept, selectedStatus, search, currentPage, itemsPerPage]);

  useEffect(() => {
    setFailedReasons(new Map());
  }, [selectedMonth, selectedDept, selectedStatus, search, currentPage]);

  const startItem = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const detailEntries = detailRequest?.dailyEntries ?? [];
  const detailTotalHours = detailEntries.reduce((s, e) => s + e.hours, 0);
  const detailStatusLabel = detailRequest
    ? (STATUS_CONFIG[(detailRequest.status || "").toLowerCase()]?.label ?? detailRequest.status)
    : "";

  const submittedOnPage = useMemo(
    () => requests.filter((r) => (r.status || "").toLowerCase() === "submitted").map((r) => r.id),
    [requests]
  );
  const allSubmittedSelected =
    submittedOnPage.length > 0 && submittedOnPage.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSubmittedSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        submittedOnPage.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        submittedOnPage.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number, isSubmitted: boolean) => {
    if (!isSubmitted) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApproveConfirm = async () => {
    if (selectedIds.size === 0 || bulkApproveLoading) return;
    setBulkApproveLoading(true);
    setFailedReasons(new Map());
    try {
      const result = await bulkApproveSuperAdminOTRequests(Array.from(selectedIds));
      setBulkApproveModalOpen(false);
      setSelectedIds(new Set());
      await loadData();

      const { approvedCount, failedCount } = result.summary;
      if (failedCount === 0) {
        toast.success(`${approvedCount} phiếu đã được phê duyệt thành công.`);
      } else if (approvedCount === 0) {
        toast.error(`${failedCount} phiếu phê duyệt thất bại.`);
        setFailedReasons(new Map(result.failed.map((f) => [f.id, f.reason])));
      } else {
        toast.success(`${approvedCount} phiếu đã duyệt thành công, ${failedCount} phiếu thất bại.`);
        setFailedReasons(new Map(result.failed.map((f) => [f.id, f.reason])));
      }
    } catch (error) {
      console.error("Bulk approve failed", error);
      toast.error("Duyệt hàng loạt thất bại. Vui lòng thử lại.");
    } finally {
      setBulkApproveLoading(false);
    }
  };

  const openDetail = async (requestId: number) => {
    setLoadingDetail(true);
    try {
      const detail = await getSuperAdminOTRequestDetail(requestId);
      setDetailRequest(normalizeDetail(detail));
    } catch (error) {
      console.error("Load OT detail failed", error);
      toast.error("Không thể tải chi tiết phiếu OT. Vui lòng thử lại.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleApprove = async () => {
    if (!detailRequest || actionLoading) return;
    setActionLoading(true);
    try {
      await approveSuperAdminOTRequest(detailRequest.id);
      setDetailRequest(null);
      await loadData();
      toast.success("Phê duyệt phiếu OT thành công.");
    } catch (error) {
      console.error("Approve OT failed", error);
      toast.error("Phê duyệt thất bại. Vui lòng thử lại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!detailRequest || !rejectReason.trim() || actionLoading) return;
    setActionLoading(true);
    try {
      await rejectSuperAdminOTRequest(detailRequest.id, rejectReason);
      setRejectModalOpen(false);
      setRejectReason("");
      setDetailRequest(null);
      await loadData();
      toast.success("Đã từ chối phiếu OT.");
    } catch (error) {
      console.error("Reject OT failed", error);
      toast.error("Từ chối thất bại. Vui lòng thử lại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportDownload = async () => {
    if (!detailRequest || exportLoading) return;
    setExportLoading(true);
    try {
      const created = await createOTExportJob(detailRequest.id, "csv");
      let completedJobId: number | null = null;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await sleep(1500);
        const status = await getOTExportJobStatus(created.jobId);
        if (status.status === "completed") {
          completedJobId = status.jobId;
          break;
        }
        if (status.status === "failed") {
          throw new Error(status.errorMessage || "Export thất bại");
        }
      }

      if (!completedJobId) {
        throw new Error("Export đang xử lý lâu hơn dự kiến, vui lòng thử lại sau.");
      }

      const response = await downloadOTExportFile(completedJobId);
      const blob = response.data;
      const disposition = response.headers?.["content-disposition"] as string | undefined;
      const filename = parseFileNameFromDisposition(disposition) || `ot-export-${completedJobId}.csv`;

      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Tải file OT thành công.");
    } catch (error) {
      console.error("Export OT failed", error);
      toast.error(error instanceof Error ? error.message : "Export thất bại. Vui lòng thử lại.");
    } finally {
      setExportLoading(false);
    }
  };

  const handlePeriodExportExcel = async () => {
    if (pendingCount > 0 || periodExportLoading) return;
    setPeriodExportLoading(true);
    try {
      const response = await exportPeriodToExcel(monthParams.year, monthParams.month);
      const blob = response.data;
      const disposition = response.headers?.["content-disposition"] as string | undefined;
      const filename = parseFileNameFromDisposition(disposition) || `ot-tong-hop-${monthParams.year}-${String(monthParams.month).padStart(2, "0")}.xlsx`;

      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Xuất Excel tổng hợp thành công.");
    } catch (error) {
      console.error("Period export failed", error);
      const msg = error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
        : error instanceof Error ? error.message : "Xuất Excel thất bại.";
      toast.error(msg || "Xuất Excel thất bại. Chỉ xuất được khi đã phê duyệt hết.");
    } finally {
      setPeriodExportLoading(false);
    }
  };

  const canExportPeriod = pendingCount === 0;

  return (
    <>
      <PageMeta
        title="Phê duyệt Tăng ca | TAGTECH"
        description="Xem xét và quản lý các yêu cầu tăng ca hàng tháng của nhân viên"
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Phê duyệt Tăng ca
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Xem xét và quản lý các yêu cầu tăng ca hàng tháng của nhân viên.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                <ListIcon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">Đang chờ</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
                  <span className="text-amber-600 dark:text-amber-400">{pendingCount}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Yêu cầu chờ phê duyệt</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                <TimeIcon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">Tổng giờ</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
                  <span className="text-blue-600 dark:text-blue-400">{totalHoursSum}h</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tổng giờ tăng ca tháng này</p>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                  Ngày thường: <span className="font-semibold text-blue-700 dark:text-blue-300">{weekdayHours}h</span>
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Ngày nghỉ: <span className="font-semibold text-amber-700 dark:text-amber-300">{offdayHours}h</span>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700 md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckLineIcon className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">Đã phê duyệt</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
                  <span className="text-emerald-600 dark:text-emerald-400">{approvedCount}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Yêu cầu đã duyệt tháng này</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between lg:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <CalenderIcon className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[160px] appearance-none rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <BoxIconLine className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[180px] appearance-none rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <ListIcon className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as "" | "submitted");
                  setCurrentPage(1);
                }}
                className="h-11 min-w-[160px] appearance-none rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="submitted">Đã gửi</option>
              </select>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setBulkApproveModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <CheckLineIcon className="size-4" />
              Duyệt đã chọn ({selectedIds.size})
            </button>
          )}
          <div className="flex w-full items-center gap-2 sm:w-auto sm:max-w-md sm:flex-1 sm:justify-end">
            <div className="relative flex-1 sm:max-w-xs">
            <svg
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tìm kiếm nhân viên..."
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
            />
            </div>
            <button
              type="button"
              onClick={handlePeriodExportExcel}
              disabled={!canExportPeriod || periodExportLoading}
              title={!canExportPeriod ? "Chỉ xuất được khi đã phê duyệt hết phiếu" : ""}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              {periodExportLoading ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent dark:border-emerald-400" />
                  Đang xuất...
                </>
              ) : (
                <>
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Xuất Excel
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="w-12 px-4 py-3">
                    {submittedOnPage.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSubmittedSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                    )}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">STT</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Họ và tên</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Phòng ban</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Tổng giờ tăng ca</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Ngày gửi</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Trạng thái</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {!loadingList && requests.map((row, idx) => {
                  const stt = (currentPage - 1) * itemsPerPage + idx + 1;
                  const statusKey = (row.status || "").toLowerCase();
                  const statusCfg = STATUS_CONFIG[statusKey] ?? { label: row.status, className: "bg-gray-100 text-gray-700" };
                  const isSubmitted = statusKey === "submitted";
                  const failedReason = failedReasons.get(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`transition hover:bg-gray-50 dark:hover:bg-gray-800/30 ${
                        failedReason ? "bg-red-50 dark:bg-red-900/10" : ""
                      }`}
                      title={failedReason || undefined}
                    >
                      <td className="px-4 py-3">
                        {isSubmitted ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelectRow(row.id, true)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                          />
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{stt}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={row.avatar || "/images/user/owner.jpg"}
                            alt={row.name}
                            className="h-10 w-10 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "/images/user/owner.jpg";
                            }}
                          />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{row.empId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatDeptLabel(row.dept)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <p className="font-medium">{row.hours} h</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Thường: <span className="font-semibold text-blue-700 dark:text-blue-300">{row.weekdayHours ?? 0}h</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          Nghỉ: <span className="font-semibold text-amber-700 dark:text-amber-300">{row.offdayHours ?? 0}h</span>
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.submitDate}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusCfg.className}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusCfg.label}
                          </span>
                          {failedReason && (
                            <span
                              className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              title={failedReason}
                            >
                              <svg className="mr-1 size-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Lỗi
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openDetail(row.id)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <EyeIcon className="size-4" />
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loadingList && requests.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Không có dữ liệu OT cho bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
                {loadingList && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:flex-row">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Hiển thị {startItem} đến {endItem} trong tổng số {totalItems} mục
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400">Hiển thị:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="h-8 min-w-[4rem] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label="Trang đầu"
                >
                  &#171;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label="Trang trước"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-medium text-white dark:bg-blue-500"
                >
                  {currentPage}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label="Trang sau"
                >
                  &#8250;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  aria-label="Trang cuối"
                >
                  &#187;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!detailRequest}
        onClose={() => setDetailRequest(null)}
        className="max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
      >
        {detailRequest && (
          <div className="p-6 sm:p-8">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Chi tiết tăng ca</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Tháng {detailRequest.period?.label ?? selectedMonth} · #{detailRequest.otId ?? `OT-${detailRequest.empId}`}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                    <UserIcon className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Nhân viên</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{detailRequest.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{detailRequest.role ?? formatDeptLabel(detailRequest.dept)}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <TimeIcon className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Tổng giờ</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{detailRequest.hours} Giờ</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                    <DocsIcon className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Trạng thái</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{detailStatusLabel}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Gửi ngày {detailRequest.submitDate}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <ListIcon className="size-5 text-gray-500 dark:text-gray-400" />
                <h4 className="font-semibold text-gray-900 dark:text-white">Chi tiết theo ngày</h4>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Ngày</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Thời gian</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Số giờ</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Loại OT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Mô tả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {detailEntries.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{e.date}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{e.start} - {e.end}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">{e.hours} giờ</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              e.otType === "offday"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                            }`}
                          >
                            {e.otType === "offday" ? "Ngày nghỉ" : "Ngày thường"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500" />
                          {e.desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                      <td colSpan={5} className="px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300">
                        Tổng số giờ: <span className="font-bold text-indigo-600 dark:text-indigo-400">{detailTotalHours} giờ</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-gray-500">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </span>
                <h4 className="font-semibold text-gray-900 dark:text-white">Ghi chú trong tháng</h4>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-sm text-gray-700 dark:text-gray-300">{detailRequest.monthlyNotes || "Không có ghi chú."}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              
              {((detailRequest.status || "").toLowerCase() === "submitted") && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectReason("");
                      setRejectModalOpen(true);
                    }}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <CloseLineIcon className="size-4" />
                    Từ chối
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    <CheckLineIcon className="size-4" />
                    Phê duyệt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        className="max-w-md mx-4"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
              <svg className="size-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Từ chối yêu cầu tăng ca</h3>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Bạn sắp từ chối yêu cầu làm thêm giờ của <span className="font-semibold text-gray-900 dark:text-white">{detailRequest?.name}</span>{" "}
            vào ngày <span className="font-semibold text-gray-900 dark:text-white">{detailRequest ? formatDateForReject(detailRequest.submitDate) : ""}</span>.
            Hành động này không thể hoàn tác ngay lập tức nếu không gửi yêu cầu mới.
          </p>

          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Lý do từ chối (bắt buộc) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Vui lòng nhập lý do từ chối..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
            />
            <p className="mt-2 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
              <svg className="mt-0.5 size-4 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Nhân viên sẽ được thông báo qua email với lý do này.
            </p>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
            >
              <CloseLineIcon className="size-4" />
              Xác nhận từ chối
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={bulkApproveModalOpen}
        onClose={() => !bulkApproveLoading && setBulkApproveModalOpen(false)}
        className="max-w-md mx-4"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              <CheckLineIcon className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Duyệt hàng loạt</h3>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Bạn sẽ duyệt <span className="font-semibold text-gray-900 dark:text-white">{selectedIds.size}</span> phiếu tăng ca.
            Mỗi phiếu sẽ được xử lý riêng. Một số phiếu có thể không duyệt được nếu vi phạm điều kiện (ví dụ: đã chốt payroll).
          </p>
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setBulkApproveModalOpen(false)}
              disabled={bulkApproveLoading}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleBulkApproveConfirm}
              disabled={bulkApproveLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {bulkApproveLoading ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <CheckLineIcon className="size-4" />
                  Xác nhận duyệt
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={loadingDetail}
        onClose={() => {}}
        className="max-w-sm mx-4"
      >
        <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300">Đang tải chi tiết...</div>
      </Modal>
    </>
  );
}
