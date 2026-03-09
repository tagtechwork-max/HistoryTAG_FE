import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TaskCardNew from "../SuperAdmin/TaskCardNew";
import TaskNotes from "../../components/TaskNotes";
import { AiOutlineEye } from "react-icons/ai";
import toast from "react-hot-toast";
import { FaHospital } from "react-icons/fa";
import { FiUser, FiLink, FiClock, FiTag, FiCheckCircle, FiX } from "react-icons/fi";
import { useWebSocket } from "../../contexts/WebSocketContext";
import TicketsTab from "../../pages/CustomerCare/SubCustomerCare/TicketsTab";
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

function PendingTasksModal({
    open,
    onClose,
    onAccept,
    onAcceptAll,
    list,
    loading,
}: {
    open: boolean;
    onClose: () => void;
    onAccept: (group: PendingTransferGroup) => Promise<void>;
    onAcceptAll?: () => Promise<void>;
    list: PendingTransferGroup[];
    loading: boolean;
}) {
    const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        Danh sách viện chờ tiếp nhận
                    </h2>

                    {/* <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        ✕
                    </button> */}
                </div>
                <hr className="my-4 border-gray-200 dark:border-gray-700"></hr>

                {loading ? (
                    <div className="text-center text-gray-500 py-6">Đang tải...</div>
                ) : list.length === 0 ? (
                    <div className="text-center text-gray-500 py-6">
                        Không có viện nào chờ tiếp nhận.
                    </div>
                ) : (
                    <>
                        {onAcceptAll && (
                            <div className="mb-4 flex justify-end">
                                <button
                                    onClick={onAcceptAll}
                                    disabled={list.length === 0}
                                    className="h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm !bg-green-600 !text-white !border-green-600 hover:!bg-green-700 hover:!border-green-700 disabled:!bg-green-300 disabled:!border-green-300 disabled:!text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Tiếp nhận tất cả ({list.length})
                                </button>
                            </div>
                        )}
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                            {list.map((group) => (
                                <div
                                    key={group.key}
                                    className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800 overflow-hidden"
                                >
                                    <div className="flex items-center justify-between px-5 py-4">
                                        <div>
                                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                                                {group.hospitalName || "Bệnh viện không xác định"}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                Bệnh viện chờ tiếp nhận từ Triển khai
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                setAcceptingKey(group.key);
                                                try {
                                                    await onAccept(group);
                                                } finally {
                                                    setAcceptingKey(null);
                                                }
                                            }}
                                            disabled={acceptingKey === group.key}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-green-500 disabled:opacity-60"
                                        >

                                            <span>Tiếp nhận</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}

// =====================
// Types khớp với BE DTOs
// =====================
export type ImplementationTaskResponseDTO = {
    id: number;
    name: string;
    hospitalId: number | null;
    hospitalName?: string | null;
    picDeploymentId: number | null;
    picDeploymentName?: string | null;
    picDeploymentIds?: number[] | null;
    picDeploymentNames?: string[] | null;
    receivedById?: number | null;
    receivedByName?: string | null;
    receivedDate?: string | null;
    quantity?: number | null;
    agencyId?: number | null;
    hisSystemId?: number | null;
    hardwareId?: number | null;
    endDate?: string | null; // ISO string từ LocalDateTime
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

type PendingTransferGroup = {
    key: string;
    hospitalId: number | null;
    hospitalName: string;
    tasks: ImplementationTaskResponseDTO[];
};

type PendingHospital = {
    id: number;
    name: string;
    province?: string | null;
    transferredToMaintenance?: boolean | null;
    acceptedByMaintenance?: boolean | null;
    transferredAt?: string | null;
    acceptedAt?: string | null;
    transferredById?: number | null;
    transferredByFullname?: string | null;
    acceptedById?: number | null;
    acceptedByFullname?: string | null;
};

export type ImplementationTaskRequestDTO = {
    name: string;
    hospitalId: number;
    picDeploymentId: number;
    picDeploymentIds?: number[];
    agencyId?: number | null;
    hisSystemId?: number | null;
    hardwareId?: number | null;
    quantity?: number | null;
    apiTestStatus?: string | null;
    bhytPortCheckInfo?: string | null;
    additionalRequest?: string | null;
    apiUrl?: string | null;
    deadline?: string | null; // ISO
    completionDate?: string | null; // ISO
    status?: string | null;
    startDate?: string | null;
    acceptanceDate?: string | null;
};

export type ImplementationTaskUpdateDTO = Partial<ImplementationTaskRequestDTO>;

type UserInfo = { id?: number; username?: string; team?: string; roles?: string[] } | null;

const API_ROOT = import.meta.env.VITE_API_URL || "";

// PageClients: admin area — always use admin endpoints
const apiBase = `${API_ROOT}/api/v1/admin/maintenance/tasks`;
const MIN_LOADING_MS = 2000;

function authHeaders(extra?: Record<string, string>) {
    const token = localStorage.getItem("access_token");
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

// Read from localStorage then sessionStorage (some flows store in session)
function readStored<T = unknown>(key: string): T | null {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}


function fmt(dt?: string | null) {
    if (!dt) return "";
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
}
// mark fmt as referenced to avoid TS6133 in builds when this file does not use fmt directly
void fmt;

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
                "h-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
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

function isCompletedStatus(status?: string | null) {
    return normalizeStatus(status) === "COMPLETED";
}

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

// formatStt, PencilIcon, TrashIcon removed — using shared TaskCardNew for visuals/controls

/** ===========================
 *  RemoteSelect (autocomplete)
 *  =========================== */
function RemoteSelect({
    label,
    placeholder,
    fetchOptions,
    value,
    onChange,
    required,
    excludeIds,
}: {
    label: string;
    placeholder?: string;
    required?: boolean;
    fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
    value: { id: number; name: string } | null;
    onChange: (v: { id: number; name: string } | null) => void;
    excludeIds?: number[];
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [highlight, setHighlight] = useState<number>(-1);

    // debounce search - chỉ search khi user nhập ít nhất 2 ký tự
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
                if (!alive) return;
                const mapped = Array.isArray(res) ? res.map((o: any) => ({ id: Number(o.id), name: String(o.name) })) : [];
                const filtered = excludeIds && excludeIds.length ? mapped.filter((o) => !excludeIds.includes(o.id)) : mapped;
                if (alive) setOptions(filtered);
            } catch (err) {
                if (alive) setOptions([]);
            } finally {
                if (alive) setLoading(false);
            }
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [q, fetchOptions, excludeIds]);

    // KHÔNG preload khi mở dropdown - chỉ load khi user nhập ít nhất 2 ký tự
    // useEffect(() => {
    //     if (open) {
    //         // preload lần đầu
    //         if (!options.length && !q.trim()) {
    //             (async () => {
    //                 setLoading(true);
    //                 try {
    //                     const res = await fetchOptions("");
    //                     setOptions(res);
    //                 } finally {
    //                     setLoading(false);
    //                 }
    //             })();
    //         }
    //     }
    // }, [open]); // eslint-disable-line

    return (
        <Field label={label} required={required}>
            <div className="relative">
                <input
                    className={clsx(
                        "h-10 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
                        "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                    )}
                    placeholder={placeholder || "Gõ để tìm..."}
                    value={open ? q : value?.name || ""}
                    onChange={(e) => {
                        setQ(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        setTimeout(() => setOpen(false), 150);
                    }}
                    onKeyDown={(e) => {
                        if (!open) return;
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlight((h) => Math.min(h + 1, options.length - 1));
                        } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlight((h) => Math.max(h - 1, 0));
                        } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (highlight >= 0 && options[highlight]) {
                                onChange(options[highlight]);
                                setOpen(false);
                            }
                        } else if (e.key === "Escape") {
                            setOpen(false);
                        }
                    }}
                />
                {/* Nút xóa chọn */}
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
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                                {q.trim().length < 2 ? "Nhập ít nhất 2 ký tự để tìm kiếm" : "Không tìm thấy"}
                            </div>
                        )}
                        {options.length > 0 &&
                            options.map((opt, idx) => (
                                <div
                                    key={opt.id}
                                    className={clsx(
                                        "px-3 py-2 text-sm cursor-pointer",
                                        idx === highlight ? "bg-gray-100 dark:bg-gray-800" : ""
                                    )}
                                    onMouseEnter={() => setHighlight(idx)}
                                    onMouseDown={(e) => {
                                        // dùng mousedown để chọn trước khi input blur
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
    initial?: Partial<ImplementationTaskRequestDTO> & { id?: number; hospitalName?: string | null; picDeploymentName?: string | null };
    onSubmit: (payload: ImplementationTaskRequestDTO, id?: number) => Promise<void>;
    userTeam: string;
}) {
    // ===== Fetchers cho RemoteSelect =====
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
            // Lọc theo team dựa trên user đăng nhập
            if (userTeam === "MAINTENANCE") {
                params.set("team", "MAINTENANCE");
            } else if (userTeam === "DEPLOYMENT") {
                params.set("team", "DEPLOYMENT");
            }
            // Nếu SUPERADMIN, không lọc team để hiện tất cả
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

    // Thêm loaders giống dev-tasks cho Agency/HIS/Hardware
    // const searchAgencies = useMemo(
    //     () => async (term: string) => {
    //         const url = `${API_ROOT}/api/v1/admin/agencies/search?search=${encodeURIComponent(term)}`;
    //         const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    //         if (!res.ok) return [];
    //         const list = await res.json();
    //         const mapped = Array.isArray(list)
    //             ? list.map((a: { id?: number; label?: string; name?: string }) => ({ id: Number(a.id), name: String(a.label ?? a.name ?? a?.id) }))
    //             : [];
    //         return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
    //     },
    //     []
    // );

    // const searchHisSystems = useMemo(
    //     () => async (term: string) => {
    //         const url = `${API_ROOT}/api/v1/admin/his/search?search=${encodeURIComponent(term)}`;
    //         const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    //         if (!res.ok) return [];
    //         const list = await res.json();
    //         const mapped = Array.isArray(list)
    //             ? list.map((h: { id?: number; label?: string; name?: string }) => ({ id: Number(h.id), name: String(h.label ?? h.name ?? h?.id) }))
    //             : [];
    //         return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
    //     },
    //     []
    // );

    // const searchHardwares = useMemo(
    //     () => async (term: string) => {
    //         const url = `${API_ROOT}/api/v1/admin/hardware/search?search=${encodeURIComponent(term)}`;
    //         const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
    //         if (!res.ok) return [];
    //         const list = await res.json();
    //         const mapped = Array.isArray(list)
    //             ? list.map((h: { id?: number; label?: string; name?: string }) => ({ id: Number(h.id), name: String(h.label ?? h.name ?? h?.id) }))
    //             : [];
    //         return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
    //     },
    //     []
    // );

    // Lấy thông tin user đang đăng nhập để tự động điền vào picDeployment khi tạo mới
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
    // Nếu task được server đánh dấu read-only cho deployment, ẩn input/controls
    const readOnly = Boolean((initial as any)?.readOnlyForDeployment);

    const [model, setModel] = useState<ImplementationTaskRequestDTO>(() => {
        const isNew = !(initial?.id);
        const nowIso = toLocalISOString(new Date());
        const normalizedStatus = normalizeStatus(initial?.status) ?? "RECEIVED";
        const completionDefault =
            normalizedStatus === "COMPLETED"
                ? (initial?.completionDate ?? nowIso)
                : (initial?.completionDate ?? "");
        const defaultPicId = Number(initial?.picDeploymentId) || (isNew ? currentUserId ?? 0 : 0);
        return {
            name: initial?.name || "",
            hospitalId: (initial?.hospitalId as number) || 0,
            picDeploymentId: defaultPicId,
            agencyId: initial?.agencyId ?? null,
            hisSystemId: initial?.hisSystemId ?? null,
            hardwareId: initial?.hardwareId ?? null,
            quantity: initial?.quantity ?? null,
            apiTestStatus: initial?.apiTestStatus ?? "",
            bhytPortCheckInfo: initial?.bhytPortCheckInfo ?? "",
            additionalRequest: initial?.additionalRequest ?? "",
            apiUrl: initial?.apiUrl ?? "",
            deadline: initial?.deadline ?? "",
            completionDate: completionDefault,
            status: normalizedStatus,
            startDate: initial?.startDate ?? (isNew ? nowIso : ""),
            acceptanceDate: initial?.acceptanceDate ?? "",
        };
    });

    // Lưu selection theo {id, name} để hiển thị tên
    const [hospitalOpt, setHospitalOpt] = useState<{ id: number; name: string } | null>(() => {
        const id = (initial?.hospitalId as number) || 0;
        const nm = (initial?.hospitalName as string) || "";
        return id ? { id, name: nm || String(id) } : null;
    });
    // 1) State lưu danh sách những người ĐÃ chọn (dạng mảng)
    const buildPicOptsFromInitial = (init?: any) => {
        const isNew = !init?.id;
        const pairs: Array<{ id: number; name?: string | null }> = [];

        if (init?.picDeploymentId) {
            pairs.push({ id: Number(init.picDeploymentId), name: (init as any).picDeploymentName });
        }

        if (Array.isArray(init?.picDeploymentIds)) {
            const ids = init!.picDeploymentIds as any[];
            const names = Array.isArray((init as any)?.picDeploymentNames) ? (init as any).picDeploymentNames : [];
            for (let i = 0; i < ids.length; i++) {
                const id = Number(ids[i]);
                const name = names[i];
                pairs.push({ id, name });
            }
        }

        // Deduplicate while preserving first occurrence
        const seen = new Set<number>();
        const uniq: Array<{ id: number; name?: string | null }> = [];
        for (const p of pairs) {
            if (!Number.isFinite(p.id) || p.id <= 0) continue;
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            uniq.push(p);
        }

        if (isNew && uniq.length === 0 && currentUserId) uniq.unshift({ id: currentUserId, name: currentUserName });

        return uniq.map((p, idx) => ({
            id: p.id,
            name: p.name && String(p.name).trim() ? String(p.name) : p.id === currentUserId ? currentUserName || String(p.id) : String(p.id),
            _uid: `pic-${p.id}-${idx}-${Math.random().toString(36).slice(2, 9)}`,
        }));
    };

    const [picOpts, setPicOpts] = useState<Array<{ id: number; name: string; _uid: string }>>(() => buildPicOptsFromInitial(initial));
    // 2) State lưu giá trị tạm thời của ô tìm kiếm (để clear sau khi chọn xong)
    const [currentPicInput, setCurrentPicInput] = useState<{ id: number; name: string } | null>(null);
    const [supporterOpts, setSupporterOpts] = useState<Array<{ id: number; name: string; _uid: string }>>(() => {
        if (!initial?.picDeploymentIds || initial.picDeploymentIds.length === 0) return [];
        const ids = initial.picDeploymentIds.map((x: any) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
        const names = Array.isArray((initial as any)?.picDeploymentNames) ? (initial as any).picDeploymentNames : [];
        return ids.map((id, idx) => ({
            id,
            name: names[idx] && String(names[idx]).trim() ? String(names[idx]) : `User-${id}`,
            _uid: `supporter-${id}-${idx}-${Math.random().toString(36).slice(2, 9)}`,
        }));
    });
    const [currentSupporterInput, setCurrentSupporterInput] = useState<{ id: number; name: string } | null>(null);

    const [agencyOpt, setAgencyOpt] = useState<{ id: number; name: string } | null>(() => {
        const id = (initial?.agencyId as number) || 0;
        return id ? { id, name: String(id) } : null;
    });
    const [hisOpt, setHisOpt] = useState<{ id: number; name: string } | null>(() => {
        const id = (initial?.hisSystemId as number) || 0;
        return id ? { id, name: String(id) } : null;
    });
    const [hardwareOpt, setHardwareOpt] = useState<{ id: number; name: string } | null>(() => {
        const id = (initial?.hardwareId as number) || 0;
        return id ? { id, name: String(id) } : null;
    });

    // These selection states are intentionally kept for future fields but may be unused
    // in some builds; reference them to avoid TS6133 (declared but never read).
    void agencyOpt;
    void setAgencyOpt;
    void hisOpt;
    void setHisOpt;
    void hardwareOpt;
    void setHardwareOpt;


    useEffect(() => {
        if (open) {
            const isNew = !(initial?.id);
            const nowIso = toLocalISOString(new Date());
            const normalizedStatus = normalizeStatus(initial?.status) ?? "RECEIVED";
            const completionDefault =
                normalizedStatus === "COMPLETED"
                    ? (initial?.completionDate ?? nowIso)
                    : (initial?.completionDate ?? "");
            const defaultPicId = Number(initial?.picDeploymentId) || (isNew ? currentUserId ?? 0 : 0);
            const defaultStart = initial?.startDate || (isNew ? nowIso : "");

            setModel({
                name: initial?.name || "",
                hospitalId: (initial?.hospitalId as number) || 0,
                picDeploymentId: defaultPicId,
                agencyId: initial?.agencyId ?? null,
                hisSystemId: initial?.hisSystemId ?? null,
                hardwareId: initial?.hardwareId ?? null,
                quantity: initial?.quantity ?? null,
                apiTestStatus: initial?.apiTestStatus ?? "",
                bhytPortCheckInfo: initial?.bhytPortCheckInfo ?? "",
                additionalRequest: initial?.additionalRequest ?? "",
                apiUrl: initial?.apiUrl ?? "",
                deadline: initial?.deadline ?? "",
                completionDate: completionDefault,
                status: normalizedStatus,
                startDate: defaultStart,
                acceptanceDate: initial?.acceptanceDate ?? "",
            });

            const hid = (initial?.hospitalId as number) || 0;
            const hnm = (initial?.hospitalName as string) || "";
            setHospitalOpt(hid ? { id: hid, name: hnm || String(hid) } : null);

            // Set danh sách PICs: dùng helper để ghép id->name ổn định, tránh sai lệch chỉ số
            setPicOpts(buildPicOptsFromInitial(initial));

            // Prefill các select phụ
            // const aid = (initial?.agencyId as number) || 0;
            // setAgencyOpt(aid ? { id: aid, name: String(aid) } : null);
            // const hid2 = (initial?.hisSystemId as number) || 0;
            // setHisOpt(hid2 ? { id: hid2, name: String(hid2) } : null);
            // const hwid = (initial?.hardwareId as number) || 0;
            // setHardwareOpt(hwid ? { id: hwid, name: String(hwid) } : null);
        }
    }, [open, initial]);

    // Khi sửa: resolve tên theo ID cho Agency/HIS/Hardware/Hospital/PIC nếu chỉ có ID
    useEffect(() => {
        if (!open) return;
        const isNewTask = !(initial?.id);

        async function resolveById(
            id: number | null | undefined,
            setOpt: (v: { id: number; name: string } | null) => void,
            detailPath: string,
            nameKeys: string[]
        ) {
            if (!id || id <= 0) return;

            const extractName = (payload: unknown): string | null => {
                const candidates: any[] = [];
                if (payload && typeof payload === "object") {
                    candidates.push(payload);
                    // @ts-ignore
                    if ((payload as any).data) candidates.push((payload as any).data);
                    // @ts-ignore
                    if ((payload as any).result) candidates.push((payload as any).result);
                }
                for (const obj of candidates) {
                    for (const k of nameKeys) {
                        const v = (obj as any)?.[k];
                        if (typeof v === "string" && v.trim()) return String(v);
                    }
                }
                return null;
            };

            // 1) Try detail endpoint
            try {
                const res = await fetch(`${API_ROOT}${detailPath}/${id}`, { headers: authHeaders(), credentials: "include" });
                if (res.ok) {
                    const obj = await res.json();
                    const name = extractName(obj);
                    if (name) {
                        setOpt({ id, name });
                        return;
                    }
                }
            } catch {
                /* ignore */
            }

            // 2) Try listing/search endpoint
            try {
                const res = await fetch(`${API_ROOT}${detailPath}?search=${encodeURIComponent(String(id))}&page=0&size=50`, { headers: authHeaders(), credentials: "include" });
                if (res.ok) {
                    const obj = await res.json();
                    const list = Array.isArray(obj?.content) ? obj.content : Array.isArray(obj) ? obj : [];
                    const found = list.find((it: any) => Number(it?.id) === Number(id));
                    if (found) {
                        const name = extractName(found) || String((found as any).name ?? (found as any).label ?? found[id]);
                        if (name) {
                            setOpt({ id, name });
                            return;
                        }
                    }
                }
            } catch {
                /* ignore */
            }

            // 3) Fallback: use existing search loaders
            // const fetcher = setOpt === setAgencyOpt ? searchAgencies : setOpt === setHisOpt ? searchHisSystems : searchHardwares;
            // const opts: Array<{ id: number; name: string }> = await fetcher("");
            // const found = opts.find((o: { id: number; name: string }) => o.id === id);
            // if (found) setOpt(found);
        }

        // Resolve cho Hospital & PIC
        resolveById((initial?.hospitalId as number) || null, setHospitalOpt, "/api/v1/admin/hospitals", ["name", "hospitalName", "label", "code"]);

        // Resolve PIC: 
        // - Nếu là task mới và có currentUserId: luôn fetch để đảm bảo có tên đầy đủ
        // - Nếu là task cũ: chỉ fetch khi có picDeploymentId
        if (isNewTask && currentUserId) {
            // resolve into temporary input (will be added to picOpts on user interaction if needed)
            resolveById(currentUserId, setCurrentPicInput, "/api/v1/admin/users", ["fullName", "fullname", "name", "username", "label"]);
        } else if (initial?.picDeploymentId) {
            resolveById((initial?.picDeploymentId as number) || null, setCurrentPicInput, "/api/v1/admin/users", ["fullName", "fullname", "name", "username", "label"]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initial, currentUserId]);

    // Nếu có các picOpts hiển thị là số/placeholder (ví dụ "9" hoặc "User-9"),
    // fetch thông tin user và cập nhật tên hiển thị.
    useEffect(() => {
        if (!open) return;
        if (!picOpts || picOpts.length === 0) return;

        const needsResolve = picOpts
            .filter((p) => {
                const n = String(p.name ?? "").trim();
                return (
                    !n ||
                    /^\d+$/.test(n) ||
                    n === String(p.id) ||
                    n === `User-${p.id}` ||
                    n === "Không có tên"
                );
            })
            .map((p) => Number(p.id))
            .filter((id, i, arr) => Number.isFinite(id) && id > 0 && arr.indexOf(id) === i);

        if (needsResolve.length === 0) return;

        let cancelled = false;

        (async () => {
            try {
                const results = await Promise.all(
                    needsResolve.map(async (id) => {
                        try {
                            const res = await fetch(`${API_ROOT}/api/v1/admin/users/${id}`, { headers: authHeaders(), credentials: "include" });
                            if (!res.ok) return null;
                            return await res.json();
                        } catch {
                            return null;
                        }
                    })
                );

                if (cancelled) return;

                setPicOpts((prev) =>
                    prev.map((p) => {
                        const idx = needsResolve.indexOf(Number(p.id));
                        if (idx === -1) return p;
                        const u = results[idx];
                        if (!u) return p;
                        const resolvedName = (u.fullName || u.fullname || u.name || u.username || u.label) as string | undefined;
                        if (!resolvedName) return p;
                        return { ...p, name: String(resolvedName) };
                    })
                );
            } catch {
                // ignore
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, picOpts]);

    useEffect(() => {
        if (!open) return;
        if (!initial?.picDeploymentIds || initial.picDeploymentIds.length === 0) {
            setSupporterOpts([]);
            return;
        }
        const ids = initial.picDeploymentIds
            .map((x: any) => Number(x))
            .filter((n: number) => Number.isFinite(n) && n > 0);
        const names = Array.isArray((initial as any)?.picDeploymentNames) ? (initial as any).picDeploymentNames : [];
        const opts = ids.map((id, idx) => ({
            id,
            name: names[idx] && String(names[idx]).trim() ? String(names[idx]) : `User-${id}`,
            _uid: `supporter-${id}-${idx}-${Math.random().toString(36).slice(2, 9)}`,
        }));
        setSupporterOpts(opts);
    }, [open, initial]);

    useEffect(() => {
        if (!picOpts || picOpts.length === 0) return;
        const ids = new Set(picOpts.map((p) => p.id));
        setSupporterOpts((prev) => prev.filter((s) => !ids.has(s.id)));
    }, [picOpts]);

    const removeSupporter = (uid: string) => {
        setSupporterOpts((prev) => prev.filter((s) => s._uid !== uid));
    };

    const addSupporter = (supporter: { id: number; name: string }) => {
        if (!supporter?.id) return;
        if (picOpts.some((p) => p.id === supporter.id)) {
            toast.error("Đang là người phụ trách chính");
            setCurrentSupporterInput(null);
            return;
        }
        if (supporterOpts.some((s) => s.id === supporter.id)) {
            toast.error("Người này đã có trong danh sách hỗ trợ");
            setCurrentSupporterInput(null);
            return;
        }
        setSupporterOpts((prev) => [
            ...prev,
            {
                id: supporter.id,
                name: supporter.name || `User-${supporter.id}`,
                _uid: `supporter-${supporter.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            },
        ]);
        setCurrentSupporterInput(null);
    };

    // 3) Hàm xóa một người khỏi danh sách PICs (tags)
    const removePic = (uidToRemove: string) => {
        setPicOpts((prev) => prev.filter((p) => p._uid !== uidToRemove));
    };

    // Đóng bằng phím ESC
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const [submitting, setSubmitting] = useState(false);

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!model.name?.trim()) { toast.error("Tên dự án không được để trống"); return; }
        if (!hospitalOpt?.id) { toast.error("Bệnh viện không được để trống"); return; }
        if (!picOpts || picOpts.length === 0) { toast.error("Người phụ trách không được để trống"); return; }

        const normalizedStatus = normalizeStatus(model.status) ?? "RECEIVED";

        const isNew = !(initial?.id);
        const startDateRaw = model.startDate || (isNew ? toLocalISOString(new Date()) : "");
        const completionRaw = isCompletedStatus(normalizedStatus)
            ? (model.completionDate && String(model.completionDate).trim() ? model.completionDate : toLocalISOString(new Date()))
            : "";

        const picIds = picOpts.map((p) => p.id).filter((id) => Number.isFinite(id));

        const payload: ImplementationTaskRequestDTO = {
            ...model,
            hospitalId: hospitalOpt.id,
            picDeploymentId: picIds[0],
            picDeploymentIds: picIds,
            status: normalizedStatus,
            deadline: toISOOrNull(model.deadline) || undefined,
            completionDate: completionRaw ? toISOOrNull(completionRaw) || undefined : undefined,
            startDate: toISOOrNull(startDateRaw) || undefined,
            acceptanceDate: toISOOrNull(model.acceptanceDate) || undefined,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload, initial?.id);
            toast.success(initial?.id ? "Cập nhật thành công" : "Tạo mới thành công");
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    const lockHospital = !initial?.id && (Boolean(initial?.hospitalId) || Boolean(initial?.hospitalName));

    return (
        <>
            {/* Wrapper làm overlay + bắt click nền để đóng */}
            <div
                className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40"
                onMouseDown={(e) => {
                    // chỉ đóng khi click đúng nền (không phải click vào con bên trong)
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
                        onMouseDown={(e) => e.stopPropagation()} // chặn đóng khi click trong modal
                        role="dialog"
                        aria-modal="true"
                    >
                        {/* Thêm max-h & overflow để có thanh cuộn */}
                        <form onSubmit={handleSubmit} className="px-6 pt-0 pb-6 grid gap-4 max-h-[80vh] overflow-y-auto no-scrollbar">
                            <div className="sticky top-0 z-[100] -mx-3 px-3  bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                                <div className="flex items-center justify-between py-3">
                                    <h3 className="text-lg font-semibold">{initial?.id ? (initial?.name || "") : "Tạo tác vụ"}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(() => { return null; })()}
                                <Field label="Tên công việc" required>
                                    <TextInput
                                        value={model.name}
                                        onChange={(e) => setModel((s) => ({ ...s, name: e.target.value }))}
                                        placeholder="Nhập tên công việc"
                                    />
                                </Field>

                                {/* Bệnh viện theo TÊN */}
                                {lockHospital ? (
                                    <Field label="Bệnh viện" required>
                                        <div className="h-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 flex items-center">
                                            {hospitalOpt?.name || "-"}
                                        </div>
                                    </Field>
                                ) : (
                                    <RemoteSelect
                                        label="Bệnh viện"
                                        required
                                        placeholder="Nhập tên bệnh viện để tìm…"
                                        fetchOptions={searchHospitals}
                                        value={hospitalOpt}
                                        onChange={setHospitalOpt}
                                    />
                                )}

                                {/* PIC theo TÊN (multi-select tags) */}
                                <div className="col-span-2">
                                    {/* Dùng <div> thay vì <Field> (<label>) để tránh label forward click vào nút ✕ */}
                                    <div className="grid gap-1">
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            Người phụ trách (PIC) <span className="text-red-500">*</span>
                                        </span>
                                        <div className="flex flex-col gap-2">
                                            {/* PHẦN 1: Hiển thị tags */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {picOpts.map((pic, index) => (
                                                    <div
                                                        key={pic._uid}
                                                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${index === 0
                                                            ? "bg-blue-100 border-blue-200 text-blue-800 font-bold"
                                                            : "bg-gray-50 dark:bg-gray-800 border-gray-200 text-gray-700"
                                                            }`}
                                                    >
                                                        <span className="max-w-[12rem] truncate block">
                                                            {pic.name || (pic as any).fullName || (pic as any).label || (pic as any).username || String(pic.id) || "Không có tên"}
                                                            {index === 0 && " (Chính)"}
                                                        </span>

                                                        {!readOnly && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    removePic(pic._uid);
                                                                }}
                                                                className="text-red-500 hover:text-red-700 text-xs px-1 ml-1 font-bold"
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* PHẦN 2: Input tìm kiếm (ĐÃ FIX LOGIC) */}
                                            {!readOnly && (
                                                <div>
                                                    <RemoteSelect
                                                        label=""
                                                        placeholder="Nhập tên người phụ trách để tìm…"
                                                        fetchOptions={searchPICs}
                                                        value={currentPicInput}
                                                        excludeIds={picOpts.map((p) => p.id)}
                                                        onChange={(selected) => {
                                                            // 1. Nếu không chọn gì thì thôi
                                                            if (!selected || !selected.id) return;

                                                            // 2. Ép kiểu String để so sánh ID (Chấp hết số hay chữ)
                                                            const isDuplicate = picOpts.some((p) => String(p.id) === String(selected.id));

                                                            if (!isDuplicate) {
                                                                // 3. Chuẩn hóa tên (Phòng trường hợp API thiếu field name)
                                                                const displayName = (selected as any).name || (selected as any).fullName || (selected as any).label || (selected as any).username;

                                                                // Nếu data lỗi chỉ có ID mà không có tên => Bỏ qua luôn cho sạch
                                                                if (!displayName) {
                                                                    // console.log("Selected item has no display name, ignoring");
                                                                    setCurrentPicInput(null);
                                                                    return;
                                                                }

                                                                const newPic = {
                                                                    ...selected,
                                                                    name: displayName, // Gán cứng tên để hiển thị
                                                                    _uid: `pic-${Date.now()}-${selected.id}`,
                                                                };

                                                                setPicOpts((prev) => {
                                                                    // 4. QUAN TRỌNG: Đưa newPic lên đầu mảng (index 0)
                                                                    return [newPic, ...prev];
                                                                });

                                                                setCurrentPicInput(null);
                                                            } else {
                                                                // Đã trùng rồi thì xóa input đi thôi
                                                                setCurrentPicInput(null);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>



                                {/* Ẩn các trường nâng cao để đồng bộ với form triển khai */}
                                <Field label="Trạng thái" required>
                                    <select
                                        className={clsx(
                                            "h-10 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
                                            "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                                        )}
                                        value={model.status ?? ""}
                                        onChange={(e) => {
                                            const rawValue = (e.target as HTMLSelectElement).value || "";
                                            setModel((s) => {
                                                const prevNormalized = normalizeStatus(s.status);
                                                const nextNormalized = normalizeStatus(rawValue) ?? "RECEIVED";
                                                const nowIso = toLocalISOString(new Date());
                                                const becameCompleted = nextNormalized === "COMPLETED";
                                                const wasCompleted = prevNormalized === "COMPLETED";
                                                const nextCompletion = becameCompleted
                                                    ? (s.completionDate && s.completionDate.toString().trim() ? s.completionDate : nowIso)
                                                    : (!becameCompleted && wasCompleted ? "" : s.completionDate ?? "");
                                                return {
                                                    ...s,
                                                    status: nextNormalized,
                                                    completionDate: nextCompletion,
                                                };
                                            });
                                        }}
                                    >
                                        <option value="">— Chọn trạng thái —</option>
                                        {STATUS_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Deadline (ngày)">
                                    <TextInput
                                        type="datetime-local"
                                        value={toDatetimeLocalInput(model.deadline)}
                                        onChange={(e) => setModel((s) => ({ ...s, deadline: e.target.value }))}
                                    />
                                </Field>
                                <Field label="Ngày bắt đầu">
                                    <TextInput
                                        type="datetime-local"
                                        value={toDatetimeLocalInput(model.startDate)}
                                        onChange={(e) => setModel((s) => ({ ...s, startDate: e.target.value }))}
                                    />
                                </Field>
                                <Field label="Ngày hoàn thành">
                                    <TextInput
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

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button type="button" variant="ghost" onClick={onClose}>Hủy</Button>
                                <Button type="submit" disabled={submitting}>{submitting ? "Đang lưu..." : initial?.id ? "Cập nhật" : "Tạo mới"}</Button>
                            </div>
                        </form>
                    </motion.div>
                </AnimatePresence>
            </div>
        </>
    );
}

// Detail modal
// =====================
// DetailModal (phiên bản đẹp, đồng bộ UI)
// =====================
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

    // Fetch tên các PIC khi modal mở
    React.useEffect(() => {
        if (!open || !item) {
            setPicNames([]);
            return;
        }

        // Nếu backend đã trả danh sách supporter, ưu tiên dùng trực tiếp
        if (item.picDeploymentNames && item.picDeploymentNames.length > 0 && item.picDeploymentIds && item.picDeploymentIds.length > 0) {
            setPicNames(
                item.picDeploymentIds.map((id, idx) => ({
                    id: Number(id),
                    name: item.picDeploymentNames![idx] || String(id),
                }))
            );
            return;
        }

        const picIds = parsePicIdsFromAdditionalRequest(item.additionalRequest, item.picDeploymentId);
        if (picIds.length <= 1) {
            // Chỉ có 1 PIC, dùng tên từ item
            if (item.picDeploymentId && item.picDeploymentName) {
                setPicNames([{ id: item.picDeploymentId, name: item.picDeploymentName }]);
            } else {
                setPicNames([]);
            }
            return;
        }

        // Fetch tên các PIC từ API batch một lần
        setLoadingPics(true);
        (async () => {
            try {
                const idsCsv = picIds.join(",");
                const url = `${API_ROOT}/api/v1/admin/users/batch?ids=${encodeURIComponent(idsCsv)}`;
                const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
                if (!res.ok) throw new Error(`Batch fetch failed: ${res.status}`);
                const payload = await res.json();
                const list = Array.isArray(payload) ? payload : Array.isArray(payload?.content) ? payload.content : [];
                const byId = new Map<number, string>();
                list.forEach((user: any) => {
                    const uid = Number(user?.id);
                    if (!Number.isFinite(uid)) return;
                    const name = user?.fullName ?? user?.fullname ?? user?.name ?? user?.username ?? user?.label ?? user?.email;
                    if (name) byId.set(uid, String(name).trim());
                });

                setPicNames(
                    picIds.map((id) => {
                        if (id === item.picDeploymentId && item.picDeploymentName) return { id, name: item.picDeploymentName };
                        const found = byId.get(id);
                        return { id, name: found || `User-${id}` };
                    })
                );
            } catch (err) {
                console.error("Error fetching PIC names (maintenance)", err);
                if (item.picDeploymentId && item.picDeploymentName) {
                    setPicNames([{ id: item.picDeploymentId, name: item.picDeploymentName }]);
                } else {
                    setPicNames(picIds.map((id) => ({ id, name: `User-${id}` })));
                }
            } finally {
                setLoadingPics(false);
            }
        })();
    }, [open, item]);

    if (!open || !item) return null;

    const fmt = (d?: string | null) =>
        d ? new Date(d).toLocaleString("vi-VN") : "—";

    // use shared statusBadgeClasses (defined higher in file) for color classes

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Header (sticky like SuperAdmin) */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        📋 Chi tiết tác vụ bảo trì
                    </h2>
                </div>

                {/* Content (scrollable) */}
                <div className="p-6 max-h-[60vh] overflow-y-auto text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {/* Grid Info */}
                    <div className="grid  grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                        <Info icon={<FiTag />} label="Tên" value={item.name} />
                        <Info icon={<FaHospital />} label="Bệnh viện" value={item.hospitalName} />

                        {/* Người phụ trách (chính) */}
                        <Info
                            icon={<FiUser />}
                            label="Người phụ trách"
                            value={item.picDeploymentName || "—"}
                        />

                        {/* Người hỗ trợ (lọc bỏ người chính) */}
                        <Info
                            icon={<FiUser />}
                            label="Người hỗ trợ"
                            value={
                                loadingPics ? (
                                    <span className="text-gray-500">Đang tải...</span>
                                ) : (
                                    <span className="font-medium">
                                        {picNames
                                            .filter((p) => Number(p.id) !== Number(item.picDeploymentId))
                                            .map((p) => p.name)
                                            .join(", ") || <span className="text-gray-400 font-normal">Chưa có</span>
                                        }
                                    </span>
                                )
                            }
                        />

                        <Info icon={<FiUser />} label="Tiếp nhận bởi" value={item.receivedByName || "—"} />

                        <Info
                            icon={<FiTag />}
                            label="Trạng thái"
                            value={(
                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(item.status)}`}>
                                    {statusLabel(item.status)}
                                </span>
                            )}
                        />

                        {/* <Info
                            icon={<FiLink />}
                            label="API URL"
                            stacked
                            value={
                                item.apiUrl ? (
                                    <a href={item.apiUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-words">
                                        {item.apiUrl}
                                    </a>
                                ) : (
                                    "—"
                                )
                            }
                        /> */}
                        {/* <Info icon={<FiTag />} label="API Test" value={item.apiTestStatus || "—"} /> */}
                        {/* <Info icon={<FiTag />} label="Số lượng" value={item.quantity ?? "—"} /> */}
                        <Info icon={<FiClock />} label="Deadline:" value={fmt(item.deadline)} />
                        <Info icon={<FiClock />} label="Bắt đầu:" value={fmt(item.startDate)} />
                        {/* <Info icon={<FiClock />} label="Ngày nghiệm thu:" value={fmt(item.acceptanceDate)} /> */}
                        <Info icon={<FiClock />} label="Hoàn thành:" value={fmt(item.completionDate)} />
                        <Info icon={<FiClock />} label="Tạo lúc:" value={fmt(item.createdAt)} />
                        {/* <Info icon={<FiClock />} label="Cập nhật lúc:" value={fmt(item.updatedAt)} /> */}
                    </div>

                    {/* Additional request */}
                    <div className="pt-6 mb-6">
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

                    {/* Task Notes (personal notes for maintenance) */}
                    <TaskNotes taskId={item?.id} myRole={(item as any)?.myRole} taskType="maintenance" />
                </div>

                {/* Footer (sticky) */}
                <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4 rounded-b-2xl flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                        Đóng
                    </button>
                </div>
            </motion.div>
        </div>
    );
}


// Sub component cho label + value
// 🔹 Helper cho hiển thị gọn gàng (icon, label, value, stacked for long text)
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
        // keep the same left columns (icon + fixed label width) so rows align vertically
        return (
            <div className="flex justify-start items-start gap-3">
                <div className="flex items-center gap-2 min-w-[140px] shrink-0">
                    {icon && <span className="text-gray-400">{icon}</span>}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{label}</span>
                    <div className="mt-1 text-gray-700 dark:text-gray-300 text-sm break-words">{value ?? "—"}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-3">
            {icon && <div className="min-w-[36px] flex items-center justify-center text-gray-500">{icon}</div>}
            <div className="flex-1 flex items-start">
                <div className="min-w-[140px] font-semibold text-gray-900 dark:text-gray-100">{label}</div>
                <div className="text-gray-700 dark:text-gray-300 flex-1 text-left break-words">{value ?? "—"}</div>
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
    const searchDebounce = useRef<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<PendingTransferGroup[]>([]);
    const [pendingOpen, setPendingOpen] = useState(false);
    const [loadingPending, setLoadingPending] = useState(false);
    // hospital list view state (like implementation-tasks page)
    const [showHospitalList, setShowHospitalList] = useState<boolean>(true);
    const [hospitalsWithTasks, setHospitalsWithTasks] = useState<Array<{
        id: number;
        label: string;
        subLabel?: string;
        hospitalCode?: string;
        taskCount: number;
        acceptedCount: number;
        nearDueCount?: number;
        overdueCount?: number;
        fromDeployment?: boolean;
        acceptedByMaintenance?: boolean;
        picDeploymentIds?: Array<string | number>;
        picDeploymentNames?: string[];
        maintenancePersonInChargeName?: string;
    }>>([]);
    const [loadingHospitals, setLoadingHospitals] = useState<boolean>(false);
    const [hospitalPage, setHospitalPage] = useState<number>(0);
    const [hospitalSize, setHospitalSize] = useState<number>(10);
    const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
    const [hospitalSearch, setHospitalSearch] = useState<string>("");
    const [hospitalCodeSearch, setHospitalCodeSearch] = useState<string>("");
    const [hospitalStatusFilter, setHospitalStatusFilter] = useState<string>("");
    const [hospitalPicFilter, setHospitalPicFilter] = useState<string[]>([]);
    const [picFilterOpen, setPicFilterOpen] = useState<boolean>(false);
    const [picFilterQuery, setPicFilterQuery] = useState<string>("");
    const [picOptions, setPicOptions] = useState<Array<{ id: string; label: string }>>([]);
    const picFilterDropdownRef = useRef<HTMLDivElement | null>(null);
    const [hospitalSortBy, setHospitalSortBy] = useState<string>("label");
    const [hospitalSortDir, setHospitalSortDir] = useState<string>("asc");
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
    const [bulkCompleting, setBulkCompleting] = useState(false);
    const [showTicketsModal, setShowTicketsModal] = useState(false);
    const [selectedHospitalIdForTickets, setSelectedHospitalIdForTickets] = useState<number | null>(null);
    const [selectedHospitalNameForTickets, setSelectedHospitalNameForTickets] = useState<string | null>(null);
    const [ticketOpenCounts, setTicketOpenCounts] = useState<Record<number, number>>({});
    const [ticketCountLoading, setTicketCountLoading] = useState<Set<number>>(new Set());

    // Click outside to close PIC filter dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (picFilterDropdownRef.current && !picFilterDropdownRef.current.contains(event.target as Node)) {
                setPicFilterOpen(false);
            }
        }
        if (picFilterOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [picFilterOpen]);

    // Reset PIC search when closing dropdown
    useEffect(() => {
        if (!picFilterOpen) {
            setPicFilterQuery("");
        }
    }, [picFilterOpen]);

    // Filtered PIC options based on search query
    const filteredPicOptions = useMemo(() => {
        const q = picFilterQuery.trim().toLowerCase();
        if (!q) return picOptions;
        return picOptions.filter((opt) => opt.label.toLowerCase().includes(q));
    }, [picOptions, picFilterQuery]);

    // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
    const { isSuperAdmin, activeTeam } = useAuth();
    const currentUser = useMemo<UserInfo>(() => readStored<UserInfo>("user"), []);
    // Prefer activeTeam from JWT (new way), fallback to localStorage (old way)
    const userTeam = (activeTeam || currentUser?.team || "").toString().toUpperCase();

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

    const filtered = useMemo(() => data, [data]);
    const [completedCount, setCompletedCount] = useState<number | null>(null);

    // Tính số task đã hoàn thành từ data đã được filter (trong trang hiện tại)
    const completedCountFromFiltered = useMemo(() => {
        return filtered.filter((item) => {
            const taskStatus = normalizeStatus(item.status);
            return taskStatus === 'COMPLETED';
        }).length;
    }, [filtered]);

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
            setData(items);
            if (resp && typeof resp.totalElements === "number") setTotalCount(resp.totalElements);
            else setTotalCount(Array.isArray(resp) ? resp.length : null);

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
    const fetchPendingTasks = useCallback(async () => {
        setLoadingPending(true);
        try {
            // ✅ API mới: Lấy danh sách bệnh viện chờ tiếp nhận (hospital-level)
            const res = await fetch(`${API_ROOT}/api/v1/admin/maintenance/pending-hospitals`, {
                method: "GET",
                headers: authHeaders(),
                credentials: "include",
            });
            if (!res.ok) {
                const msg = await res.text();
                toast.error(`Tải danh sách bệnh viện chờ thất bại: ${msg || res.status}`);
                return;
            }
            const hospitals: PendingHospital[] = await res.json();
            const hospitalsList = Array.isArray(hospitals) ? hospitals : [];

            // Convert từ HospitalResponseDTO sang PendingTransferGroup format (để tương thích với UI hiện tại)
            const groupedList: PendingTransferGroup[] = hospitalsList.map((hospital) => ({
                key: `id-${hospital.id}`,
                hospitalId: hospital.id,
                hospitalName: hospital.name || "Bệnh viện không xác định",
                tasks: [], // Không có tasks vì đây là hospital-level
            }));

            setPendingTasks(groupedList.sort((a, b) =>
                a.hospitalName.localeCompare(b.hospitalName, "vi", { sensitivity: "base" }),
            ));
        } catch (err: unknown) {
            console.error(err);
            toast.error("Lỗi khi tải danh sách bệnh viện chờ");
            setPendingTasks([]);
        } finally {
            setLoadingPending(false);
        }
    }, []);

    const handleAcceptPendingGroup = async (group: PendingTransferGroup) => {
        if (!group || !group.hospitalId) {
            toast.error("Không có bệnh viện nào để tiếp nhận.");
            return;
        }

        if (
            !confirm(
                `Tiếp nhận bệnh viện ${group.hospitalName} và chuyển sang danh sách bảo trì?`,
            )
        )
            return;

        try {
            // ✅ API mới: Tiếp nhận bệnh viện (1 API call thay vì loop qua từng task)
            const res = await fetch(`${API_ROOT}/api/v1/admin/maintenance/accept-hospital/${group.hospitalId}`, {
                method: "PUT",
                headers: authHeaders(),
                credentials: "include",
            });
            if (!res.ok) {
                const msg = await res.text();
                toast.error(`Tiếp nhận thất bại: Bạn không có quyền tiếp nhận !`);
                return;
            }

            toast.success(`Đã tiếp nhận bệnh viện ${group.hospitalName}`);
            setPendingTasks((prev) => prev.filter((item) => item.key !== group.key));
            // ✅ Refresh danh sách bệnh viện để hiển thị ngay bệnh viện vừa tiếp nhận
            await fetchHospitalsWithTasks();
            await fetchList();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(msg || "Lỗi khi tiếp nhận");
            await fetchPendingTasks();
        }
    };

    const handleAcceptAll = async () => {
        if (pendingTasks.length === 0) {
            toast.error("Không có bệnh viện nào để tiếp nhận.");
            return;
        }

        if (
            !confirm(
                `Tiếp nhận tất cả ${pendingTasks.length} bệnh viện và chuyển sang danh sách bảo trì?`,
            )
        )
            return;

        // Accept all hospitals sequentially
        for (const group of [...pendingTasks]) {
            if (group.hospitalId) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await handleAcceptPendingGroup(group);
                } catch (err) {
                    console.error(`Failed to accept hospital ${group.hospitalName}:`, err);
                }
            }
        }
    };

    // Initial: load hospital list instead of tasks
    useEffect(() => {
        fetchHospitalsWithTasks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ WebSocket subscription: Cập nhật danh sách chờ khi có thông báo
    useEffect(() => {
        const unsubscribe = subscribe("/topic/maintenance/pending-changed", (payload) => {
            console.log("WebSocket: Pending maintenance tasks changed", payload);
            fetchPendingTasks();
            if (!showHospitalList && selectedHospital) {
                fetchList();
            }
        });
        return () => unsubscribe();
    }, [subscribe, fetchPendingTasks, fetchList, showHospitalList, selectedHospital]);

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
            const res = await fetch(`${API_ROOT}/api/v1/admin/maintenance/tasks/bulk-complete`, {
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

    // Fetch pending tasks on mount so the badge shows without requiring a click.
    // Also refresh periodically (every 60s) to keep the count up-to-date.
    // BUT: Skip polling when modal is open to avoid blinking/flashing
    useEffect(() => {
        let mounted = true;

        // Initial load (only if modal is not open)
        if (!pendingOpen) {
            (async () => {
                try {
                    await fetchPendingTasks();
                } catch (err) {
                    console.debug('Initial fetchPendingTasks failed', err);
                }
            })();
        }

        // Only set up interval if modal is closed
        if (pendingOpen) {
            return () => {
                mounted = false;
            };
        }

        const timer = window.setInterval(() => {
            try {
                // Skip if modal is open or component unmounted
                if (!mounted || pendingOpen) return;
                fetchPendingTasks();
            } catch (err) {
                console.debug('Polling fetchPendingTasks failed', err);
            }
        }, 60000); // ✅ Đã có WebSocket, giảm polling xuống 60s làm fallback

        return () => {
            mounted = false;
            window.clearInterval(timer);
        };
    }, [fetchPendingTasks, pendingOpen]);

    const togglePicFilterValue = (value: string, checked: boolean) => {
        setHospitalPicFilter((prev) => {
            if (checked) {
                if (prev.includes(value)) return prev;
                return [...prev, value];
            }
            return prev.filter((id) => id !== value);
        });
        setHospitalPage(0);
    };

    const clearPicFilter = () => {
        setHospitalPicFilter([]);
        setHospitalPage(0);
        setPicFilterOpen(false);
        setPicFilterQuery("");
    };

    async function fetchHospitalOptions(q: string) {
        try {
            const res = await fetch(`${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(q || "")}`, { headers: authHeaders() });
            if (!res.ok) return;
            const list = await res.json();
            if (Array.isArray(list)) setHospitalOptions(list.map((h: any) => ({ id: Number(h.id), label: String(h.label ?? h.name ?? "") })));
        } catch { /* ignore */ }
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
            // ✅ Chỉ cần 1 API call - summary đã có đầy đủ thống kê và PIC info
            const summaryEndpoint = `${API_ROOT}/api/v1/admin/maintenance/hospitals/summary`;
            const summaryRes = await fetch(summaryEndpoint, {
                method: "GET",
                headers: authHeaders(),
                credentials: "include",
            });
            if (!summaryRes.ok) throw new Error(`Failed to fetch hospitals summary: ${summaryRes.status}`);
            const summaryPayload = await summaryRes.json();
            const summaries = Array.isArray(summaryPayload) ? summaryPayload : [];

            // Collect PIC options từ summary
            const picOptionMap = new Map<string, { id: string; label: string }>();
            summaries.forEach((item: any) => {
                // Collect từ picDeploymentIds và picDeploymentNames
                const picIds = Array.isArray(item?.picDeploymentIds) ? item.picDeploymentIds : [];
                const picNames = Array.isArray(item?.picDeploymentNames) ? item.picDeploymentNames : [];
                picIds.forEach((picId: any, idx: number) => {
                    const picIdStr = String(picId);
                    const picName = picNames[idx] && String(picNames[idx]).trim() ? String(picNames[idx]).trim() : "";
                    if (picName) {
                        picOptionMap.set(picIdStr, { id: picIdStr, label: picName });
                    }
                });
                
                // ✅ Collect từ maintenancePersonInCharge (người phụ trách bảo trì)
                const maintenancePicId = item?.maintenancePersonInChargeId;
                const maintenancePicName = item?.maintenancePersonInChargeName;
                if (maintenancePicId && maintenancePicName) {
                    const maintenancePicIdStr = String(maintenancePicId);
                    const maintenancePicNameStr = String(maintenancePicName).trim();
                    // Chỉ thêm nếu chưa có trong map (tránh override nếu đã có từ picDeploymentIds)
                    if (maintenancePicNameStr && !picOptionMap.has(maintenancePicIdStr)) {
                        picOptionMap.set(maintenancePicIdStr, { id: maintenancePicIdStr, label: maintenancePicNameStr });
                    }
                }
            });

            // ✅ Fetch tất cả PICs từ API users để đảm bảo filter có đầy đủ options
            try {
                const params = new URLSearchParams();
                // Không gửi parameter 'name' để lấy tất cả users
                // Lọc theo team dựa trên user đăng nhập
                if (userTeam === "MAINTENANCE") {
                    params.set("team", "MAINTENANCE");
                } else if (userTeam === "DEPLOYMENT") {
                    params.set("team", "DEPLOYMENT");
                }
                // Nếu SUPERADMIN, không lọc team để hiện tất cả
                const queryString = params.toString();
                const usersUrl = queryString 
                    ? `${API_ROOT}/api/v1/admin/users/search?${queryString}`
                    : `${API_ROOT}/api/v1/admin/users/search`;
                const usersRes = await fetch(usersUrl, { headers: authHeaders(), credentials: "include" });
                if (usersRes.ok) {
                    const usersList = await usersRes.json();
                    const users = Array.isArray(usersList) ? usersList : [];
                    users.forEach((u: any) => {
                        const userId = String(u?.id);
                        if (userId && !picOptionMap.has(userId)) {
                            const userName = String(u?.label ?? u?.name ?? u?.fullName ?? u?.fullname ?? u?.username ?? u?.id ?? "");
                            if (userName && userName.trim()) {
                                picOptionMap.set(userId, { id: userId, label: userName.trim() });
                            }
                        }
                    });
                }
            } catch (err) {
                // Nếu lỗi khi fetch users, vẫn dùng PICs từ summary
                console.warn("Failed to fetch all users for PIC filter:", err);
            }

            // ✅ Fetch acceptedCount cho từng bệnh viện (backend không trả về trong summary)
            const acceptedCountsMap = new Map<string, number>();
            const allHospitalNames = new Set<string>();
            summaries.forEach((item: any) => {
                const hospitalName = String(item?.hospitalName ?? "").trim();
                if (hospitalName) allHospitalNames.add(hospitalName);
            });

            // Fetch acceptedCount cho tất cả bệnh viện
            const acceptedCountsPromises = Array.from(allHospitalNames).map(async (hospitalName) => {
                try {
                    // Fetch count of COMPLETED tasks for this hospital (maintenance tasks use COMPLETED status)
                    const params = new URLSearchParams({ page: "0", size: "1", status: "COMPLETED", hospitalName });
                    const url = `${API_ROOT}/api/v1/admin/maintenance/tasks?${params.toString()}`;
                    const res = await fetch(url, {
                        method: "GET",
                        headers: authHeaders(),
                        credentials: "include",
                    });
                    if (!res.ok) return { hospitalName, count: 0 };
                    const resp = await res.json();
                    const count = resp && typeof resp.totalElements === "number" ? resp.totalElements : (Array.isArray(resp) ? resp.length : (Array.isArray(resp?.content) ? resp.content.length : 0));
                    return { hospitalName, count };
                } catch {
                    return { hospitalName, count: 0 };
                }
            });
            const acceptedCountsResults = await Promise.all(acceptedCountsPromises);
            acceptedCountsResults.forEach(({ hospitalName, count }) => {
                acceptedCountsMap.set(hospitalName, count);
            });

            // ✅ Fetch tasks để tính nearDueCount, overdueCount và collect PICs từ từng task
            const nearDueOverdueMap = new Map<string, { nearDueCount: number; overdueCount: number }>();
            const hospitalPicsFromTasks = new Map<string, { picIds: Set<string>; picNames: Set<string> }>();
            try {
                // Fetch tasks (cả completed và chưa completed để lấy đầy đủ PICs)
                // ✅ Tối ưu: Fetch song song nhiều pages đầu để nhanh hơn, giới hạn tối đa để tránh chậm
                let allTasks: any[] = [];
                const pageSize = 1000; // Mỗi page 1000 items
                const maxPages = 5; // Giới hạn tối đa 5 pages (5000 tasks) để tránh quá chậm
                
                // Fetch song song 3 pages đầu để nhanh hơn
                const initialPages = Math.min(3, maxPages);
                const initialPromises = Array.from({ length: initialPages }, (_, i) => {
                    const tasksParams = new URLSearchParams({ page: String(i), size: String(pageSize), sortBy: "id", sortDir: "asc" });
                    const tasksUrl = `${API_ROOT}/api/v1/admin/maintenance/tasks?${tasksParams.toString()}`;
                    return fetch(tasksUrl, { headers: authHeaders(), credentials: "include" })
                        .then(res => res.ok ? res.json() : null)
                        .then(payload => {
                            const tasks = Array.isArray(payload?.content) ? payload.content : Array.isArray(payload) ? payload : [];
                            return { page: i, tasks, totalElements: payload?.totalElements || 0 };
                        })
                        .catch(() => ({ page: i, tasks: [], totalElements: 0 }));
                });
                
                const initialResults = await Promise.all(initialPromises);
                initialResults.forEach(({ tasks }) => {
                    if (tasks.length > 0) allTasks = allTasks.concat(tasks);
                });
                
                // Nếu còn nhiều tasks và chưa đạt maxPages, fetch thêm tuần tự
                const firstResult = initialResults[0];
                const totalTasks = firstResult?.totalElements || 0;
                if (totalTasks > initialPages * pageSize && initialPages < maxPages) {
                    for (let page = initialPages; page < maxPages; page++) {
                        const tasksParams = new URLSearchParams({ page: String(page), size: String(pageSize), sortBy: "id", sortDir: "asc" });
                        const tasksUrl = `${API_ROOT}/api/v1/admin/maintenance/tasks?${tasksParams.toString()}`;
                        const tasksRes = await fetch(tasksUrl, { headers: authHeaders(), credentials: "include" });
                        if (tasksRes.ok) {
                            const tasksPayload = await tasksRes.json();
                            const tasks = Array.isArray(tasksPayload?.content) ? tasksPayload.content : Array.isArray(tasksPayload) ? tasksPayload : [];
                            if (tasks.length === 0) break;
                            allTasks = allTasks.concat(tasks);
                            if (tasks.length < pageSize) break; // Đã hết
                        } else {
                            break; // Lỗi, dừng
                        }
                    }
                }
                
                if (allTasks.length > 0) {
                    const tasks = allTasks;
                    
                    const today = new Date();
                    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                    
                    tasks.forEach((task: any) => {
                        const statusUp = String(task?.status || '').trim().toUpperCase();
                        const hospitalName = String(task?.hospitalName || '').trim();
                        if (!hospitalName) return;
                        
                        // ✅ Collect PICs từ từng task (quan trọng cho filter)
                        const picId = task?.picDeploymentId ? String(task.picDeploymentId) : null;
                        const picName = task?.picDeploymentName ? String(task.picDeploymentName).trim() : null;
                        if (picId || picName) {
                            const hospitalPics = hospitalPicsFromTasks.get(hospitalName) || { picIds: new Set<string>(), picNames: new Set<string>() };
                            if (picId) hospitalPics.picIds.add(picId);
                            if (picName) hospitalPics.picNames.add(picName);
                            hospitalPicsFromTasks.set(hospitalName, hospitalPics);
                        }
                        
                        // Collect PICs từ additionalRequest nếu có
                        const additionalRequest = task?.additionalRequest || task?.notes || "";
                        if (additionalRequest) {
                            const picIds = parsePicIdsFromAdditionalRequest(additionalRequest, task?.picDeploymentId);
                            if (picIds.length > 0) {
                                const hospitalPics = hospitalPicsFromTasks.get(hospitalName) || { picIds: new Set<string>(), picNames: new Set<string>() };
                                picIds.forEach(id => hospitalPics.picIds.add(String(id)));
                                hospitalPicsFromTasks.set(hospitalName, hospitalPics);
                            }
                        }
                        
                        // Skip completed tasks khi tính nearDue/overdue
                        const isCompleted = statusUp === 'COMPLETED' || statusUp === 'ACCEPTED' || statusUp === 'WAITING_FOR_DEV' || statusUp === 'TRANSFERRED';
                        if (isCompleted) return;
                        
                        // Chỉ tính cho task có deadline
                        if (!task?.deadline) return;
                        const d = new Date(task.deadline);
                        if (Number.isNaN(d.getTime())) return;
                        d.setHours(0, 0, 0, 0);
                        const dayDiff = Math.round((d.getTime() - startToday) / (24 * 60 * 60 * 1000));
                        
                        const current = nearDueOverdueMap.get(hospitalName) || { nearDueCount: 0, overdueCount: 0 };
                        if (dayDiff < 0) {
                            current.overdueCount += 1;
                        } else if (dayDiff >= 0 && dayDiff <= 3) {
                            current.nearDueCount += 1;
                        }
                        nearDueOverdueMap.set(hospitalName, current);
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch tasks for nearDue/overdue calculation:", err);
            }

            // Map summary - đã có đầy đủ thông tin từ backend
            const normalized = summaries.map((item: any, idx: number) => {
                const hospitalId = Number(item?.hospitalId ?? -(idx + 1));
                const hospitalName = String(item?.hospitalName ?? "—");
                const acceptedCount = acceptedCountsMap.get(hospitalName) ?? 0;
                const dueStats = nearDueOverdueMap.get(hospitalName) || { nearDueCount: 0, overdueCount: 0 };
                
                // ✅ Merge PICs từ summary và từ tasks (ưu tiên từ tasks vì đầy đủ hơn)
                const taskPics = hospitalPicsFromTasks.get(hospitalName) || { picIds: new Set<string>(), picNames: new Set<string>() };
                const summaryPicIds = Array.isArray(item?.picDeploymentIds) ? item.picDeploymentIds.map((id: any) => String(id)) : [];
                const summaryPicNames = Array.isArray(item?.picDeploymentNames) ? item.picDeploymentNames.map((name: any) => String(name)) : [];
                
                // Merge: thêm PICs từ summary vào set từ tasks
                summaryPicIds.forEach(id => taskPics.picIds.add(id));
                summaryPicNames.forEach(name => taskPics.picNames.add(name));
                
                return {
                    id: hospitalId,
                    label: hospitalName,
                    subLabel: item?.province ? String(item.province) : "",
                    hospitalCode: item?.hospitalCode || "",
                    taskCount: Number(item?.maintenanceTaskCount ?? 0),
                    acceptedCount: acceptedCount, // ✅ Fetch từ API riêng
                    nearDueCount: dueStats.nearDueCount,   // ✅ Tính từ tasks chưa completed
                    overdueCount: dueStats.overdueCount,  // ✅ Tính từ tasks chưa completed
                    fromDeployment: Boolean(item?.transferredFromDeployment),
                    acceptedByMaintenance: Boolean(item?.acceptedByMaintenance),
                    picDeploymentIds: Array.from(taskPics.picIds), // ✅ Dùng PICs từ tasks (đầy đủ hơn)
                    picDeploymentNames: Array.from(taskPics.picNames), // ✅ Dùng PICs từ tasks (đầy đủ hơn)
                    maintenancePersonInChargeName: item?.maintenancePersonInChargeName || undefined,
                };
            });

            setPicOptions(Array.from(picOptionMap.values()));

            setHospitalsWithTasks((prev) => {
                const prevMap = new Map(prev.map((entry) => [entry.id, entry]));
                const merged = normalized.map((entry) => {
                    const prevEntry = prevMap.get(entry.id);
                    return {
                        ...entry,
                        // Giữ lại fromDeployment nếu đã có từ trước, hoặc từ API response
                        fromDeployment: entry.fromDeployment || prevEntry?.fromDeployment || false,
                        acceptedByMaintenance: entry.acceptedByMaintenance || prevEntry?.acceptedByMaintenance || false,
                    };
                });
                // Hiển thị bệnh viện nếu:
                // 1. Đã được tiếp nhận (acceptedByMaintenance = true), hoặc
                // 2. Có task nhưng không phải từ Triển khai (fromDeployment = false)
                // Bệnh viện từ Triển khai nhưng chưa tiếp nhận sẽ chỉ hiện ở "Viện chờ tiếp nhận"
                return merged.filter((h) => h.acceptedByMaintenance === true || (h.fromDeployment === false && h.taskCount > 0));
            });
        } catch (e: any) {
            setError(e.message || "Lỗi tải danh sách bệnh viện");
            setHospitalsWithTasks([]);
        } finally {
            setLoadingHospitals(false);
        }
    }

    const filteredHospitals = useMemo(() => {
        let list = hospitalsWithTasks;
        const q = hospitalSearch.trim().toLowerCase();
        if (q) list = list.filter(h => h.label.toLowerCase().includes(q) || (h.subLabel || '').toLowerCase().includes(q));
        
        // Filter by hospital code
        const codeQ = hospitalCodeSearch.trim().toLowerCase();
        if (codeQ) list = list.filter(h => (h.hospitalCode || '').toLowerCase().includes(codeQ));
        if (hospitalStatusFilter === 'accepted') list = list.filter(h => h.acceptedByMaintenance);
        else if (hospitalStatusFilter === 'incomplete') list = list.filter(h => (h.acceptedCount || 0) < (h.taskCount || 0));
        else if (hospitalStatusFilter === 'unaccepted') list = list.filter(h => !h.acceptedByMaintenance);
        else if (hospitalStatusFilter === 'hasOpenTickets') list = list.filter(h => h.id && (ticketOpenCounts[h.id] ?? 0) > 0);

        // Filter by PIC
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
            
            const beforeFilterCount = list.length;
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
                
                // ✅ Check by maintenancePersonInChargeName (người phụ trách bảo trì)
                const maintenancePicName = h.maintenancePersonInChargeName ? String(h.maintenancePersonInChargeName).trim() : "";
                const hasMatchingMaintenancePic = maintenancePicName && (() => {
                    // Tìm ID từ name, rồi check ID đó có trong selected không
                    const idFromName = picNameToIdMap.get(maintenancePicName);
                    if (!idFromName) return false;
                    // Check cả string và number format
                    const idNum = Number(idFromName);
                    return selectedStrings.has(idFromName) || 
                           (!isNaN(idNum) && idNum > 0 && selectedNumbers.has(idNum)) ||
                           (!isNaN(idNum) && idNum > 0 && selectedStrings.has(String(idNum)));
                })();
                
                const matches = hasMatchingId || hasMatchingName || hasMatchingMaintenancePic;
                return matches;
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
            if (hospitalSortBy === 'accepted') return ((Number(Boolean(a.acceptedByMaintenance)) - Number(Boolean(b.acceptedByMaintenance)))) * dir;
            if (hospitalSortBy === 'ratio') {
                const ra = (a.taskCount || 0) > 0 ? (a.acceptedCount || 0) / (a.taskCount || 1) : Number(Boolean(a.acceptedByMaintenance));
                const rb = (b.taskCount || 0) > 0 ? (b.acceptedCount || 0) / (b.taskCount || 1) : Number(Boolean(b.acceptedByMaintenance));
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
                    const incAccepted = isCompletedStatus((payload as any)?.status) ? 1 : 0;
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

    return (
        <div className="p-6 xl:p-10">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-extrabold">{showHospitalList ? "Danh sách các bệnh viện cần bảo trì" : `Danh sách công việc bảo trì - ${selectedHospital}`}</h1>
                {!showHospitalList && (
                    <button onClick={() => { setSelectedHospital(null); setShowHospitalList(true); setSearchTerm(""); setStatusFilter(""); setPage(0); setData([]); fetchHospitalsWithTasks(); }} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium">← Quay lại danh sách bệnh viện</button>
                )}
            </div>

            {error && <div className="text-red-600 mb-4">{error}</div>}

            {!showHospitalList && (
                <div className="mb-6 rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-[320px]">
                            <h3 className="text-lg font-semibold mb-3 ">Tìm kiếm & Thao tác</h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative">
                                    <input
                                        list="hospital-list"
                                        type="text"
                                        className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                        placeholder="Tìm theo tên (gõ để gợi ý bệnh viện)"
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setHospitalQuery(e.target.value); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { fetchList(); } }}
                                        onBlur={() => { /* keep search */ }}
                                    />
                                    <datalist id="hospital-list">
                                        {hospitalOptions.map((h) => (
                                            <option key={h.id} value={h.label} />
                                        ))}
                                    </datalist>
                                </div>

                                <select
                                    className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[160px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="">— Chọn trạng thái —</option>
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-4">
                                <span>Tổng: <span className="font-semibold text-gray-800 dark:text-gray-100">{loading ? '...' : (totalCount ?? filtered.length)}</span></span>
                                <span>Đã hoàn thành: <span className="font-semibold text-gray-800 dark:text-gray-100">{completedCount ?? completedCountFromFiltered}/{totalCount ?? filtered.length} task</span></span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 ml-auto justify-end">
                            {/* Sort */}
                            <div className="flex items-center gap-2">

                            </div>

                            {/* Thêm mới */}
                            {isSuperAdmin || userTeam === "MAINTENANCE" ? (
                                <button
                                    className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700 flex items-center gap-2"
                                    onClick={async () => {
                                        let hid: number | null = null;
                                        if (selectedHospital) hid = await resolveHospitalIdByName(selectedHospital);
                                        setEditing(hid ? ({ hospitalId: hid, hospitalName: selectedHospital } as any) : ({ hospitalName: selectedHospital } as any));
                                        setModalOpen(true);
                                    }}
                                >
                                    <PlusIcon />
                                    <span>Thêm mới</span>
                                </button>
                            ) : (
                                <button
                                    disabled
                                    className="rounded-xl bg-gray-200 text-gray-500 px-5 py-2 shadow-sm flex items-center gap-2"
                                    title="Không có quyền"
                                >
                                    <PlusIcon />
                                    <span>Thêm mới</span>
                                </button>
                            )}

                        </div>
                    </div>
                </div>
            )}

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
                            <div className="mb-6 rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Lọc</h3>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <input
                                                type="text"
                                                className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                                placeholder="Tìm theo tên bệnh viện / tỉnh"
                                                value={hospitalSearch}
                                                onChange={(e) => { setHospitalSearch(e.target.value); setHospitalPage(0); }}
                                            />
                                            <input
                                                type="text"
                                                className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                                placeholder="Tìm theo mã bệnh viện"
                                                value={hospitalCodeSearch}
                                                onChange={(e) => { setHospitalCodeSearch(e.target.value); setHospitalPage(0); }}
                                            />
                                            <select
                                                className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[200px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                                                value={hospitalStatusFilter}
                                                onChange={(e) => { setHospitalStatusFilter(e.target.value); setHospitalPage(0); }}
                                            >
                                                <option value="">— Trạng thái —</option>
                                                <option value="accepted">Có nghiệm thu</option>
                                                <option value="incomplete">Chưa nghiệm thu hết</option>
                                                <option value="unaccepted">Chưa có nghiệm thu</option>
                                                <option value="hasOpenTickets">Có tickets chưa hoàn thành</option>
                                            </select>
                                        </div>

                                        {/* PIC Filter Dropdown - second row */}
                                        <div className="flex flex-col gap-0 mt-3">
                                            <div ref={picFilterDropdownRef} className="relative w-full max-w-[200px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setPicFilterOpen(!picFilterOpen)}
                                                    className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between gap-2"
                                                >
                                                    <span className="truncate">
                                                        {hospitalPicFilter.length === 0
                                                            ? "Lọc người phụ trách"
                                                            : hospitalPicFilter.length === 1
                                                                ? picOptions.find((opt) => opt.id === hospitalPicFilter[0])?.label ?? "Đã chọn 1"
                                                                : `Đã chọn ${hospitalPicFilter.length} người phụ trách`}
                                                    </span>
                                                    <svg className={`w-4 h-4 transition-transform ${picFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {picFilterOpen && (
                                                    <div className="absolute z-30 mt-2 w-60 max-h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3 dark:border-gray-700 dark:bg-gray-800">
                                                        <input
                                                            type="text"
                                                            value={picFilterQuery}
                                                            onChange={(e) => setPicFilterQuery(e.target.value)}
                                                            placeholder="Tìm người phụ trách"
                                                            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                        />
                                                        <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                                                            {filteredPicOptions.length === 0 ? (
                                                                <div className="text-sm text-gray-500 text-center py-6">
                                                                    Không có dữ liệu người phụ trách
                                                                </div>
                                                            ) : (
                                                                filteredPicOptions.map((option) => {
                                                                    const value = String(option.id);
                                                                    const checked = hospitalPicFilter.includes(value);
                                                                    return (
                                                                        <label key={option.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-1.5 rounded cursor-pointer">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={checked}
                                                                                onChange={(e) => togglePicFilterValue(value, e.target.checked)}
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
                                                                onClick={clearPicFilter}
                                                                disabled={hospitalPicFilter.length === 0}
                                                            >
                                                                Bỏ lọc
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 focus:outline-none dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                                                onClick={() => setPicFilterOpen(false)}
                                                            >
                                                                Đóng
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className={`self-start px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${hospitalPicFilter.length === 0 ? "invisible pointer-events-none" : ""}`}
                                                onClick={clearPicFilter}
                                            >
                                                Bỏ lọc người phụ trách
                                            </button>
                                        </div>

                                        <div className="mt-6 mb-0.5 text-sm text-gray-600 dark:text-gray-300">
                                            <span >Tổng bệnh viện: <span className="font-semibold text-gray-900 dark:text-gray-100">{loadingHospitals ? '...' : filteredHospitals.length}</span> </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">

                                        {(isSuperAdmin || userTeam === "MAINTENANCE") && (
                                            <>
                                                <button
                                                    className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700"
                                                    onClick={() => { setEditing(null); setModalOpen(true); }}
                                                    type="button"
                                                >
                                                    + Thêm công việc mới
                                                </button>
                                                <button
                                                    className="relative inline-flex items-center gap-2 rounded-full border border-gray-300 text-gray-800 px-4 py-2 text-sm bg-white hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:bg-gray-900"
                                                    onClick={() => { setPendingOpen(true); fetchPendingTasks(); }}
                                                >

                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                                    </svg> Viện chờ tiếp nhận
                                                    {pendingTasks.length > 0 && (
                                                        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
                                                            {pendingTasks.length}
                                                        </span>
                                                    )}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {loadingHospitals ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse" aria-hidden="true">TAG</div>
                                </div>
                            ) : filteredHospitals.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                                    Không có bệnh viện nào có task
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 border-b border-gray-200">
                                                    <tr>
                                                        <th className="px-6 w-10 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">STT</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên bệnh viện</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã BV</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tỉnh/thành</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách chính</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách bảo trì</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng task</th>
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {pagedHospitals
                                                        .map((hospital, index) => (
                                                            <tr key={hospital.id || `${hospital.label}-${index}`} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { setSelectedHospital(hospital.label); setShowHospitalList(false); setPage(0); }}>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospitalPage * hospitalSize + index + 1}</td>
                                                                <td className="px-6 py-4">
                                                                    {(() => {
                                                                        const longName = (hospital.label || "").length > 32;
                                                                        return (
                                                                            <div className={`flex gap-3 ${longName ? 'items-start' : 'items-center'}`}>
                                                                                <div className={`text-sm font-medium text-gray-900 break-words max-w-[260px] flex flex-wrap gap-2 ${longName ? 'leading-snug' : ''}`}>
                                                                                    <span>{hospital.label}</span>
                                                                                    {hospital.fromDeployment && !hospital.acceptedByMaintenance && (
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                                                                            Từ triển khai
                                                                                        </span>
                                                                                    )}
                                                                                    {hospital.fromDeployment && hospital.acceptedByMaintenance && (
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                                                            Nhận từ triển khai
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.hospitalCode || "—"}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.subLabel || "—"}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{hospital.maintenancePersonInChargeName || "—"}</td>
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
                                                                      : "—"}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm align-center">
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{(hospital.acceptedCount ?? 0)}/{hospital.taskCount ?? 0} task</span>
                                                                        {(hospital.nearDueCount ?? 0) > 0 && (
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Sắp đến hạn: {hospital.nearDueCount}</span>
                                                                        )}
                                                                        {(hospital.overdueCount ?? 0) > 0 && (
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Quá hạn: {hospital.overdueCount}</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setSelectedHospital(hospital.label);
                                                                                setShowHospitalList(false);
                                                                                setPage(0);
                                                                            }}
                                                                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition"
                                                                            title="Xem công việc"
                                                                        >
                                                                            <AiOutlineEye className="h-4 w-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation();
                                                                                // hospital.id từ summary API chính là hospitalId thực sự từ bảng hospitals
                                                                                // Chỉ resolve lại nếu hospital.id không hợp lệ (số âm hoặc <= 0)
                                                                                let finalHospitalId: number | null = null;
                                                                                
                                                                                if (hospital.id && hospital.id > 0) {
                                                                                    // Dùng trực tiếp hospital.id vì nó đã là hospitalId thực sự từ summary API
                                                                                    finalHospitalId = hospital.id;
                                                                                    console.log("Using hospital.id directly:", finalHospitalId, "for hospital:", hospital.label);
                                                                                } else {
                                                                                    // Fallback: resolve từ tên nếu hospital.id không hợp lệ
                                                                                    console.log("hospital.id is invalid, resolving from name:", hospital.id);
                                                                                    const resolvedId = await resolveHospitalIdByName(hospital.label);
                                                                                    if (resolvedId) {
                                                                                        finalHospitalId = resolvedId;
                                                                                        console.log("Resolved hospitalId:", finalHospitalId, "for hospital:", hospital.label);
                                                                                    }
                                                                                }
                                                                                
                                                                                if (finalHospitalId && finalHospitalId > 0) {
                                                                                    setSelectedHospitalIdForTickets(finalHospitalId);
                                                                                    setSelectedHospitalNameForTickets(hospital.label);
                                                                                    setShowTicketsModal(true);
                                                                                } else {
                                                                                    toast.error("Không thể tìm thấy ID bệnh viện hợp lệ");
                                                                                }
                                                                            }}
                                                                            className="relative rounded-lg p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition"
                                                                            title="Xem danh sách tickets"
                                                                        >
                                                                            <FiTag className="h-4 w-4" />
                                                                            {(ticketOpenCounts[hospital.id] ?? 0) > 0 && (
                                                                                <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                                                                                    {ticketOpenCounts[hospital.id]}
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between py-3 w-full">
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
                                </>
                            )}
                        </div>
                    ) : (
                        filtered.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                                Không có dữ liệu
                            </div>
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

                                                        <span>Hoàn thành đã chọn</span>
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
                                    const canComplete = (isSuperAdmin || userTeam === "MAINTENANCE") && (() => {
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
                                                statusLabelOverride={statusLabel}
                                                statusClassOverride={statusBadgeClasses}
                                                onOpen={() => { setDetailItem(row); setDetailOpen(true); }}
                                                onEdit={() => { setEditing(row); setModalOpen(true); }}
                                                onDelete={(id: number) => { handleDelete(id); }}
                                                canEdit={(isSuperAdmin || userTeam === "MAINTENANCE") && (() => { try { const uidRaw = localStorage.getItem("userId") || sessionStorage.getItem("userId"); const uid = uidRaw ? Number(uidRaw) : 0; return uid > 0 && Number(row.picDeploymentId) === uid; } catch { return false; } })()}
                                                canDelete={(isSuperAdmin || userTeam === "MAINTENANCE") && (() => { try { const uidRaw = localStorage.getItem("userId") || sessionStorage.getItem("userId"); const uid = uidRaw ? Number(uidRaw) : 0; return uid > 0 && Number(row.picDeploymentId) === uid; } catch { return false; } })()}
                                                leadingTopLeft={canComplete ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            const newSet = new Set(selectedTaskIds);
                                                            if (e.target.checked) newSet.add(taskId); else newSet.delete(taskId);
                                                            setSelectedTaskIds(newSet);
                                                        }}
                                                        className="w-4.5 h-4.5 text-blue-600 border-blue-600 rounded focus:ring-blue-500 shadow-sm bg-white"
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
                            <select
                                value={String(size)}
                                onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                                className="border rounded px-2 py-1 text-sm"
                            >
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

            <PendingTasksModal
                open={pendingOpen}
                onClose={() => setPendingOpen(false)}
                onAccept={handleAcceptPendingGroup}
                onAcceptAll={handleAcceptAll}
                list={pendingTasks}
                loading={loadingPending}
            />

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
                    } as Partial<ImplementationTaskRequestDTO> & { id?: number; hospitalName?: string | null; picDeploymentName?: string | null })
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

            <DetailModal open={detailOpen} onClose={() => setDetailOpen(false)} item={detailItem} />

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
                                <TicketsTab
                                    hospitalId={selectedHospitalIdForTickets}
                                    onTicketsChange={handleTicketsChange}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ImplementationTasksPage;
