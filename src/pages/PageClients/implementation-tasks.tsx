import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import TaskCardNew from "../SuperAdmin/TaskCardNew";
import TaskNotes from "../../components/TaskNotes";
import TicketsTab from "../../pages/CustomerCare/SubCustomerCare/TicketsTab";
import { AiOutlineEye } from "react-icons/ai";
import { toast } from "react-hot-toast";
import { FiUser, FiMapPin, FiLink, FiClock, FiTag, FiPhone, FiCheckCircle, FiX } from "react-icons/fi";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { isBusinessContractTaskName as isBusinessContractTask } from "../../utils/businessContract";
import { getHospitalTickets } from "../../api/ticket.api";
import { useAuth } from '../../contexts/AuthContext';

// Helper function để parse PIC IDs từ additionalRequest
function parsePicIdsFromAdditionalRequest(additionalRequest?: string | null, picDeploymentId?: number | null): number[] {
  const ids: number[] = [];
  if (picDeploymentId) {
    ids.push(picDeploymentId);
  }
  if (additionalRequest) {
    const match = additionalRequest.match(/\[PIC_IDS:\s*([^\]]+)\]/);
    if (match) {
      const parsedIds = match[1].split(',').map(id => Number(id.trim())).filter(id => !isNaN(id) && id > 0);
      ids.push(...parsedIds);
    }
  }
  return [...new Set(ids)]; // Loại bỏ duplicate
}

export type ImplementationTaskResponseDTO = {
  id: number;
  name: string;
  hospitalId: number | null;
  hospitalName?: string | null;
  businessProjectId?: number | null;
  businessProjectName?: string | null;
  fromBusinessContract?: boolean | null;
  picDeploymentId: number | null;
  picDeploymentIds?: number[] | null;
  picDeploymentName?: string | null;
  picDeploymentNames?: string[] | null;
  receivedById?: number | null;
  receivedByName?: string | null;
  receivedDate?: string | null;
  quantity?: number | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hisSystemName?: string | null;
  hardwareId?: number | null;
  endDate?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  status?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
  team?: "DEPLOYMENT" | string;
  createdAt?: string | null;
  updatedAt?: string | null;
  transferredToMaintenance?: boolean | null;
  readOnlyForDeployment?: boolean | null;
  myRole?: "owner" | "supporter" | "viewer" | string | null;
};

export type ImplementationTaskRequestDTO = {
  name: string;
  hospitalId: number;
  picDeploymentIds: number[];
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  quantity?: number | null;
  apiTestStatus?: string | null;
  bhytPortCheckInfo?: string | null;
  additionalRequest?: string | null;
  apiUrl?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  status?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
};

export type ImplementationTaskUpdateDTO = Partial<ImplementationTaskRequestDTO>;

const STATUS_LABELS: Record<"RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED", string> = {
  RECEIVED: "Đã tiếp nhận",
  IN_PROCESS: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  ISSUE: "Gặp sự cố",
  CANCELLED: "Hủy",
};

const STATUS_OPTIONS: Array<{ value: keyof typeof STATUS_LABELS; label: string }> = (
  Object.entries(STATUS_LABELS) as Array<[keyof typeof STATUS_LABELS, string]>
).map(([value, label]) => ({ value, label }));

const STATUS_CANONICAL_MAP: Record<string, "RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED"> = {
  RECEIVED: "RECEIVED",
  IN_PROCESS: "IN_PROCESS",
  COMPLETED: "COMPLETED",
  ISSUE: "ISSUE",
  CANCELLED: "CANCELLED",
  NOT_STARTED: "RECEIVED",
  IN_PROGRESS: "IN_PROCESS",
  API_TESTING: "IN_PROCESS",
  INTEGRATING: "IN_PROCESS",
  WAITING_FOR_DEV: "IN_PROCESS",
  ACCEPTED: "COMPLETED",
  PENDING_TRANSFER: "COMPLETED",
  TRANSFERRED: "COMPLETED",
};

function normalizeStatus(status?: string | null): "RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED" | undefined {
  if (!status) return undefined;
  const upper = status.toUpperCase();
  return STATUS_CANONICAL_MAP[upper] || (upper as any);
}

function statusLabel(status?: string | null) {
  const normalized = normalizeStatus(status);
  if (!normalized) return status || "";
  return STATUS_LABELS[normalized];
}

function statusBadgeClasses(status?: string | null) {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "RECEIVED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "IN_PROCESS":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "ISSUE":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "CANCELLED":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

const API_ROOT = import.meta.env.VITE_API_URL || "";
const MIN_LOADING_MS = 2000;

// PageClients folder is admin-facing: always use admin API root for tasks
const apiBase = `${API_ROOT}/api/v1/admin/implementation/tasks`;


function authHeaders(extra?: Record<string, string>) {
  // Support a few possible storage keys for the JWT to be resilient to different login flows
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

function toLocalISOString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`; // no timezone suffix
}

function toISOOrNull(v?: string | Date | null) {
  if (!v) return null;
  try {
    if (v instanceof Date) {
      return toLocalISOString(v);
    }
    const raw = String(v).trim();
    if (!raw) return null;
    // If has timezone, keep as is
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw;
    // If datetime-local 'YYYY-MM-DDTHH:mm' or with seconds
    const m1 = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/);
    if (m1) {
      return raw.length === 16 ? `${raw}:00` : raw.slice(0, 19);
    }
    // Fallback: attempt parse and format local
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return toLocalISOString(d);
    return raw;
  } catch {
    return null;
  }
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
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      return raw.slice(0, 16);
    }

    return raw;
  } catch {
    return "";
  }
}

function fmt(dt?: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function clsx(...arr: Array<string | false | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-10 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-blue-900 px-3 outline-none",
        "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500",
        props.className || ""
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-[90px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 outline-none",
        "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500",
        props.className || ""
      )}
    />
  );
}

function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
) {
  const { variant = "primary", className, ...rest } = props;
  const base = "h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-white/90"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : "bg-transparent border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";
  return <button className={clsx(base, styles, className)} {...rest} />;
}

// Lightweight inline icons (no external deps)
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className || "w-4 h-4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className || "w-4 h-4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className || "w-4 h-4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
// helper for STT display like 001, 002
// local icons and formatStt removed — TaskCardNew provides consistent UI
function RemoteSelect({
  label,
  placeholder,
  fetchOptions,
  value,
  onChange,
  required,
  disabled,
  excludeIds,
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
  value: { id: number; name: string } | null;
  onChange: (v: { id: number; name: string } | null) => void;
  disabled?: boolean;
  excludeIds?: number[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [highlight, setHighlight] = useState<number>(-1);

  const filteredOptions = React.useMemo(() => {
    if (!excludeIds || excludeIds.length === 0) return options;
    return options.filter(opt => !excludeIds.includes(opt.id));
  }, [options, excludeIds]);

  if (disabled) {
    return (
      <Field label={label} required={required}>
        <div className="h-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 flex items-center">
          {value?.name || "-"}
        </div>
      </Field>
    );
  }

  useEffect(() => {
    // Chỉ search khi user nhập ít nhất 2 ký tự để tránh load quá nhiều dữ liệu
    if (!q.trim() || q.trim().length < 2) {
      setOptions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchOptions(q.trim());
        if (alive) setOptions(res);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, fetchOptions]);

  // KHÔNG preload khi mở dropdown - chỉ load khi user nhập ít nhất 2 ký tự
  // useEffect(() => {
  //   let alive = true;
  //   if (open && options.length === 0 && !q.trim()) {
  //     (async () => {
  //       setLoading(true);
  //       try {
  //         const res = await fetchOptions("");
  //         if (alive) setOptions(res);
  //       } finally {
  //         if (alive) setLoading(false);
  //       }
  //     })();
  //   }
  //   return () => {
  //     alive = false;
  //   };
  // }, [open]);

  return (
    <Field label={label} required={required}>
      <div className="relative">
        <input
          className={clsx(
            "h-10 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
            "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
          )}
          placeholder={placeholder || "Nhập để tìm..."}
          value={open ? q : value?.name || ""}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay nhỏ để onMouseDown trên option kịp fire trước khi đóng
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filteredOptions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlight >= 0 && filteredOptions[highlight]) {
                onChange(filteredOptions[highlight]);
                setOpen(false);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => onChange(null)}
            aria-label="Clear"
          >
            ✕
          </button>
        )}
        {open && (
          <div
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            onMouseLeave={() => setHighlight(-1)}
          >
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                {q.trim().length < 2 ? "Nhập ít nhất 2 ký tự để tìm kiếm" : "Không tìm thấy"}
              </div>
            )}
            {filteredOptions.length > 0 &&
              filteredOptions.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={clsx(
                    "px-3 py-2 text-sm cursor-pointer",
                    idx === highlight ? "bg-gray-100 dark:bg-gray-800" : ""
                  )}
                  onMouseEnter={() => setHighlight(idx)}
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


function TaskFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  userTeam,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ImplementationTaskRequestDTO> & {
    id?: number;
    hospitalName?: string | null;
    picDeploymentId?: number | null;
    picDeploymentName?: string | null;
    picDeploymentIds?: number[] | null;
    picDeploymentNames?: string[] | null;
  };
  onSubmit: (payload: ImplementationTaskRequestDTO, id?: number) => Promise<void>;
  userTeam: string;
}) {
  const fromBusinessContract =
    Boolean((initial as any)?.fromBusinessContract) ||
    Boolean((initial as any)?.businessProjectId);
  const searchHospitals = useMemo(
    () => async (term: string) => {
      const url = `${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(term)}`;
      const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
      if (!res.ok) return [];
      const list = await res.json();
      const mapped = Array.isArray(list)
        ? list.map((h: { id?: number; label?: string; name?: string; hospitalName?: string; code?: string }) => ({
          id: Number(h.id),
          name: String(h.label ?? h.name ?? h.hospitalName ?? h.code ?? h?.id),
        }))
        : [];
      return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
    },
    []
  );

  const searchPICs = useMemo(
    () => async (term: string) => {
      const params = new URLSearchParams({ name: term });
      // Lọc theo team DEPLOYMENT cho implementation tasks
      if (userTeam === "DEPLOYMENT") {
        params.set("team", "DEPLOYMENT");
      }
      // Nếu SUPERADMIN hoặc team khác, không lọc team để hiện tất cả
      const url = `${API_ROOT}/api/v1/admin/users/search?${params.toString()}`;
      const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
      if (!res.ok) return [];
      const list = await res.json();
      const mapped = Array.isArray(list)
        ? list.map((u: { id?: number; label?: string; name?: string; fullName?: string; fullname?: string; username?: string }) => ({
          id: Number(u.id),
          name: String(u.label ?? u.name ?? u.fullName ?? u.fullname ?? u.username ?? u?.id),
        }))
        : [];
      return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
    },
    [userTeam]
  );

  const currentUser = useMemo((): { id: number | null; name: string } => {
    const parseNumber = (value: unknown): number | null => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : null;
    };

    const readStoredUser = (): Record<string, any> | null => {
      try {
        const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
      } catch {
        return null;
      }
    };

    const storedUser = readStoredUser();
    let id = storedUser ? parseNumber(storedUser.id ?? storedUser.userId) : null;

    if (!id) {
      id = parseNumber(localStorage.getItem("userId") ?? sessionStorage.getItem("userId"));
    }

    const nameCandidates = [
      storedUser?.fullname,
      storedUser?.fullName,
      storedUser?.username,
      storedUser?.name,
      localStorage.getItem("username"),
      sessionStorage.getItem("username"),
    ];

    let name = "";
    for (const candidate of nameCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        name = candidate.trim();
        break;
      }
    }

    if (!name && storedUser?.email && typeof storedUser.email === "string") {
      name = storedUser.email;
    }

    return { id: id ?? null, name };
  }, []);
  const currentUserId = currentUser.id;
  const currentUserName = currentUser.name;

  // Removed loaders for Agency/HIS/Hardware (fields hidden)

  const [model, setModel] = useState<ImplementationTaskRequestDTO>(() => {
    const normalized = normalizeStatus(initial?.status)?.toString() ?? "RECEIVED";
    const isNew = !initial?.id;
    // Use explicit presence checks — don't coerce to 0 which is falsy and hides a valid id
    const defaultPicIds = initial?.picDeploymentIds && initial.picDeploymentIds.length > 0
      ? initial.picDeploymentIds
      : (initial?.picDeploymentId ? [initial.picDeploymentId] : (isNew && currentUserId ? [currentUserId] : []));
    const defaultStart = initial?.startDate || (isNew ? toLocalISOString(new Date()) : "");
    return {
      name: initial?.name || "",
      hospitalId: Number(initial?.hospitalId) || 0,
      // model requires an array; use empty array when unknown but the select (picOpts) below controls validation
      picDeploymentIds: defaultPicIds,
      apiTestStatus: initial?.apiTestStatus ?? "",
      additionalRequest: initial?.additionalRequest ?? "",
      deadline: initial?.deadline ?? "",
      completionDate: initial?.completionDate ?? "",
      status: normalized,
      startDate: defaultStart,
    };
  });

  const [hospitalOpt, setHospitalOpt] = useState<{ id: number; name: string } | null>(() => {
    const id = (initial?.hospitalId as number) || 0;
    const nm = (initial?.hospitalName as string) || "";
    return id ? { id, name: nm || String(id) } : null;
  });

  const [picOpts, setPicOpts] = useState<Array<{ id: number; name: string; _uid: string }>>(() => {
    const isNew = !initial?.id;
    const ids = initial?.picDeploymentIds && initial.picDeploymentIds.length > 0
      ? initial.picDeploymentIds
      : (initial?.picDeploymentId ? [initial.picDeploymentId] : (isNew && currentUserId ? [currentUserId] : []));
    const nm = (initial?.picDeploymentName as string) || (isNew ? currentUserName : "");
    return ids.map((id) => ({
      id: Number(id),
      name: nm && nm.trim() ? nm : String(id),
      _uid: `pic-${id}`
    }));
  });

  // Removed: agencyOpt, hisOpt, hardwareOpt (fields hidden)

  const [currentPicInput, setCurrentPicInput] = useState<{ id: number; name: string } | null>(null);

  // Refs to control one-time initialization when modal opens or task ID changes
  const prevOpenRef = useRef<boolean>(false);
  const prevInitialIdRef = useRef<number | undefined>(undefined);

  const removePic = (uid: string) => {
    setPicOpts((prev) => prev.filter(p => p._uid !== uid));
  };

  useEffect(() => {
    // Guard: only initialize when modal opens or the initial id changes
    const prevOpen = prevOpenRef.current;
    const prevId = prevInitialIdRef.current;
    const isJustOpened = open && !prevOpen;
    const isIdChanged = initial?.id !== prevId;

    if (!isJustOpened && !isIdChanged) {
      prevOpenRef.current = open;
      prevInitialIdRef.current = initial?.id;
      return;
    }

    // --- Setup model & hospital ---
    const normalizedStatus = normalizeStatus(initial?.status)?.toString() ?? "RECEIVED";
    const isNew = !initial?.id;
    const nowIso = toLocalISOString(new Date());
    const defaultStart = initial?.startDate || (isNew ? nowIso : "");

    const defaultPicIds = initial?.picDeploymentIds && initial.picDeploymentIds.length > 0
      ? initial.picDeploymentIds
      : (initial?.picDeploymentId ? [initial.picDeploymentId] : (isNew && currentUserId ? [currentUserId] : []));

    setModel({
      name: initial?.name || "",
      hospitalId: Number(initial?.hospitalId) || 0,
      picDeploymentIds: defaultPicIds,
      apiTestStatus: initial?.apiTestStatus ?? "",
      additionalRequest: initial?.additionalRequest ?? "",
      deadline: initial?.deadline ?? "",
      completionDate: initial?.completionDate ?? "",
      status: normalizedStatus,
      startDate: defaultStart,
    });

    const hid = (initial?.hospitalId as number) || 0;
    const hnm = (initial?.hospitalName as string) || "";
    setHospitalOpt(hid ? { id: hid, name: hnm || String(hid) } : null);

    // --- PIC init & resolve ---
    const primary = Number((initial as any)?.picDeploymentId) || 0;
    const pnm = (initial?.picDeploymentName as string) || (isNew ? currentUserName : "");

    // gather ids
    let rawIds: number[] = [];
    if (initial?.picDeploymentIds && Array.isArray(initial.picDeploymentIds)) {
      rawIds = initial.picDeploymentIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);
    } else {
      rawIds = defaultPicIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);
    }

    const finalIds = (primary && !rawIds.includes(primary)) ? [primary, ...rawIds] : rawIds;

    if (finalIds.length > 0) {
      if (initial?.picDeploymentNames && Array.isArray(initial.picDeploymentNames) && initial.picDeploymentNames.length === (initial?.picDeploymentIds?.length ?? 0)) {
        const results = finalIds.map((id) => {
          if (id === primary && pnm) return { id, name: pnm, _uid: `pic-${id}` };
          const idx = (initial.picDeploymentIds || []).map((x: any) => Number(x)).indexOf(id);
          const name = (idx >= 0 && initial.picDeploymentNames) ? initial.picDeploymentNames[idx] : String(id);
          return { id, name: name || String(id), _uid: `pic-${id}` };
        });
        setPicOpts(results);
      } else {
        // temporary placeholders, then batch fetch
        const tempOpts = finalIds.map(id => ({ id, name: (id === primary && pnm) ? pnm : String(id), _uid: `pic-${id}` }));
        setPicOpts(tempOpts);

        if (finalIds.length > 0) {
          const idsCsv = finalIds.join(",");
          fetch(`${API_ROOT}/api/v1/admin/users/batch?ids=${encodeURIComponent(idsCsv)}`, { headers: authHeaders(), credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then((users) => {
              const userMap = new Map<number, string>();
              if (Array.isArray(users)) {
                users.forEach((u: any) => {
                  const uid = Number(u.id);
                  const uname = u.fullName ?? u.fullname ?? u.username ?? u.name ?? u.label ?? u.email;
                  if (uid && uname) userMap.set(uid, String(uname));
                });
              }
              setPicOpts(prev => prev.map(p => userMap.has(p.id) ? { ...p, name: userMap.get(p.id)! } : p));
            })
            .catch(err => console.error("Err fetching pics", err));
        }
      }
    } else {
      setPicOpts([]);
    }

    prevOpenRef.current = open;
    prevInitialIdRef.current = initial?.id;
  }, [open, initial]);

  // Keep model.picDeploymentIds in sync with UI picOpts so payload always reflects displayed tags
  React.useEffect(() => {
    setModel((prev) => ({ ...prev, picDeploymentIds: picOpts.map((p) => Number(p.id)) }));
  }, [picOpts]);

  // Removed resolve effect for agency/his/hardware

  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;

  const lockHospital = !initial?.id && (Boolean(initial?.hospitalId) || Boolean(initial?.hospitalName));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.name?.trim()) {
      toast.error("Tên dự án không được để trống");
      return;
    }
    if (!hospitalOpt?.id) {
      toast.error("Bệnh viện không được để trống");
      return;
    }
    if (picOpts.length === 0) {
      toast.error("Người phụ trách không được để trống");
      return;
    }

    const normalizedStatus = normalizeStatus(model.status);
    const isNew = !(initial as any)?.id;
    const startDateRaw = model.startDate || (isNew ? toLocalISOString(new Date()) : "");
    const completionRaw = normalizedStatus === "COMPLETED"
      ? (model.completionDate || toLocalISOString(new Date()))
      : "";
    const payload: ImplementationTaskRequestDTO = {
      ...model,
      hospitalId: hospitalOpt.id,
      picDeploymentIds: picOpts.map(p => p.id),
      // Ensure backend receives the chosen primary PIC (first in the list)
      picDeploymentId: picOpts.length > 0 ? picOpts[0].id : undefined,
      agencyId: null,
      hisSystemId: null,
      hardwareId: null,
      quantity: null,
      bhytPortCheckInfo: null,
      apiUrl: null,
      deadline: toISOOrNull(model.deadline) || undefined,
      completionDate: toISOOrNull(completionRaw) || undefined,
      startDate: toISOOrNull(startDateRaw) || undefined,
      status: normalizedStatus || "RECEIVED",
    } as any;

    try {
      setSubmitting(true);
      await onSubmit(payload, (initial as any)?.id);
      toast.success(initial?.id ? "Cập nhật thành công" : "Tạo mới thành công");
      onClose();
    } catch (err: any) {
      toast.error("Lưu thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="w-full max-w-3xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800"
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleSubmit} className="px-6 pt-0 pb-6 grid gap-4 max-h-[80vh] overflow-y-auto no-scrollbar">
            <div className="sticky top-0 z-[100] -mx-3 px-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between py-3">
                <h3 className="text-lg font-semibold">
                  {initial?.id ? (initial?.name || "") : "Tạo tác vụ"}
                </h3>
              </div>
            </div>
            {/* Form fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tên công việc" required>
                <TextInput
                  disabled={fromBusinessContract}
                  value={model.name}
                  onChange={(e) => setModel((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Nhập tên công việc"
                />
              </Field>

              <RemoteSelect
                label="Bệnh viện"
                required
                placeholder="Nhập tên bệnh viện để tìm…"
                fetchOptions={searchHospitals}
                value={hospitalOpt}
                onChange={setHospitalOpt}
                disabled={fromBusinessContract || lockHospital}
              />

              <div className="col-span-2">
                {/* Dùng <div> thay vì <Field> (<label>) để tránh label forward click vào nút ✕ */}
                <div className="grid gap-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Người phụ trách (PIC) <span className="text-red-500">*</span>
                  </span>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {picOpts.map((pic, index) => (
                        <div key={pic._uid} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${index === 0
                          ? "bg-blue-100 border-blue-200 text-blue-800 font-bold"
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 text-gray-700"
                          }`}>

                          <span className="max-w-[12rem] truncate block">
                            {pic.name || (pic as any).fullName || (pic as any).label || (pic as any).username || String(pic.id) || "Không có tên"}
                            {index === 0 && " (Chính)"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePic(pic._uid); }}
                            className="text-red-500 hover:text-red-700 text-xs px-1"
                            aria-label={`Remove ${pic.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div>
                      <RemoteSelect
                        label=""
                        placeholder="Nhập tên người phụ trách để tìm…"
                        fetchOptions={searchPICs}
                        value={currentPicInput}
                        excludeIds={picOpts.map(p => p.id)}
                        onChange={(selected) => {
                          if (selected) {
                            const alreadySelected = picOpts.some(p => p.id === selected.id);
                            if (!alreadySelected) {
                              const newPic = { ...selected, _uid: `pic-${Date.now()}-${selected.id}-${Math.random().toString(36).substring(2, 9)}` };
                              setPicOpts((prev) => {
                                const updated = [...prev, newPic];
                                console.log('Added PIC:', selected.name, 'Total PICs:', updated.length);
                                return updated;
                              });
                              setCurrentPicInput(null);
                            } else {
                              console.log('PIC already selected:', selected.name);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Removed fields: quantity, agency, HIS, hardware, API URL, BHYT */}

              <Field label="Trạng thái" required>
                <select
                  className={clsx(
                    "h-10 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
                    "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                  )}
                  value={normalizeStatus(model.status)?.toString() ?? "RECEIVED"}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value;
                    setModel((s) => {
                      const normalized = normalizeStatus(value);
                      const isCompleted = normalized === "COMPLETED";
                      return {
                        ...s,
                        status: value,
                        completionDate: isCompleted ? (s.completionDate || toLocalISOString(new Date())) : "",
                      };
                    });
                  }}
                >
                  <option value="">— Chọn trạng thái —</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Deadline (ngày)">
                <TextInput
                  lang="vi"
                  type="datetime-local"
                  value={toDatetimeLocalInput(model.deadline)}
                  onChange={(e) => setModel((s) => ({ ...s, deadline: e.target.value }))}
                />
              </Field>
              <Field label="Ngày bắt đầu">
                <TextInput
                  lang="vi"
                  type="datetime-local"
                  value={toDatetimeLocalInput(model.startDate)}
                  onChange={(e) => setModel((s) => ({ ...s, startDate: e.target.value }))}
                />
              </Field>
              <Field label="Ngày hoàn thành">
                <TextInput
                  lang="vi"
                  type="datetime-local"
                  value={toDatetimeLocalInput(model.completionDate)}
                  onChange={(e) => setModel((s) => ({ ...s, completionDate: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Yêu cầu bổ sung">
              <TextArea
                value={model.additionalRequest ?? ""}
                onChange={(e) => setModel((s) => ({ ...s, additionalRequest: e.target.value }))}
                placeholder="Mô tả chi tiết yêu cầu"
              />
            </Field>
            <hr className="my-4 border-gray-200 dark:border-gray-800" />

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : initial?.id ? "Cập nhật" : "Tạo mới"}
              </Button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ✅ NEW DETAIL MODAL (đẹp)
function DetailModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: ImplementationTaskResponseDTO | null;
}) {
  const [picNames, setPicNames] = React.useState<Array<{ id: number; name: string }>>([]);
  const [loadingPics, setLoadingPics] = React.useState(false);
  const [needRelogin, setNeedRelogin] = React.useState(false);
  const [myNotes, setMyNotes] = React.useState<Array<{
    id: number;
    taskId: number;
    authorId: number;
    authorName?: string | null;
    content: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>>([]);
  const [myNoteText, setMyNoteText] = React.useState("");
  const [loadingMyNotes, setLoadingMyNotes] = React.useState(false);
  const [savingMyNote, setSavingMyNote] = React.useState(false);
  const [allNotes, setAllNotes] = React.useState<Array<{
    id: number;
    taskId: number;
    authorId: number;
    authorName?: string | null;
    content: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  }>>([]);
  const [loadingAllNotes, setLoadingAllNotes] = React.useState(false);
  // determine current user id (try stored user object first, then raw userId key)
  const currentUserId: number | null = React.useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const id = Number(parsed?.id ?? parsed?.userId);
        if (Number.isFinite(id) && id > 0) return id;
      }
    } catch {
      // ignore
    }
    const fallback = Number(localStorage.getItem("userId") || sessionStorage.getItem("userId") || 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }, []);
  // Fetch tên các PIC khi modal mở
  React.useEffect(() => {
    if (!open || !item) {
      setPicNames([]);
      return;
    }

    // Use backend data if available
    if (item.picDeploymentNames && item.picDeploymentNames.length > 0 && item.picDeploymentIds && item.picDeploymentIds.length > 0) {
      setPicNames(item.picDeploymentIds.map((id, idx) => ({
        id: Number(id),
        name: item.picDeploymentNames![idx] || String(id)
      })));
      return;
    }

    // Fallback to parsing from additionalRequest for backward compatibility
    const picIds = parsePicIdsFromAdditionalRequest(item.additionalRequest, item.picDeploymentId);
    // console.log('Parsed PIC IDs:', picIds, 'from additionalRequest:', item.additionalRequest, 'picDeploymentId:', item.picDeploymentId);

    if (picIds.length <= 1) {
      // Chỉ có 1 PIC, dùng tên từ item
      if (item.picDeploymentId && item.picDeploymentName) {
        setPicNames([{ id: item.picDeploymentId, name: item.picDeploymentName }]);
      } else {
        setPicNames([]);
      }
      return;
    }

    // Nếu có nhiều PIC nhưng không có tên cho PIC đầu tiên, vẫn fetch tất cả
    // console.log('Fetching names for', picIds.length, 'PICs');

    // Thực hiện batch lookup bằng một request duy nhất tới endpoint admin batch
    setLoadingPics(true);
    (async () => {
      try {
        if (picIds.length === 0) {
          setPicNames([]);
          return;
        }

        const idsCsv = picIds.join(",");
        const url = `${API_ROOT}/api/v1/admin/users/batch?ids=${encodeURIComponent(idsCsv)}`;
        const res = await fetch(url, { headers: authHeaders(), credentials: "include" });

        if (res.status === 401) {
          // console.warn('Admin batch API returned 401');
          setNeedRelogin(true);
          // fallback to User-<id>
          setPicNames(picIds.map((id) => ({ id, name: id === item.picDeploymentId && item.picDeploymentName ? item.picDeploymentName : `User-${id}` })));
          return;
        }

        if (!res.ok) {
          // console.warn(`Admin batch API returned ${res.status}`);
          // fallback per-id
          setPicNames(picIds.map((id) => ({ id, name: id === item.picDeploymentId && item.picDeploymentName ? item.picDeploymentName : `User-${id}` })));
          return;
        }

        const payload = await res.json();
        // payload might be Array or wrapped { content: [...] }
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : [];
        const byId = new Map<number, string>();
        for (const u of list) {
          const uid = Number(u?.id);
          if (!Number.isFinite(uid)) continue;
          const name = u?.fullName ?? u?.fullname ?? u?.name ?? u?.username ?? u?.label ?? u?.email;
          if (name) byId.set(uid, String(name).trim());
        }

        const results = picIds.map((id) => {
          if (id === item.picDeploymentId && item.picDeploymentName) return { id, name: item.picDeploymentName };
          const found = byId.get(id);
          if (found && found !== String(id)) return { id, name: found };
          return { id, name: `User-${id}` };
        });

        // console.log('Batch fetched PIC names:', results);
        setPicNames(results);
      } catch (err) {
        console.error('Error fetching PIC names (batch):', err);
        setPicNames(picIds.map((id) => ({ id, name: id === item.picDeploymentId && item.picDeploymentName ? item.picDeploymentName : `User-${id}` })));
      } finally {
        setLoadingPics(false);
      }
    })();
  }, [open, item]);

  // Fetch "ghi chú của tôi" khi mở modal (chỉ nếu backend có myRole phù hợp)
  React.useEffect(() => {
    if (!open || !item) {
      setMyNotes([]);
      setMyNoteText("");
      return;
    }
    if (item.myRole !== "owner" && item.myRole !== "supporter") {
      // Không load ghi chú nếu chỉ là viewer
      setMyNotes([]);
      setMyNoteText("");
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setLoadingMyNotes(true);
        const url = `${apiBase}/${item.id}/notes/my`;
        const res = await fetch(url, {
          method: "GET",
          headers: authHeaders(),
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          // console.warn("GET my notes failed", res.status);
          return;
        }
        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : [];
        setMyNotes(list);
        if (list.length > 0) {
          // Dùng nội dung ghi chú mới nhất để hiển thị trong textarea
          const latest = list[list.length - 1];
          setMyNoteText("");
        } else {
          setMyNoteText("");
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Error fetching my notes", err);
        }
      } finally {
        setLoadingMyNotes(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [open, item]);

  // Fetch "ghi chú của tất cả" khi modal mở (chỉ nếu backend có myRole phù hợp)
  React.useEffect(() => {
    if (!open || !item) {
      setAllNotes([]);
      setLoadingAllNotes(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setLoadingAllNotes(true);
        const url = `${apiBase}/${item.id}/notes`;
        const res = await fetch(url, {
          method: "GET",
          headers: authHeaders(),
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          // console.warn("GET all notes failed", res.status);
          return;
        }
        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : [];
        setAllNotes(list);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Error fetching all notes", err);
        }
      } finally {
        setLoadingAllNotes(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [open, item]);

  const handleSaveMyNote = async () => {
    if (!item || !item.id) return;
    const content = myNoteText.trim();
    if (!content) {
      toast.error("Nội dung ghi chú không được để trống");
      return;
    }
    try {
      setSavingMyNote(true);
      const url = `${apiBase}/${item.id}/notes/my`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        throw new Error(`POST ${url} failed: ${res.status}`);
      }
      const created = await res.json();

      // Cập nhật list ghi chú của tôi
      setMyNotes((prev) => {
        try {
          if (!created || typeof created !== 'object') return prev;
          const cid = Number((created as any).id);
          if (Number.isFinite(cid) && prev.some((p) => Number(p.id) === cid)) return prev;
        } catch { }
        return [...prev, created];
      });

      // Cập nhật list tất cả ghi chú (để hiện ngay bên kia mà ko cần F5)
      setAllNotes((prev) => {
        try {
          if (!created || typeof created !== 'object') return prev;
          const cid = Number((created as any).id);
          if (Number.isFinite(cid) && prev.some((p) => Number(p.id) === cid)) return prev;
        } catch { }
        return [...prev, created];
      });

      // 👇👇👇 SỬA Ở ĐÂY 👇👇👇
      setMyNoteText(""); // Xóa trắng ô nhập
      // 👆👆👆 (Đừng dùng created?.content ?? content)

      toast.success("Đã lưu ghi chú của bạn");
    } catch (err) {
      console.error("Error saving my note", err);
      toast.error("Lưu ghi chú thất bại, vui lòng thử lại");
    } finally {
      setSavingMyNote(false);
    }
  };

  const handleDeleteMyNote = async (noteId: number) => {
    if (!noteId) return;
    const ok = window.confirm("Bạn chắc chắn muốn xóa ghi chú này?");
    if (!ok) return;

    if (!item || !item.id) {
      toast.error("Không xác định được task");
      return;
    }

    try {
      // Call the new admin implementation task-note delete endpoint
      const url = `${apiBase}/${item.id}/notes/${noteId}`;
      console.log("Calling DELETE:", url);

      const res = await fetch(url, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });

      if (res.status === 204 || res.ok) {
        setMyNotes((prev) => prev.filter((n) => n.id !== noteId));
        toast.success("Đã xóa ghi chú");
        // refresh allNotes as well
        setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
        return;
      }

      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Lỗi ${res.status}`);
    } catch (err: any) {
      console.error("Lỗi xóa ghi chú:", err);
      toast.error("Xóa thất bại: " + (err.message || "Lỗi không xác định"));
    }
  };

  if (!open || !item) return null;

  // console.log("DetailModal item startDate", item.startDate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 250, damping: 25 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"

      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            📋 Chi tiết tác vụ triển khai
          </h2>

        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-800 dark:text-gray-200">
          {/* Grid Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <Info icon={<FiMapPin />} label="Tên: " value={item.name} />
            <Info icon={<FiMapPin />} label="Bệnh viện: " value={item.hospitalName} />
            <Info
              icon={<FiUser />}
              label="Phụ trách chính: "
              value={item.picDeploymentName || "-"}
            />
            <Info
              icon={<FiUser />}
              label="Người hỗ trợ: "
              value={
                item.picDeploymentNames && item.picDeploymentNames.length > 0
                  ? item.picDeploymentNames.join(", ")
                  : "-"
              }
            />
            <Info
              icon={<FiCheckCircle />}
              label="Người tiếp nhận: "
              value={(item as any).receivedByName || "-"}
            />
            {/* <Info icon={<FiUser />} label="Tiếp nhận bởi: " value={item.receivedByName || "—"} /> */}

            <Info
              icon={<FiTag />}
              label="Trạng thái: "
              value={
                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              }
            />


            <Info icon={<FiClock />} label="Deadline: " value={fmt(item.deadline)} />
            <Info icon={<FiClock />} label="Bắt đầu: " value={fmt(item.startDate)} />
            <Info icon={<FiClock />} label="Hoàn thành: " value={fmt(item.completionDate)} />
            <Info icon={<FiClock />} label="Tạo lúc: " value={fmt(item.createdAt)} />
            {/* <Info icon={<FiClock />} label="Cập nhật lúc: " value={fmt(item.updatedAt)} /> */}
          </div>
          {/* Additional request */}
          <div className="">
            <p className="text-gray-500 mb-2">Nội dung công việc:</p>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-gray-800 dark:text-gray-300 min-h-[60px] whitespace-pre-wrap break-words">
              {(() => {
                const notes = (item as any).notes || item.additionalRequest || "";
                // Loại bỏ phần [PIC_IDS: ...] khỏi hiển thị
                const cleaned = notes.replace(/\[PIC_IDS:\s*[^\]]+\]\s*/g, "").trim();
                return cleaned || "—";
              })()}
            </div>
          </div>

          {/* Additional request + task notes (reused component) */}
          <TaskNotes taskId={item?.id} myRole={item?.myRole} />
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Đóng
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// 🔹 Helper cho hiển thị gọn gàng
function Info({
  label,
  value,
  icon,
  stacked,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {icon && <span className="text-gray-500">{icon}</span>}
          <span>{label}</span>
        </div>
        <div className="mt-1 text-gray-700 dark:text-gray-300 text-sm break-words">{value ?? "—"}</div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {icon && <div className="min-w-[36px] flex items-center justify-center text-gray-500">{icon}</div>}
      <div className="flex-1 flex items-start">
        <div className="min-w-[125px] font-semibold text-gray-900 dark:text-gray-100">{label}</div>
        <div className="text-gray-700 dark:text-gray-300 flex-1 text-left break-words">{value ?? "—"}</div>
      </div>
    </div>
  );
}

type FilterToolbarOption = { value: string; label: string };
type FilterToolbarTotals = { label: string; value: React.ReactNode };
type FilterToolbarPicFilterProps = {
  picFilterOpen: boolean;
  setPicFilterOpen: (open: boolean) => void;
  picFilterQuery: string;
  setPicFilterQuery: (query: string) => void;
  picOptions: Array<{ id: string; label: string }>;
  filteredPicOptions: Array<{ id: string; label: string }>;
  hospitalPicFilter: string[];
  togglePicFilterValue: (value: string, checked: boolean) => void;
  clearPicFilter: () => void;
  picFilterDropdownRef: React.RefObject<HTMLDivElement | null>;
};

function FilterToolbar({
  mode,
  searchValue,
  placeholder,
  onSearchChange,
  onSearchSubmit,
  statusValue,
  onStatusChange,
  statusOptions,
  totals,
  datalistId,
  datalistOptions,
  actions,
  picFilter,
  hospitalCodeSearch,
  onHospitalCodeSearchChange,
}: {
  mode: "tasks" | "hospitals";
  searchValue: string;
  placeholder: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: FilterToolbarOption[];
  totals?: FilterToolbarTotals[];
  datalistId?: string;
  datalistOptions?: Array<{ id: number | string; label: string }>;
  actions?: React.ReactNode;
  picFilter?: FilterToolbarPicFilterProps;
  hospitalCodeSearch?: string;
  onHospitalCodeSearchChange?: (value: string) => void;
}) {
  const clearStatusFilter = () => {
    if (onStatusChange) {
      onStatusChange("");
    }
  };

  return (
    <div className="rounded-2xl border bg-white border-gray-200 p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Lọc</h3>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition dark:border-gray-700 dark:bg-gray-900"
              placeholder={placeholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && onSearchSubmit) {
                  onSearchSubmit();
                }
              }}
              list={datalistId}
            />
            {datalistId && datalistOptions && datalistOptions.length > 0 && (
              <datalist id={datalistId}>
                {datalistOptions.map((opt) => (
                  <option key={opt.id ?? opt.label} value={opt.label} />
                ))}
              </datalist>
            )}

            {mode === "hospitals" && hospitalCodeSearch !== undefined && onHospitalCodeSearchChange && (
              <input
                type="text"
                className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition dark:border-gray-700 dark:bg-gray-900"
                placeholder="Tìm theo mã bệnh viện"
                value={hospitalCodeSearch}
                onChange={(e) => onHospitalCodeSearchChange(e.target.value)}
              />
            )}

            {statusOptions && statusOptions.length > 0 && onStatusChange && (
              <div className="flex items-center gap-2 w-[280px]">
                <select
                  className="w-[200px] rounded-full border px-4 py-3 text-sm shadow-sm border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition dark:border-gray-700 dark:bg-gray-900"
                  value={statusValue ?? ""}
                  onChange={(e) => onStatusChange(e.target.value)}
                >
                  {statusOptions.map((opt, index) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={index === 0 && opt.value === ""}
                      hidden={index === 0 && opt.value === ""}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${statusValue ? "visible" : "invisible pointer-events-none"}`}
                  onClick={clearStatusFilter}
                >
                  Bỏ lọc
                </button>
              </div>
            )}
          </div>

          {picFilter && (
            <div ref={picFilter.picFilterDropdownRef} className="flex flex-col gap-0 mt-3">
              <div className="relative w-full max-w-[200px]">
                <button
                  type="button"
                  className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between gap-2"
                  onClick={() => picFilter.setPicFilterOpen(!picFilter.picFilterOpen)}
                >
                  <span className="truncate">
                    {picFilter.hospitalPicFilter.length === 0
                      ? "Lọc người phụ trách"
                      : picFilter.hospitalPicFilter.length === 1
                        ? picFilter.picOptions.find((opt) => opt.id === picFilter.hospitalPicFilter[0])?.label ?? "Đã chọn 1"
                        : `Đã chọn ${picFilter.hospitalPicFilter.length} người phụ trách`}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${picFilter.picFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {picFilter.picFilterOpen && (
                  <div className="absolute z-30 mt-2 w-60 max-h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3 dark:border-gray-700 dark:bg-gray-800">
                    <input
                      type="text"
                      value={picFilter.picFilterQuery}
                      onChange={(e) => picFilter.setPicFilterQuery(e.target.value)}
                      placeholder="Tìm người phụ trách"
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                      {picFilter.filteredPicOptions.length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-6">
                          Không có dữ liệu người phụ trách
                        </div>
                      ) : (
                        picFilter.filteredPicOptions.map((option) => {
                          const value = String(option.id);
                          const checked = picFilter.hospitalPicFilter.includes(value);
                          return (
                            <label key={option.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-1.5 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => picFilter.togglePicFilterValue(value, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{option.label}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm text-blue-600 hover:underline focus:outline-none disabled:opacity-50"
                        onClick={picFilter.clearPicFilter}
                        disabled={picFilter.hospitalPicFilter.length === 0}
                      >
                        Bỏ lọc
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 focus:outline-none dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        onClick={() => picFilter.setPicFilterOpen(false)}
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`self-start px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${picFilter.hospitalPicFilter.length === 0 ? "invisible pointer-events-none" : ""}`}
                onClick={picFilter.clearPicFilter}
              >
                Bỏ lọc người phụ trách
              </button>
            </div>
          )}

          {totals && totals.length > 0 && (
            <div className=" flex flex-wrap items-center  text-sm text-gray-600 dark:text-gray-300">
              {totals.map((item) => (
                <span key={item.label} className="font-normal text-gray-800 dark:text-gray-100">
                  {item.label}{" "}
                  <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
    </div>
  );
}

const ImplementationTasksPage: React.FC = () => {
  const [data, setData] = useState<ImplementationTaskResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ImplementationTaskResponseDTO | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [enableItemAnimation, setEnableItemAnimation] = useState<boolean>(true);

  const { subscribe } = useWebSocket();

  const [hospitalQuery, setHospitalQuery] = useState<string>("");
  const [hospitalOptions, setHospitalOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ImplementationTaskResponseDTO | null>(null);
  // hospital list view state (like SuperAdmin page)
  const [showHospitalList, setShowHospitalList] = useState<boolean>(true);
  const [hospitalsWithTasks, setHospitalsWithTasks] = useState<Array<{ id: number | null; label: string; subLabel?: string; hospitalCode?: string; taskCount?: number; acceptedCount?: number; nearDueCount?: number; overdueCount?: number; transferredCount?: number; allTransferred?: boolean; allAccepted?: boolean; personInChargeId?: number | null; personInChargeName?: string | null; hiddenPendingCount?: number; hiddenTaskCount?: number; acceptedFromBusiness?: boolean; hasBusinessPlaceholder?: boolean; picDeploymentIds?: Array<string | number>; picDeploymentNames?: string[] }>>([]);
  const [loadingHospitals, setLoadingHospitals] = useState<boolean>(false);
  const [hospitalPage, setHospitalPage] = useState<number>(0);
  const [hospitalSize, setHospitalSize] = useState<number>(20);
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [hospitalSearch, setHospitalSearch] = useState<string>("");
  const [hospitalCodeSearch, setHospitalCodeSearch] = useState<string>("");
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState<string>("");
  const [hospitalPicFilter, setHospitalPicFilter] = useState<string[]>([]);
  const [picFilterOpen, setPicFilterOpen] = useState(false);
  const [picFilterQuery, setPicFilterQuery] = useState("");
  const [picOptions, setPicOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [hospitalSortBy, setHospitalSortBy] = useState<string>("label");
  const [hospitalSortDir, setHospitalSortDir] = useState<string>("asc");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [bulkCompleting, setBulkCompleting] = useState(false);

  const picFilterDropdownRef = useRef<HTMLDivElement>(null);

  const searchDebounce = useRef<number | null>(null);
  const readStored = <T = unknown>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
  const { isSuperAdmin, activeTeam } = useAuth();
  const currentUser = readStored<{ id?: number; username?: string; team?: string; roles?: unknown[] }>("user") || null;
  // Prefer activeTeam from JWT (new way), fallback to localStorage (old way)
  const userTeam = (activeTeam || currentUser?.team || "").toString().toUpperCase();
  // SUPERADMIN can always manage, DEPLOYMENT team can manage
  const canManage = isSuperAdmin || userTeam === "DEPLOYMENT";

  // Filter out tasks from Business that haven't been received yet
  const filtered = useMemo(() => {
    return data.filter((r) => {
      const rr = r as Record<string, unknown>;
      const rod = (rr['readOnlyForDeployment'] as unknown as boolean) === true;
      const received = Boolean(rr['receivedById'] || rr['receivedByName']);
      const nameRaw = typeof rr['name'] === 'string' ? (rr['name'] as string) : String(rr['name'] ?? '');
      const businessPlaceholder = isBusinessContractTask(nameRaw);
      // Hide if it's from Business and not received yet
      if (rod && !received) return false;
      if (businessPlaceholder && !received) return false;
      return true;
    });
  }, [data]);

  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const navigate = useNavigate();
  // Pending (Business -> Deployment) modal state
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingGroups, setPendingGroups] = useState<Array<{ hospitalName: string; hospitalId: number | null; tasks: ImplementationTaskResponseDTO[] }>>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const pendingCountRef = useRef<number>(0);
  const lastPendingCountRef = useRef<number>(0);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [selectedHospitalIdForTickets, setSelectedHospitalIdForTickets] = useState<number | null>(null);
  const [selectedHospitalNameForTickets, setSelectedHospitalNameForTickets] = useState<string | null>(null);
  const [ticketOpenCounts, setTicketOpenCounts] = useState<Record<number, number>>({});
  const [ticketCountLoading, setTicketCountLoading] = useState<Set<number>>(new Set());

  // Tính số task đã hoàn thành từ data đã được filter (trong trang hiện tại)
  const completedCountFromFiltered = useMemo(() => {
    return filtered.filter((item) => {
      const taskStatus = normalizeStatus(item.status);
      return taskStatus === 'COMPLETED';
    }).length;
  }, [filtered]);

  const pendingCount = pendingGroups.reduce((sum, group) => sum + (group.tasks?.length || 0), 0);

  // Calculate hidden pending count for selected hospital from hospitalsWithTasks (like SuperAdmin)
  const selectedHospitalMeta = useMemo(() => {
    if (!selectedHospital) return null;
    return hospitalsWithTasks.find(h => h.label === selectedHospital) ?? null;
  }, [selectedHospital, hospitalsWithTasks]);

  const hiddenPendingSummary = selectedHospitalMeta?.hiddenPendingCount ?? 0;

  // Filter PIC options based on search query
  const filteredPicOptions = useMemo(() => {
    const q = picFilterQuery.trim().toLowerCase();
    if (!q) return picOptions;
    return picOptions.filter(opt => opt.label.toLowerCase().includes(q));
  }, [picOptions, picFilterQuery]);

  // Toggle PIC filter value
  const togglePicFilterValue = (value: string, checked: boolean) => {
    setHospitalPicFilter(prev => {
      if (checked) {
        return [...prev, value];
      } else {
        return prev.filter(v => v !== value);
      }
    });
    setHospitalPage(0);
  };

  // Clear PIC filter
  const clearPicFilter = () => {
    setHospitalPicFilter([]);
    setHospitalPage(0);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (picFilterDropdownRef.current && !picFilterDropdownRef.current.contains(event.target as Node)) {
        setPicFilterOpen(false);
      }
    };
    if (picFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [picFilterOpen]);

  // ✅ Tự động set filter cho user hiện tại khi đăng nhập
  const autoFilterSetRef = useRef<boolean>(false);
  useEffect(() => {
    // Chỉ set một lần khi picOptions đã load và filter chưa được set
    if (autoFilterSetRef.current || hospitalPicFilter.length > 0 || picOptions.length === 0) {
      return;
    }

    // Lấy userId hiện tại - thử nhiều cách
    let userId: string | null = null;
    
    // Thử từ currentUser.id
    if (currentUser?.id) {
      userId = String(currentUser.id);
    }
    
    // Nếu chưa có, thử từ localStorage/sessionStorage
    if (!userId) {
      userId = localStorage.getItem("userId") || sessionStorage.getItem("userId");
    }
    
    // Nếu vẫn chưa có, thử parse từ currentUser object
    if (!userId && currentUser && typeof currentUser === 'object') {
      const userObj = currentUser as any;
      if (userObj.userId) userId = String(userObj.userId);
      if (!userId && userObj.id) userId = String(userObj.id);
    }

    if (!userId) return;

    // Normalize userId (trim và đảm bảo là string)
    userId = String(userId).trim();
    if (!userId) return;

    // Kiểm tra xem userId có trong picOptions không (so sánh cả string và number)
    const userOption = picOptions.find(opt => {
      const optId = String(opt.id).trim();
      return optId === userId || optId === String(Number(userId)) || String(Number(optId)) === userId;
    });
    
    if (userOption) {
      // Sử dụng ID chính xác từ picOptions
      setHospitalPicFilter([userOption.id]);
      autoFilterSetRef.current = true;
    }
  }, [picOptions, currentUser, hospitalPicFilter.length]);

  const handleNewTaskClick = async () => {
    if (!canManage) return;
    if (!showHospitalList && selectedHospital) {
      const hid = await resolveHospitalIdByName(selectedHospital);
      if (hid) {
        setEditing({ hospitalId: hid, hospitalName: selectedHospital } as any);
      } else {
        setEditing({ hospitalName: selectedHospital } as any);
      }
    } else {
      setEditing(null);
    }
    setModalOpen(true);
  };

  const addTaskButton = canManage ? (
    <button
      className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700"
      onClick={() => {
        void handleNewTaskClick();
      }}
      type="button"
    >
      + Thêm công việc mới
    </button>
  ) : (
    <button
      hidden
      className="rounded-xl bg-gray-200 text-gray-500 px-5 py-2 shadow-sm"
      title="Không có quyền"
      type="button"
    >
      + Thêm mới
    </button>
  );

  const pendingButton = canManage ? (
    <button
      className="relative inline-flex items-center gap-2 rounded-full border border-gray-300 text-gray-800 px-4 py-2 text-sm bg-white hover:bg-gray-50"
      onClick={() => {
        setPendingOpen(true);
        fetchPendingGroups();
      }}
      type="button"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
      Công việc chờ tiếp nhận
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
          {pendingCount}
        </span>
      )}
    </button>
  ) : null;

  const toolbarActions = (
    <>
      {addTaskButton}
      {pendingButton}
    </>
  );

  const hospitalStatusOptions = useMemo<FilterToolbarOption[]>(
    () => [
      { value: "", label: "— Trạng thái —" },
      { value: "hasCompleted", label: "Có task hoàn thành" },
      { value: "notCompleted", label: "Chưa hoàn thành hết" },
      { value: "noneCompleted", label: "Chưa có task hoàn thành" },
      { value: "transferred", label: "Đã chuyển sang bảo trì" },
      { value: "hasOpenTickets", label: "Có tickets chưa hoàn thành" },
    ],
    []
  );

  async function fetchList() {
    const start = Date.now();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
        sortBy: sortBy,
        sortDir: sortDir,
      });
      if (searchTerm) params.set("search", searchTerm.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (selectedHospital) params.set("hospitalName", selectedHospital);

      const url = `${apiBase}?${params.toString()}`;
      const res = await fetch(url, { method: "GET", headers: authHeaders(), credentials: "include" });
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      const resp = await res.json();
      const items = Array.isArray(resp?.content) ? resp.content : Array.isArray(resp) ? resp : [];
      const normalizedItems = items.map((item: ImplementationTaskResponseDTO) => ({
        ...item,
        status: normalizeStatus(item.status) || item.status || "RECEIVED",
      }));
      // Exclude tasks that were created from Business and are still pending acceptance by Deployment
      const finalItems = normalizedItems.filter((it) => {
        try {
          const received = Boolean(it?.receivedById || it?.receivedByName);
          const readOnlyPlaceholder = it?.readOnlyForDeployment === true;
          const businessPlaceholder = isBusinessContractTask(
            typeof it?.name === "string" ? it.name : String(it?.name ?? "")
          );
          if (readOnlyPlaceholder && !received) return false;
          if (businessPlaceholder && !received) return false;
          return true;
        } catch {
          return true;
        }
      });
      if (sortBy === "createdAt") {
        const dir = sortDir === "asc" ? 1 : -1;
        // sort the final items list
        const sorted = [...finalItems].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (aTime !== bTime) return (aTime - bTime) * dir;
          const aId = Number(a.id ?? 0);
          const bId = Number(b.id ?? 0);
          return (aId - bId) * dir;
        });
        setData(sorted);
      } else {
        setData(finalItems);
      }
      // Use finalItems length (after filtering out pending tasks) instead of resp.totalElements
      setTotalCount(finalItems.length);

      // Tính số task completed với cùng filter (search, hospitalName) nhưng không có statusFilter
      // Nếu statusFilter đã là COMPLETED, thì completedCount = totalCount
      // Nếu statusFilter khác COMPLETED, thì completedCount = 0 (đang filter status khác)
      // Nếu không có statusFilter, fetch riêng để đếm completed
      if (!showHospitalList) {
        try {
          if (statusFilter && statusFilter.toUpperCase() === 'COMPLETED') {
            // Đang filter COMPLETED, nên completedCount = totalCount
            setCompletedCount(resp && typeof resp.totalElements === "number" ? resp.totalElements : (Array.isArray(resp) ? resp.length : filtered.length));
          } else if (statusFilter && statusFilter.toUpperCase() !== 'COMPLETED') {
            // Đang filter status khác, nên completedCount = 0
            setCompletedCount(0);
          } else {
            // Không có statusFilter, fetch riêng với cùng filter nhưng status=COMPLETED
            const countParams = new URLSearchParams({
              page: "0",
              size: "1", // Chỉ cần totalElements
              sortBy: sortBy,
              sortDir: sortDir,
            });
            if (searchTerm) countParams.set("search", searchTerm.trim());
            countParams.set("status", "COMPLETED"); // Chỉ lấy COMPLETED
            if (selectedHospital) countParams.set("hospitalName", selectedHospital);

            const countUrl = `${apiBase}?${countParams.toString()}`;
            const countRes = await fetch(countUrl, { method: "GET", headers: authHeaders(), credentials: "include" });
            if (countRes.ok) {
              const countResp = await countRes.json();
              if (countResp && typeof countResp.totalElements === "number") {
                setCompletedCount(countResp.totalElements);
              } else if (Array.isArray(countResp)) {
                setCompletedCount(countResp.length);
              } else {
                setCompletedCount(0);
              }
            } else {
              setCompletedCount(completedCountFromFiltered);
            }
          }
        } catch (e) {
          // Nếu lỗi, tính từ data hiện tại (fallback)
          setCompletedCount(completedCountFromFiltered);
        }
      }

      if (enableItemAnimation) {
        const itemCount = items.length;
        const maxDelay = itemCount > 1 ? 2000 + ((itemCount - 2) * 80) : 0;
        const animationDuration = 220;
        const buffer = 120;
        window.setTimeout(() => setEnableItemAnimation(false), maxDelay + animationDuration + buffer);
      }
    } catch (e: any) {
      setError(e.message || "Lỗi tải dữ liệu");
    } finally {
      const elapsed = Date.now() - start;
      if (isInitialLoad) {
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        await new Promise((r) => setTimeout(r, remaining));
      }
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }

  // Fetch PIC (deployment users) options for filter
  useEffect(() => {
    const fetchPicOptions = async () => {
      try {
        const params = new URLSearchParams({
          department: "IT",
        });
        const res = await fetch(`${API_ROOT}/api/v1/admin/users/search?${params.toString()}`, {
          method: 'GET',
          headers: authHeaders(),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          const options = list
            .map((u: any) => {
              const id = u?.id;
              const labelRaw = u?.label ?? u?.fullname ?? u?.fullName ?? u?.username ?? u?.email ?? u?.id;
              const label = typeof labelRaw === "string" ? labelRaw.trim() : String(labelRaw ?? "");
              if (id == null || !label) return null;
              return { id: String(id), label };
            })
            .filter((item): item is { id: string; label: string } => Boolean(item));
          options.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
          setPicOptions(options);
        }
      } catch (err) {
        console.debug('Failed to fetch deployment users', err);
      }
    };
    fetchPicOptions();
  }, []);

  // Initial: load hospital list instead of tasks
  useEffect(() => {
    fetchHospitalsWithTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll pending groups periodically and show notifications when new pending tasks arrive
  // BUT: Skip polling when modal is open to avoid blinking/flashing
  useEffect(() => {
    let mounted = true;

    // Ask for notification permission once (non-blocking)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        // request in background; user may decline
        Notification.requestPermission().catch(() => { });
      }
    } catch (err) {
      console.debug('Notification permission request failed', err);
    }

    // Initial load (only if modal is not open)
    if (!pendingOpen) {
      (async () => {
        try {
          const initial = await fetchPendingGroups();
          lastPendingCountRef.current = initial;
        } catch (err) {
          console.debug('Initial fetchPendingGroups failed', err);
        }
      })();
    }

    // Only set up interval if modal is closed
    if (pendingOpen) {
      return () => {
        mounted = false;
      };
    }

    const intervalId = window.setInterval(async () => {
      try {
        // Skip if modal is open or component unmounted
        if (!mounted || pendingOpen) return;
        const newCount = await fetchPendingGroups();
        lastPendingCountRef.current = newCount;
      } catch (err) {
        console.debug('Polling fetchPendingGroups failed', err);
      }
    }, 60000); // ✅ Đã có WebSocket, giảm polling xuống 60s làm fallback

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  // ✅ WebSocket subscription: Cập nhật danh sách chờ khi có thông báo
  useEffect(() => {
    const unsubscribe = subscribe("/topic/implementation/pending-changed", (payload) => {
      console.log("WebSocket: Pending implementation tasks changed", payload);
      fetchPendingGroups();
      if (!showHospitalList && selectedHospital) {
        fetchList();
      }
    });
    return () => unsubscribe();
  }, [subscribe, fetchPendingGroups, fetchList, showHospitalList, selectedHospital]);

  // ✅ WebSocket subscription: Cập nhật danh sách chờ khi có thông báo
  useEffect(() => {
    const unsubscribe = subscribe("/topic/implementation/pending-changed", (payload) => {
      console.log("WebSocket: Pending implementation tasks changed", payload);
      fetchPendingGroups();
      if (!showHospitalList && selectedHospital) {
        fetchList();
      }
    });
    return () => unsubscribe();
  }, [subscribe, fetchPendingGroups, fetchList, showHospitalList, selectedHospital]);

  // when page or size changes, refetch
  useEffect(() => {
    if (!showHospitalList && selectedHospital) fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size]);

  // reset page when filters/sort/search change
  useEffect(() => { setPage(0); }, [searchTerm, statusFilter, sortBy, sortDir]);

  // debounce searchTerm changes and refetch
  useEffect(() => {
    if (showHospitalList) return;
    if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => { fetchList(); }, 600);
    return () => { if (searchDebounce.current) window.clearTimeout(searchDebounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // refetch when statusFilter or sort changes
  useEffect(() => { if (!showHospitalList) fetchList(); /* eslint-disable-line */ }, [statusFilter]);
  useEffect(() => { if (!showHospitalList) fetchList(); /* eslint-disable-line */ }, [sortBy, sortDir]);

  // Clear selected tasks when switching views or filters
  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [showHospitalList, page, statusFilter, searchTerm, selectedHospital]);

  const handleBulkComplete = async () => {
    if (selectedTaskIds.size === 0) return;

    setBulkCompleting(true);
    try {
      const taskIdsArray = Array.from(selectedTaskIds);
      const res = await fetch(`${API_ROOT}/api/v1/admin/implementation/tasks/bulk-complete`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ taskIds: taskIdsArray }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Lỗi khi hoàn thành tasks" }));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const result = await res.json();
      const completedCount = result.completedCount || 0;

      toast.success(`Đã hoàn thành ${completedCount} task${completedCount > 1 ? "s" : ""}`);

      // Clear selection and refresh list
      setSelectedTaskIds(new Set());
      await fetchList();

      // Refresh hospital summary if in hospital view
      if (showHospitalList) {
        await fetchHospitalsWithTasks();
      }
    } catch (error: any) {
      toast.error(error.message || "Lỗi khi hoàn thành tasks");
    } finally {
      setBulkCompleting(false);
    }
  };

  async function fetchHospitalOptions(q: string) {
    try {
      const res = await fetch(`${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(q || "")}`, { headers: authHeaders() });
      if (!res.ok) return;
      const list = await res.json();
      if (Array.isArray(list)) setHospitalOptions(list.map((h: any) => ({ id: Number(h.id), label: String(h.label ?? h.name ?? "") })));
    } catch { /* ignore */ }
  }

  async function resolveHospitalIdByName(name: string): Promise<number | null> {
    try {
      const res = await fetch(`${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(name)}`, { headers: authHeaders(), credentials: 'include' });
      if (!res.ok) return null;
      const list = await res.json();
      if (!Array.isArray(list)) return null;
      const exact = list.find((h: any) => String(h?.label ?? h?.name ?? '').trim().toLowerCase() === name.trim().toLowerCase());
      const item = exact || list[0];
      const id = Number(item?.id);
      return Number.isFinite(id) ? id : null;
    } catch { return null; }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (hospitalQuery && hospitalQuery.trim().length > 0) fetchHospitalOptions(hospitalQuery.trim());
      else setHospitalOptions([]);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hospitalQuery]);

  async function fetchHospitalsWithTasks() {
    setLoadingHospitals(true);
    setError(null);
    try {
      // ✅ Fetch hospitals with transfer status (new endpoint - tối ưu hơn)
      const res = await fetch(`${API_ROOT}/api/v1/admin/implementation/tasks/hospitals/with-status`, {
        method: "GET",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(`Unauthorized (401): Token may be expired or invalid. Please login again.`);
        }
        throw new Error(`Failed to fetch hospitals: ${res.status}`);
      }
      const hospitals = await res.json();
      console.log("[Admin Implementation] Hospitals response sample:", hospitals?.[0]); // Debug: Check if hospitalCode exists in response

      // Parse task count from subLabel (format: "Province - X tasks" or "X tasks")
      const baseList = (Array.isArray(hospitals) ? hospitals : []).map((hospital: { id: number; label: string; subLabel?: string; hospitalCode?: string; transferredToMaintenance?: boolean; acceptedByMaintenance?: boolean; personInChargeId?: number | null; personInChargeName?: string | null }) => {
        let taskCount = 0;
        let province = "";

        // Parse task count from subLabel
        if (hospital.subLabel) {
          const match = hospital.subLabel.match(/(\d+)\s+tasks?/i);
          if (match) {
            taskCount = parseInt(match[1], 10);
            // Extract province (everything before " - X tasks")
            // If subLabel contains " - ", it means there's a province
            if (hospital.subLabel.includes(" - ")) {
              province = hospital.subLabel.replace(/\s*-\s*\d+\s+tasks?/i, "").trim();
            } else {
              // If no " - ", it means subLabel is just "X tasks" (no province)
              province = "";
            }
          } else {
            // No task count pattern found, treat entire subLabel as province
            province = hospital.subLabel.trim();
          }
        }

        return {
          ...hospital,
          subLabel: province || undefined, // Keep only province without task count, undefined if empty
          hospitalCode: (hospital.hospitalCode || (hospital as any).hospital_code || ""), // Support both camelCase and snake_case
          taskCount: taskCount,
          nearDueCount: 0, // Initialize to 0 - will be calculated in augment()
          overdueCount: 0, // Initialize to 0 - will be calculated in augment()
          transferredCount: 0,
          // Use transfer status from backend
          allTransferred: Boolean(hospital.transferredToMaintenance),
          allAccepted: Boolean(hospital.acceptedByMaintenance),
          personInChargeId: hospital.personInChargeId ?? null,
          personInChargeName: hospital.personInChargeName ?? null,
        };
      });

      // Fetch completed counts + near due/overdue for each hospital in parallel
      const completedCounts = await Promise.all(
        baseList.map(async (h) => {
          try {
            // count only COMPLETED as 'completed' for hospital aggregation
            const p = new URLSearchParams({ page: "0", size: "1", status: "COMPLETED", hospitalName: h.label });
            const u = `${API_ROOT}/api/v1/admin/implementation/tasks?${p.toString()}`;
            const r = await fetch(u, { method: 'GET', headers: authHeaders(), credentials: 'include' });
            if (!r.ok) return 0;
            try {
              const resp = await r.json();
              if (resp && typeof resp.totalElements === 'number') return resp.totalElements as number;
              else if (Array.isArray(resp)) return resp.length;
            } catch {
              // ignore individual parse errors
            }
            return 0;
          } catch {
            return 0;
          }
        })
      );

      // ✅ Tối ưu: Fetch tasks chưa completed để tính near due/overdue (giảm từ 2000 xuống 500)
      // Fetch tasks chưa completed để tính toán nearDueCount và overdueCount
      const allParams = new URLSearchParams({ page: "0", size: "500", sortBy: "id", sortDir: "asc" });
      const allRes = await fetch(`${API_ROOT}/api/v1/admin/implementation/tasks?${allParams.toString()}`, { method: 'GET', headers: authHeaders(), credentials: 'include' });
      const allPayload = allRes.ok ? await allRes.json() : [];
      const allItems = Array.isArray(allPayload?.content) ? allPayload.content : Array.isArray(allPayload) ? allPayload : [];

      // Track business transfer status (similar to SuperAdmin)
      const businessTransferStatus = new Map<string, { hasGeneratedTask: boolean; hasTransfer: boolean; pending: number; accepted: boolean }>();
      const makeHospitalKey = (hospitalId: number | null | undefined, hospitalName: string) => {
        if (hospitalId != null && !Number.isNaN(Number(hospitalId))) return `id-${Number(hospitalId)}`;
        return `name-${hospitalName}`;
      };

      // Track business tasks (both pending and accepted)
      for (const raw of allItems as ImplementationTaskResponseDTO[]) {
        const hospitalName = (raw.hospitalName || "").toString().trim();
        const hospitalId = typeof raw.hospitalId === "number" ? raw.hospitalId : raw.hospitalId != null ? Number(raw.hospitalId) : null;
        if (!hospitalName) continue;
        const key = makeHospitalKey(hospitalId, hospitalName);
        const received = Boolean(raw.receivedById || raw.receivedByName);
        const businessName = isBusinessContractTask(
          typeof raw?.name === "string" ? raw.name : String(raw?.name ?? "")
        );
        const placeholder = raw.readOnlyForDeployment === true || businessName;
        const pending = (!received && raw.readOnlyForDeployment === true) || (!received && businessName);
        if (!placeholder && !pending) continue;
        const entry = businessTransferStatus.get(key) || {
          hasGeneratedTask: false,
          hasTransfer: false,
          pending: 0,
          accepted: false,
        };
        if (placeholder) entry.hasGeneratedTask = true;
        if (raw.readOnlyForDeployment === true) entry.hasTransfer = true;
        if (pending) entry.pending += 1;
        if (received && placeholder) entry.accepted = true;
        businessTransferStatus.set(key, entry);
      }

      // Separate hidden (pending Business) tasks from visible tasks
      const hiddenItems: ImplementationTaskResponseDTO[] = [];
      const visibleItems = (allItems as ImplementationTaskResponseDTO[]).filter((it) => {
        try {
          const received = Boolean(it?.receivedById || it?.receivedByName);
          const readOnlyPlaceholder = it?.readOnlyForDeployment === true;
          const businessPlaceholder = isBusinessContractTask(
            typeof it?.name === "string" ? it.name : String(it?.name ?? "")
          );
          if (readOnlyPlaceholder && !received) {
            hiddenItems.push(it);
            return false;
          }
          if (businessPlaceholder && !received) {
            hiddenItems.push(it);
            return false;
          }
          return true;
        } catch {
          return true;
        }
      });

      // Aggregate by hospitalName
      const acc = new Map<string, { id: number | null; label: string; subLabel?: string; taskCount: number; acceptedCount: number; nearDueCount: number; overdueCount: number; transferredCount: number; acceptedByMaintenanceCount: number; hiddenPendingCount: number; hiddenTaskCount: number; picDeploymentIds: Set<string | number>; picDeploymentNames: Set<string> }>();
      for (const it of visibleItems) {
        const name = (it.hospitalName || "").toString().trim() || "—";
        const hospitalId = typeof it.hospitalId === "number" ? it.hospitalId : it.hospitalId != null ? Number(it.hospitalId) : null;
        const key = hospitalId != null ? `id-${hospitalId}` : `name-${name}`;
        const current = acc.get(key) || { id: hospitalId, label: name, subLabel: "", taskCount: 0, acceptedCount: 0, nearDueCount: 0, overdueCount: 0, transferredCount: 0, acceptedByMaintenanceCount: 0, hiddenPendingCount: 0, hiddenTaskCount: 0, picDeploymentIds: new Set<string | number>(), picDeploymentNames: new Set<string>() };
        if (current.id == null && hospitalId != null) current.id = hospitalId;
        if (!current.label && name) current.label = name;
        current.taskCount += 1;
        
        // ✅ Collect PICs từ task
        if (it.picDeploymentIds && Array.isArray(it.picDeploymentIds)) {
          it.picDeploymentIds.forEach((picId: any) => {
            if (picId != null) current.picDeploymentIds.add(picId);
          });
        }
        if (it.picDeploymentNames && Array.isArray(it.picDeploymentNames)) {
          it.picDeploymentNames.forEach((picName: any) => {
            const nameStr = String(picName || "").trim();
            if (nameStr) current.picDeploymentNames.add(nameStr);
          });
        }
        // Fallback: nếu không có picDeploymentIds nhưng có picDeploymentId
        if (!it.picDeploymentIds && it.picDeploymentId) {
          current.picDeploymentIds.add(it.picDeploymentId);
        }
        if (!it.picDeploymentNames && it.picDeploymentName) {
          const nameStr = String(it.picDeploymentName || "").trim();
          if (nameStr) current.picDeploymentNames.add(nameStr);
        }
        const taskStatus = normalizeStatus(it.status);
        if (taskStatus === 'COMPLETED') current.acceptedCount += 1;
        // Count transferred tasks
        if (it.transferredToMaintenance === true) {
          current.transferredCount += 1;
        }
        // Count tasks accepted by maintenance (readOnlyForDeployment = true means maintenance accepted)
        if (it.readOnlyForDeployment === true && it.transferredToMaintenance === true) {
          current.acceptedByMaintenanceCount += 1;
        }
        // Count near due / overdue for non-completed
        if (taskStatus !== 'COMPLETED' && it.deadline) {
          const d = new Date(it.deadline);
          if (!Number.isNaN(d.getTime())) {
            d.setHours(0, 0, 0, 0);
            const today = new Date();
            const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const dayDiff = Math.round((d.getTime() - startToday) / (24 * 60 * 60 * 1000));
            // Quá hạn: deadline đã qua (dayDiff < 0)
            if (dayDiff < 0) current.overdueCount += 1;
            // Sắp đến hạn: hôm nay hoặc trong 3 ngày tới (0 <= dayDiff <= 3)
            if (dayDiff >= 0 && dayDiff <= 3) current.nearDueCount += 1;
          }
        }
        acc.set(key, current);
      }

      // Fetch pending tasks from Business (use dedicated endpoint)
      let pendingTasksFromBusiness: ImplementationTaskResponseDTO[] = [];
      try {
        const pendingRes = await fetch(`${API_ROOT}/api/v1/admin/implementation/pending`, {
          method: 'GET',
          headers: authHeaders(),
          credentials: 'include'
        });
        if (pendingRes.ok) {
          const pendingList = await pendingRes.json();
          pendingTasksFromBusiness = Array.isArray(pendingList) ? pendingList : [];
        }
      } catch (err) {
        // console.warn('Failed to fetch pending tasks:', err);
      }

      // Count hidden (pending Business) tasks per hospital from hiddenItems
      for (const it of hiddenItems) {
        const name = (it.hospitalName || "").toString().trim() || "—";
        const hospitalId = typeof it.hospitalId === "number" ? it.hospitalId : it.hospitalId != null ? Number(it.hospitalId) : null;
        const key = hospitalId != null ? `id-${hospitalId}` : `name-${name}`;
        const current = acc.get(key);
        if (current) {
          current.hiddenPendingCount += 1;
          current.hiddenTaskCount += 1;
          // ✅ Collect PICs từ hidden task
          if (it.picDeploymentIds && Array.isArray(it.picDeploymentIds)) {
            it.picDeploymentIds.forEach((picId: any) => {
              if (picId != null) current.picDeploymentIds.add(picId);
            });
          }
          if (it.picDeploymentNames && Array.isArray(it.picDeploymentNames)) {
            it.picDeploymentNames.forEach((picName: any) => {
              const nameStr = String(picName || "").trim();
              if (nameStr) current.picDeploymentNames.add(nameStr);
            });
          }
          // Fallback: nếu không có picDeploymentIds nhưng có picDeploymentId
          if (!it.picDeploymentIds && it.picDeploymentId) {
            current.picDeploymentIds.add(it.picDeploymentId);
          }
          if (!it.picDeploymentNames && it.picDeploymentName) {
            const nameStr = String(it.picDeploymentName || "").trim();
            if (nameStr) current.picDeploymentNames.add(nameStr);
          }
        }
      }

      // Also count from pending endpoint (in case main endpoint filters them out)
      // Build set of IDs already counted from hiddenItems to avoid double-counting
      const countedHiddenIds = new Set<number>();
      for (const h of hiddenItems) {
        if (typeof h.id === 'number') countedHiddenIds.add(h.id);
      }

      for (const it of pendingTasksFromBusiness) {
        // Skip tasks already present in hiddenItems (dedupe)
        if (typeof it.id === 'number' && countedHiddenIds.has(it.id)) continue;
        const name = (it.hospitalName || "").toString().trim() || "—";
        const hospitalId = typeof it.hospitalId === "number" ? it.hospitalId : it.hospitalId != null ? Number(it.hospitalId) : null;
        if (!name) continue;
        const key = hospitalId != null ? `id-${hospitalId}` : `name-${name}`;

        // Track in businessTransferStatus (for hospitals with only pending tasks)
        const received = Boolean(it.receivedById || it.receivedByName);
        const businessName = isBusinessContractTask(
          typeof it?.name === "string" ? it.name : String(it?.name ?? "")
        );
        const placeholder = it.readOnlyForDeployment === true || businessName;
        if (placeholder && !received) {
          const entry = businessTransferStatus.get(key) || {
            hasGeneratedTask: false,
            hasTransfer: false,
            pending: 0,
            accepted: false,
          };
          entry.hasGeneratedTask = true;
          if (it.readOnlyForDeployment === true) entry.hasTransfer = true;
          entry.pending += 1;
          businessTransferStatus.set(key, entry);
        }

        // Create entry if hospital not in acc yet (hospital with only pending tasks)
        const current = acc.get(key) || {
          id: hospitalId,
          label: name,
          subLabel: "",
          taskCount: 0,
          acceptedCount: 0,
          nearDueCount: 0,
          overdueCount: 0,
          transferredCount: 0,
          acceptedByMaintenanceCount: 0,
          hiddenPendingCount: 0,
          hiddenTaskCount: 0,
          picDeploymentIds: new Set<string | number>(),
          picDeploymentNames: new Set<string>()
        };
        
        // ✅ Collect PICs từ pending task
        if (it.picDeploymentIds && Array.isArray(it.picDeploymentIds)) {
          it.picDeploymentIds.forEach((picId: any) => {
            if (picId != null) current.picDeploymentIds.add(picId);
          });
        }
        if (it.picDeploymentNames && Array.isArray(it.picDeploymentNames)) {
          it.picDeploymentNames.forEach((picName: any) => {
            const nameStr = String(picName || "").trim();
            if (nameStr) current.picDeploymentNames.add(nameStr);
          });
        }
        // Fallback: nếu không có picDeploymentIds nhưng có picDeploymentId
        if (!it.picDeploymentIds && it.picDeploymentId) {
          current.picDeploymentIds.add(it.picDeploymentId);
        }
        if (!it.picDeploymentNames && it.picDeploymentName) {
          const nameStr = String(it.picDeploymentName || "").trim();
          if (nameStr) current.picDeploymentNames.add(nameStr);
        }
        if (current.id == null && hospitalId != null) current.id = hospitalId;
        if (!current.label && name) current.label = name;
        current.hiddenPendingCount += 1;
        current.hiddenTaskCount += 1;
        acc.set(key, current);
      }

      // Merge baseList (có transfer status từ endpoint) với task counts từ aggregation
      // Hiển thị các bệnh viện có task đã được tiếp nhận hoặc có pending tasks
      const baseListMap = new Map<string, typeof baseList[0]>();
      baseList.forEach((h, idx) => {
        const hospitalId = h.id;
        const hospitalName = h.label;
        const key = hospitalId != null ? `id-${hospitalId}` : `name-${hospitalName}`;
        baseListMap.set(key, { ...h, _index: idx } as typeof h & { _index: number });
      });

      const withCompleted = baseList
        .map((h, idx) => {
          // Tìm matching hospital từ acc (aggregated from tasks - đã loại pending)
          const hospitalId = h.id;
          const hospitalName = h.label;
          const keyById = hospitalId != null ? `id-${hospitalId}` : null;
          const keyByName = `name-${hospitalName}`;
          const aggregated = (keyById && acc.get(keyById)) || acc.get(keyByName);
          const businessInfo = (keyById && businessTransferStatus.get(keyById)) || businessTransferStatus.get(keyByName);

          // Chỉ sử dụng taskCount từ aggregated (đã filter pending tasks)
          // Không fallback về h.taskCount vì nó có thể bao gồm pending tasks
          const visibleTaskCount = aggregated?.taskCount ?? 0;
          // Use hiddenPendingCount from both aggregated and businessInfo for accuracy
          const aggregatedHiddenPending = aggregated?.hiddenPendingCount ?? 0;
          const businessHiddenPending = businessInfo?.pending ?? 0;
          const hiddenPendingCount = Math.max(aggregatedHiddenPending, businessHiddenPending);
          const hiddenTaskCount = hiddenPendingCount;

          // Check if hospital has accepted tasks from Business (even if all tasks are completed now)
          const acceptedFromBusiness = visibleTaskCount === 0 && Boolean(businessInfo?.accepted);

          return {
            ...h,
            taskCount: visibleTaskCount,
            acceptedCount: completedCounts[idx] ?? (aggregated?.acceptedCount ?? 0),
            nearDueCount: aggregated?.nearDueCount ?? 0,
            overdueCount: aggregated?.overdueCount ?? 0,
            hiddenPendingCount: hiddenPendingCount,
            hiddenTaskCount: hiddenTaskCount,
            acceptedFromBusiness: acceptedFromBusiness,
            hasBusinessPlaceholder: Boolean(businessInfo?.hasGeneratedTask) || hiddenTaskCount > 0,
            // ✅ Merge PICs từ aggregated
            picDeploymentIds: aggregated ? Array.from(aggregated.picDeploymentIds) : undefined,
            picDeploymentNames: aggregated ? Array.from(aggregated.picDeploymentNames) : undefined,
            // Transfer status đã có từ backend endpoint
          };
        })
        .filter((h) => (h.taskCount ?? 0) > 0 || (h.hiddenPendingCount ?? 0) > 0 || h.acceptedFromBusiness); // Hiển thị bệnh viện có task đã tiếp nhận, có pending tasks, hoặc đã tiếp nhận từ phòng KD

      // Thêm các bệnh viện chỉ có pending tasks (không có trong baseList)
      // Đảm bảo TẤT CẢ các bệnh viện trong pendingTasksFromBusiness đều được hiển thị
      const hospitalsWithOnlyPending: Array<{ id: number | null; label: string; subLabel?: string; taskCount?: number; acceptedCount?: number; nearDueCount?: number; overdueCount?: number; transferredCount?: number; allTransferred?: boolean; allAccepted?: boolean; personInChargeId?: number | null; personInChargeName?: string | null; hiddenPendingCount?: number; hiddenTaskCount?: number; acceptedFromBusiness?: boolean; hasBusinessPlaceholder?: boolean; picDeploymentIds?: Array<string | number>; picDeploymentNames?: string[] }> = [];
      const addedHospitalKeys = new Set<string>();

      // First, add hospitals from acc that are not in baseList
      for (const [key, aggregated] of acc.entries()) {
        if (!baseListMap.has(key)) {
          const businessInfo = businessTransferStatus.get(key);
          const aggregatedPending = aggregated.hiddenPendingCount ?? 0;
          const businessPending = businessInfo?.pending ?? 0;
          const hasPending = aggregatedPending > 0 || businessPending > 0;
          const hasAccepted = Boolean(businessInfo?.accepted);

          if (hasPending || hasAccepted) {
            addedHospitalKeys.add(key);
            const hiddenPendingCount = Math.max(aggregatedPending, businessPending);
            const acceptedFromBusiness = (aggregated.taskCount ?? 0) === 0 && hasAccepted;
            hospitalsWithOnlyPending.push({
              id: aggregated.id ?? null,
              label: aggregated.label,
              subLabel: aggregated.subLabel || "",
              taskCount: aggregated.taskCount ?? 0,
              acceptedCount: aggregated.acceptedCount ?? 0,
              nearDueCount: aggregated.nearDueCount ?? 0,
              overdueCount: aggregated.overdueCount ?? 0,
              hiddenPendingCount: hiddenPendingCount,
              hiddenTaskCount: hiddenPendingCount,
              allTransferred: false,
              allAccepted: false,
              personInChargeId: null,
              personInChargeName: null,
              acceptedFromBusiness: acceptedFromBusiness,
              hasBusinessPlaceholder: Boolean(businessInfo?.hasGeneratedTask) || hiddenPendingCount > 0,
              // ✅ Merge PICs từ aggregated
              picDeploymentIds: Array.from(aggregated.picDeploymentIds),
              picDeploymentNames: Array.from(aggregated.picDeploymentNames),
            });
          }
        }
      }

      // Then, ensure ALL hospitals from pendingTasksFromBusiness are added (even if not in acc)
      // Count pending tasks per hospital from pendingTasksFromBusiness
      const pendingCountByHospital = new Map<string, number>();
      for (const it of pendingTasksFromBusiness) {
        const name = (it.hospitalName || "").toString().trim();
        const hospitalId = typeof it.hospitalId === "number" ? it.hospitalId : it.hospitalId != null ? Number(it.hospitalId) : null;
        if (!name) continue;
        const key = hospitalId != null ? `id-${hospitalId}` : `name-${name}`;
        const current = pendingCountByHospital.get(key) || 0;
        pendingCountByHospital.set(key, current + 1);
      }

      // Add hospitals from pendingTasksFromBusiness that aren't in baseList or already added
      for (const [key, pendingCount] of pendingCountByHospital.entries()) {
        // Skip if already in baseList (already displayed)
        if (baseListMap.has(key)) continue;

        // Skip if already added
        if (addedHospitalKeys.has(key)) continue;

        // Find hospital info from pendingTasksFromBusiness
        const pendingTask = pendingTasksFromBusiness.find(t => {
          const name = (t.hospitalName || "").toString().trim();
          const hospitalId = typeof t.hospitalId === "number" ? t.hospitalId : t.hospitalId != null ? Number(t.hospitalId) : null;
          const taskKey = hospitalId != null ? `id-${hospitalId}` : `name-${name}`;
          return taskKey === key && name;
        });

        if (!pendingTask) continue;

        const name = (pendingTask.hospitalName || "").toString().trim();
        const hospitalId = typeof pendingTask.hospitalId === "number" ? pendingTask.hospitalId : pendingTask.hospitalId != null ? Number(pendingTask.hospitalId) : null;
        if (!name) continue;

        // Add this hospital
        addedHospitalKeys.add(key);
        const businessInfo = businessTransferStatus.get(key);
        hospitalsWithOnlyPending.push({
          id: hospitalId,
          label: name,
          subLabel: "",
          taskCount: 0,
          acceptedCount: 0,
          nearDueCount: 0,
          overdueCount: 0,
          hiddenPendingCount: pendingCount,
          hiddenTaskCount: pendingCount,
          allTransferred: false,
          allAccepted: false,
          personInChargeId: null,
          personInChargeName: null,
          acceptedFromBusiness: Boolean(businessInfo?.accepted) && pendingCount === 0,
          hasBusinessPlaceholder: Boolean(businessInfo?.hasGeneratedTask) || pendingCount > 0,
        });
      }

      // Merge và loại bỏ duplicate (theo ID hoặc tên), sau đó sắp xếp theo tên bệnh viện
      const mergedMap = new Map<string, typeof withCompleted[0]>();

      // Add from withCompleted first
      for (const h of withCompleted) {
        const key = h.id != null ? `id-${h.id}` : `name-${h.label}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, h as any);
        }
      }

      // Add from hospitalsWithOnlyPending, skip if already exists
      for (const h of hospitalsWithOnlyPending) {
        const key = h.id != null ? `id-${h.id}` : `name-${h.label}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, h as any);
        } else {
          // Merge hiddenPendingCount if exists
          const existing = mergedMap.get(key)!;
          const maxHiddenPending = Math.max(
            existing.hiddenPendingCount ?? 0,
            h.hiddenPendingCount ?? 0
          );
          if (maxHiddenPending > (existing.hiddenPendingCount ?? 0)) {
            mergedMap.set(key, {
              ...existing,
              hiddenPendingCount: maxHiddenPending,
              hiddenTaskCount: maxHiddenPending,
            });
          }
        }
      }

      const finalList = Array.from(mergedMap.values()).sort((a, b) =>
        (a.label || "").localeCompare(b.label || "")
      );

      // Province đã có trong subLabel từ endpoint, không cần fetch thêm
      setHospitalsWithTasks(finalList);

      // ✅ Merge PICs từ tasks vào picOptions (giống bên bảo trì)
      setPicOptions(prev => {
        const optionMap = new Map<string, { id: string; label: string }>();
        prev.forEach(opt => optionMap.set(String(opt.id), opt));
        // Thêm PICs từ aggregated task data
        for (const [, aggregated] of acc.entries()) {
          const picIdsArr = Array.from(aggregated.picDeploymentIds);
          const picNamesArr = Array.from(aggregated.picDeploymentNames);
          picIdsArr.forEach((picId, idx) => {
            const idStr = String(picId).trim();
            if (idStr && !optionMap.has(idStr)) {
              const name = picNamesArr[idx] || "";
              if (name) optionMap.set(idStr, { id: idStr, label: name });
            }
          });
        }
        const merged = Array.from(optionMap.values());
        merged.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
        return merged;
      });
    } catch (e: any) {
      setError(e.message || "Lỗi tải danh sách bệnh viện");
    } finally {
      setLoadingHospitals(false);
    }
  }

  // Fetch pending implementation tasks that were created from Business and not yet accepted by Deployment
  async function fetchPendingGroups(): Promise<number> {
    setLoadingPending(true);
    try {
      const url = `${API_ROOT}/api/v1/admin/implementation/pending`;
      const res = await fetch(url, { method: 'GET', headers: authHeaders(), credentials: 'include' });
      if (res.status === 401) {
        toast.error('Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        navigate('/signin');
        return pendingCountRef.current;
      }
      if (!res.ok) throw new Error(`Failed to load pending: ${res.status}`);
      const list: ImplementationTaskResponseDTO[] = await res.json();
      // Defensive: only keep tasks without receivedBy
      const filtered = (Array.isArray(list) ? list : []).filter((t) => !t.receivedById && !t.receivedByName);
      const groups = new Map<string, { hospitalId: number | null; hospitalName: string; tasks: ImplementationTaskResponseDTO[] }>();
      for (const t of filtered) {
        const name = (t.hospitalName || '—').toString();
        const key = `${t.hospitalId ?? 'null'}::${name}`;
        const cur = groups.get(key) || { hospitalId: typeof t.hospitalId === 'number' ? t.hospitalId : null, hospitalName: name, tasks: [] };
        cur.tasks.push(t);
        groups.set(key, cur);
      }
      const grouped = Array.from(groups.values()).map(g => ({ hospitalName: g.hospitalName, hospitalId: g.hospitalId, tasks: g.tasks }));
      setPendingGroups(grouped);
      const count = grouped.reduce((s, g) => s + (g.tasks?.length || 0), 0);
      pendingCountRef.current = count;
      return count;
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi khi tải danh sách chờ');
    } finally {
      setLoadingPending(false);
    }
    return pendingCountRef.current;
  }

  async function handleAcceptTask(taskId: number) {
    try {
      const url = `${API_ROOT}/api/v1/admin/implementation/accept/${taskId}`;
      // Set startDate to current date/time and status to RECEIVED when accepting
      const startDate = toLocalISOString(new Date());
      const res = await fetch(url, {
        method: 'PUT',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          startDate,
          status: 'RECEIVED'
        })
      });
      if (res.status === 401) {
        toast.error('Bạn chưa đăng nhập hoặc không có quyền. Vui lòng đăng nhập lại.');
        navigate('/signin');
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const updated: ImplementationTaskResponseDTO | null = await res.json().catch(() => null);
      // Remove from pendingGroups
      setPendingGroups((prev) => prev.map(g => ({ ...g, tasks: g.tasks.filter(t => t.id !== taskId) })).filter(g => g.tasks.length > 0));

      // If server returned updated DTO, insert/update it into current view so accepter sees it immediately
      if (updated) {
        toast.success(`Đã nhận công việc: ${updated.name}`);
        // If currently viewing tasks for a specific hospital, and it matches, add to data list
        if (!showHospitalList && selectedHospital && updated.hospitalName === selectedHospital) {
          setData((prev) => {
            // avoid duplicates
            const exists = prev.some((p) => p.id === updated.id);
            if (exists) return prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
            return [{ ...updated, status: normalizeStatus(updated.status) || updated.status }, ...prev];
          });
        } else {
          // Not viewing that hospital — update hospitals summary counters optimistically
          setHospitalsWithTasks((prev) => prev.map(h => {
            if ((h.id ?? null) === (updated.hospitalId ?? null) || h.label === updated.hospitalName) {
              // task moved from pending -> active: increment taskCount and acceptedCount accordingly
              return { ...h, taskCount: (h.taskCount || 0) + 1, acceptedCount: (h.acceptedCount || 0) + 1 };
            }
            return h;
          }));
        }
      } else {
        toast.success('Đã nhận công việc');
      }

      // Refresh hospital summary to keep counters in sync (best-effort)
      fetchHospitalsWithTasks().catch(() => { });

      // Refresh task list if viewing tasks to show updated startDate and status
      if (!showHospitalList && selectedHospital) {
        await fetchList();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi khi tiếp nhận công việc');
    }
  }

  async function handleAcceptGroup(hospitalId: number | null) {
    // Accept all tasks in a given hospital group sequentially
    const group = pendingGroups.find(g => (g.hospitalId ?? null) === (hospitalId ?? null));
    if (!group) return;
    for (const t of [...group.tasks]) {
      // eslint-disable-next-line no-await-in-loop
      await handleAcceptTask(t.id as number);
    }
  }

  async function handleAcceptAll() {
    // Accept all tasks from all hospitals sequentially
    for (const group of [...pendingGroups]) {
      for (const t of [...group.tasks]) {
        // eslint-disable-next-line no-await-in-loop
        await handleAcceptTask(t.id as number);
      }
    }
  }

  const filteredHospitals = useMemo(() => {
    let list = hospitalsWithTasks;
    const q = hospitalSearch.trim().toLowerCase();
    if (q) list = list.filter(h => h.label.toLowerCase().includes(q) || (h.subLabel || '').toLowerCase().includes(q));
    
    // Filter by hospital code
    const codeQ = hospitalCodeSearch.trim().toLowerCase();
    if (codeQ) list = list.filter(h => (h.hospitalCode || '').toLowerCase().includes(codeQ));

    // Apply status filter
    if (hospitalStatusFilter === 'hasCompleted') {
      list = list.filter(h => (h.acceptedCount || 0) > 0);
    } else if (hospitalStatusFilter === 'notCompleted') {
      list = list.filter(h => (h.acceptedCount || 0) < (h.taskCount || 0));
    } else if (hospitalStatusFilter === 'noneCompleted') {
      list = list.filter(h => (h.acceptedCount || 0) === 0);
    } else if (hospitalStatusFilter === 'transferred') {
      list = list.filter(h => h.allTransferred === true);
    } else if (hospitalStatusFilter === 'hasOpenTickets') {
      list = list.filter(h => h.id && (ticketOpenCounts[h.id] ?? 0) > 0);
    }

    // Apply PIC filter - filter by picDeploymentIds/picDeploymentNames from tasks (giống bên bảo trì)
    if (hospitalPicFilter.length > 0) {
      // ✅ Normalize selected IDs - tạo Set với cả string và number format để match được cả hai
      const selectedStrings = new Set<string>();
      const selectedNumbers = new Set<number>();
      hospitalPicFilter.forEach(id => {
        const idStr = String(id).trim();
        const idNum = Number(id);
        selectedStrings.add(idStr);
        if (!isNaN(idNum) && idNum > 0) {
          selectedNumbers.add(idNum);
          // Thêm cả number dạng string để match
          selectedStrings.add(String(idNum));
        }
      });
      
      // Tạo map từ picOptions để có thể lookup name từ ID và ngược lại
      const picIdToNameMap = new Map<string, string>();
      const picNameToIdMap = new Map<string, string>();
      picOptions.forEach(opt => {
        const idStr = String(opt.id).trim();
        const nameStr = String(opt.label).trim();
        picIdToNameMap.set(idStr, nameStr);
        picNameToIdMap.set(nameStr, idStr);
      });

      list = list.filter((h) => {
        // Check by ID (so sánh với picDeploymentIds) - normalize cả hai bên
        const picIds = h.picDeploymentIds || [];
        const hasMatchingId = picIds.some((id: any) => {
          // So sánh cả string và number format
          const idStr = String(id).trim();
          const idNum = Number(id);
          return selectedStrings.has(idStr) || 
                 (!isNaN(idNum) && idNum > 0 && selectedNumbers.has(idNum)) ||
                 (!isNaN(idNum) && idNum > 0 && selectedStrings.has(String(idNum)));
        });
        
        // Check by name (so sánh với picDeploymentNames) - cần convert name sang ID trước
        const picNames = (h.picDeploymentNames || []).map(name => String(name).trim());
        const hasMatchingName = picNames.some((nameStr) => {
          // Tìm ID từ name, rồi check ID đó có trong selected không
          const idFromName = picNameToIdMap.get(nameStr);
          if (!idFromName) return false;
          // Check cả string và number format
          const idNum = Number(idFromName);
          return selectedStrings.has(idFromName) || 
                 (!isNaN(idNum) && idNum > 0 && selectedNumbers.has(idNum)) ||
                 (!isNaN(idNum) && idNum > 0 && selectedStrings.has(String(idNum)));
        });
        
        // Fallback: Check by personInChargeId nếu không có picDeploymentIds
        const hasMatchingPersonInCharge = h.personInChargeId && (() => {
          const picIdStr = String(h.personInChargeId).trim();
          const picIdNum = Number(h.personInChargeId);
          return selectedStrings.has(picIdStr) || 
                 (!isNaN(picIdNum) && picIdNum > 0 && selectedNumbers.has(picIdNum)) ||
                 (!isNaN(picIdNum) && picIdNum > 0 && selectedStrings.has(String(picIdNum)));
        })();
        
        return hasMatchingId || hasMatchingName || hasMatchingPersonInCharge;
      });
    }

    const dir = hospitalSortDir === 'desc' ? -1 : 1;
    // Chỉ sort theo ticket khi tất cả hospitals đã load xong ticket count (tránh nháy)
    const allTicketsLoaded = ticketCountLoading.size === 0;
    
    list = [...list].sort((a, b) => {
      // Chỉ áp dụng sort theo ticket khi đã load xong tất cả
      if (allTicketsLoaded) {
        const aTickets = a.id ? (ticketOpenCounts[a.id] ?? 0) : 0;
        const bTickets = b.id ? (ticketOpenCounts[b.id] ?? 0) : 0;
        
        // Bệnh viện có ticket > 0 luôn lên trước
        if (aTickets > 0 && bTickets === 0) return -1;
        if (aTickets === 0 && bTickets > 0) return 1;
        
        // Nếu cả 2 đều có ticket, sort theo số ticket giảm dần
        if (aTickets > 0 && bTickets > 0 && aTickets !== bTickets) {
          return bTickets - aTickets;
        }
      }
      
      // Sau đó áp dụng sort theo user chọn
      if (hospitalSortBy === 'taskCount') return ((a.taskCount || 0) - (b.taskCount || 0)) * dir;
      if (hospitalSortBy === 'accepted') return ((a.acceptedCount || 0) - (b.acceptedCount || 0)) * dir;
      if (hospitalSortBy === 'ratio') {
        const ra = (a.taskCount || 0) > 0 ? (a.acceptedCount || 0) / (a.taskCount || 1) : 0;
        const rb = (b.taskCount || 0) > 0 ? (b.acceptedCount || 0) / (b.taskCount || 1) : 0;
        return (ra - rb) * dir;
      }
      // label
      return a.label.localeCompare(b.label, "vi", { sensitivity: "base" }) * dir;
    });
    return list;
  }, [hospitalsWithTasks, hospitalSearch, hospitalCodeSearch, hospitalStatusFilter, hospitalPicFilter, hospitalSortBy, hospitalSortDir, ticketOpenCounts, ticketCountLoading, picOptions]);

  const pagedHospitals = useMemo(() => {
    return filteredHospitals.slice(hospitalPage * hospitalSize, (hospitalPage + 1) * hospitalSize);
  }, [filteredHospitals, hospitalPage, hospitalSize]);

  const getOpenTicketCount = useCallback((tickets: Array<{ status?: string }>) => {
    return tickets.filter((t) => t.status !== "HOAN_THANH").length;
  }, []);

  const updateTicketOpenCount = useCallback((hospitalId: number, tickets: Array<{ status?: string }>) => {
    setTicketOpenCounts((prev) => {
      const newCount = getOpenTicketCount(tickets);
      // Chỉ update nếu count thay đổi để tránh re-render không cần thiết
      if (prev[hospitalId] === newCount) return prev;
      return {
        ...prev,
        [hospitalId]: newCount,
      };
    });
  }, [getOpenTicketCount]);

  const handleTicketsChange = useCallback((tickets: Array<{ status?: string }>) => {
    if (selectedHospitalIdForTickets) {
      updateTicketOpenCount(selectedHospitalIdForTickets, tickets);
    }
  }, [selectedHospitalIdForTickets, updateTicketOpenCount]);

  const loadTicketOpenCount = useCallback(async (hospitalId: number) => {
    if (!hospitalId || hospitalId <= 0) return;
    if (typeof ticketOpenCounts[hospitalId] === "number") return;
    if (ticketCountLoading.has(hospitalId)) return;
    setTicketCountLoading((prev) => new Set(prev).add(hospitalId));
    try {
      const tickets = await getHospitalTickets(hospitalId);
      updateTicketOpenCount(hospitalId, tickets);
    } catch {
      // ignore errors to avoid noisy UI; badge just won't show
    } finally {
      setTicketCountLoading((prev) => {
        const next = new Set(prev);
        next.delete(hospitalId);
        return next;
      });
    }
  }, [ticketCountLoading, ticketOpenCounts, updateTicketOpenCount]);

  // ✅ Load ticket counts cho TẤT CẢ hospitals (không chỉ trang hiện tại) để sort đúng
  useEffect(() => {
    if (!showHospitalList) return;
    // Load cho tất cả hospitals để có thể sort theo ticket trước khi phân trang
    const ids = hospitalsWithTasks.map((h) => h.id).filter((id): id is number => typeof id === "number" && id > 0);
    ids.forEach((id) => {
      void loadTicketOpenCount(id);
    });
  }, [hospitalsWithTasks, showHospitalList, loadTicketOpenCount]);

  useEffect(() => {
    if (!showHospitalList && selectedHospital) {
      fetchList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHospital, showHospitalList]);

  const handleSubmit = async (payload: ImplementationTaskRequestDTO, id?: number) => {
    const isUpdate = Boolean(id);
    const url = isUpdate ? `${apiBase}/${id}` : apiBase;
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const msg = await res.text();
      toast.error(`${method} thất bại: ${msg || res.status}`);
      return;
    }
    // Update UI immediately without full page reload
    if (showHospitalList) {
      // We are on hospital table → refresh the aggregated list
      await fetchHospitalsWithTasks();
    } else {
      // We are viewing tasks of a hospital → refresh tasks
      await fetchList();

      // Optimistically bump hospital list counters so when user quay lại không cần reload
      if (!isUpdate && selectedHospital) {
        setHospitalsWithTasks((prev) => prev.map((h) => {
          if (h.label !== selectedHospital) return h;
          const incAccepted = normalizeStatus((payload as any)?.status) === 'COMPLETED' ? 1 : 0;
          return { ...h, taskCount: (h.taskCount || 0) + 1, acceptedCount: (h.acceptedCount || 0) + incAccepted };
        }));
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa bản ghi này?")) return;
    const res = await fetch(`${apiBase}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const msg = await res.text();
      toast.error(`Xóa thất bại: ${msg || res.status}`);
      return;
    }
    setData((s) => s.filter((x) => x.id !== id));
    toast.success("Đã xóa");
  };

  const handleConvertHospital = async (hospital: { label: string; taskCount?: number; acceptedCount?: number; id?: number | null }) => {
    if (!canManage) return;
    const total = hospital.taskCount || 0;
    const accepted = hospital.acceptedCount || 0;
    if (total === 0 || accepted < total) {
      toast.error("Bệnh viện còn tác vụ chưa hoàn thành nên chưa thể chuyển.");
      return;
    }
    const hospitalIdRaw =
      hospital.id ??
      hospitalsWithTasks.find((h) => h.label === hospital.label)?.id ??
      null;
    const hospitalId = hospitalIdRaw != null ? Number(hospitalIdRaw) : null;
    if (!hospitalId) {
      toast.error("Không xác định được bệnh viện để chuyển sang bảo trì.");
      return;
    }
    if (!confirm(`Chuyển bệnh viện ${hospital.label} sang bảo trì?`)) return;
    try {
      // ✅ API mới: Chuyển bệnh viện (không phải task)
      const res = await fetch(
        `${API_ROOT}/api/v1/admin/hospitals/${hospitalId}/transfer-to-maintenance`,
        {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
        },
      );
      if (!res.ok) {
        const text = await res.text();
        toast.error(`Chuyển sang bảo trì thất bại: ${text || res.status}`);
        return;
      }

      toast.success(`Đã chuyển bệnh viện ${hospital.label} sang bảo trì`);

      // ✅ Update state ngay lập tức để UI cập nhật (từ "Chuyển sang bảo trì" → "Chờ tiếp nhận")
      setHospitalsWithTasks((prev) => prev.map((h) => {
        if (h.id === hospitalId || h.label === hospital.label) {
          return {
            ...h,
            allTransferred: true, // Đã chuyển
            allAccepted: false,   // Chưa tiếp nhận
          };
        }
        return h;
      }));

      // ✅ Refresh để lấy data mới nhất từ backend (sau delay nhỏ để đảm bảo backend đã commit)
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchHospitalsWithTasks();
      if (!showHospitalList && selectedHospital === hospital.label) {
        await fetchList();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Lỗi khi chuyển sang bảo trì");
    }
  };

  // Props for hospital list filter
  const hospitalFilterProps: React.ComponentProps<typeof FilterToolbar> = {
    mode: "hospitals",
    searchValue: hospitalSearch,
    placeholder: "Tìm theo tên bệnh viện / tỉnh",
    onSearchChange: (value: string) => {
      setHospitalSearch(value);
      setHospitalPage(0);
    },
    hospitalCodeSearch: hospitalCodeSearch,
    onHospitalCodeSearchChange: (value: string) => {
      setHospitalCodeSearch(value);
      setHospitalPage(0);
    },
    statusValue: hospitalStatusFilter,
    onStatusChange: (value: string) => {
      setHospitalStatusFilter(value);
      setHospitalPage(0);
    },
    statusOptions: hospitalStatusOptions,
    totals: [
      {
        label: "Tổng bệnh viện:",
        value: loadingHospitals ? "..." : filteredHospitals.length,
      },
    ],
    actions: toolbarActions,
    picFilter: {
      picFilterOpen,
      setPicFilterOpen,
      picFilterQuery,
      setPicFilterQuery,
      picOptions,
      filteredPicOptions,
      hospitalPicFilter,
      togglePicFilterValue,
      clearPicFilter,
      picFilterDropdownRef,
    },
  };

  // Props for task list filter
  const taskFilterProps: React.ComponentProps<typeof FilterToolbar> = {
    mode: "tasks",
    searchValue: searchTerm,
    placeholder: "Tìm theo tên (gõ để gợi ý bệnh viện)s",
    onSearchChange: (value: string) => {
      setSearchTerm(value);
    },
    onSearchSubmit: () => {
      fetchList();
    },
    statusValue: statusFilter,
    onStatusChange: (value: string) => {
      setStatusFilter(value);
    },
    statusOptions: [
      { value: "", label: "— Trạng thái —" },
      { value: "RECEIVED", label: "Đã tiếp nhận" },
      { value: "IN_PROCESS", label: "Đang xử lý" },
      { value: "COMPLETED", label: "Hoàn thành" },
      { value: "ISSUE", label: "Gặp sự cố" },
      { value: "CANCELLED", label: "Hủy" },
    ],
    totals: [
      {
        label: "",
        value: loading ? "..." : (
          <div className="flex items-center gap-1  flex-nowrap">
            <span className="font-normal text-gray-600">Tổng:</span>
            <span className="font-bold text-gray-900">{totalCount ?? data.length}</span>
            {typeof completedCount === "number" && (
              <span className="text-sm font-normal text-gray-500 whitespace-nowrap">
                - Đã hoàn thành: <span className="text-sm font-bold text-gray-900 whitespace-nowrap" >{completedCount}/{totalCount ?? data.length} công việc </span>
              </span>
            )}
            {hiddenPendingSummary > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 whitespace-nowrap">
                + {hiddenPendingSummary} task từ Phòng KD chờ tiếp nhận
              </span>
            )}
          </div>
        ),
      },
    ],
    actions: addTaskButton,
  };

  const handleBackToHospitals = () => {
    setSelectedHospital(null);
    setShowHospitalList(true);
    setSearchTerm("");
    setStatusFilter("");
    setPage(0);
    setData([]);
    fetchHospitalsWithTasks();
  };

  return (
    <div className="p-6 xl:p-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">{showHospitalList ? "Danh sách bệnh viện có công việc triển khai" : `Danh sách công việc triển khai - ${selectedHospital}`}</h1>
        {!showHospitalList && (
          <button onClick={() => { setSelectedHospital(null); setShowHospitalList(true); setSearchTerm(""); setStatusFilter(""); setPage(0); setData([]); fetchHospitalsWithTasks(); }} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium">← Quay lại danh sách bệnh viện</button>
        )}
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="mb-6">
        {showHospitalList ? (
          <FilterToolbar {...hospitalFilterProps} />
        ) : (
          <FilterToolbar {...taskFilterProps} />
        )}
      </div>

      <div>
        <style>{`
          @keyframes fadeInUp { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
        `}</style>

        <div className="space-y-3">
          {loading && isInitialLoad && !showHospitalList ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse" aria-hidden="true">TAG</div>
            </div>
          ) : showHospitalList ? (
            // hospital list table
            <div className="mb-6">
              {loadingHospitals ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse" aria-hidden="true">TAG</div>
                </div>
              ) : filteredHospitals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                  Không có bệnh viện nào có task
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">STT</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên bệnh viện</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã BV</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tỉnh/Thành</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách chính</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách triển khai</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng task</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {pagedHospitals
                            .map((hospital, index) => {
                              const longName = (hospital.label || "").length > 32;
                              return (
                                <tr key={hospital.id ?? `${hospital.label}-${index}`} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { setSelectedHospital(hospital.label); setShowHospitalList(false); setPage(0); }}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospitalPage * hospitalSize + index + 1}</td>
                                  <td className="px-6 py-4">
                                    <div className={`flex gap-3 ${longName ? 'items-start' : 'items-center'}`}>

                                      <div className={`text-sm font-medium text-gray-900 break-words max-w-[260px] flex flex-wrap gap-2 ${longName ? 'leading-snug' : ''}`}>
                                        <span>{hospital.label}</span>
                                        {hospital.acceptedFromBusiness && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700">
                                            Tiếp nhận từ phòng KD
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.hospitalCode || "—"}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.subLabel || "—"}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.personInChargeName || "—"}</td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {hospital.picDeploymentNames && hospital.picDeploymentNames.length > 0
                                      ? (
                                        <div className="flex flex-wrap gap-1">
                                          {hospital.picDeploymentNames.map((name, i) => (
                                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      )
                                      : hospital.personInChargeName || "—"}
                                  </td>
                                  <td className="px-6 py-6 whitespace-nowrap text-sm align-top">
                                    <div className="flex flex-col items-start gap-1">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{(hospital.acceptedCount ?? 0)}/{hospital.taskCount ?? 0} task</span>
                                      {(hospital.nearDueCount ?? 0) > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Sắp đến hạn: {hospital.nearDueCount}</span>
                                      )}
                                      {(hospital.overdueCount ?? 0) > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Quá hạn: {hospital.overdueCount}</span>
                                      )}
                                      {(hospital.hiddenPendingCount ?? 0) > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                          + {hospital.hiddenPendingCount} task từ Phòng KD chờ tiếp nhận
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedHospital(hospital.label);
                                          setShowHospitalList(false);
                                          setPage(0);
                                        }}
                                        className="p-2 rounded-full text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition" title="Xem công việc"
                                      >
                                        <AiOutlineEye className="text-lg" />
                                      </button>
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          let finalHospitalId: number | null = null;
                                          if (hospital.id && hospital.id > 0) {
                                            finalHospitalId = hospital.id;
                                          } else {
                                            const resolvedId = await resolveHospitalIdByName(hospital.label);
                                            if (resolvedId) finalHospitalId = resolvedId;
                                          }

                                          if (finalHospitalId && finalHospitalId > 0) {
                                            setSelectedHospitalIdForTickets(finalHospitalId);
                                            setSelectedHospitalNameForTickets(hospital.label);
                                            setShowTicketsModal(true);
                                          } else {
                                            toast.error("Không thể tìm thấy ID bệnh viện hợp lệ");
                                          }
                                        }}
                                        className="relative p-2 rounded-full text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition"
                                        title="Xem danh sách tickets"
                                      >
                                        <FiTag className="text-lg" />
                                        {hospital.id && (ticketOpenCounts[hospital.id] ?? 0) > 0 && (
                                          <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                                            {ticketOpenCounts[hospital.id]}
                                          </span>
                                        )}
                                      </button>
                                      {canManage && (hospital.taskCount || 0) > 0 && (hospital.acceptedCount || 0) === (hospital.taskCount || 0) && !hospital.allTransferred && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleConvertHospital(hospital);
                                          }}
                                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                                          title="Chuyển tất cả tác vụ đã hoàn thành sang bảo trì"
                                        >
                                          ➜ Chuyển sang bảo trì
                                        </button>
                                      )}
                                      {canManage && (hospital.taskCount || 0) > 0 && hospital.allTransferred && !hospital.allAccepted && (
                                        <span
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-100 text-yellow-700 text-sm font-medium"
                                          title="Đã chuyển sang bảo trì, đang chờ bảo trì tiếp nhận"
                                        >
                                          ⏳ Chờ tiếp nhận
                                        </span>
                                      )}
                                      {canManage && (hospital.taskCount || 0) > 0 && hospital.allTransferred && hospital.allAccepted && (
                                        <span
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm"
                                          title="Đã chuyển sang bảo trì và bảo trì đã tiếp nhận"
                                        >
                                          ✓ Đã chuyển sang bảo trì
                                        </span>
                                      )}
                                      {canManage && (hospital.taskCount || 0) > 0 && (hospital.acceptedCount || 0) < (hospital.taskCount || 0) && !hospital.allTransferred && (
                                        <span
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm"
                                          title={`Còn ${(hospital.taskCount || 0) - (hospital.acceptedCount || 0)} task chưa hoàn thành`}
                                        >
                                          <span className="text-orange-500">⚠</span>
                                          Chưa thể chuyển
                                        </span>
                                      )}
                                      {canManage && (hospital.taskCount || 0) === 0 && (hospital.hiddenPendingCount ?? 0) > 0 && (
                                        <span
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm"
                                          title={`Còn ${hospital.hiddenPendingCount} task từ Phòng KD chưa tiếp nhận`}
                                        >
                                          <span className="text-orange-500">⚠</span>
                                          Chưa thể chuyển
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between py-3">
                    <div className="text-sm text-gray-600">
                      {filteredHospitals.length === 0 ? (
                        <span>Hiển thị 0 trong tổng số 0 mục</span>
                      ) : (
                        (() => {
                          const total = filteredHospitals.length;
                          const from = hospitalPage * hospitalSize + 1;
                          const to = Math.min((hospitalPage + 1) * hospitalSize, total);
                          return <span>Hiển thị {from} đến {to} trong tổng số {total} mục</span>;
                        })()
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Hiển thị:</label>
                        <select value={String(hospitalSize)} onChange={(e) => { setHospitalSize(Number(e.target.value)); setHospitalPage(0); }} className="border rounded px-2 py-1 text-sm">
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                      </div>

                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => setHospitalPage(0)} disabled={hospitalPage <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Đầu">«</button>
                        <button onClick={() => setHospitalPage((p) => Math.max(0, p - 1))} disabled={hospitalPage <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Trước">‹</button>

                        {(() => {
                          const total = Math.max(1, Math.ceil(filteredHospitals.length / hospitalSize));
                          const pages: number[] = [];
                          const start = Math.max(1, hospitalPage + 1 - 2);
                          const end = Math.min(total, start + 4);
                          for (let i = start; i <= end; i++) pages.push(i);
                          return pages.map((p) => (
                            <button key={p} onClick={() => setHospitalPage(p - 1)} className={`px-3 py-1 border rounded text-sm ${hospitalPage + 1 === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>
                              {p}
                            </button>
                          ));
                        })()}

                        <button onClick={() => setHospitalPage((p) => Math.min(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1), p + 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Tiếp">›</button>
                        <button onClick={() => setHospitalPage(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Cuối">»</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            filtered.length === 0 ? (
              hiddenPendingSummary > 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  <p className="text-base font-medium text-gray-800 dark:text-gray-100">
                    Có {hiddenPendingSummary} công việc từ Phòng KD đang chờ tiếp nhận.
                  </p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Mở danh sách "Công việc chờ tiếp nhận" để tiếp nhận hoặc kiểm tra các công việc này.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingOpen(true);
                        fetchPendingGroups();
                      }}
                      className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                    >
                      Xem danh sách chờ
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                  Không có dữ liệu
                </div>
              )
            ) : (
              <>
                {/* Bulk actions toolbar */}
                {selectedTaskIds.size > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Đã chọn {selectedTaskIds.size} task
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedTaskIds(new Set())}
                        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                      >
                        Bỏ chọn
                      </button>
                      <button
                        onClick={handleBulkComplete}
                        disabled={bulkCompleting}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {bulkCompleting ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            <span>Đang xử lý...</span>
                          </>
                        ) : (
                          <>

                            <span>Hoàn thành</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Task list with checkboxes */}
                {filtered.map((row, idx) => {
                  const taskId = row.id;
                  const isSelected = selectedTaskIds.has(taskId);
                  const canComplete = canManage && (() => {
                    try {
                      const uidRaw = localStorage.getItem("userId") || sessionStorage.getItem("userId");
                      const uid = uidRaw ? Number(uidRaw) : 0;
                      return uid > 0 && Number(row.picDeploymentId) === uid && row.status !== "COMPLETED";
                    } catch {
                      return false;
                    }
                  })();

                  return (
                    <div key={row.id}>
                      <TaskCardNew
                        task={row as unknown as ImplementationTaskResponseDTO}
                        idx={enableItemAnimation ? idx : undefined}
                        displayIndex={page * size + idx}
                        animate={enableItemAnimation}
                        onOpen={() => { setDetailItem(row); setDetailOpen(true); }}
                        onEdit={() => { setEditing(row); setModalOpen(true); }}
                        onDelete={(id: number) => { handleDelete(id); }}
                        canEdit={canManage && row.myRole === "owner"}
                        canDelete={canManage && row.myRole === "owner"}
                        leadingTopLeft={canComplete ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSet = new Set(selectedTaskIds);
                              if (e.target.checked) newSet.add(taskId); else newSet.delete(taskId);
                              setSelectedTaskIds(newSet);
                            }}
                            className="w-4.5 h-4.5 text-blue-600 border-blue-300 rounded focus:ring-blue-500 shadow-sm bg-white"
                          />
                        ) : undefined}
                      />
                    </div>
                  );
                })}
              </>
            )
          )}
        </div>
      </div>

      {!showHospitalList && (
        <div className="mt-4 flex items-center justify-between py-3">
          <div className="text-sm text-gray-600">
            {totalCount === null || totalCount === 0 ? (
              <span>Hiển thị 0 trong tổng số 0 mục</span>
            ) : (
              (() => {
                const from = page * size + 1;
                const to = Math.min((page + 1) * size, totalCount);
                return <span>Hiển thị {from} đến {to} trong tổng số {totalCount} mục</span>;
              })()
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Hiển thị:</label>
              <select value={String(size)} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="border rounded px-2 py-1 text-sm">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Đầu">«</button>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Trước">‹</button>

              {(() => {
                const total = Math.max(1, Math.ceil((totalCount || 0) / size));
                const pages: number[] = [];
                const start = Math.max(1, page + 1 - 2);
                const end = Math.min(total, start + 4);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button key={p} onClick={() => setPage(p - 1)} className={`px-3 py-1 border rounded text-sm ${page + 1 === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>
                    {p}
                  </button>
                ));
              })()}

              <button onClick={() => setPage((p) => Math.min(Math.max(0, Math.ceil((totalCount || 0) / size) - 1), p + 1))} disabled={totalCount !== null && (page + 1) * size >= (totalCount || 0)} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Tiếp">›</button>
              <button onClick={() => setPage(Math.max(0, Math.ceil((totalCount || 0) / size) - 1))} disabled={totalCount !== null && (page + 1) * size >= (totalCount || 0)} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Cuối">»</button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const initialForForm = editing
          ? ({
            id: (editing as ImplementationTaskResponseDTO).id,
            name: (editing as ImplementationTaskResponseDTO).name,
            hospitalId: (editing as ImplementationTaskResponseDTO).hospitalId ?? undefined,
            hospitalName: (editing as ImplementationTaskResponseDTO).hospitalName ?? null,
            picDeploymentId: (editing as ImplementationTaskResponseDTO).picDeploymentId ?? undefined,
            picDeploymentName: (editing as ImplementationTaskResponseDTO).picDeploymentName ?? null,
            picDeploymentIds: (editing as ImplementationTaskResponseDTO).picDeploymentIds ?? undefined,
            picDeploymentNames: (editing as ImplementationTaskResponseDTO).picDeploymentNames ?? undefined,
            apiTestStatus: (editing as ImplementationTaskResponseDTO).apiTestStatus ?? undefined,
            additionalRequest: (editing as ImplementationTaskResponseDTO).additionalRequest ?? undefined,
            deadline: (editing as ImplementationTaskResponseDTO).deadline ?? undefined,
            completionDate: (editing as ImplementationTaskResponseDTO).completionDate ?? undefined,
            status: (editing as ImplementationTaskResponseDTO).status ?? undefined,
            startDate: (editing as ImplementationTaskResponseDTO).startDate ?? undefined,
          } as Partial<ImplementationTaskRequestDTO> & { id?: number; hospitalName?: string | null; picDeploymentName?: string | null; picDeploymentIds?: number[] | null; picDeploymentNames?: string[] | null })
          : undefined;

        return (
          <TaskFormModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            initial={initialForForm}
            onSubmit={handleSubmit}
            userTeam={userTeam}
          />
        );
      })()}

      <DetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        item={detailItem}
      />
      {/* Pending tasks modal (Deployment acceptance for tasks created from Business) */}
      {pendingOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingOpen(false); }}>
          <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 overflow-auto max-h-[80vh]">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">📨 Công việc chờ - Tiếp nhận từ Phòng Kinh Doanh</h3>
              <div className="flex items-center gap-2">
                <button
                  className="h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm bg-transparent border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => { setPendingOpen(false); }}
                >
                  Đóng
                </button>
                <button
                  className="h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  onClick={async () => { await fetchPendingGroups(); }}
                >
                  Làm mới
                </button>
              </div>
            </div>
            <div className="p-4">
              {loadingPending ? (
                <div className="text-center py-8">Đang tải...</div>
              ) : pendingGroups.length === 0 ? (
                <div className="text-center py-8">Không có công việc chờ</div>
              ) : (
                <>
                  <div className="mb-4 flex justify-end">
                    <Button
                      variant="primary"
                      onClick={handleAcceptAll}
                      disabled={pendingGroups.reduce((sum, g) => sum + g.tasks.length, 0) === 0}
                      className="!bg-green-600 !text-white !border-green-600 hover:!bg-green-700 hover:!border-green-700 disabled:!bg-green-300 disabled:!border-green-300 disabled:!text-white"
                    >
                      Tiếp nhận tất cả ({pendingGroups.reduce((sum, g) => sum + g.tasks.length, 0)})
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {pendingGroups.map((g) => (
                      <div key={`${g.hospitalId ?? 'null'}-${g.hospitalName}`} className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="font-semibold text-base">
                          {g.hospitalName} <span className="text-sm text-gray-500 font-normal">({g.tasks.length} hợp đồng)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            onClick={() => handleAcceptGroup(g.hospitalId)}
                            className="!bg-blue-600 !text-white !border-blue-600 hover:!bg-blue-700 hover:!border-blue-700 disabled:!bg-blue-300 disabled:!border-blue-300 disabled:!text-white"
                          >
                            Tiếp nhận
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Tickets Modal */}
      <AnimatePresence>
        {showTicketsModal && selectedHospitalIdForTickets && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowTicketsModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
            <motion.div
              className="relative z-[121] w-full max-w-6xl rounded-2xl bg-white shadow-2xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Tickets của {selectedHospitalNameForTickets || hospitalsWithTasks.find(h => h.id === selectedHospitalIdForTickets)?.label || "Bệnh viện"}
                </h3>
                <button
                  onClick={() => {
                    setShowTicketsModal(false);
                    setSelectedHospitalIdForTickets(null);
                    setSelectedHospitalNameForTickets(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">
                {selectedHospitalIdForTickets ? (
                  <TicketsTab
                    hospitalId={selectedHospitalIdForTickets}
                    onTicketsChange={handleTicketsChange}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Đang tải thông tin bệnh viện...
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImplementationTasksPage;
