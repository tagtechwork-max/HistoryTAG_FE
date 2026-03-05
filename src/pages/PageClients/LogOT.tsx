import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import {
  CalenderIcon,
  TimeIcon,
  ListIcon,
  PlusIcon,
  PaperPlaneIcon,
  PencilIcon,
  TrashBinIcon,
  CheckLineIcon,
  InfoIcon,
} from "../../icons";
import {
  createAdminOTEntry,
  deleteAdminOTEntry,
  getAdminOTRequestByPeriod,
  submitAdminOTRequest,
  updateAdminOTEntry,
  updateAdminOTMonthlyNotes,
  type OTAdminRequestDetailResponseDTO,
  type OTEntryUpsertRequestDTO,
} from "../../api/ot.api";

type OTEntry = {
  id: number;
  date: string;
  start: string;
  end: string;
  hours: number;
  otType: "weekday" | "offday";
  desc: string;
};

const OT_TYPE_OPTIONS = [
  { value: "weekday", label: "Ngày thường" },
  { value: "offday", label: "Ngày nghỉ" },
] as const;

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

const STATUS_OPTIONS = [
  { value: "draft", label: "Bản nháp", color: "bg-amber-400" },
  { value: "submitted", label: "Đã gửi", color: "bg-blue-400" },
  { value: "approved", label: "Đã phê duyệt", color: "bg-emerald-400" },
  { value: "rejected", label: "Đã từ chối", color: "bg-red-400" },
];

function parseTimeToMinutes(timeStr: string): number {
  const normalized = normalizeTimeTo24h(timeStr || "00:00");
  const [h, m] = normalized.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Accept both "HH:mm" (24h) and "H:mm AM/PM" (12h) and return "HH:mm" (24h). */
function normalizeTimeTo24h(timeStr: string): string {
  if (!timeStr || typeof timeStr !== "string") return "00:00";
  const t = timeStr.trim();
  const upper = t.toUpperCase();
  const hasPM = upper.includes("PM");
  const hasAM = upper.includes("AM");
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) {
    const already24 = t.match(/^(\d{1,2}):(\d{2})$/);
    if (already24) return t.length === 5 ? t : `${String(parseInt(already24[1], 10)).padStart(2, "0")}:${String(parseInt(already24[2], 10)).padStart(2, "0")}`;
    return "00:00";
  }
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) || 0;
  if (isNaN(h)) return "00:00";
  if (hasPM && h !== 12) h += 12;
  if (hasAM && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(Math.min(59, Math.max(0, m))).padStart(2, "0")}`;
}

function toHTMLDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function fromHTMLDate(htmlDate: string): string {
  if (!htmlDate) return "";
  const [y, m, d] = htmlDate.split("-");
  return `${d}/${m}/${y}`;
}

function detectOTTypeByHTMLDate(htmlDate: string): "weekday" | "offday" {
  if (!htmlDate) return "weekday";
  const date = new Date(`${htmlDate}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6 ? "offday" : "weekday";
}

function parseMonthValue(value: string) {
  const [monthStr, yearStr] = value.split("/");
  return {
    month: Number(monthStr),
    year: Number(yearStr),
  };
}

function toApiDate(htmlDate: string): string {
  return htmlDate;
}

function mapDetailToEntries(detail: OTAdminRequestDetailResponseDTO): OTEntry[] {
  return (detail.entries || []).map((entry) => ({
    id: entry.id || 0,
    date: entry.date,
    start: entry.start,
    end: entry.end,
    hours: entry.hours,
    otType: (entry.otType || "weekday") as "weekday" | "offday",
    desc: entry.desc,
  }));
}

export default function LogOT() {
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0]?.value || "01/2026");
  const [status, setStatus] = useState("draft");
  const [rejectReason, setRejectReason] = useState("");
  const [requestId, setRequestId] = useState<number | null>(null);
  const [entries, setEntries] = useState<OTEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<OTEntry | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formStart, setFormStart] = useState("18:00");
  const [formEnd, setFormEnd] = useState("20:30");
  const [formOTType, setFormOTType] = useState<"weekday" | "offday">("weekday");
  const [formDesc, setFormDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const itemsPerPage = 4;

  const monthParams = useMemo(() => parseMonthValue(selectedMonth), [selectedMonth]);

  const loadByPeriod = async () => {
    setLoading(true);
    try {
      const detail = await getAdminOTRequestByPeriod(monthParams.year, monthParams.month);
      setRequestId(detail.id);
      setStatus(detail.status || "draft");
      setNotes(detail.monthlyNotes || "");
      setRejectReason(detail.rejectReason || "");
      setEntries(mapDetailToEntries(detail));
    } catch (error) {
      console.error("Load admin OT by period failed", error);
      setRequestId(null);
      setEntries([]);
      setStatus("draft");
      setNotes("");
      setRejectReason("");
      toast.error("Không tải được dữ liệu OT. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    loadByPeriod();
  }, [selectedMonth]);

  const totalHours = useMemo(
    () => entries.reduce((sum, e) => sum + e.hours, 0),
    [entries]
  );

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return entries.slice(start, start + itemsPerPage);
  }, [entries, currentPage]);

  const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "Bản nháp";
  const statusColor = STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "bg-amber-400";

  // Support overnight OT: e.g. 22:00 -> 06:00 next morning = 8h (end < start => span midnight)
  const totalHoursForm = useMemo(() => {
    const startMin = parseTimeToMinutes(formStart);
    const endMin = parseTimeToMinutes(formEnd);
    const minutesPerDay = 24 * 60;
    const durationMin =
      endMin <= startMin ? minutesPerDay - startMin + endMin : endMin - startMin;
    if (durationMin <= 0) return 0;
    return Math.round((durationMin / 60) * 100) / 100;
  }, [formStart, formEnd]);

  const isReadOnly = status === "submitted" || status === "approved";

  const openAddModal = () => {
    if (isReadOnly) return;
    setEditingEntry(null);
    setFormDate("");
    setFormStart("18:00");
    setFormEnd("20:30");
    setFormOTType("weekday");
    setFormDesc("");
    setModalOpen(true);
  };

  const openEditModal = (entry: OTEntry) => {
    if (isReadOnly) return;
    setEditingEntry(entry);
    setFormDate(toHTMLDate(entry.date));
    setFormStart(normalizeTimeTo24h(entry.start));
    setFormEnd(normalizeTimeTo24h(entry.end));
    setFormOTType(entry.otType);
    setFormDesc(entry.desc);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEntry(null);
  };

  const handleSave = async () => {
    if (!requestId) return;
    const dateStr = formDate ? fromHTMLDate(formDate) : "";
    const hours = totalHoursForm;
    if (!dateStr || hours <= 0) return;

    const payload: OTEntryUpsertRequestDTO = {
      date: toApiDate(formDate),
      start: normalizeTimeTo24h(formStart),
      end: normalizeTimeTo24h(formEnd),
      otType: formOTType,
      desc: formDesc,
    };

    setSavingEntry(true);
    try {
      if (editingEntry) {
        await updateAdminOTEntry(editingEntry.id, payload);
      } else {
        await createAdminOTEntry(requestId, payload);
      }
      await loadByPeriod();
      closeModal();
      toast.success(editingEntry ? "Cập nhật mục OT thành công." : "Thêm mục OT thành công.");
    } catch (error) {
      console.error("Save OT entry failed", error);
      toast.error("Không lưu được mục OT. Vui lòng kiểm tra lại dữ liệu.");
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (isReadOnly) return;
    if (!window.confirm("Bạn có chắc muốn xóa mục tăng ca này?")) return;
    try {
      await deleteAdminOTEntry(id);
      await loadByPeriod();
      toast.success("Đã xóa mục OT.");
    } catch (error) {
      console.error("Delete OT entry failed", error);
      toast.error("Xóa mục OT thất bại. Vui lòng thử lại.");
    }
  };

  const handleSubmitApproval = async () => {
    if (!requestId || submitting || isReadOnly) return;
    setSubmitting(true);
    try {
      const response = await submitAdminOTRequest(requestId);
      setStatus(response.status || "submitted");
      await loadByPeriod();
      toast.success("Đã gửi phiếu OT để phê duyệt.");
    } catch (error) {
      console.error("Submit OT request failed", error);
      toast.error("Gửi phê duyệt thất bại. Vui lòng kiểm tra dữ liệu và thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotesBlur = async () => {
    if (!requestId || isReadOnly) return;
    setSavingNotes(true);
    try {
      const updated = await updateAdminOTMonthlyNotes(requestId, notes);
      setNotes(updated.monthlyNotes || "");
      toast.success("Đã lưu ghi chú tháng.");
    } catch (error) {
      console.error("Update monthly notes failed", error);
      toast.error("Lưu ghi chú thất bại. Vui lòng thử lại.");
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Tăng ca của tôi | TAGTECH"
        description="Quản lý và gửi giờ làm thêm hàng tháng để được phê duyệt"
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tăng ca của tôi</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Quản lý và gửi giờ làm thêm hàng tháng để được phê duyệt.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Chọn tháng (MM/YYYY)
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-11 min-w-[160px] rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Trạng thái
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800">
                <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                <span className="text-sm font-medium text-gray-800 dark:text-white">{statusLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {status === "rejected" && rejectReason && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                <InfoIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Lý do từ chối</h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{rejectReason}</p>
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  Vui lòng chỉnh sửa theo góp ý trên rồi gửi lại phiếu phê duyệt.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                  <CalenderIcon className="size-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tháng đã chọn</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">Tháng {selectedMonth}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                  <TimeIcon className="size-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tổng số giờ</p>
                  <p className="text-xl font-bold text-indigo-600 dark:text-indigo-300">
                    {totalHours} <span className="text-base font-normal text-gray-500">giờ</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-4 lg:p-6">
            <p className="text-sm text-gray-700 dark:text-gray-300">Dữ liệu đã chính xác? Gửi cho quản lý phê duyệt.</p>
            <button
              type="button"
              onClick={handleSubmitApproval}
              disabled={submitting || isReadOnly || loading || entries.length === 0}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-900"
            >
              <PaperPlaneIcon className="size-4" />
              Gửi phê duyệt
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between lg:p-5">
            <div className="flex items-center gap-2">
              <ListIcon className="size-5 text-gray-500 dark:text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Nhật ký Tăng ca</h2>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              disabled={isReadOnly}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              <PlusIcon className="size-4" />
              Thêm mục tăng ca
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Ngày</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Bắt đầu</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Kết thúc</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Tổng giờ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Loại OT</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Mô tả</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {!loading && paginatedEntries.map((row) => (
                  <tr key={row.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.date}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.start}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.end}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{row.hours}h</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          row.otType === "offday"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        }`}
                      >
                        {row.otType === "offday" ? "Ngày nghỉ" : "Ngày thường"}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.desc}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          disabled={isReadOnly}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                          title="Chỉnh sửa"
                        >
                          <PencilIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          disabled={isReadOnly}
                          className="rounded p-1.5 text-gray-500 hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-red-400"
                          title="Xóa"
                        >
                          <TrashBinIcon className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && paginatedEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Chưa có mục OT trong tháng này.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row">
            <div className="font-semibold text-indigo-600 dark:text-indigo-400">Tổng cộng tháng: {totalHours}h</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Sau
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="flex items-center gap-2">
            <ListIcon className="size-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Ghi chú bổ sung cho tháng này</h2>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            onBlur={handleNotesBlur}
            disabled={isReadOnly || savingNotes}
            placeholder="Thêm ngữ cảnh về lịch trực, mã dự án cụ thể hoặc lý do cho giờ làm việc bất thường..."
            rows={4}
            className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
          />
          <div className="mt-2 flex justify-end text-xs text-gray-500 dark:text-gray-400">
            {notes.length}/500
          </div>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} className="max-w-lg mx-4">
        <div className="p-6 sm:p-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingEntry ? "Sửa mục tăng ca" : "Thêm mục tăng ca"}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ghi nhận giờ làm thêm để quản lý phê duyệt.</p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Ngày làm việc</label>
              <div className="relative">
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormDate(value);
                    setFormOTType(detectOTTypeByHTMLDate(value));
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <CalenderIcon className="size-5" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Giờ bắt đầu</label>
                <div className="relative">
                  <input
                    type="time"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <TimeIcon className="size-5" />
                  </span>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Giờ kết thúc</label>
                <div className="relative">
                  <input
                    type="time"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-12 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <TimeIcon className="size-5" />
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Loại OT</label>
              <select
                value={formOTType}
                onChange={(e) => setFormOTType(e.target.value as "weekday" | "offday")}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {OT_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tự động gợi ý theo ngày đã chọn, bạn có thể chỉnh lại nếu cần.</p>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <InfoIcon className="size-4 text-gray-500" />
                TỔNG THỜI GIAN
              </label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{totalHoursForm.toFixed(2)} giờ</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Tự động tính từ giờ nhập (cả giờ sáng AM và chiều/tối PM). Hỗ trợ OT qua đêm (vd: 22:00 → 06:00 = 8h).
              </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Mô tả công việc</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Chi tiết công việc và lý do tăng ca..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!formDate || totalHoursForm <= 0 || savingEntry}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-900"
            >
              <CheckLineIcon className="size-4" />
              Lưu
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
