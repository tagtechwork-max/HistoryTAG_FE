import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiCalendar,
  FiCheck,
  FiDownload,
  FiEdit2,
  FiFile,
  FiPlus,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { isSuperAdmin } from "../../utils/permission";

type TicketFile = {
  id?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
};

type DevSentTicket = {
  id: number;
  title: string;
  content?: string | null;
  hospitalId?: number | null;
  hospitalName?: string | null;
  ticketType?: string | null;
  ticketTypeLabel?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  pauseReason?: string | null;
  requesterAcknowledged?: boolean;
  requesterAcknowledgedAt?: string | null;
  requesterAcknowledgedByName?: string | null;
  priority?: string | null;
  priorityLabel?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  deadline?: string | null;
  personInChargeUserId?: number | null;
  personInChargeName?: string | null;
  devHandlerUserId?: number | null;
  devHandlerName?: string | null;
  minutesFiles?: TicketFile[];
  apiFiles?: TicketFile[];
  hasMinutesFile?: boolean;
  hasApiFile?: boolean;
  createdByName?: string | null;
  createdAt?: string | null;
};

type SelectOption = { id: number; name: string };

type TelegramStatus = {
  enabled?: boolean;
  tokenConfigured?: boolean;
  chatIdConfigured?: boolean;
  ready?: boolean;
  botUsername?: string | null;
  message?: string | null;
  recentChats?: Array<{ chatIdHint: string; title: string; type: string }>;
};

type FormState = {
  title: string;
  content: string;
  hospital: SelectOption | null;
  ticketType: string;
  status: string;
  pauseReason: string;
  priority: string;
  startDate: string;
  endDate: string;
  deadline: string;
  personInCharge: SelectOption | null;
  devHandler: SelectOption | null;
  minutesFiles: File[];
  apiFiles: File[];
  existingMinutesFiles: TicketFile[];
  existingApiFiles: TicketFile[];
};

const API_ROOT = import.meta.env.VITE_API_URL || "";

const STATUS_OPTIONS = [
  { value: "RECEIVED", label: "Đã tiếp nhận" },
  { value: "IN_PROCESS", label: "Đang xử lý" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "ISSUE", label: "Tạm dừng" },
  { value: "CANCELLED", label: "Hủy" },
];

const PRIORITY_OPTIONS = [
  { value: "P0", label: "Rất Khẩn cấp" },
  { value: "P1", label: "Khẩn cấp" },
  { value: "P2", label: "Quan trọng" },
  { value: "P3", label: "Thường xuyên" },
  { value: "P4", label: "Thấp" },
];

const STATUS_FILTER_OPTIONS = [
  ...STATUS_OPTIONS,
  { value: "TAG_ACK", label: "Hoàn thành (TAG)" },
  { value: "TAG_PENDING", label: "Chưa hoàn thành (TAG)" },
];

const TYPE_OPTIONS = [
  { value: "TRIEN_KHAI", label: "Triển khai" },
  { value: "UPDATE", label: "Update" },
  { value: "BAO_TRI", label: "Bảo trì" },
];

const defaultForm = (): FormState => ({
  title: "",
  content: "",
  hospital: null,
  ticketType: "TRIEN_KHAI",
  status: "RECEIVED",
  pauseReason: "",
  priority: "P3",
  startDate: "",
  endDate: "",
  deadline: "",
  personInCharge: null,
  devHandler: null,
  minutesFiles: [],
  apiFiles: [],
  existingMinutesFiles: [],
  existingApiFiles: [],
});

function authHeaders(extra?: Record<string, string>) {
  const token =
    localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

function getStoredUserId(): number {
  const uidStr = localStorage.getItem("userId") || sessionStorage.getItem("userId");
  if (!uidStr) return 0;
  const n = Number(uidStr);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nowDatetimeLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocalInput(value?: string | null) {
  if (!value) return "";
  try {
    const raw = String(value).trim();
    if (!raw) return "";
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      return raw.slice(0, 16);
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    }
    return raw.slice(0, 16);
  } catch {
    return "";
  }
}

function toISOOrNull(v?: string | null) {
  if (!v?.trim()) return null;
  try {
    const raw = String(v).trim();
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/);
    if (m) {
      return raw.length === 16 ? `${raw}:00` : raw.slice(0, 19);
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    return raw;
  } catch {
    return null;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
    return `${hh}:${mm}:${ss} ${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("vi-VN");
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDeadlineUrgency(deadline?: string | null, status?: string | null) {
  if (!deadline) return null;

  const statusKey = (status || "").toUpperCase();
  if (statusKey === "COMPLETED" || statusKey === "CANCELLED") return null;

  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) return null;

  const daysLeft = Math.round(
    (startOfDay(deadlineDate).getTime() - startOfDay(new Date()).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (daysLeft > 1) return null;

  if (daysLeft < 0) {
    return { label: `Quá hạn ${Math.abs(daysLeft)} ngày`, urgent: true };
  }
  return { label: `Còn ${daysLeft} ngày`, urgent: true };
}

function DeadlineCell({
  deadline,
  status,
}: {
  deadline?: string | null;
  status?: string | null;
}) {
  if (!deadline) return <>—</>;

  const urgency = getDeadlineUrgency(deadline, status);

  return (
    <div className="whitespace-nowrap">
      <span className={urgency?.urgent ? "font-medium text-red-600" : undefined}>
        {formatDateTime(deadline)}
      </span>
      {urgency?.label && (
        <div className="mt-0.5 text-xs font-medium text-red-600">{urgency.label}</div>
      )}
    </div>
  );
}

function clsx(...arr: Array<string | false | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function statusBadgeClass(status?: string | null) {
  const key = (status || "").toUpperCase();
  if (key === "COMPLETED") return "bg-green-100 text-green-800";
  if (key === "IN_PROCESS") return "bg-yellow-100 text-yellow-800";
  if (key === "ISSUE") return "bg-orange-100 text-orange-800";
  if (key === "CANCELLED") return "bg-gray-100 text-gray-700";
  return "bg-blue-100 text-blue-800";
}

function priorityBadgeClass(priority?: string | null) {
  const key = (priority || "").toUpperCase();
  if (key === "P0" || key === "P1") return "bg-red-100 text-red-800";
  if (key === "P2") return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-700";
}

function parseDownloadFilename(
  disposition: string | null,
  fallback: string
): string {
  if (!disposition) return fallback;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const match = disposition.match(/filename="?([^";\n]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

function fileDownloadKind(file: TicketFile): "minutes" | "api" {
  return file.fileType?.toUpperCase() === "API" ? "api" : "minutes";
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MultiFileUpload({
  label,
  hint,
  files,
  existingFiles,
  onChange,
  onDownloadExisting,
}: {
  label: string;
  hint?: string;
  files: File[];
  existingFiles: TicketFile[];
  onChange: (files: File[]) => void;
  onDownloadExisting?: (file: TicketFile) => void;
}) {
  const inputId = useMemo(
    () => `file-upload-${label.replace(/\s+/g, "-").toLowerCase()}`,
    [label]
  );

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    const next = [...files];
    Array.from(incoming).forEach((file) => {
      const dup = next.some((f) => f.name === file.name && f.size === file.size);
      if (!dup) next.push(file);
    });
    onChange(next);
  };

  return (
    <Field label={label}>
      <div className="space-y-2">
        <label
          htmlFor={inputId}
          className={clsx(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed",
            "border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/50",
            "px-4 py-6 cursor-pointer transition hover:border-brand-500 hover:bg-brand-50/30 dark:hover:bg-gray-800"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addFiles(e.dataTransfer.files);
          }}
        >
          <FiUploadCloud className="text-2xl text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Kéo thả hoặc bấm để chọn file
          </span>
          <span className="text-xs text-gray-500">Có thể chọn nhiều file cùng lúc</span>
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
          <input
            id={inputId}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {existingFiles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">File đã lưu ({existingFiles.length})</p>
            {existingFiles.map((f, idx) => (
              <div
                key={`existing-${f.id ?? idx}`}
                role={onDownloadExisting ? "button" : undefined}
                tabIndex={onDownloadExisting ? 0 : undefined}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border bg-white dark:bg-gray-900 px-3 py-2 text-sm",
                  onDownloadExisting &&
                    "cursor-pointer hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-gray-800"
                )}
                onClick={() => onDownloadExisting?.(f)}
                onKeyDown={(e) => {
                  if (onDownloadExisting && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onDownloadExisting(f);
                  }
                }}
                title={onDownloadExisting ? "Tải xuống" : undefined}
              >
                {onDownloadExisting ? (
                  <FiDownload className="shrink-0 text-blue-600" />
                ) : (
                  <FiFile className="shrink-0 text-gray-400" />
                )}
                <span className="flex-1 truncate">{f.fileName || "File"}</span>
                {f.fileSize ? (
                  <span className="text-xs text-gray-400">{formatFileSize(f.fileSize)}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">File mới ({files.length})</p>
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${file.size}-${idx}`}
                className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/40 dark:bg-brand-950/20 px-3 py-2 text-sm"
              >
                <FiFile className="shrink-0 text-brand-500" />
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-red-50 text-red-500"
                  onClick={() => onChange(files.filter((_, i) => i !== idx))}
                  aria-label="Xóa file"
                >
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function RemoteSelect({
  label,
  placeholder,
  fetchOptions,
  value,
  onChange,
  required,
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  fetchOptions: (q: string) => Promise<SelectOption[]>;
  value: SelectOption | null;
  onChange: (v: SelectOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchOptions(q.trim());
        if (alive) setOptions(res);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, fetchOptions]);

  return (
    <Field label={label} required={required}>
      <div className="relative">
        <input
          className="h-10 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none focus:ring-2 focus:ring-brand-500/40"
          placeholder={placeholder || "Gõ để tìm..."}
          value={open ? q : value?.name || ""}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => onChange(null)}
          >
            ✕
          </button>
        )}
        {open && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-white dark:bg-gray-900 shadow-lg">
            {loading && <div className="px-3 py-2 text-sm text-gray-500">Đang tải...</div>}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
            )}
            {!loading &&
              options.map((opt) => (
                <div
                  key={opt.id}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt);
                    setOpen(false);
                  }}
                >
                  {opt.name}
                </div>
              ))}
          </div>
        )}
      </div>
    </Field>
  );
}

export default function TicketSentDevPage() {
  const location = useLocation();
  const isSuperAdminRoute = location.pathname.includes("/superadmin");
  const superUser = useMemo(() => isSuperAdmin(), []);
  const { activeTeam } = useAuth();
  const canConfirmRequester =
    activeTeam === "DEPLOYMENT" || activeTeam === "MAINTENANCE";
  const apiBase = `${API_ROOT}/api/v1/admin/dev-sent-tickets`;
  const telegramApiBase = `${API_ROOT}/api/v1/superadmin/dev-sent-tickets/telegram`;
  const { ask: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const [items, setItems] = useState<DevSentTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<DevSentTicket | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  const searchHospitals = useCallback(async (term: string) => {
    const url = `${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(term)}`;
    const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    if (!res.ok) return [];
    const list = await res.json();
    return (Array.isArray(list) ? list : []).map(
      (h: { id?: number; label?: string; name?: string }) => ({
        id: Number(h.id),
        name: String(h.label ?? h.name ?? h.id),
      })
    );
  }, []);

  const searchItUsers = useCallback(async (term: string) => {
    const url = `${API_ROOT}/api/v1/admin/users/search?department=IT&includeSuperAdmin=true&name=${encodeURIComponent(term)}`;
    const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    if (!res.ok) return [];
    const list = await res.json();
    return (Array.isArray(list) ? list : []).map(
      (u: { id?: number; label?: string }) => ({
        id: Number(u.id),
        name: String(u.label ?? u.id),
      })
    );
  }, []);

  const searchDevUsers = useCallback(async (term: string) => {
    const url = `${API_ROOT}/api/v1/admin/users/search?department=IT&team=DEV&includeSuperAdmin=true&name=${encodeURIComponent(term)}`;
    const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    if (!res.ok) return [];
    const list = await res.json();
    return (Array.isArray(list) ? list : []).map(
      (u: { id?: number; label?: string }) => ({
        id: Number(u.id),
        name: String(u.label ?? u.id),
      })
    );
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
        sortBy: "id",
        sortDir: "desc",
      });
      if (search.trim()) params.set("search", search.trim());
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("ticketType", filterType);

      const res = await fetch(`${apiBase}?${params}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được danh sách ticket");
      const data = await res.json();
      setItems(Array.isArray(data.content) ? data.content : []);
      const total = Number(data.totalElements) || 0;
      setTotalCount(total);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [apiBase, page, size, search, filterStatus, filterType]);

  useEffect(() => {
    const maxPage = Math.max(0, totalPages - 1);
    if (page > maxPage) setPage(maxPage);
  }, [page, totalPages]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadTelegramStatus = useCallback(async (discover = false) => {
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      const path = discover ? "/discover" : "/status";
      const res = await fetch(`${telegramApiBase}${path}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Backend chưa có API Telegram — cần restart backend mới build");
      }
      setTelegramStatus(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi Telegram";
      setTelegramError(msg);
      toast.error(msg);
    } finally {
      setTelegramLoading(false);
    }
  }, [telegramApiBase]);

  useEffect(() => {
    if (superUser) {
      loadTelegramStatus(false);
    }
  }, [loadTelegramStatus, superUser]);

  const testTelegram = async () => {
    setTelegramLoading(true);
    try {
      const res = await fetch(`${telegramApiBase}/test`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Gửi test thất bại");
      toast.success(data.message || "Đã gửi tin test tới Telegram");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi gửi test");
    } finally {
      setTelegramLoading(false);
    }
  };

  const openCreate = async () => {
    const uid = getStoredUserId();
    let defaultPic: SelectOption | null = null;
    if (uid > 0) {
      const users = await searchItUsers("");
      defaultPic = users.find((u) => u.id === uid) || null;
    }
    setEditingId(null);
    setForm({ ...defaultForm(), personInCharge: defaultPic, startDate: nowDatetimeLocalInput() });
    setModalOpen(true);
  };

  const openEdit = (item: DevSentTicket) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      content: item.content || "",
      hospital: item.hospitalId
        ? { id: item.hospitalId, name: item.hospitalName || `#${item.hospitalId}` }
        : null,
      ticketType: item.ticketType || "TRIEN_KHAI",
      status: item.status || "RECEIVED",
      pauseReason: item.pauseReason || "",
      priority: item.priority || "P3",
      startDate: toDatetimeLocalInput(item.startDate),
      endDate: toDatetimeLocalInput(item.endDate),
      deadline: toDatetimeLocalInput(item.deadline),
      personInCharge: item.personInChargeUserId
        ? {
            id: item.personInChargeUserId,
            name: item.personInChargeName || `#${item.personInChargeUserId}`,
          }
        : null,
      devHandler: item.devHandlerUserId
        ? { id: item.devHandlerUserId, name: item.devHandlerName || `#${item.devHandlerUserId}` }
        : null,
      minutesFiles: [],
      apiFiles: [],
      existingMinutesFiles: item.minutesFiles || [],
      existingApiFiles: item.apiFiles || [],
    });
    setModalOpen(true);
  };

  const openDetail = (item: DevSentTicket) => {
    setViewItem(item);
    setDetailOpen(true);
  };

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("title", form.title.trim());
    fd.append("content", form.content || "");
    if (form.hospital) fd.append("hospitalId", String(form.hospital.id));
    fd.append("ticketType", form.ticketType);
    fd.append("status", form.status);
    if (form.status === "ISSUE" && form.pauseReason.trim()) {
      fd.append("pauseReason", form.pauseReason.trim());
    }
    if (form.priority) fd.append("priority", form.priority);
    const startIso = toISOOrNull(form.startDate) || toISOOrNull(nowDatetimeLocalInput());
    const endIso = toISOOrNull(form.endDate);
    const deadlineIso = toISOOrNull(form.deadline);
    fd.append("startDate", startIso!);
    if (endIso) fd.append("endDate", endIso);
    if (deadlineIso) fd.append("deadline", deadlineIso);
    if (form.personInCharge) fd.append("personInChargeUserId", String(form.personInCharge.id));
    if (form.devHandler) fd.append("devHandlerUserId", String(form.devHandler.id));
    form.minutesFiles.forEach((file) => fd.append("minutesFiles", file));
    form.apiFiles.forEach((file) => fd.append("apiFiles", file));
    return fd;
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error("Vui lòng nhập tiêu đề");
    if (!form.hospital) return toast.error("Vui lòng chọn cơ sở y tế");
    if (!form.personInCharge) return toast.error("Vui lòng chọn người phụ trách");
    if (form.status === "ISSUE" && !form.pauseReason.trim()) {
      return toast.error("Vui lòng nhập lý do tạm dừng");
    }

    setSaving(true);
    try {
      const fd = buildFormData();
      const url = editingId ? `${apiBase}/${editingId}` : apiBase;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: authHeaders(),
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Lưu ticket thất bại");
      }
      toast.success(editingId ? "Cập nhật ticket thành công" : "Tạo ticket thành công — đã gửi thông báo Telegram");
      setModalOpen(false);
      loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu ticket");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRequester = async (item: DevSentTicket) => {
    if (item.requesterAcknowledged) return;
    const ok = await askConfirm({
      title: "Xác nhận hoàn thành",
      message: "Bạn có muốn hoàn thành công việc này không?",
      confirmLabel: "Xác nhận",
    });
    if (!ok) return;

    setConfirmingId(item.id);
    try {
      const res = await fetch(`${apiBase}/${item.id}/confirm-requester`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Xác nhận thất bại");
      }
      const updated = (await res.json()) as DevSentTicket;
      setItems((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      if (viewItem?.id === updated.id) {
        setViewItem((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      toast.success("Đã xác nhận hoàn thành công việc");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xác nhận thất bại");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await askConfirm({
      title: "Xóa ticket này?",
      message: "Hành động không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Xóa thất bại");
      toast.success("Đã xóa ticket");
      loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xóa");
    }
  };

  const downloadFile = async (ticketId: number, file: TicketFile) => {
    const kind = fileDownloadKind(file);
    const path = file.id
      ? `${apiBase}/${ticketId}/files/${file.id}/download`
      : `${apiBase}/${ticketId}/${kind}-file/download`;
    const fallbackName = file.fileName || (kind === "api" ? "file-api" : "bien-ban");
    const loadingToast = toast.loading(`Đang tải ${fallbackName}...`);
    try {
      const res = await fetch(path, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Tải file thất bại");
      }
      const blob = await res.blob();
      const filename = parseDownloadFilename(
        res.headers.get("Content-Disposition"),
        fallbackName
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ${filename}`, { id: loadingToast });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải file", { id: loadingToast });
    }
  };

  const pageTitle = useMemo(
    () => (isSuperAdminRoute ? "Quản lý Tickets (SuperAdmin)" : "Quản lý Tickets"),
    [isSuperAdminRoute]
  );

  const fromIdx = totalCount === 0 ? 0 : page * size + 1;
  const toIdx = Math.min((page + 1) * size, totalCount);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {confirmDialog}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {superUser
              ? "Quản lý tickets gửi team DEV — tạo mới sẽ thông báo qua Telegram channel"
              : "Quản lý tickets gửi team DEV"}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
        >
          <FiPlus /> Thêm ticket
        </button>
      </div>

      {superUser && !telegramStatus?.ready && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-2 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Backend chưa nhận cấu hình Telegram (Enabled / Token / Chat ID đang ✗)
          </p>
          <p className="text-amber-800 dark:text-amber-300 text-xs">
            Cần <strong>restart backend</strong> sau khi cấu hình Telegram trên server (.env).
            Token và Chat ID không hiển thị trên trình duyệt.
          </p>
        </div>
      )}

      {superUser && (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-sm">Telegram Bot — @tag_dev_ticket_bot</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {telegramError ||
                telegramStatus?.message ||
                (telegramLoading ? "Đang kiểm tra..." : "Đang kiểm tra cấu hình...")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={telegramLoading}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => loadTelegramStatus(false)}
            >
              Kiểm tra
            </button>
            <button
              type="button"
              disabled={telegramLoading}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              onClick={() => loadTelegramStatus(true)}
            >
              Lấy chat ID
            </button>
            <button
              type="button"
              disabled={telegramLoading || !telegramStatus?.ready}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50"
              onClick={testTelegram}
            >
              Gửi test
            </button>
          </div>
        </div>
        {telegramStatus && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={clsx("px-2 py-1 rounded-full", telegramStatus.enabled ? "bg-green-100 text-green-800" : "bg-gray-100")}>
              Enabled: {telegramStatus.enabled ? "✓" : "✗"}
            </span>
            <span className={clsx("px-2 py-1 rounded-full", telegramStatus.tokenConfigured ? "bg-green-100 text-green-800" : "bg-gray-100")}>
              Token: {telegramStatus.tokenConfigured ? "✓" : "✗"}
            </span>
            <span className={clsx("px-2 py-1 rounded-full", telegramStatus.chatIdConfigured ? "bg-green-100 text-green-800" : "bg-gray-100")}>
              Chat ID: {telegramStatus.chatIdConfigured ? "✓" : "✗"}
            </span>
            {telegramStatus.botUsername && (
              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                @{telegramStatus.botUsername}
              </span>
            )}
          </div>
        )}
        {telegramStatus?.recentChats && telegramStatus.recentChats.length > 0 && (
          <div className="text-xs space-y-1 border-t pt-2">
            <p className="font-medium">Group tìm thấy (Chat ID che trên trình duyệt — xem log server):</p>
            {telegramStatus.recentChats.map((c, idx) => (
              <div key={`${c.chatIdHint}-${idx}`} className="font-mono bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                {c.chatIdHint} — {c.title} ({c.type})
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className="h-10 rounded-xl border px-3 dark:bg-gray-900 dark:border-gray-700"
          placeholder="Tìm tiêu đề, nội dung, bệnh viện..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          className="h-10 rounded-xl border px-3 dark:bg-gray-900 dark:border-gray-700"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border px-3 dark:bg-gray-900 dark:border-gray-700"
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Tất cả loại</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="h-10 rounded-xl border px-3 hover:bg-gray-50 dark:hover:bg-gray-800"
          onClick={() => loadList()}
        >
          Làm mới
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Tiêu đề</th>
              <th className="px-4 py-3">Cơ sở y tế</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ưu tiên</th>
              <th className="px-4 py-3">Dev xử lý</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  Chưa có ticket nào
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td
                    className="px-4 py-3 cursor-pointer text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                    title="Xem chi tiết"
                    onClick={() => openDetail(item)}
                  >
                    #{item.id}
                  </td>
                  <td
                    className="px-4 py-3 font-medium max-w-[220px] truncate cursor-pointer text-blue-700 dark:text-blue-400 hover:underline"
                    title="Xem chi tiết"
                    onClick={() => openDetail(item)}
                  >
                    {item.title}
                  </td>
                  <td className="px-4 py-3 max-w-[180px] truncate">{item.hospitalName || "—"}</td>
                  <td className="px-4 py-3">{item.ticketTypeLabel || item.ticketType}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-1 rounded-full text-xs", statusBadgeClass(item.status))}>
                      {item.statusLabel || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-1 rounded-full text-xs", priorityBadgeClass(item.priority))}>
                      {item.priorityLabel || item.priority || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.devHandlerName || "—"}</td>
                  <td className="px-4 py-3">
                    <DeadlineCell deadline={item.deadline} status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {item.status?.toUpperCase() === "COMPLETED" &&
                        (item.requesterAcknowledged ? (
                          <span
                            className="p-2 rounded-lg text-green-600"
                            title={
                              item.requesterAcknowledgedByName
                                ? `Đã xác nhận bởi ${item.requesterAcknowledgedByName}`
                                : "Đã xác nhận hoàn thành"
                            }
                          >
                            <FiCheck className="w-5 h-5" />
                          </span>
                        ) : canConfirmRequester ? (
                          <button
                            type="button"
                            className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-green-400 hover:text-green-600 disabled:opacity-50"
                            title="Xác nhận hoàn thành"
                            disabled={confirmingId === item.id}
                            onClick={() => handleConfirmRequester(item)}
                          >
                            <FiCheck className="w-5 h-5" />
                          </button>
                        ) : null)}
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-gray-100"
                        title="Sửa"
                        onClick={() => openEdit(item)}
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                        title="Xóa"
                        onClick={() => handleDelete(item.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && totalCount > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Hiển thị <span className="font-semibold text-slate-900 dark:text-white">{fromIdx}</span> đến{" "}
            <span className="font-semibold text-slate-900 dark:text-white">{toIdx}</span> trên{" "}
            <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> ticket
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
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

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b px-5 py-4 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold">{editingId ? "Sửa ticket" : "Thêm ticket mới"}</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                <FiX />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Tiêu đề" required>
                  <input
                    className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Nội dung">
                  <textarea
                    className="min-h-[90px] w-full rounded-xl border p-3 dark:bg-gray-900"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  />
                </Field>
              </div>

              <RemoteSelect
                label="Cơ sở y tế"
                required
                fetchOptions={searchHospitals}
                value={form.hospital}
                onChange={(v) => setForm((f) => ({ ...f, hospital: v }))}
              />

              <Field label="Loại" required>
                <select
                  className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                  value={form.ticketType}
                  onChange={(e) => setForm((f) => ({ ...f, ticketType: e.target.value }))}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Trạng thái">
                <select
                  className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                  value={form.status}
                  onChange={(e) => {
                    const status = e.target.value;
                    setForm((f) => ({
                      ...f,
                      status,
                      pauseReason: status === "ISSUE" ? f.pauseReason : "",
                      endDate:
                        status === "COMPLETED" ? nowDatetimeLocalInput() : f.endDate,
                    }));
                  }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              {form.status === "ISSUE" && (
                <div className="md:col-span-2">
                  <Field label="Lý do tạm dừng" required>
                    <textarea
                      className="w-full min-h-[88px] rounded-xl border px-3 py-2 dark:bg-gray-900"
                      placeholder="Nhập lý do tại sao tạm dừng công việc..."
                      value={form.pauseReason}
                      onChange={(e) => setForm((f) => ({ ...f, pauseReason: e.target.value }))}
                    />
                  </Field>
                </div>
              )}

              <Field label="Mức độ ưu tiên">
                <select
                  className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ngày bắt đầu">
                <div className="relative">
                  <input
                    type="datetime-local"
                    className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                  <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <Field label="Ngày hoàn thành">
                <div className="relative">
                  <input
                    type="datetime-local"
                    className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                  <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <Field label="Deadline">
                <div className="relative">
                  <input
                    type="datetime-local"
                    className="h-10 w-full rounded-xl border px-3 dark:bg-gray-900"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  />
                  <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <RemoteSelect
                label="Người phụ trách (IT)"
                required
                fetchOptions={searchItUsers}
                value={form.personInCharge}
                onChange={(v) => setForm((f) => ({ ...f, personInCharge: v }))}
              />

              <RemoteSelect
                label="Dev xử lý (IT - Phát triển)"
                fetchOptions={searchDevUsers}
                value={form.devHandler}
                onChange={(v) => setForm((f) => ({ ...f, devHandler: v }))}
              />

              <div className="md:col-span-2">
                <MultiFileUpload
                  label="File biên bản"
                  hint="PDF, DOC, ZIP, XLSX, PNG, JPG..."
                  files={form.minutesFiles}
                  existingFiles={form.existingMinutesFiles}
                  onChange={(minutesFiles) => setForm((f) => ({ ...f, minutesFiles }))}
                  onDownloadExisting={
                    editingId ? (file) => downloadFile(editingId, file) : undefined
                  }
                />
              </div>

              <div className="md:col-span-2">
                <MultiFileUpload
                  label="File API"
                  hint="JSON, ZIP, PDF, DOC..."
                  files={form.apiFiles}
                  existingFiles={form.existingApiFiles}
                  onChange={(apiFiles) => setForm((f) => ({ ...f, apiFiles }))}
                  onDownloadExisting={
                    editingId ? (file) => downloadFile(editingId, file) : undefined
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                className="px-4 py-2 rounded-xl border"
                onClick={() => setModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-50"
                onClick={handleSubmit}
              >
                {saving ? "Đang lưu..." : editingId ? "Cập nhật" : "Tạo mới"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && viewItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
              <h2 className="text-lg font-semibold">Chi tiết ticket #{viewItem.id}</h2>
              <button type="button" onClick={() => setDetailOpen(false)}>
                <FiX />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm overflow-y-auto min-h-0">
              <div><span className="text-gray-500">Tiêu đề:</span> <strong>{viewItem.title}</strong></div>
              <div><span className="text-gray-500">Cơ sở y tế:</span> {viewItem.hospitalName || "—"}</div>
              <div><span className="text-gray-500">Loại:</span> {viewItem.ticketTypeLabel}</div>
              <div><span className="text-gray-500">Trạng thái:</span> {viewItem.statusLabel}</div>
              {viewItem.status?.toUpperCase() === "ISSUE" && viewItem.pauseReason && (
                <div className="text-red-600 dark:text-red-400 font-medium">
                  Lý do tạm dừng: {viewItem.pauseReason}
                </div>
              )}
              <div><span className="text-gray-500">Ưu tiên:</span> {viewItem.priorityLabel}</div>
              <div><span className="text-gray-500">Người phụ trách:</span> {viewItem.personInChargeName || "—"}</div>
              <div><span className="text-gray-500">Dev xử lý:</span> {viewItem.devHandlerName || "—"}</div>
              <div><span className="text-gray-500">Bắt đầu:</span> {formatDateTime(viewItem.startDate)}</div>
              <div><span className="text-gray-500">Ngày hoàn thành:</span> {formatDateTime(viewItem.endDate)}</div>
              <div><span className="text-gray-500">Deadline:</span> {formatDateTime(viewItem.deadline)}</div>
              {viewItem.content && (
                <div>
                  <span className="text-gray-500">Nội dung:</span>
                  <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                    {viewItem.content}
                  </p>
                </div>
              )}
              {(viewItem.minutesFiles?.length || viewItem.apiFiles?.length) ? (
                <div className="pt-2 space-y-2">
                  <p className="text-gray-500 text-xs font-medium">File đính kèm — bấm để tải xuống</p>
                  <div className="flex flex-col gap-2">
                    {[...(viewItem.minutesFiles || []), ...(viewItem.apiFiles || [])].map(
                      (file, idx) => (
                        <button
                          key={`file-${file.id ?? idx}-${file.fileName}`}
                          type="button"
                          className="inline-flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-sm hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-gray-800 transition cursor-pointer"
                          onClick={() => downloadFile(viewItem.id, file)}
                          title="Tải xuống"
                        >
                          <FiDownload className="shrink-0 text-blue-600" />
                          <span className="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                            {file.fileName || "File đính kèm"}
                          </span>
                          {file.fileSize ? (
                            <span className="text-xs text-gray-400 shrink-0">
                              {formatFileSize(file.fileSize)}
                            </span>
                          ) : null}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
