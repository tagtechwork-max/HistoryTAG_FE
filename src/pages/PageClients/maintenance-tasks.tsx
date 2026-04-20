import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import TaskCardNew from "../SuperAdmin/TaskCardNew";
import TaskNotes from "../../components/TaskNotes";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { AiOutlineEye } from "react-icons/ai";
import toast from "react-hot-toast";
import { FaHospital } from "react-icons/fa";
import { FiUser, FiLink, FiClock, FiTag, FiCheckCircle, FiX } from "react-icons/fi";
import { useWebSocket } from "../../contexts/WebSocketContext";
import TicketsTab from "../../pages/CustomerCare/SubCustomerCare/TicketsTab";
import { getHospitalTickets } from "../../api/ticket.api";
import { useAuth } from '../../contexts/AuthContext';
import { VIETNAM_PROVINCE_LABELS } from "../../utils/vietnamProvinceCenters";

// Helper function để parse PIC IDs từ additionalRequest
const normalizeSearchText = (value: string) =>
    value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

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
    hccFacilityId?: number | null;
    hccFacilityName?: string | null;
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
    hospitalId?: number | null;
    hccFacilityId?: number | null;
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

function getStoredUserIdForPicFilter(): string | null {
    const raw = localStorage.getItem("userId") ?? sessionStorage.getItem("userId");
    if (raw?.trim()) return String(raw).trim();
    const u = readStored<Record<string, unknown>>("user");
    if (!u) return null;
    const id = u.id ?? u.userId;
    if (id != null && String(id).trim()) return String(id).trim();
    return null;
}

function getStoredUserDisplayNameForPicFilter(): string | null {
    const u = readStored<Record<string, unknown>>("user");
    if (!u) return null;
    for (const key of ["fullName", "fullname", "name", "label", "username"] as const) {
        const v = u[key];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

/** Label for "Phụ trách chính" hospital list filter: match PIC dropdown id first, else stored name. */
function resolveDefaultHospitalPicQuery(picOptions: Array<{ id: string; label: string }>): string | null {
    const uid = getStoredUserIdForPicFilter();
    if (uid && picOptions.length > 0) {
        const opt = picOptions.find((o) => {
            const oid = String(o.id).trim();
            return oid === uid || oid === String(Number(uid)) || String(Number(oid)) === String(Number(uid));
        });
        if (opt?.label?.trim()) return opt.label.trim();
    }
    return getStoredUserDisplayNameForPicFilter();
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

const CURATOR_INPUT =
    "box-border min-w-0 max-w-full h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal leading-snug text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100/90 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40";
const CURATOR_TEXTAREA =
    "box-border min-h-[120px] min-w-0 max-w-full w-full resize-y overflow-x-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-normal leading-snug text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100/90 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40";

function Field({
    label,
    children,
    required,
    variant = "default",
}: {
    label: string;
    children: React.ReactNode;
    required?: boolean;
    variant?: "default" | "curator";
}) {
    if (variant === "curator") {
        return (
            <div className="grid min-w-0 max-w-full gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                {children}
            </div>
        );
    }
    return (
        <label className="grid gap-1">
            <span className="text-sm text-gray-700 dark:text-gray-300">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {children}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { curator?: boolean }) {
    const { curator, className, ...rest } = props;
    return (
        <input
            {...rest}
            className={clsx(
                curator
                    ? CURATOR_INPUT
                    : "h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm font-normal leading-snug outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
                className || ""
            )}
        />
    );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { curator?: boolean }) {
    const { curator, className, ...rest } = props;
    return (
        <textarea
            {...rest}
            className={clsx(
                curator
                    ? CURATOR_TEXTAREA
                    : "min-h-[90px] rounded-xl border border-gray-300 bg-white p-3 text-sm font-normal leading-snug outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
                className || ""
            )}
        />
    );
}

function Button(
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; curatorPrimary?: boolean }
) {
    const { variant = "primary", className, curatorPrimary, ...rest } = props;
    const base = "h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm";
    const styles =
        curatorPrimary && variant === "primary"
            ? "rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
            : variant === "primary"
                ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-white/90"
                : variant === "danger"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-transparent border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";
    return <button className={clsx(base, styles, className)} {...rest} />;
}

function CuratorSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    const { className, ...rest } = props;
    return (
        <select
            {...rest}
            className={clsx(
                `${CURATOR_INPUT} appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-10`,
                "min-w-0 max-w-full dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
                className || ""
            )}
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 9l4-4 4 4m0 6l-4 4-4-4'/%3E%3C/svg%3E")`,
            }}
        />
    );
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

function filterStaticHospitalOptionsForRemoteSelect(
    list: Array<{ id: number; name: string }>,
    query: string
): Array<{ id: number; name: string }> {
    const q = query.trim();
    if (!q) return list;
    const norm = (s: string) =>
        s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    const nq = norm(q);
    return list.filter((o) => norm(o.name).includes(nq));
}

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
    disabled,
    hideLabel,
    curator,
    trailing,
    fieldVariant,
    staticOptions,
    wrapSelectedLabel,
}: {
    label: string;
    placeholder?: string;
    required?: boolean;
    fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
    value: { id: number; name: string } | null;
    onChange: (v: { id: number; name: string } | null) => void;
    excludeIds?: number[];
    disabled?: boolean;
    hideLabel?: boolean;
    curator?: boolean;
    trailing?: "chevron" | "search";
    fieldVariant?: "default" | "curator";
    staticOptions?: Array<{ id: number; name: string }>;
    /** When true, closed state shows the full selected label with wrapping (matches locked-hospital div UX). */
    wrapSelectedLabel?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [highlight, setHighlight] = useState<number>(-1);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const filteredOptions = React.useMemo(() => {
        if (!excludeIds || excludeIds.length === 0) return options;
        return options.filter((opt) => !excludeIds.includes(opt.id));
    }, [options, excludeIds]);

    React.useEffect(() => {
        if (highlight >= filteredOptions.length) {
            setHighlight(-1);
        }
    }, [filteredOptions.length, highlight]);

    const useStaticHospitalList = Boolean(staticOptions && staticOptions.length > 0);

    useEffect(() => {
        if (useStaticHospitalList && staticOptions) {
            if (!q.trim() || q.trim().length < 2) {
                setOptions([]);
                setLoading(false);
                return;
            }
            setOptions(filterStaticHospitalOptionsForRemoteSelect(staticOptions, q));
            setLoading(false);
            return;
        }
        if (!q.trim() || q.trim().length < 2) {
            setOptions([]);
            setLoading(false);
            return;
        }
        let alive = true;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetchOptions(q.trim());
                if (!alive) return;
                const mapped = Array.isArray(res)
                    ? res.map((o: any) => ({
                        ...o,
                        id: Number(o.id),
                        name: String(o.name),
                    }))
                    : [];
                const filtered = excludeIds && excludeIds.length ? mapped.filter((o) => !excludeIds.includes(o.id)) : mapped;
                if (alive) setOptions(filtered);
            } catch {
                if (alive) setOptions([]);
            } finally {
                if (alive) setLoading(false);
            }
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [q, fetchOptions, excludeIds, staticOptions, useStaticHospitalList]);

    // Use capture so clicks inside drawers/modals that call stopPropagation() on bubble still close the list.
    useEffect(() => {
        function handlePointerDownOutside(ev: MouseEvent | PointerEvent) {
            if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handlePointerDownOutside, true);
        document.addEventListener("pointerdown", handlePointerDownOutside, true);
        return () => {
            document.removeEventListener("mousedown", handlePointerDownOutside, true);
            document.removeEventListener("pointerdown", handlePointerDownOutside, true);
        };
    }, []);

    const inputClass = curator
        ? clsx(CURATOR_INPUT, trailing ? "pr-10" : "")
        : clsx(
              "h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-normal leading-snug outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          );

    const fv = fieldVariant ?? "default";

    const showWrappedLabel = Boolean(wrapSelectedLabel && value?.name && !open && !focused && !disabled);

    const wrappedLabelClass = curator
        ? clsx(
              CURATOR_INPUT,
              "h-auto min-h-[2.75rem] w-full py-2 text-left font-sans whitespace-normal break-words",
              trailing ? "pr-10" : ""
          )
        : clsx(
              "min-h-[2.5rem] w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left font-sans text-sm font-normal leading-snug text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
              "whitespace-normal break-words",
              "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
          );

    const openPickerFromWrappedLabel = () => {
        setQ("");
        setOpen(true);
        setFocused(true);
        requestAnimationFrame(() => {
            inputRef.current?.focus();
        });
    };

    const content = (
        <div className="relative min-w-0 max-w-full" ref={containerRef}>
            {showWrappedLabel ? (
                <button
                    type="button"
                    className={wrappedLabelClass}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={openPickerFromWrappedLabel}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openPickerFromWrappedLabel();
                        }
                    }}
                >
                    {value!.name}
                </button>
            ) : (
                <input
                    ref={inputRef}
                    className={inputClass}
                    disabled={disabled}
                    placeholder={placeholder || "Gõ để tìm..."}
                    value={(open || focused) ? q : value?.name || ""}
                    onChange={(e) => {
                        setQ(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => {
                        setOpen(true);
                        setFocused(true);
                    }}
                    onBlur={() => {
                        setFocused(false);
                        window.requestAnimationFrame(() => {
                            const root = containerRef.current;
                            if (root && !root.contains(document.activeElement)) {
                                setOpen(false);
                            }
                        });
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
                                setFocused(false);
                                setQ("");
                            }
                        } else if (e.key === "Escape") {
                            setOpen(false);
                        }
                    }}
                />
            )}
            {!(value && !open) && trailing === "chevron" && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </span>
            )}
            {!(value && !open) && trailing === "search" && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                </span>
            )}
            {value && !open && !disabled && (
                <button
                    type="button"
                    className={clsx(
                        "absolute right-2 z-10 text-gray-400 hover:text-gray-600",
                        showWrappedLabel ? "top-2.5" : "top-1/2 -translate-y-1/2"
                    )}
                    onClick={() => onChange(null)}
                    aria-label="Clear"
                >
                    ✕
                </button>
            )}

            {open && (
                <div
                    className={clsx(
                        "absolute z-50 mt-1 max-h-64 w-full overflow-auto border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900",
                        curator ? "rounded-lg border-slate-200" : "rounded-xl border-gray-200"
                    )}
                    onMouseLeave={() => setHighlight(-1)}
                >
                    {filteredOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">
                            {useStaticHospitalList
                                ? q.trim().length < 2
                                    ? "Nhập ít nhất 2 ký tự để tìm kiếm"
                                    : "Không tìm thấy"
                                : loading
                                  ? "Đang tìm…"
                                  : q.trim().length < 2
                                    ? "Nhập ít nhất 2 ký tự để tìm kiếm"
                                    : "Không tìm thấy"}
                        </div>
                    )}
                    {filteredOptions.length > 0 &&
                        filteredOptions.map((opt, idx) => (
                            <div
                                key={opt.id}
                                className={clsx(
                                    "cursor-pointer px-3 py-2 text-sm",
                                    idx === highlight ? "bg-gray-100 dark:bg-gray-800" : ""
                                )}
                                onMouseEnter={() => setHighlight(idx)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(opt);
                                    setOpen(false);
                                    setFocused(false);
                                    setQ("");
                                }}
                            >
                                {opt.name}
                            </div>
                        ))}
                </div>
            )}
        </div>
    );

    if (disabled) {
        const wrapRead = Boolean(curator && wrapSelectedLabel);
        return (
            <Field label={label} required={required} variant={fv}>
                <div
                    className={clsx(
                        "flex border px-3",
                        curator
                            ? wrapRead
                                ? "min-h-[2.75rem] min-w-0 max-w-full items-start rounded-lg border-slate-200 bg-slate-50 py-2 text-sm font-normal leading-snug text-slate-900 whitespace-normal break-words dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                                : "h-11 min-w-0 max-w-full items-center rounded-lg border-slate-200 bg-slate-100/80 text-sm font-normal leading-snug text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            : "h-10 items-center rounded-xl border border-gray-300 bg-gray-50 text-sm font-normal leading-snug text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    )}
                >
                    {value?.name || "-"}
                </div>
            </Field>
        );
    }

    if (hideLabel) {
        return content;
    }

    return (
        <Field label={label} required={required} variant={fv}>
            {content}
        </Field>
    );
}

function TaskFormModal({
    open,
    onClose,
    initial,
    onSubmit,
    userTeam,
    pageHospitalOptions,
}: {
    open: boolean;
    onClose: () => void;
    initial?: Partial<ImplementationTaskRequestDTO> & { id?: number; hospitalName?: string | null; picDeploymentName?: string | null };
    onSubmit: (payload: ImplementationTaskRequestDTO, id?: number) => Promise<void>;
    userTeam: string;
    pageHospitalOptions?: Array<{ id: number; name: string }>;
}) {
    type FacilityOption = { id: number; name: string; facilityType: "HOSPITAL" | "HCC" };
    // ===== Fetchers cho RemoteSelect =====
    const searchHospitals = useMemo(
        () => async (term: string) => {
            const [hospitalRes, hccRes] = await Promise.all([
                fetch(`${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(term)}`, { headers: authHeaders(), credentials: "include" }),
                fetch(`${API_ROOT}/api/v1/admin/hcc-facilities?search=${encodeURIComponent(term)}&page=0&size=20`, { headers: authHeaders(), credentials: "include" }),
            ]);
            const hospitals: FacilityOption[] = hospitalRes.ok
                ? ((await hospitalRes.json()) as Array<{ id?: number; label?: string; name?: string; hospitalName?: string; code?: string }>)
                    .map((h) => ({
                        id: Number(h.id),
                        name: String(h.label ?? h.name ?? h.hospitalName ?? h.code ?? h?.id),
                        facilityType: "HOSPITAL" as const,
                    }))
                    .filter((x) => Number.isFinite(x.id) && x.name)
                : [];
            const hccPayload = hccRes.ok ? await hccRes.json() : { content: [] };
            const hccList = Array.isArray(hccPayload?.content) ? hccPayload.content : [];
            const hccs: FacilityOption[] = hccList
                .map((f: { id?: number; name?: string }) => ({
                    id: -Number(f.id), // negative id to avoid collision in shared select
                    name: `${String(f.name ?? f?.id)} (HCC)`,
                    facilityType: "HCC" as const,
                }))
                .filter((x: FacilityOption) => Number.isFinite(x.id) && x.name);
            return [...hospitals, ...hccs];
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
    const [hospitalOpt, setHospitalOpt] = useState<{ id: number; name: string; facilityType: "HOSPITAL" | "HCC" } | null>(() => {
        const hospitalId = (initial?.hospitalId as number) || 0;
        const hccId = Number((initial as any)?.hccFacilityId || 0);
        const nm = (initial?.hospitalName as string) || (initial as any)?.hccFacilityName || "";
        if (hospitalId) return { id: hospitalId, name: nm || String(hospitalId), facilityType: "HOSPITAL" };
        if (hccId) return { id: -hccId, name: nm || `HCC #${hccId}`, facilityType: "HCC" };
        return null;
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
            const hccId = Number((initial as any)?.hccFacilityId || 0);
            const hnm = (initial?.hospitalName as string) || (initial as any)?.hccFacilityName || "";
            setHospitalOpt(
                hid
                    ? { id: hid, name: hnm || String(hid), facilityType: "HOSPITAL" }
                    : hccId
                        ? { id: -hccId, name: hnm || `HCC #${hccId}`, facilityType: "HCC" }
                        : null
            );

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
        resolveById((initial?.hospitalId as number) || null, (v) => setHospitalOpt(v ? { ...v, facilityType: "HOSPITAL" } : null), "/api/v1/admin/hospitals", ["name", "hospitalName", "label", "code"]);
        resolveById(((initial as any)?.hccFacilityId as number) || null, (v) => setHospitalOpt(v ? { id: -v.id, name: v.name, facilityType: "HCC" } : null), "/api/v1/admin/hcc-facilities", ["name", "label"]);

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

    const makePicPrimary = (uid: string) => {
        setPicOpts((prev) => {
            const idx = prev.findIndex((p) => p._uid === uid);
            if (idx <= 0) return prev;
            const next = [...prev];
            const [picked] = next.splice(idx, 1);
            return [picked, ...next];
        });
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!model.name?.trim()) { toast.error("Tên dự án không được để trống"); return; }
        if (!hospitalOpt?.id) { toast.error("Cơ sở y tế/hành chính công không được để trống"); return; }
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
            hospitalId: hospitalOpt.facilityType === "HOSPITAL" ? hospitalOpt.id : undefined,
            hccFacilityId: hospitalOpt.facilityType === "HCC" ? Math.abs(hospitalOpt.id) : undefined,
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

    const lockHospital = !initial?.id && (Boolean(initial?.hospitalId) || Boolean((initial as any)?.hccFacilityId) || Boolean(initial?.hospitalName));

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="maintenance-task-form-layer"
                    className="fixed inset-0 z-50 flex"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                >
                    <motion.div
                        className="min-w-0 flex-1 bg-slate-900/25 backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onMouseDown={onClose}
                        aria-hidden
                    />
                    <motion.div
                        key="maintenance-task-drawer"
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 32 }}
                        className="relative flex h-full min-w-0 w-full max-w-lg flex-col overflow-hidden border-l border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-gray-900"
                        onMouseDown={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                    <header className="relative flex min-w-0 shrink-0 items-start justify-between gap-4 overflow-x-hidden border-b border-slate-100 px-6 pb-4 pt-6 dark:border-slate-800">
                        <div
                            className={clsx(
                                "pointer-events-none absolute inset-y-0 left-0 w-1",
                                initial?.id ? "bg-amber-500 dark:bg-amber-400" : "bg-emerald-500 dark:bg-emerald-400"
                            )}
                            aria-hidden
                        />
                        <div className="min-w-0 pl-2">
                            <span
                                className={clsx(
                                    "mb-1.5 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                    initial?.id
                                        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200/90 dark:bg-amber-950/70 dark:text-amber-100 dark:ring-amber-800/70"
                                        : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/90 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-800/70"
                                )}
                            >
                                {initial?.id ? "Sửa" : "Thêm mới"}
                            </span>
                            <h2
                                className={clsx(
                                    "text-xl font-bold tracking-tight",
                                    initial?.id ? "text-slate-900 dark:text-white" : "text-emerald-950 dark:text-emerald-50"
                                )}
                            >
                                {initial?.id ? "Chỉnh sửa công việc" : "Tạo công việc mới"}
                            </h2>
                            {!initial?.id && (
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    Điền thông tin chi tiết để bắt đầu nhiệm vụ
                                </p>
                            )}
                            {initial?.id && initial?.name && (
                                <p className="mt-1 truncate text-sm font-medium text-slate-600 dark:text-slate-300">{initial.name}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label="Close"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                            </svg>
                        </button>
                    </header>

                    <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 py-5 [overflow-wrap:anywhere]">
                            <Field label="Tên công việc" required variant="curator">
                                <TextInput
                                    curator
                                    disabled={readOnly}
                                    value={model.name}
                                    onChange={(e) => setModel((s) => ({ ...s, name: e.target.value }))}
                                    placeholder="Ví dụ: Kiểm tra thiết bị,..."
                                />
                            </Field>

                            <div className="grid min-w-0 max-w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
                                {lockHospital ? (
                                    <Field label="Cơ sở y tế, hành chính công" required variant="curator">
                                        <div className="flex min-h-[2.75rem] min-w-0 max-w-full items-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal leading-snug text-slate-900 whitespace-normal break-words dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100">
                                            {hospitalOpt?.name || "-"}
                                        </div>
                                    </Field>
                                ) : (
                                    <RemoteSelect
                                        label="Cơ sở y tế, hành chính công"
                                        fieldVariant="curator"
                                        curator
                                        trailing="chevron"
                                        required
                                        placeholder="Chọn cơ sở y tế hoặc cơ sở hành chính công"
                                        fetchOptions={searchHospitals}
                                        value={hospitalOpt}
                                        onChange={(v) => setHospitalOpt(v ? { ...v, facilityType: (v as any).facilityType ?? "HOSPITAL" } : null)}
                                        disabled={readOnly}
                                        wrapSelectedLabel
                                    />
                                )}

                                <div className="min-w-0 max-w-full">
                                    <div className="grid min-w-0 gap-1.5">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            Người phụ trách <span className="text-red-500">*</span>
                                        </span>
                                        <div className="flex flex-col gap-2">
                                            {!readOnly && (
                                                <RemoteSelect
                                                    label=""
                                                    hideLabel
                                                    curator
                                                    trailing="search"
                                                    placeholder="Tìm PIC…"
                                                    fetchOptions={searchPICs}
                                                    value={currentPicInput}
                                                    excludeIds={picOpts.map((p) => p.id)}
                                                    onChange={(selected) => {
                                                        if (!selected || !selected.id) return;
                                                        const isDuplicate = picOpts.some((p) => String(p.id) === String(selected.id));
                                                        if (!isDuplicate) {
                                                            const displayName =
                                                                (selected as any).name ||
                                                                (selected as any).fullName ||
                                                                (selected as any).label ||
                                                                (selected as any).username;
                                                            if (!displayName) {
                                                                setCurrentPicInput(null);
                                                                return;
                                                            }
                                                            const newPic = {
                                                                ...selected,
                                                                name: displayName,
                                                                _uid: `pic-${Date.now()}-${selected.id}`,
                                                            };
                                                            setPicOpts((prev) => [...prev, newPic]);
                                                            setCurrentPicInput(null);
                                                        } else {
                                                            setCurrentPicInput(null);
                                                        }
                                                    }}
                                                />
                                            )}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {picOpts.map((pic, index) => (
                                                    <div
                                                        key={pic._uid}
                                                        role="presentation"
                                                        className={clsx(
                                                            "inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1 text-xs",
                                                            index === 0
                                                                ? "border-blue-200 bg-blue-50 font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
                                                                : "border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
                                                            !readOnly && index > 0 && "cursor-pointer hover:ring-2 hover:ring-slate-300/90 dark:hover:ring-slate-600"
                                                        )}
                                                        onClick={() => {
                                                            if (!readOnly && index > 0) makePicPrimary(pic._uid);
                                                        }}
                                                        title={
                                                            !readOnly && index > 0
                                                                ? "Nhấn để đặt làm PIC chính"
                                                                : index === 0
                                                                  ? "PIC chính"
                                                                  : undefined
                                                        }
                                                    >
                                                        <span className="max-w-[11rem] truncate">
                                                            {pic.name ||
                                                                (pic as any).fullName ||
                                                                (pic as any).label ||
                                                                (pic as any).username ||
                                                                String(pic.id) ||
                                                                "Không có tên"}
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
                                                                className="text-red-500 hover:text-red-700"
                                                                aria-label={`Remove ${pic.name}`}
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid min-w-0 max-w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
                                <Field label="Trạng thái" required variant="curator">
                                    <CuratorSelect
                                        disabled={readOnly}
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
                                                    : !becameCompleted && wasCompleted
                                                      ? ""
                                                      : (s.completionDate ?? "");
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
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </CuratorSelect>
                                </Field>
                                <Field label="Hạn chót" variant="curator">
                                    <TextInput
                                        curator
                                        disabled={readOnly}
                                        type="datetime-local"
                                        value={toDatetimeLocalInput(model.deadline)}
                                        onChange={(e) => setModel((s) => ({ ...s, deadline: e.target.value }))}
                                    />
                                </Field>
                            </div>

                            <div className="min-w-0 max-w-full rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Thời gian xử lý: 
                                </p>
                                <div className="mt-3 grid min-w-0 max-w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
                                    <Field label="Bắt đầu" variant="curator">
                                        <TextInput
                                            curator
                                            disabled={readOnly}
                                            type="datetime-local"
                                            value={toDatetimeLocalInput(model.startDate)}
                                            onChange={(e) => setModel((s) => ({ ...s, startDate: e.target.value }))}
                                        />
                                    </Field>
                                    <Field label="Kết thúc" variant="curator">
                                        <TextInput
                                            curator
                                            disabled={readOnly}
                                            type="datetime-local"
                                            value={toDatetimeLocalInput(model.completionDate)}
                                            onChange={(e) => setModel((s) => ({ ...s, completionDate: e.target.value }))}
                                        />
                                    </Field>
                                </div>
                            </div>

                            <Field label="Yêu cầu bổ sung" variant="curator">
                                <TextArea
                                    curator
                                    disabled={readOnly}
                                    value={model.additionalRequest ?? ""}
                                    onChange={(e) => setModel((s) => ({ ...s, additionalRequest: e.target.value }))}
                                    placeholder="Nhập các yêu cầu kỹ thuật hoặc lưu ý đặc biệt tại đây..."
                                />
                            </Field>
                        </div>

                        <footer className="flex min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-hidden border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-gray-900/95">
                            {readOnly ? (
                                <div className="flex w-full justify-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={onClose}
                                        className="!h-10 !rounded-lg !border-0 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        Đóng
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                        onClick={onClose}
                                    >
                                        Hủy
                                    </button>
                                    <Button type="submit" disabled={submitting} curatorPrimary className="!h-11 !rounded-lg !px-5">
                                        {submitting ? "Đang lưu..." : initial?.id ? "Cập nhật" : "Tạo mới"}
                                    </Button>
                                </>
                            )}
                        </footer>
                    </form>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
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
                        <Info icon={<FaHospital />} label="Cơ sở" value={item.hospitalName} />

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
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
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
    const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

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
    const [hospitalRegionFilter, setHospitalRegionFilter] = useState<string>("");
    const [hospitalRegionQuery, setHospitalRegionQuery] = useState<string>("");
    const [hospitalStatusFilter, setHospitalStatusFilter] = useState<string>("");
    /** Selected PIC display names for hospital list filter (OR). */
    const [hospitalPicFilters, setHospitalPicFilters] = useState<string[]>([]);
    /** Typing for autocomplete to add more PICs. */
    const [hospitalPicInput, setHospitalPicInput] = useState<string>("");
    const [isPicSuggestOpen, setIsPicSuggestOpen] = useState<boolean>(false);
    const [isRegionSuggestOpen, setIsRegionSuggestOpen] = useState<boolean>(false);
    const [picOptions, setPicOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [hospitalSortBy, setHospitalSortBy] = useState<string>("label");
    const [hospitalSortDir, setHospitalSortDir] = useState<string>("asc");
    const [showTicketsModal, setShowTicketsModal] = useState(false);
    const [selectedHospitalIdForTickets, setSelectedHospitalIdForTickets] = useState<number | null>(null);
    const [selectedHospitalNameForTickets, setSelectedHospitalNameForTickets] = useState<string | null>(null);
    const [ticketOpenCounts, setTicketOpenCounts] = useState<Record<number, number>>({});
    const [ticketCountLoading, setTicketCountLoading] = useState<Set<number>>(new Set());
    const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
    const { isSuperAdmin, activeTeam } = useAuth();
    const currentUser = useMemo<UserInfo>(() => readStored<UserInfo>("user"), []);
    // Prefer activeTeam from JWT (new way), fallback to localStorage (old way)
    const userTeam = (activeTeam || currentUser?.team || "").toString().toUpperCase();

    const defaultHospitalPicQueryAppliedRef = useRef(false);
    const hospitalPicInputRef = useRef<HTMLInputElement>(null);

    const mergePicOptionsFromUsers = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (userTeam === "MAINTENANCE") {
                params.set("team", "MAINTENANCE");
            } else if (userTeam === "DEPLOYMENT") {
                params.set("team", "DEPLOYMENT");
            }
            const queryString = params.toString();
            const usersUrl = queryString
                ? `${API_ROOT}/api/v1/admin/users/search?${queryString}`
                : `${API_ROOT}/api/v1/admin/users/search`;
            const usersRes = await fetch(usersUrl, { headers: authHeaders(), credentials: "include" });
            if (!usersRes.ok) return;
            const usersList = await usersRes.json();
            const users = Array.isArray(usersList) ? usersList : [];
            setPicOptions((prev) => {
                const map = new Map<string, { id: string; label: string }>();
                prev.forEach((p) => {
                    if (p.id && p.label) map.set(String(p.id), { id: String(p.id), label: String(p.label) });
                });
                users.forEach((u: any) => {
                    const userId = String(u?.id ?? "").trim();
                    if (!userId) return;
                    const userName = String(u?.label ?? u?.name ?? u?.fullName ?? u?.fullname ?? u?.username ?? "").trim();
                    if (!userName) return;
                    if (!map.has(userId)) {
                        map.set(userId, { id: userId, label: userName });
                    }
                });
                return Array.from(map.values());
            });
        } catch {
            // ignore, keep current options
        }
    }, [userTeam]);

    useEffect(() => {
        if (!showHospitalList) return;
        if (defaultHospitalPicQueryAppliedRef.current) return;
        if (picOptions.length === 0) return;
        if (hospitalPicFilters.length > 0) {
            defaultHospitalPicQueryAppliedRef.current = true;
            return;
        }
        const next = resolveDefaultHospitalPicQuery(picOptions);
        if (!next?.trim()) return;
        setHospitalPicFilters([next.trim()]);
        defaultHospitalPicQueryAppliedRef.current = true;
    }, [showHospitalList, picOptions, hospitalPicFilters.length]);

    // Keep hospital drill-down in the URL so browser Back returns to the list instead of leaving the page.
    useEffect(() => {
        const h = searchParams.get("hospital");
        if (h && h.trim()) {
            setSelectedHospital(h.trim());
            setShowHospitalList(false);
        } else {
            setSelectedHospital(null);
            setShowHospitalList(true);
        }
    }, [searchParams]);

    const openHospitalTasksInHistory = useCallback((hospitalLabel: string) => {
        setSearchParams(
            (prev) => {
                const p = new URLSearchParams(prev);
                p.set("hospital", hospitalLabel);
                return p;
            },
            { replace: false },
        );
    }, [setSearchParams]);

    const backToHospitalListInHistory = useCallback(() => {
        setSearchParams(
            (prev) => {
                const p = new URLSearchParams(prev);
                p.delete("hospital");
                return p;
            },
            { replace: true },
        );
    }, [setSearchParams]);

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

    const acceptPendingHospitalCore = async (group: PendingTransferGroup) => {
        if (!group || !group.hospitalId) {
            toast.error("Không có bệnh viện nào để tiếp nhận.");
            return;
        }

        try {
            // ✅ API mới: Tiếp nhận bệnh viện (1 API call thay vì loop qua từng task)
            const res = await fetch(`${API_ROOT}/api/v1/admin/maintenance/accept-hospital/${group.hospitalId}`, {
                method: "PUT",
                headers: authHeaders(),
                credentials: "include",
            });
            if (!res.ok) {
                await res.text();
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

    const handleAcceptPendingGroup = async (group: PendingTransferGroup) => {
        if (!group || !group.hospitalId) {
            toast.error("Không có bệnh viện nào để tiếp nhận.");
            return;
        }

        const ok = await askConfirm({
            title: "Tiếp nhận bệnh viện?",
            message: `Tiếp nhận bệnh viện ${group.hospitalName} và chuyển sang danh sách bảo trì?`,
            confirmLabel: "Tiếp nhận",
        });
        if (!ok) return;

        await acceptPendingHospitalCore(group);
    };

    const handleAcceptAll = async () => {
        if (pendingTasks.length === 0) {
            toast.error("Không có bệnh viện nào để tiếp nhận.");
            return;
        }

        const ok = await askConfirm({
            title: "Tiếp nhận tất cả?",
            message: `Tiếp nhận tất cả ${pendingTasks.length} bệnh viện và chuyển sang danh sách bảo trì?`,
            confirmLabel: "Tiếp nhận tất cả",
        });
        if (!ok) return;

        // Accept all hospitals sequentially (no per-row confirm)
        for (const group of [...pendingTasks]) {
            if (group.hospitalId) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await acceptPendingHospitalCore(group);
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
        if (hospitalRegionQuery.trim()) {
            const regionQ = normalizeSearchText(hospitalRegionQuery);
            list = list.filter((h) => normalizeSearchText(h.subLabel || "").includes(regionQ));
        }
        if (hospitalStatusFilter === 'accepted') list = list.filter(h => h.acceptedByMaintenance);
        else if (hospitalStatusFilter === 'incomplete') list = list.filter(h => (h.acceptedCount || 0) < (h.taskCount || 0));
        else if (hospitalStatusFilter === 'unaccepted') list = list.filter(h => !h.acceptedByMaintenance);
        else if (hospitalStatusFilter === 'hasOpenTickets') list = list.filter(h => h.id && (ticketOpenCounts[h.id] ?? 0) > 0);

        // Search by PIC name(s): any selected tag matches maintenance or deployment PIC (OR)
        if (hospitalPicFilters.length > 0) {
            list = list.filter((h) => {
                const maintenancePic = String(h.maintenancePersonInChargeName || "").toLowerCase();
                const deploymentPics = (h.picDeploymentNames || []).map((name) => String(name).toLowerCase());
                return hospitalPicFilters.some((tag) => {
                    const picQ = tag.trim().toLowerCase();
                    if (!picQ) return false;
                    return maintenancePic.includes(picQ) || deploymentPics.some((name) => name.includes(picQ));
                });
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
    }, [hospitalsWithTasks, hospitalSearch, hospitalCodeSearch, hospitalRegionQuery, hospitalStatusFilter, hospitalPicFilters, hospitalSortBy, hospitalSortDir, ticketOpenCounts, ticketCountLoading]);

    const pageHospitalOptionsForTaskModal = useMemo(
        () =>
            hospitalsWithTasks
                .filter((h) => typeof h.id === "number" && Number.isFinite(h.id) && h.id > 0)
                .map((h) => ({ id: Number(h.id), name: String(h.label ?? "").trim() || String(h.id) })),
        [hospitalsWithTasks],
    );

    const regionOptions = useMemo(() => VIETNAM_PROVINCE_LABELS, []);

    const picNameOptions = useMemo(() => {
        return Array.from(
            new Set(
                picOptions
                    .map((opt) => (opt.label || "").trim())
                    .filter((v) => v.length > 0),
            ),
        ).sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }));
    }, [picOptions]);

    const filteredPicNameOptions = useMemo(() => {
        const q = hospitalPicInput.trim().toLowerCase();
        if (!q) return [];
        const notSelected = picNameOptions.filter((name) => !hospitalPicFilters.includes(name));
        return notSelected.filter((name) => name.toLowerCase().includes(q));
    }, [picNameOptions, hospitalPicInput, hospitalPicFilters]);

    const filteredRegionOptions = useMemo(() => {
        const q = normalizeSearchText(hospitalRegionQuery);
        if (!q) return [];
        const source = regionOptions.filter((region) => normalizeSearchText(region).includes(q));
        return source.slice(0, 8);
    }, [regionOptions, hospitalRegionQuery]);

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

    const deleteTargetName = useMemo(() => {
        if (deleteDialogId == null) return null;
        const row = data.find((x) => x.id === deleteDialogId);
        return row?.name ?? null;
    }, [deleteDialogId, data]);

    const requestDelete = (id: number) => {
        setDeleteDialogId(id);
    };

    const confirmDeleteTask = async () => {
        if (deleteDialogId == null) return;
        setDeleteSubmitting(true);
        try {
            const id = deleteDialogId;
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
            setDeleteDialogId(null);
        } finally {
            setDeleteSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen p-6 xl:p-10">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-extrabold">{showHospitalList ? "Danh sách các bệnh viện bảo trì" : "Danh sách công việc bảo trì"}</h1>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {showHospitalList ? (
                        (isSuperAdmin || userTeam === "MAINTENANCE") && (
                            <>
                                <button
                                    className="rounded-xl bg-blue-600 px-5 py-2 text-white shadow hover:bg-blue-700"
                                    onClick={() => { setEditing(null); setModalOpen(true); }}
                                    type="button"
                                >
                                    + Thêm công việc mới
                                </button>
                                <button
                                    className="relative inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                    onClick={() => { setPendingOpen(true); fetchPendingTasks(); }}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    Viện chờ tiếp nhận
                                    {pendingTasks.length > 0 && (
                                        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
                                            {pendingTasks.length}
                                        </span>
                                    )}
                                </button>
                                <button
                                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                    onClick={() => {
                                        const targetPath = isSuperAdmin ? "/superadmin/tickets" : "/tickets";
                                        navigate(targetPath);
                                    }}
                                >
                                    <FiTag className="w-5 h-5" />
                                    Tickets
                                </button>
                            </>
                        )
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                backToHospitalListInHistory();
                                setSearchTerm("");
                                setStatusFilter("");
                                setPage(0);
                                setData([]);
                                void fetchHospitalsWithTasks();
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium"
                        >
                            ← Quay lại danh sách bệnh viện
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="text-red-600 mb-4">{error}</div>}

            {!showHospitalList && selectedHospital && (
                <>
                    <div className="mb-5 rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-white px-6 py-5 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-gray-900 dark:to-gray-900">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">Chi tiết bệnh viện</p>
                        <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900 dark:text-white">{selectedHospital}</h2>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {(() => {
                                const h = hospitalsWithTasks.find((x) => x.label === selectedHospital);
                                return (
                                    <>
                                        {h?.hospitalCode && (
                                            <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
                                                Mã BV: {h.hospitalCode}
                                            </span>
                                        )}
                                        {h?.subLabel && (
                                            <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600">
                                                Khu vực: {h.subLabel}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <div className="mt-5 space-y-4 border-t border-sky-100/80 pt-4 dark:border-sky-900/40">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                    <span className="font-semibold">Danh sách nhiệm vụ cụ thể</span>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm">
                                    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                        Tổng:{" "}
                                        <strong className="text-slate-900 dark:text-slate-100">{loading ? "…" : totalCount ?? filtered.length}</strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                                        Hoàn thành:{" "}
                                        <strong>{completedCount ?? completedCountFromFiltered}</strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                                        <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                                        Chưa hoàn thành:{" "}
                                        <strong>
                                            {Math.max(0, (totalCount ?? filtered.length) - (completedCount ?? completedCountFromFiltered))}
                                        </strong>
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                                    <div className="relative">
                                        <input
                                            list="hospital-list"
                                            type="text"
                                            className="min-w-[200px] rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-sky-200/50 focus:border-sky-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500"
                                            placeholder="Tìm theo tên công việc"
                                            value={searchTerm}
                                            onChange={(e) => {
                                                setSearchTerm(e.target.value);
                                                setHospitalQuery(e.target.value);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") fetchList();
                                            }}
                                        />
                                        <datalist id="hospital-list">
                                            {hospitalOptions.map((h) => (
                                                <option key={h.id} value={h.label} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <select
                                        className="min-w-[180px] rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <option value="">— Chọn trạng thái —</option>
                                        {STATUS_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 lg:shrink-0 lg:justify-end">
                                    {isSuperAdmin || userTeam === "MAINTENANCE" ? (
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
                                            onClick={async () => {
                                                const selected = hospitalsWithTasks.find((h) => h.label === selectedHospital);
                                                let hid: number | null = null;
                                                if (!selected && selectedHospital) {
                                                    hid = await resolveHospitalIdByName(selectedHospital);
                                                }
                                                setEditing(
                                                    selected && selected.id < 0
                                                        ? ({ hccFacilityId: Math.abs(selected.id), hccFacilityName: selected.label, hospitalName: selected.label } as any)
                                                        : selected && selected.id > 0
                                                            ? ({ hospitalId: selected.id, hospitalName: selected.label } as any)
                                                            : hid
                                                                ? ({ hospitalId: hid, hospitalName: selectedHospital } as any)
                                                                : ({ hospitalName: selectedHospital } as any)
                                                );
                                                setModalOpen(true);
                                            }}
                                        >
                                            <PlusIcon />
                                            <span>Thêm mới</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled
                                            className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500 shadow-sm"
                                            title="Không có quyền"
                                        >
                                            <PlusIcon />
                                            <span>Thêm mới</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mb-2 hidden rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/90 dark:text-slate-400 md:grid md:grid-cols-12 md:gap-4">
                        <div className="md:col-span-4">Tên nhiệm vụ</div>
                        <div className="md:col-span-2 text-center">Trạng thái</div>
                        <div className="md:col-span-2">Phụ trách chính</div>
                        <div className="md:col-span-2">Thời gian tạo</div>
                        <div className="md:col-span-2 text-right">Thao tác</div>
                    </div>
                </>
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
                            <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="flex flex-col gap-4">
                                    <div className="w-full">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                            {/* <div>
                                                <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Lọc theo trạng thái</h4>
                                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                                    <button className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${hospitalStatusFilter === "" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-[#dfe4f0] hover:bg-[#f8f9fc]"}`} onClick={() => { setHospitalStatusFilter(""); setHospitalPage(0); }}>Tất cả</button>
                                                    <button className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${hospitalStatusFilter === "incomplete" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-[#dfe4f0] hover:bg-[#f8f9fc]"}`} onClick={() => { setHospitalStatusFilter("incomplete"); setHospitalPage(0); }}>Đang thực hiện</button>
                                                    <button className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${hospitalStatusFilter === "accepted" ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-[#dfe4f0] hover:bg-[#f8f9fc]"}`} onClick={() => { setHospitalStatusFilter("accepted"); setHospitalPage(0); }}>Đã hoàn thành</button>
                                                </div>
                                            </div> */}

                                            <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-3">
                                                <div>
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Tên bệnh viện</label>
                                                    <input
                                                        type="text"
                                                        value={hospitalSearch}
                                                        onChange={(e) => {
                                                            setHospitalSearch(e.target.value);
                                                            setHospitalPage(0);
                                                        }}
                                                        placeholder="Tìm theo tên bệnh viện"
                                                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Phụ trách chính</label>
                                                    <div className="relative">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const nextOpen = !isPicSuggestOpen;
                                                                setIsPicSuggestOpen(nextOpen);
                                                                if (nextOpen) {
                                                                    void mergePicOptionsFromUsers();
                                                                }
                                                            }}
                                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                                                        >
                                                            {hospitalPicFilters.length === 0
                                                                ? "Phụ trách chính: Tất cả"
                                                                : `Phụ trách chính: ${hospitalPicFilters.length} đã chọn`}
                                                        </button>

                                                        {isPicSuggestOpen && (
                                                            <div className="absolute left-0 z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                                                                <div className="mb-2">
                                                                    <input
                                                                        ref={hospitalPicInputRef}
                                                                        type="text"
                                                                        value={hospitalPicInput}
                                                                        onChange={(e) => setHospitalPicInput(e.target.value)}
                                                                        placeholder="Tìm người phụ trách"
                                                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                                                    />
                                                                </div>

                                                                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                                                    {(hospitalPicInput.trim()
                                                                        ? filteredPicNameOptions
                                                                        : picNameOptions.filter((name) => !hospitalPicFilters.includes(name))
                                                                    ).length === 0 ? (
                                                                        <div className="py-3 text-center text-sm text-gray-500 dark:text-gray-400">Không có dữ liệu phụ trách</div>
                                                                    ) : (
                                                                        (hospitalPicInput.trim()
                                                                            ? filteredPicNameOptions
                                                                            : picNameOptions.filter((name) => !hospitalPicFilters.includes(name))
                                                                        ).map((name) => {
                                                                            const checked = hospitalPicFilters.includes(name);
                                                                            return (
                                                                                <label key={name} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={checked}
                                                                                        onChange={(e) => {
                                                                                            if (e.target.checked) {
                                                                                                setHospitalPicFilters((prev) => (prev.includes(name) ? prev : [...prev, name]));
                                                                                            } else {
                                                                                                setHospitalPicFilters((prev) => prev.filter((n) => n !== name));
                                                                                            }
                                                                                            setHospitalPage(0);
                                                                                        }}
                                                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                                    />
                                                                                    <span className="truncate">{name}</span>
                                                                                </label>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>

                                                                <div className="mt-2 flex items-center justify-between">
                                                                    <button
                                                                        type="button"
                                                                        className="px-3 py-1.5 text-xs text-blue-600 hover:underline disabled:pointer-events-none disabled:opacity-50"
                                                                        disabled={hospitalPicFilters.length === 0}
                                                                        onClick={() => {
                                                                            setHospitalPicFilters([]);
                                                                            setHospitalPicInput("");
                                                                            setHospitalPage(0);
                                                                        }}
                                                                    >
                                                                        Bỏ lọc
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                                                        onClick={() => setIsPicSuggestOpen(false)}
                                                                    >
                                                                        Đóng
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Khu vực</label>
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            value={hospitalRegionQuery}
                                                            onChange={(e) => {
                                                                setHospitalRegionQuery(e.target.value);
                                                                setHospitalPage(0);
                                                                setIsRegionSuggestOpen(true);
                                                            }}
                                                            onFocus={() => setIsRegionSuggestOpen(true)}
                                                            onBlur={() => window.setTimeout(() => setIsRegionSuggestOpen(false), 120)}
                                                            placeholder="Tìm tất cả tỉnh/thành"
                                                            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                                        />
                                                        {isRegionSuggestOpen && filteredRegionOptions.length > 0 && (
                                                            <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                                                                {filteredRegionOptions.map((region) => (
                                                                    <button
                                                                        key={region}
                                                                        type="button"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            setHospitalRegionQuery(region);
                                                                            setHospitalPage(0);
                                                                            setIsRegionSuggestOpen(false);
                                                                        }}
                                                                        className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                                                                    >
                                                                        {region}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                            <span className="font-semibold text-gray-800">
                                                Tổng bệnh viện:
                                                <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                                                    {loadingHospitals ? "..." : filteredHospitals.length}
                                                </span>
                                            </span>
                                        </div>
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
                                    <div className="space-y-3">
                                        {pagedHospitals.map((hospital, index) => (
                                            <div
                                                key={hospital.id || `${hospital.label}-${index}`}
                                                className="group cursor-pointer rounded-2xl border border-[#e4e7f2] bg-[#f8f9fc] px-5 py-5 shadow-none transition hover:border-[#d4daea] hover:bg-white"
                                                onClick={() => {
                                                    openHospitalTasksInHistory(hospital.label);
                                                    setPage(0);
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-5">
                                                    <div className="min-w-0 flex flex-[1.7] items-center gap-3">
                                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#e8ecf8] text-blue-600">
                                                            <FaHospital className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Mã BV: {hospital.hospitalCode || "—"}</div>
                                                            <div className="mt-0.5 text-[20px] font-bold leading-tight text-gray-900">{hospital.label}</div>
                                                            <div className="mt-0.5 text-[14px] leading-tight text-gray-600">{hospital.subLabel || "Chưa có thông tin khu vực"}</div>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-[180px] flex-[1.1]">
                                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Phụ trách</div>
                                                        <div className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-gray-800">
                                                            {/* <span className="h-5 w-5 rounded-full bg-gray-200" /> */}
                                                            <span className="truncate">{hospital.maintenancePersonInChargeName || "—"}</span>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-[170px] flex-1">
                                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tiến độ công việc</div>
                                                        <div className="mt-1 flex items-center gap-3">
                                                            <span className="text-[14px] font-semibold text-gray-800">{hospital.acceptedCount ?? 0}/{hospital.taskCount ?? 0} Tasks</span>
                                                            <span className="text-[14px] font-bold text-gray-700">
                                                                {Math.round(((hospital.acceptedCount ?? 0) * 100) / Math.max(1, hospital.taskCount ?? 0))}%
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 h-1.5 w-full max-w-[120px] rounded-full bg-gray-200">
                                                            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.round(((hospital.acceptedCount ?? 0) * 100) / Math.max(1, hospital.taskCount ?? 0))}%` }} />
                                                        </div>
                                                    </div>

                                                    <div className="min-w-[130px] text-right">
                                                        <div className="text-[10px] text-gray-600">
                                                            {hospital.overdueCount ? `Quá hạn: ${hospital.overdueCount}` : hospital.nearDueCount ? `Sắp hạn: ${hospital.nearDueCount}` : "Cập nhật gần đây"}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openHospitalTasksInHistory(hospital.label);
                                                            setPage(0);
                                                        }}
                                                        className="rounded-lg p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-700"
                                                        title="Xem công việc"
                                                    >
                                                        <span className="text-lg leading-none">›</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
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
                                                <select value={String(hospitalSize)} onChange={(e) => { setHospitalSize(Number(e.target.value)); setHospitalPage(0); }} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700">
                                                    <option value="10">10</option>
                                                    <option value="20">20</option>
                                                    <option value="50">50</option>
                                                    <option value="100">100</option>
                                                </select>
                                            </div>

                                            <div className="inline-flex items-center gap-1">
                                                <button onClick={() => setHospitalPage(0)} disabled={hospitalPage <= 0} className="h-8 w-8 rounded-lg bg-[#e4e7f2] text-gray-700 disabled:opacity-50" title="Đầu">«</button>
                                                <button onClick={() => setHospitalPage((p) => Math.max(0, p - 1))} disabled={hospitalPage <= 0} className="h-8 w-8 rounded-lg bg-[#e4e7f2] text-gray-700 disabled:opacity-50" title="Trước">‹</button>

                                                {(() => {
                                                    const total = Math.max(1, Math.ceil(filteredHospitals.length / hospitalSize));
                                                    const pages: number[] = [];
                                                    const start = Math.max(1, hospitalPage + 1 - 2);
                                                    const end = Math.min(total, start + 4);
                                                    for (let i = start; i <= end; i++) pages.push(i);
                                                    return pages.map((p) => (
                                                        <button key={p} onClick={() => setHospitalPage(p - 1)} className={`h-8 min-w-8 rounded-lg px-2 text-sm ${hospitalPage + 1 === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-[#d4d9e8]'}`}>
                                                            {p}
                                                        </button>
                                                    ));
                                                })()}

                                                <button onClick={() => setHospitalPage((p) => Math.min(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1), p + 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="h-8 w-8 rounded-lg bg-[#e4e7f2] text-gray-700 disabled:opacity-50" title="Tiếp">›</button>
                                                <button onClick={() => setHospitalPage(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="h-8 w-8 rounded-lg bg-[#e4e7f2] text-gray-700 disabled:opacity-50" title="Cuối">»</button>
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
                                {filtered.map((row, idx) => (
                                        <div key={row.id}>
                                            <TaskCardNew
                                                task={row as unknown as ImplementationTaskResponseDTO}
                                                idx={enableItemAnimation ? idx : undefined}
                                                displayIndex={page * size + idx}
                                                animate={enableItemAnimation}
                                                clinicalTaskRow
                                                statusLabelOverride={statusLabel}
                                                statusClassOverride={statusBadgeClasses}
                                                onOpen={() => { setDetailItem(row); setDetailOpen(true); }}
                                                onEdit={() => { setEditing(row); setModalOpen(true); }}
                                                onDelete={(id: number) => { requestDelete(id); }}
                                                canEdit={(isSuperAdmin || userTeam === "MAINTENANCE") && (() => { try { const uidRaw = localStorage.getItem("userId") || sessionStorage.getItem("userId"); const uid = uidRaw ? Number(uidRaw) : 0; return uid > 0 && Number(row.picDeploymentId) === uid; } catch { return false; } })()}
                                                canDelete={(isSuperAdmin || userTeam === "MAINTENANCE") && (() => { try { const uidRaw = localStorage.getItem("userId") || sessionStorage.getItem("userId"); const uid = uidRaw ? Number(uidRaw) : 0; return uid > 0 && Number(row.picDeploymentId) === uid; } catch { return false; } })()}
                                            />
                                        </div>
                                    ))}
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
                        hccFacilityId: (editing as ImplementationTaskResponseDTO).hccFacilityId ?? undefined,
                        hccFacilityName: (editing as ImplementationTaskResponseDTO).hccFacilityName ?? null,
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
                    } as Partial<ImplementationTaskRequestDTO> & {
                        id?: number;
                        hospitalName?: string | null;
                        hccFacilityId?: number | null;
                        hccFacilityName?: string | null;
                        picDeploymentName?: string | null;
                    })
                    : undefined;

                return (
                    <TaskFormModal
                        open={modalOpen}
                        onClose={() => setModalOpen(false)}
                        initial={initialForForm}
                        onSubmit={handleSubmit}
                        userTeam={userTeam}
                        pageHospitalOptions={pageHospitalOptionsForTaskModal}
                    />
                );
            })()}

            <DetailModal open={detailOpen} onClose={() => setDetailOpen(false)} item={detailItem} />
            <ConfirmDialog
                open={deleteDialogId != null}
                title="Xóa công việc bảo trì?"
                message={
                    deleteTargetName ? (
                        <>
                            Bạn sắp xóa <span className="font-semibold text-slate-800 dark:text-slate-100">{deleteTargetName}</span>. Hành động
                            này không thể hoàn tác.
                        </>
                    ) : (
                        "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác."
                    )
                }
                variant="danger"
                confirmLabel="Xóa"
                cancelLabel="Huỷ"
                confirmLoading={deleteSubmitting}
                onClose={() => {
                    if (!deleteSubmitting) setDeleteDialogId(null);
                }}
                onConfirm={confirmDeleteTask}
            />
            {genericConfirmDialog}

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
