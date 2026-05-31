import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import flatpickr from "flatpickr";
import { Vietnamese } from "flatpickr/dist/l10n/vn";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageMeta from "../../components/common/PageMeta";
import { KPIStatCard, HealthStatusChart, type HealthCount } from "../../components/deployment-dashboard";
import {
  fetchTicketStatisticsData,
  type DevSentTicketSummary,
} from "../../api/ticket-statistics.api";
import type { TicketResponseDTO } from "../../api/ticket.api";
import {
  TaskIcon,
  CheckCircleIcon,
  AlertIcon,
  CalenderIcon,
  ErrorHexaIcon,
  DocsIcon,
} from "../../icons";
import { FiDownload, FiRefreshCw } from "react-icons/fi";

const MONTH_ALL = "all";

const CALENDAR_INPUT_CLASS =
  "w-[108px] rounded-md border border-gray-200 bg-white py-1 pl-2 pr-7 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200";

function CalendarDateInput({
  value,
  onChange,
  placeholder = "Chọn ngày",
  minDate,
  maxDate,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<flatpickr.Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const fp = flatpickr(el, {
      locale: Vietnamese,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      altInputClass: CALENDAR_INPUT_CLASS,
      allowInput: false,
      clickOpens: true,
      disableMobile: true,
      defaultDate: value || undefined,
      onReady: (_dates, _str, inst) => {
        if (inst.altInput) inst.altInput.placeholder = placeholder;
      },
      onChange: (_dates, dateStr) => {
        onChangeRef.current(typeof dateStr === "string" ? dateStr : "");
      },
    });
    fpRef.current = fp;

    return () => {
      fp.destroy();
      fpRef.current = null;
    };
  }, [placeholder]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;

    const alt = fp.altInput;
    const active = document.activeElement;
    if ((alt && active === alt) || active === fp.input) return;

    if (!value) {
      fp.clear();
      return;
    }

    const selected = fp.selectedDates[0];
    if (selected) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, "0");
      const d = String(selected.getDate()).padStart(2, "0");
      if (`${y}-${m}-${d}` === value) return;
    }
    fp.setDate(value, false);
  }, [value]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    fp.set("minDate", minDate || undefined);
    fp.set("maxDate", maxDate || undefined);
  }, [minDate, maxDate]);

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="hidden" readOnly aria-hidden tabIndex={-1} />
      <CalenderIcon className="pointer-events-none absolute right-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

const DEV_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Đã tiếp nhận",
  IN_PROCESS: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  ISSUE: "Tạm dừng",
  CANCELLED: "Hủy",
};

const DEV_STATUS_COLORS: Record<string, string> = {
  RECEIVED: "#94a3b8",
  IN_PROCESS: "#0ea5e9",
  COMPLETED: "#22c55e",
  ISSUE: "#f59e0b",
  CANCELLED: "#ef4444",
};

const DEV_PRIORITY_LABELS: Record<string, string> = {
  P0: "Rất khẩn cấp",
  P1: "Khẩn cấp",
  P2: "Quan trọng",
  P3: "Thường xuyên",
  P4: "Thấp",
};

const DEV_PRIORITY_COLORS: Record<string, string> = {
  P0: "#dc2626",
  P1: "#f97316",
  P2: "#eab308",
  P3: "#0ea5e9",
  P4: "#94a3b8",
};

const DEV_TYPE_LABELS: Record<string, string> = {
  TRIEN_KHAI: "Triển khai",
  UPDATE: "Update",
  BAO_TRI: "Bảo trì",
};

const HOSPITAL_STATUS_LABELS: Record<string, string> = {
  CHUA_XU_LY: "Chưa xử lý",
  DANG_XU_LY: "Đang xử lý",
  HOAN_THANH: "Hoàn thành",
};

const HOSPITAL_STATUS_COLORS: Record<string, string> = {
  CHUA_XU_LY: "#94a3b8",
  DANG_XU_LY: "#0ea5e9",
  HOAN_THANH: "#22c55e",
};

function getMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [{ value: MONTH_ALL, label: "Tất cả thời gian" }];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` });
  }
  return options;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseDateInput(value: string): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inMonth(dateStr: string | null | undefined, monthValue: string): boolean {
  if (monthValue === MONTH_ALL) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m] = monthValue.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}

function inDateRange(
  dateStr: string | null | undefined,
  fromDate: string,
  toDate: string
): boolean {
  if (!fromDate && !toDate) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const ts = d.getTime();
  const from = parseDateInput(fromDate);
  const to = parseDateInput(toDate);
  if (from && ts < startOfDay(from).getTime()) return false;
  if (to && ts > endOfDay(to).getTime()) return false;
  return true;
}

function matchesTimeFilter(
  dateStr: string | null | undefined,
  monthValue: string,
  fromDate: string,
  toDate: string
): boolean {
  if (fromDate || toDate) return inDateRange(dateStr, fromDate, toDate);
  return inMonth(dateStr, monthValue);
}

function formatFilterLabel(monthValue: string, fromDate: string, toDate: string, monthOptions: { value: string; label: string }[]) {
  if (fromDate || toDate) {
    const from = fromDate ? fromDate.split("-").reverse().join("/") : "...";
    const to = toDate ? toDate.split("-").reverse().join("/") : "...";
    return `${from} - ${to}`;
  }
  return monthOptions.find((o) => o.value === monthValue)?.label || "tat-ca";
}

function isOverdue(ticket: DevSentTicketSummary): boolean {
  if (!ticket.deadline) return false;
  const status = (ticket.status || "").toUpperCase();
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  const deadline = new Date(ticket.deadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function countByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
  labels: Record<string, string>,
  colors: Record<string, string>
): HealthCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || "UNKNOWN";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      status: key,
      label: labels[key] || key,
      count,
      color: colors[key] || "#64748b",
    }))
    .sort((a, b) => b.count - a.count);
}

async function exportTicketReportXlsx(params: {
  devTickets: DevSentTicketSummary[];
  hospitalTickets: TicketResponseDTO[];
  filterLabel: string;
  devStats: {
    total: number;
    tagPending: number;
    tagAck: number;
    inProcess: number;
    completed: number;
    overdue: number;
  };
  filename: string;
}) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TAGTECH";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Tổng hợp");
  summarySheet.addRow(["BÁO CÁO THỐNG KÊ TICKETS"]);
  summarySheet.addRow(["Kỳ báo cáo", params.filterLabel]);
  summarySheet.addRow(["Xuất lúc", new Date().toLocaleString("vi-VN")]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Tickets gửi team DEV"]);
  summarySheet.addRow(["Chỉ tiêu", "Giá trị"]);
  summarySheet.addRow(["Tổng tickets", params.devStats.total]);
  summarySheet.addRow(["Chưa hoàn thành (TAG)", params.devStats.tagPending]);
  summarySheet.addRow(["Hoàn thành (TAG)", params.devStats.tagAck]);
  summarySheet.addRow(["Đang xử lý", params.devStats.inProcess]);
  summarySheet.addRow(["Hoàn thành (DEV)", params.devStats.completed]);
  summarySheet.addRow(["Quá deadline", params.devStats.overdue]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Tickets bệnh viện", params.hospitalTickets.length]);

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 24;
  summarySheet.getRow(1).font = { bold: true, size: 14 };
  summarySheet.getRow(5).font = { bold: true };
  summarySheet.getRow(6).font = { bold: true };

  const devHeaders = [
    "ID",
    "Tiêu đề",
    "Bệnh viện",
    "Loại",
    "Trạng thái",
    "Ưu tiên",
    "Dev xử lý",
    "Deadline",
    "TAG xác nhận",
    "Ngày tạo",
  ];
  const devSheet = workbook.addWorksheet("Tickets DEV");
  const devHeaderRow = devSheet.addRow(devHeaders);
  devHeaderRow.font = { bold: true };
  devHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  params.devTickets.forEach((t) => {
    devSheet.addRow([
      t.id,
      t.title,
      t.hospitalName || "",
      t.ticketTypeLabel || t.ticketType || "",
      t.statusLabel || t.status || "",
      t.priorityLabel || t.priority || "",
      t.devHandlerName || "",
      t.deadline ? formatDateTime(t.deadline) : "",
      t.requesterAcknowledged ? "Đã xác nhận" : "Chưa xác nhận",
      t.createdAt ? formatDateTime(t.createdAt) : "",
    ]);
  });
  devSheet.columns = [
    { width: 8 },
    { width: 36 },
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 18 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
  ];

  const hospitalSheet = workbook.addWorksheet("Tickets BV");
  const hospitalHeaders = [
    "Mã ticket",
    "Nội dung",
    "Bệnh viện",
    "Loại",
    "Trạng thái",
    "Ưu tiên",
    "PIC",
    "Ngày tạo",
  ];
  const hospitalHeaderRow = hospitalSheet.addRow(hospitalHeaders);
  hospitalHeaderRow.font = { bold: true };
  hospitalHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  params.hospitalTickets.forEach((t) => {
    hospitalSheet.addRow([
      t.ticketCode,
      t.issue,
      t.hospitalName || "",
      t.ticketType === "MAINTENANCE" ? "Bảo trì" : t.ticketType === "DEPLOYMENT" ? "Triển khai" : t.ticketType || "",
      t.status === "CHUA_XU_LY" ? "Chưa xử lý" : t.status === "DANG_XU_LY" ? "Đang xử lý" : t.status === "HOAN_THANH" ? "Hoàn thành" : t.status,
      t.priority,
      t.pic || "",
      t.createdAt ? formatDateTime(t.createdAt) : "",
    ]);
  });
  hospitalSheet.columns = [
    { width: 14 },
    { width: 40 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 20 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = params.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TicketStatistics() {
  const location = useLocation();
  const isSuperAdmin = location.pathname.startsWith("/superadmin");
  const ticketManagePath = isSuperAdmin ? "/superadmin/ticket-sent-dev" : "/ticket-sent-dev";

  const [monthValue, setMonthValue] = useState(MONTH_ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devTickets, setDevTickets] = useState<DevSentTicketSummary[]>([]);
  const [hospitalTickets, setHospitalTickets] = useState<TicketResponseDTO[]>([]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTicketStatisticsData();
      setDevTickets(data.devSentTickets);
      setHospitalTickets(data.hospitalTickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu thống kê");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredDev = useMemo(
    () => devTickets.filter((t) => matchesTimeFilter(t.createdAt, monthValue, fromDate, toDate)),
    [devTickets, monthValue, fromDate, toDate]
  );

  const filteredHospital = useMemo(
    () => hospitalTickets.filter((t) => matchesTimeFilter(t.createdAt, monthValue, fromDate, toDate)),
    [hospitalTickets, monthValue, fromDate, toDate]
  );

  const devStats = useMemo(() => {
    const total = filteredDev.length;
    const tagPending = filteredDev.filter((t) => !t.requesterAcknowledged).length;
    const tagAck = filteredDev.filter((t) => t.requesterAcknowledged).length;
    const inProcess = filteredDev.filter((t) => (t.status || "").toUpperCase() === "IN_PROCESS").length;
    const completed = filteredDev.filter((t) => (t.status || "").toUpperCase() === "COMPLETED").length;
    const overdue = filteredDev.filter(isOverdue).length;
    return { total, tagPending, tagAck, inProcess, completed, overdue };
  }, [filteredDev]);

  const devStatusChart = useMemo(
    () =>
      countByKey(
        filteredDev,
        (t) => (t.status || "UNKNOWN").toUpperCase(),
        DEV_STATUS_LABELS,
        DEV_STATUS_COLORS
      ),
    [filteredDev]
  );

  const devPriorityChart = useMemo(
    () =>
      countByKey(
        filteredDev,
        (t) => (t.priority || "UNKNOWN").toUpperCase(),
        DEV_PRIORITY_LABELS,
        DEV_PRIORITY_COLORS
      ),
    [filteredDev]
  );

  const devTypeChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filteredDev) {
      const key = (t.ticketType || "UNKNOWN").toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        name: DEV_TYPE_LABELS[key] || key,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredDev]);

  const devHandlerChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filteredDev) {
      const name = t.devHandlerName?.trim() || "Chưa phân công";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredDev]);

  const hospitalStatusChart = useMemo(
    () =>
      countByKey(
        filteredHospital,
        (t) => t.status || "UNKNOWN",
        HOSPITAL_STATUS_LABELS,
        HOSPITAL_STATUS_COLORS
      ),
    [filteredHospital]
  );

  const attentionRows = useMemo(
    () =>
      filteredDev
        .filter((t) => isOverdue(t) || (!t.requesterAcknowledged && (t.status || "").toUpperCase() === "COMPLETED"))
        .sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return da - db;
        })
        .slice(0, 15),
    [filteredDev]
  );

  const handleExport = async () => {
    if (filteredDev.length === 0 && filteredHospital.length === 0) {
      toast.error("Không có dữ liệu để xuất báo cáo");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("Từ ngày không được lớn hơn đến ngày");
      return;
    }
    const filterLabel = formatFilterLabel(monthValue, fromDate, toDate, monthOptions);
    const safeLabel = filterLabel.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "-");
    setExporting(true);
    try {
      await exportTicketReportXlsx({
        devTickets: filteredDev,
        hospitalTickets: filteredHospital,
        filterLabel,
        devStats,
        filename: `bao-cao-tickets-${safeLabel}.xlsx`,
      });
      toast.success("Đã xuất báo cáo Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể xuất báo cáo");
    } finally {
      setExporting(false);
    }
  };

  const handleMonthChange = (value: string) => {
    setMonthValue(value);
    setFromDate("");
    setToDate("");
  };

  const handleFromDateChange = (value: string) => {
    setFromDate(value);
    if (value) setMonthValue(MONTH_ALL);
  };

  const handleToDateChange = (value: string) => {
    setToDate(value);
    if (value) setMonthValue(MONTH_ALL);
  };

  const clearDateRange = () => {
    setFromDate("");
    setToDate("");
  };

  return (
    <>
      <PageMeta
        title="Thống kê, báo cáo Tickets | TAGTECH"
        description="Dashboard thống kê và báo cáo tickets gửi team DEV"
      />
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Thống kê, báo cáo Tickets
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Tổng hợp tickets gửi team DEV và tickets bệnh viện
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex items-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <CalenderIcon className="ml-3 size-4 text-gray-500 dark:text-gray-400" />
              <select
                value={monthValue}
                onChange={(e) => handleMonthChange(e.target.value)}
                disabled={Boolean(fromDate || toDate)}
                className="min-w-[160px] appearance-none bg-transparent py-2 pl-9 pr-8 text-sm text-gray-700 disabled:opacity-50 dark:text-gray-200"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">Từ ngày</span>
              <CalendarDateInput
                value={fromDate}
                onChange={handleFromDateChange}
                placeholder="Từ ngày"
                maxDate={toDate || undefined}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Đến ngày</span>
              <CalendarDateInput
                value={toDate}
                onChange={handleToDateChange}
                placeholder="Đến ngày"
                minDate={fromDate || undefined}
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={clearDateRange}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Xóa
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={loading || exporting || (filteredDev.length === 0 && filteredHospital.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <FiDownload className={exporting ? "animate-pulse" : "size-4"} />
              {exporting ? "Đang xuất..." : "Xuất XLSX"}
            </button>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} />
              Làm mới
            </button>
            <Link
              to={ticketManagePath}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              Quản lý Tickets
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Tickets gửi team DEV
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KPIStatCard icon={<TaskIcon />} label="Tổng tickets" value={loading ? "..." : devStats.total} />
            <KPIStatCard
              icon={<AlertIcon />}
              label="Chưa hoàn thành (TAG)"
              value={loading ? "..." : devStats.tagPending}
              variant="warning"
              trend="Chưa có tích xanh xác nhận"
            />
            <KPIStatCard
              icon={<CheckCircleIcon />}
              label="Hoàn thành (TAG)"
              value={loading ? "..." : devStats.tagAck}
              trend="Đã xác nhận tích xanh"
            />
            <KPIStatCard
              icon={<DocsIcon />}
              label="Đang xử lý"
              value={loading ? "..." : devStats.inProcess}
            />
            <KPIStatCard
              icon={<CheckCircleIcon />}
              label="Hoàn thành (DEV)"
              value={loading ? "..." : devStats.completed}
            />
            <KPIStatCard
              icon={<ErrorHexaIcon />}
              label="Quá deadline"
              value={loading ? "..." : devStats.overdue}
              variant={devStats.overdue > 0 ? "danger" : "normal"}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <HealthStatusChart
            data={devStatusChart.length ? devStatusChart : [{ status: "empty", label: "Chưa có dữ liệu", count: 0, color: "#94a3b8" }]}
            totalLabel="TICKETS"
            totalProjects={devStats.total}
          />
          <HealthStatusChart
            data={devPriorityChart.length ? devPriorityChart : [{ status: "empty", label: "Chưa có dữ liệu", count: 0, color: "#94a3b8" }]}
            totalLabel="TICKETS"
            totalProjects={devStats.total}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
              Phân bố theo loại ticket
            </h3>
            <div className="h-[280px] w-full">
              {devTypeChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={devTypeChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => [value, "Số lượng"]} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">Chưa có dữ liệu</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
            <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
              Khối lượng theo Dev xử lý (top 8)
            </h3>
            <div className="h-[280px] w-full">
              {devHandlerChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={devHandlerChart} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => [value, "Tickets"]} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">Chưa có dữ liệu</div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Cần chú ý — quá deadline / chờ xác nhận TAG
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Tiêu đề</th>
                  <th className="px-4 py-3 font-medium">Bệnh viện</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Dev xử lý</th>
                  <th className="px-4 py-3 font-medium">Deadline</th>
                  <th className="px-4 py-3 font-medium">TAG</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Đang tải...
                    </td>
                  </tr>
                )}
                {!loading && attentionRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Không có ticket cần chú ý
                    </td>
                  </tr>
                )}
                {!loading &&
                  attentionRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3">{row.id}</td>
                      <td className="max-w-[220px] truncate px-4 py-3">{row.title}</td>
                      <td className="max-w-[160px] truncate px-4 py-3">{row.hospitalName || "—"}</td>
                      <td className="px-4 py-3">{row.statusLabel || row.status}</td>
                      <td className="px-4 py-3">{row.devHandlerName || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={isOverdue(row) ? "font-medium text-red-600" : ""}>
                          {formatDateTime(row.deadline)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.requesterAcknowledged ? (
                          <span className="text-green-600">Đã xác nhận</span>
                        ) : (
                          <span className="text-amber-600">Chưa xác nhận</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Tickets bệnh viện
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPIStatCard
              icon={<TaskIcon />}
              label="Tổng tickets BV"
              value={loading ? "..." : filteredHospital.length}
            />
            <KPIStatCard
              icon={<AlertIcon />}
              label="Chưa xử lý"
              value={
                loading
                  ? "..."
                  : filteredHospital.filter((t) => t.status === "CHUA_XU_LY").length
              }
            />
            <KPIStatCard
              icon={<DocsIcon />}
              label="Đang xử lý"
              value={
                loading
                  ? "..."
                  : filteredHospital.filter((t) => t.status === "DANG_XU_LY").length
              }
            />
            <KPIStatCard
              icon={<CheckCircleIcon />}
              label="Hoàn thành"
              value={
                loading
                  ? "..."
                  : filteredHospital.filter((t) => t.status === "HOAN_THANH").length
              }
            />
          </div>
          {filteredHospital.length > 0 && (
            <HealthStatusChart
              data={hospitalStatusChart}
              totalLabel="TICKETS BV"
              totalProjects={filteredHospital.length}
            />
          )}
        </section>
      </div>
    </>
  );
}
