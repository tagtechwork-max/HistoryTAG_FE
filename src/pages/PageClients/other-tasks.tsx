import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiActivity, FiCalendar, FiClipboard, FiEdit2, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { useLocation } from "react-router";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { isSuperAdmin } from "../../utils/permission";

type OtherTask = {
  id: number;
  taskName: string;
  status: string;
  statusLabel?: string;
  assigneeUserId: number | null;
  assigneeName?: string | null;
  startDate?: string | null;
  completionDate?: string | null;
  note?: string | null;
};

type AssigneeOption = {
  id: number;
  fullName: string;
};

type TaskPayload = {
  taskName: string;
  assigneeUserId: number;
  status: string;
  startDate?: string | null;
  completionDate?: string | null;
  note?: string | null;
};

const API_ROOT = import.meta.env.VITE_API_URL || "";
const API_BASE = `${API_ROOT}/api/v1/admin/other/tasks`;

const STATUS_OPTIONS = [
  { value: "RECEIVED", label: "Đã tiếp nhận" },
  { value: "IN_PROCESS", label: "Đang thực hiện" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "ISSUE", label: "Gặp sự cố" },
  { value: "CANCELLED", label: "Hủy" },
];

const defaultForm: TaskPayload = {
  taskName: "",
  assigneeUserId: 0,
  status: "RECEIVED",
  startDate: "",
  completionDate: "",
  note: "",
};

function authHeaders() {
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** ID user đăng nhập (lưu khi đăng nhập) — dùng mặc định người phụ trách khi thêm mới. */
function getStoredUserId(): number {
  const uidStr = localStorage.getItem("userId") || sessionStorage.getItem("userId");
  if (!uidStr) return 0;
  const n = Number(uidStr);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Giá trị cho `<input type="date">` (yyyy-mm-dd) từ ISO hoặc chuỗi ngày. */
function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ngày hôm nay theo lịch máy (yyyy-mm-dd) — dùng mặc định khi thêm mới. */
function todayDateInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    input.showPicker?.();
  } catch {
    /* một số trình duyệt không hỗ trợ */
  }
  input.focus();
}

/** yyyy-mm-dd → ISO đầu ngày theo giờ địa phương (gửi API). */
function dateInputToIsoStartOfDay(dateStr?: string | null): string | null {
  const t = dateStr?.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(y, mo - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** Chỉ hiển thị ngày theo lịch địa phương (không giờ). */
function formatDateOnly(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}

function statusLabel(status?: string) {
  if (!status) return "";
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
}

function statusBadge(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "RECEIVED") return "bg-blue-100 text-blue-700";
  if (s === "IN_PROCESS") return "bg-yellow-100 text-yellow-700";
  if (s === "COMPLETED") return "bg-green-100 text-green-700";
  if (s === "ISSUE") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

/** Chấm màu cạnh tên — cùng tông với badge trạng thái cũ. */
function statusDotClass(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "RECEIVED") return "bg-blue-500";
  if (s === "IN_PROCESS") return "bg-yellow-500";
  if (s === "COMPLETED") return "bg-green-500";
  if (s === "ISSUE") return "bg-red-500";
  return "bg-gray-400";
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]?.[0] || "?").toUpperCase();
}

function formatDateRange(start?: string | null, end?: string | null) {
  const a = formatDateOnly(start);
  const b = formatDateOnly(end);
  if (a === "—" && b === "—") return "—";
  if (a === "—") return b;
  if (b === "—") return `${a} → …`;
  return `${a} đến ${b}`;
}

function DetailModal({
  open,
  onClose,
  item,
  assigneeMap,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  item: OtherTask | null;
  assigneeMap: Record<number, string>;
  onEdit: (item: OtherTask) => void;
}) {
  if (!open || !item) return null;

  const assignee =
    item.assigneeName || (item.assigneeUserId ? assigneeMap[item.assigneeUserId] : "") || "—";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 p-4 grid place-items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-task-detail-title"
      >
        <div className="shrink-0 border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p id="other-task-detail-title" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Chi tiết công việc
            </p>
            <h2 className="mt-1 max-h-28 overflow-y-auto text-lg font-bold text-gray-900 break-words pr-1">
              {item.taskName}
            </h2>
          </div>
          <button type="button" className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-500">Trạng thái:</span>
            <span
              className={`inline-flex max-w-full items-center justify-center rounded-full px-3 py-1.5 text-center text-[11px] font-semibold leading-tight whitespace-nowrap ${statusBadge(item.status)}`}
            >
              {item.statusLabel || statusLabel(item.status)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Người phụ trách:</span>{" "}
            <span className="font-medium">{assignee}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-gray-500">Ngày bắt đầu:</span>{" "}
              <span className="font-medium">{formatDateOnly(item.startDate)}</span>
            </div>
            <div>
              <span className="text-gray-500">Ngày kết thúc:</span>{" "}
              <span className="font-medium">{formatDateOnly(item.completionDate)}</span>
            </div>
          </div>
          <div>
            <span className="text-gray-500 block mb-1">Ghi chú</span>
            <div
              className="max-h-[min(50vh,20rem)] min-h-[3rem] overflow-y-auto overscroll-y-contain rounded-xl border border-gray-100 bg-gray-50 p-3 text-gray-800 whitespace-pre-wrap break-words [scrollbar-gutter:stable]"
              tabIndex={0}
              role="region"
              aria-label="Nội dung ghi chú"
            >
              {item.note?.trim() ? item.note : "—"}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" className="h-10 px-4 rounded-xl border border-gray-300 text-gray-700" onClick={onClose}>
            Đóng
          </button>
          <button
            type="button"
            className="h-10 px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => {
              onClose();
              onEdit(item);
            }}
          >
            Sửa
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT_BASE =
  "h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100";

/** Giống ô select trạng thái — dùng cho lọc người phụ trách (SuperAdmin). */
const FILTER_SELECT_LIKE =
  "h-11 min-w-[200px] rounded-xl border bg-white px-4 pr-9 text-sm text-slate-800 outline-none transition dark:bg-gray-800 dark:text-gray-100";
const FILTER_SELECT_LIKE_BORDER = "border-slate-200 dark:border-gray-700";
const FILTER_SELECT_LIKE_FOCUS = "focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100 dark:focus-visible:ring-blue-900/40";
const FILTER_SELECT_LIKE_OPEN = "border-blue-400 ring-2 ring-blue-100 dark:border-blue-500 dark:ring-blue-900/50";

function FormModal({
  open,
  onClose,
  form,
  setForm,
  assignees,
  editingId,
  submitting,
  onSubmit,
  canPickAssignee,
}: {
  open: boolean;
  onClose: () => void;
  form: TaskPayload;
  setForm: React.Dispatch<React.SetStateAction<TaskPayload>>;
  assignees: AssigneeOption[];
  editingId: number | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  canPickAssignee: boolean;
}) {
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const isEdit = editingId !== null;
  const selectedAssignee = assignees.find((a) => a.id === form.assigneeUserId);
  const assigneeInitials = selectedAssignee ? initialsFromName(selectedAssignee.fullName) : "";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[min(92vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-task-form-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-gray-800">
          <div className="min-w-0 pr-2">
            <h2 id="other-task-form-title" className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {isEdit ? "Cập nhật công việc khác" : "Thêm công việc khác"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Tạo và phân bổ nhiệm vụ mới vào hệ thống quản lý.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800"
            onClick={onClose}
            aria-label="Đóng"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <form lang="vi" onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Tên công việc <span className="text-red-500">*</span>
              </label>
              <input
                className={`${INPUT_BASE} mt-2`}
                value={form.taskName}
                onChange={(e) => setForm((s) => ({ ...s, taskName: e.target.value }))}
                placeholder="Ví dụ: Kiểm tra vật tư tiêu hao khu A"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Người phụ trách <span className="text-red-500">*</span>
                </label>
                {canPickAssignee ? (
                  <div className="relative mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white pr-2 dark:border-gray-700 dark:bg-gray-900">
                    <div className="pointer-events-none flex h-12 w-11 shrink-0 items-center justify-center border-r border-slate-100 dark:border-gray-800">
                      {form.assigneeUserId ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {assigneeInitials}
                        </span>
                      ) : (
                        <span className="h-8 w-8 rounded-full bg-slate-100 dark:bg-gray-800" />
                      )}
                    </div>
                    <select
                      className="h-12 min-w-0 flex-1 cursor-pointer border-0 bg-transparent py-2 pr-8 text-sm font-medium text-slate-800 outline-none dark:text-slate-100"
                      value={form.assigneeUserId || ""}
                      onChange={(e) => setForm((s) => ({ ...s, assigneeUserId: Number(e.target.value) }))}
                    >
                      <option value="">Chọn người phụ trách</option>
                      {assignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
                  </div>
                ) : (
                  <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/80">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 dark:bg-slate-600 dark:text-slate-100">
                      {assigneeInitials || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {selectedAssignee?.fullName || "—"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Trạng thái</label>
                <div className="relative mt-2">
                  <select
                    className={`${INPUT_BASE} cursor-pointer appearance-none pr-10 font-medium`}
                    value={form.status}
                    onChange={(e) => {
                      const next = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        status: next,
                        completionDate:
                          next === "COMPLETED" && !(prev.completionDate && String(prev.completionDate).trim())
                            ? todayDateInputValue()
                            : prev.completionDate,
                      }));
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <FiActivity className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Thời gian bắt đầu</label>
                <div className="relative mt-2">
                  <input
                    ref={startDateRef}
                    type="date"
                    className={`${INPUT_BASE} pr-11 [color-scheme:light] dark:[color-scheme:dark]`}
                    value={typeof form.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) ? form.startDate : toDateInputValue(form.startDate)}
                    onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-slate-200"
                    onClick={() => openNativeDatePicker(startDateRef.current)}
                    aria-label="Mở lịch — ngày bắt đầu"
                  >
                    <FiCalendar className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Thời gian kết thúc</label>
                <div className="relative mt-2">
                  <input
                    ref={endDateRef}
                    type="date"
                    className={`${INPUT_BASE} pr-11 [color-scheme:light] dark:[color-scheme:dark]`}
                    value={
                      typeof form.completionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(form.completionDate)
                        ? form.completionDate
                        : toDateInputValue(form.completionDate)
                    }
                    onChange={(e) => setForm((s) => ({ ...s, completionDate: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-slate-200"
                    onClick={() => openNativeDatePicker(endDateRef.current)}
                    aria-label="Mở lịch — ngày kết thúc"
                  >
                    <FiCalendar className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Ghi chú</label>
              <textarea
                className={`${INPUT_BASE} mt-2 min-h-[120px] max-h-[min(40vh,16rem)] resize-y overflow-y-auto py-3 leading-relaxed`}
                value={form.note || ""}
                onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                placeholder="Nhập mô tả chi tiết hoặc hướng dẫn công việc tại đây..."
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-gray-800 dark:bg-gray-950/60">
            <button
              type="button"
              className="h-11 px-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
              disabled={submitting}
            >
              <FiPlus className="h-4 w-4" aria-hidden />
              {submitting ? "Đang lưu…" : isEdit ? "Cập nhật" : "Thêm mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OtherTasksPage() {
  const location = useLocation();
  const superUser = useMemo(() => isSuperAdmin(), []);
  const isSuperAdminRoute = location.pathname.includes("/superadmin");
  const showAssigneeMultiFilter = superUser && isSuperAdminRoute;

  const [items, setItems] = useState<OtherTask[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<number[]>([]);
  const [assigneeFilterOpen, setAssigneeFilterOpen] = useState(false);
  const assigneePanelRef = useRef<HTMLDivElement>(null);

  const assigneeFilterKey = useMemo(
    () => assigneeFilterIds.slice().sort((a, b) => a - b).join(","),
    [assigneeFilterIds]
  );
  const [form, setForm] = useState<TaskPayload>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<OtherTask | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const { ask: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const assigneeMap = useMemo(() => Object.fromEntries(assignees.map((a) => [a.id, a.fullName])), [assignees]);

  const totalCount = items.length;
  const pagedItems = useMemo(() => {
    const start = page * size;
    return items.slice(start, start + size);
  }, [items, page, size]);

  async function fetchAssignees() {
    const res = await fetch(`${API_BASE}/assignees`, { headers: authHeaders(), credentials: "include" });
    if (!res.ok) throw new Error("Không tải được danh sách user");
    const data = await res.json();
    setAssignees(Array.isArray(data) ? data : []);
  }

  async function fetchItems() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "0", size: "200", sortBy: "id", sortDir: "desc" });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (showAssigneeMultiFilter && assigneeFilterIds.length > 0) {
        assigneeFilterIds.forEach((id) => params.append("assigneeUserIds", String(id)));
      }
      const res = await fetch(`${API_BASE}?${params.toString()}`, { headers: authHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Không tải được danh sách công việc");
      const data = await res.json();
      setItems(Array.isArray(data?.content) ? data.content : []);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAssignees().catch((e) => toast.error(e?.message || "Lỗi tải user"));
    fetchItems();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(fetchItems, 350);
    return () => window.clearTimeout(t);
  }, [search, statusFilter, assigneeFilterKey, showAssigneeMultiFilter, superUser]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, assigneeFilterKey]);

  useEffect(() => {
    if (!assigneeFilterOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (assigneePanelRef.current && !assigneePanelRef.current.contains(e.target as Node)) {
        setAssigneeFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [assigneeFilterOpen]);

  useEffect(() => {
    if (!showAssigneeMultiFilter) {
      setAssigneeFilterIds([]);
      setAssigneeFilterOpen(false);
    }
  }, [showAssigneeMultiFilter]);

  function toggleAssigneeFilterId(id: number) {
    setAssigneeFilterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => a - b)
    );
  }

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(totalCount / size) - 1);
    setPage((p) => (p > maxPage ? maxPage : p));
  }, [totalCount, size]);

  useEffect(() => {
    if (!detailItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailItem]);

  function openCreate() {
    setEditingId(null);
    const me = getStoredUserId();
    setForm({ ...defaultForm, assigneeUserId: me, startDate: todayDateInputValue() });
    setModalOpen(true);
  }

  function openEdit(item: OtherTask) {
    setEditingId(item.id);
    setForm({
      taskName: item.taskName || "",
      assigneeUserId: item.assigneeUserId || 0,
      status: item.status || "RECEIVED",
      startDate: item.startDate ? toDateInputValue(item.startDate) : "",
      completionDate: item.completionDate ? toDateInputValue(item.completionDate) : "",
      note: item.note || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.taskName.trim()) {
      toast.error("Vui lòng nhập tên công việc");
      return;
    }

    const me = getStoredUserId();
    const assigneeUserId = superUser ? form.assigneeUserId : me;
    if (!assigneeUserId) {
      toast.error("Vui lòng chọn người phụ trách");
      return;
    }

    const payload: TaskPayload = {
      ...form,
      assigneeUserId,
      taskName: form.taskName.trim(),
      startDate: dateInputToIsoStartOfDay(typeof form.startDate === "string" ? form.startDate : null),
      completionDate: dateInputToIsoStartOfDay(typeof form.completionDate === "string" ? form.completionDate : null),
    };

    try {
      setSubmitting(true);
      const isEdit = editingId !== null;
      const res = await fetch(isEdit ? `${API_BASE}/${editingId}` : API_BASE, {
        method: isEdit ? "PUT" : "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Lưu công việc thất bại");
      }
      toast.success(isEdit ? "Cập nhật thành công" : "Thêm công việc thành công");
      setModalOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await fetchItems();
    } catch (e: any) {
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: number) {
    const ok = await askConfirm({
      title: "Xóa công việc?",
      message: "Bạn có chắc muốn xóa công việc này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE", headers: authHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Xóa công việc thất bại");
      toast.success("Đã xóa công việc");
      await fetchItems();
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / size));
  const fromIdx = totalCount === 0 ? 0 : page * size + 1;
  const toIdx = Math.min((page + 1) * size, totalCount);

  return (
    <div className="min-h-full bg-[#eef0f8] dark:bg-gray-950">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 xl:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600">
              <FiClipboard className="h-4 w-4 shrink-0" aria-hidden />
              Quản lý nhiệm vụ
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Công việc khác</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Theo dõi và quản lý các tác vụ, công việc khác của bạn.
              {!superUser && (
                <span className="mt-1 block text-slate-500 dark:text-slate-400"></span>
              )}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
            onClick={openCreate}
          >
            <FiPlus className="h-4 w-4" aria-hidden />
            Thêm công việc mới
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/90 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              className="h-11 min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-slate-50/80 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              placeholder="Tìm theo tên công việc hoặc người phụ trách..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {showAssigneeMultiFilter && (
              <div className="relative min-w-[200px] shrink-0" ref={assigneePanelRef}>
                <button
                  type="button"
                  onClick={() => setAssigneeFilterOpen((o) => !o)}
                  className={`${FILTER_SELECT_LIKE} ${FILTER_SELECT_LIKE_BORDER} ${FILTER_SELECT_LIKE_FOCUS} w-full max-w-[min(100vw,280px)] cursor-pointer text-left ${
                    assigneeFilterOpen ? FILTER_SELECT_LIKE_OPEN : ""
                  }`}
                  aria-expanded={assigneeFilterOpen}
                  aria-haspopup="listbox"
                  aria-label="Lọc theo người phụ trách"
                >
                  <span className="block truncate">
                    {assigneeFilterIds.length === 0
                      ? "Tất cả người phụ trách"
                      : assigneeFilterIds.length === 1
                        ? assignees.find((u) => u.id === assigneeFilterIds[0])?.fullName ?? "1 người phụ trách"
                        : `${assigneeFilterIds.length} người phụ trách`}
                  </span>
                  <span
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${assigneeFilterOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="block">
                      <path d="M6 8L1 3h10L6 8z" />
                    </svg>
                  </span>
                </button>
                {assigneeFilterOpen && (
                  <div
                    className="absolute left-0 z-40 mt-1 max-h-72 min-w-full overflow-hidden overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                    role="listbox"
                    aria-label="Chọn người phụ trách"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={assigneeFilterIds.length === 0}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-gray-700 ${
                        assigneeFilterIds.length === 0 ? "bg-slate-100 dark:bg-gray-800" : ""
                      }`}
                      onClick={() => {
                        setAssigneeFilterIds([]);
                      }}
                    >
                      Tất cả người phụ trách
                    </button>
                    {assignees.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-500">Đang tải danh sách…</div>
                    ) : (
                      assignees.map((a) => {
                        const on = assigneeFilterIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="option"
                            aria-selected={on}
                            className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-gray-700 ${
                              on ? "bg-slate-50 font-medium dark:bg-gray-800/80" : ""
                            }`}
                            onClick={() => toggleAssigneeFilterId(a.id)}
                          >
                            <span className="min-w-0 flex-1 truncate">{a.fullName}</span>
                            {on ? (
                              <span className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden>
                                ✓
                              </span>
                            ) : (
                              <span className="shrink-0 w-4" aria-hidden />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
            <select
              className="h-11 min-w-[200px] rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 hidden md:grid md:grid-cols-12 md:items-center md:gap-4 md:px-5 md:pb-2">
          <div className="col-span-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Tên công việc</div>
          <div className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Trạng thái</div>
          <div className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Người phụ trách</div>
          <div className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Thời gian</div>
          <div className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Ghi chú</div>
          <div className="col-span-1 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Thao tác</div>
        </div>

        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-blue-600 text-3xl font-extrabold tracking-widest animate-pulse" aria-hidden>
                TAG
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-slate-400">
              Chưa có công việc nào. Nhấn &quot;Thêm công việc mới&quot; để bắt đầu.
            </div>
          ) : (
            pagedItems.map((item) => {
              const assigneeName =
                item.assigneeName || (item.assigneeUserId ? assigneeMap[item.assigneeUserId] : "") || "—";
              const initials = assigneeName !== "—" ? initialsFromName(assigneeName) : "?";
              const label = item.statusLabel || statusLabel(item.status);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#e4e7f2] bg-white px-4 py-4 shadow-sm transition hover:border-[#d4daea] hover:shadow-md dark:border-gray-800 dark:bg-gray-900 sm:px-5 sm:py-4"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center md:gap-4">
                    <div className="md:col-span-3 min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                        Tên công việc
                      </span>
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(item.status)}`} aria-hidden />
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-200 rounded"
                          title="Xem chi tiết"
                          onClick={() => setDetailItem(item)}
                        >
                          {item.taskName}
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                        Trạng thái
                      </span>
                      <span
                        className={`inline-flex max-w-full min-w-0 shrink items-center justify-center rounded-full px-3 py-1.5 text-center text-[10px] font-bold uppercase leading-tight tracking-wide whitespace-nowrap ${statusBadge(item.status)}`}
                      >
                        {label}
                      </span>
                    </div>

                    <div className="md:col-span-2 min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                        Người phụ trách
                      </span>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {initials}
                        </div>
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{assigneeName}</span>
                      </div>
                    </div>

                    <div className="md:col-span-2 min-w-0 text-sm text-slate-700 dark:text-slate-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                        Thời gian
                      </span>
                      <span className="whitespace-nowrap">{formatDateRange(item.startDate, item.completionDate)}</span>
                    </div>

                    <div className="md:col-span-2 min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                        Ghi chú
                      </span>
                      <p
                        className="truncate text-sm italic text-slate-500 dark:text-slate-400"
                        title={item.note?.trim() || undefined}
                      >
                        {item.note?.trim() ? item.note : "—"}
                      </p>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-end gap-1 border-t border-slate-100 pt-3 md:border-0 md:pt-0 dark:border-gray-800">
                      <button
                        type="button"
                        className="rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-gray-800"
                        title="Sửa"
                        onClick={() => openEdit(item)}
                      >
                        <FiEdit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                        title="Xóa"
                        onClick={() => onDelete(item.id)}
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Hiển thị <span className="font-semibold text-slate-900 dark:text-white">{fromIdx}</span> đến{" "}
              <span className="font-semibold text-slate-900 dark:text-white">{toIdx}</span> trên{" "}
              <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> công việc
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>Hiển thị:</span>
                <select
                  value={String(size)}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    setPage(0);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(0)}
                  disabled={page <= 0}
                  className="h-9 min-w-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200"
                  title="Đầu"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page <= 0}
                  className="h-9 min-w-9 rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
                  title="Trước"
                >
                  ‹
                </button>
                {(() => {
                  const maxButtons = Math.min(5, totalPages);
                  let start = Math.max(0, page - Math.floor(maxButtons / 2));
                  if (start + maxButtons > totalPages) start = totalPages - maxButtons;
                  return Array.from({ length: maxButtons }, (_, i) => {
                    const p = start + i;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`h-9 min-w-9 rounded-lg px-3 text-sm font-medium ${
                          page === p
                            ? "bg-blue-600 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200"
                        }`}
                      >
                        {p + 1}
                      </button>
                    );
                  });
                })()}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-9 min-w-9 rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
                  title="Tiếp"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="h-9 min-w-9 rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900"
                  title="Cuối"
                >
                  »
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmDialog}

      <DetailModal
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        assigneeMap={assigneeMap}
        onEdit={(row) => openEdit(row)}
      />

      <FormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        form={form}
        setForm={setForm}
        assignees={assignees}
        editingId={editingId}
        submitting={submitting}
        onSubmit={handleSubmit}
        canPickAssignee={superUser}
      />
    </div>
  );
}
