import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import TaskCardNew from "../SuperAdmin/TaskCardNew";

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
};

export type ImplementationTaskRequestDTO = {
    name: string;
    hospitalId: number;
    picDeploymentId: number;
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

const API_ROOT = import.meta.env.VITE_API_URL || "";
import { FaHospital } from "react-icons/fa";
import { FiUser, FiLink, FiClock, FiTag } from "react-icons/fi";

// PageClients: admin area — always use admin endpoints
const apiBase = `${API_ROOT}/api/v1/admin/dev/tasks`;

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

function toISOOrNull(v?: string | Date | null) {
    if (!v) return null;
    try {
        return typeof v === "string" ? (v.trim() ? new Date(v).toISOString() : null) : v.toISOString();
    } catch {
        return null;
    }
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

// (removed legacy Select wrapper; use native select with classes for consistency)

type CanonicalStatus = "RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED";

const CANONICAL_STATUS_CLASSES: Record<CanonicalStatus, string> = {
    RECEIVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    IN_PROCESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    ISSUE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: "Chưa triển khai",
    RECEIVED: "Chưa triển khai",
    IN_PROGRESS: "Đang triển khai",
    API_TESTING: "Test thông api",
    INTEGRATING: "Tích hợp với viện",
    WAITING_FOR_DEV: "Chờ dev build update",
    ACCEPTED: "Nghiệm thu",
    COMPLETED: "Hoàn thành",
    DONE: "Hoàn thành",
    FINISHED: "Hoàn thành",
    HOAN_THANH: "Hoàn thành",
    HOÀN_THÀNH: "Hoàn thành",
    ISSUE: "Gặp sự cố",
    FAILED: "Gặp sự cố",
    ERROR: "Gặp sự cố",
    PENDING: "Chờ xử lý",
    CANCELLED: "Hủy",
    CANCELED: "Hủy",
};

const STATUS_CANONICAL_MAP: Record<string, CanonicalStatus> = {
    NOT_STARTED: "RECEIVED",
    RECEIVED: "RECEIVED",
    PENDING: "RECEIVED",
    IN_PROGRESS: "IN_PROCESS",
    API_TESTING: "IN_PROCESS",
    INTEGRATING: "IN_PROCESS",
    WAITING_FOR_DEV: "IN_PROCESS",
    IN_PROCESS: "IN_PROCESS",
    ACCEPTED: "COMPLETED",
    COMPLETED: "COMPLETED",
    DONE: "COMPLETED",
    FINISHED: "COMPLETED",
    HOAN_THANH: "COMPLETED",
    HOÀN_THÀNH: "COMPLETED",
    TRANSFERRED: "COMPLETED",
    ISSUE: "ISSUE",
    FAILED: "ISSUE",
    ERROR: "ISSUE",
    CANCELLED: "CANCELLED",
    CANCELED: "CANCELLED",
};

const STATUS_FILTER_VALUES = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "API_TESTING",
    "INTEGRATING",
    "WAITING_FOR_DEV",
    "ACCEPTED",
] as const;

function formatStatusKey(status?: string | null) {
    if (!status) return "";
    return status.toString().trim().toUpperCase().replace(/\s+/g, "_");
}

function normalizeStatus(status?: string | null): CanonicalStatus | undefined {
    const key = formatStatusKey(status);
    return (key && STATUS_CANONICAL_MAP[key]) || undefined;
}

function statusLabel(status?: string | null) {
    const key = formatStatusKey(status);
    if (!key) return status ? String(status) : "";
    return STATUS_LABELS[key] || String(status);
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = STATUS_FILTER_VALUES.map((value) => ({
    value,
    label: statusLabel(value),
}));

function statusBadgeClasses(status?: string | null) {
    const normalized = normalizeStatus(status);
    return normalized ? CANONICAL_STATUS_CLASSES[normalized] : CANONICAL_STATUS_CLASSES.CANCELLED;
}

function isCompletionStatus(status?: string | null) {
    return normalizeStatus(status) === "COMPLETED";
}

function toDatetimeLocalInput(value?: string | null) {
    if (!value) return "";
    try {
        const raw = String(value).trim();
        if (!raw) return "";
        const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
        let date: Date;
        if (hasTimezone) {
            date = new Date(raw);
        } else {
            const match = raw.match(
                /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
            );
            if (match) {
                const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
                date = new Date(
                    Date.UTC(
                        Number(y),
                        Number(m) - 1,
                        Number(d),
                        Number(hh),
                        Number(mm),
                        Number(ss)
                    )
                );
            } else {
                date = new Date(raw);
            }
        }
        if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
        const pad = (n: number) => String(n).padStart(2, "0");
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
        return "";
    }
}

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className || "w-4 h-4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}
// Chevron icons removed; pagination uses text arrows/characters to avoid unused symbol warnings

// formatStt removed - cards now rendered by TaskCardNew which shows id

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
}: {
    label: string;
    placeholder?: string;
    required?: boolean;
    fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
    value: { id: number; name: string } | null;
    onChange: (v: { id: number; name: string } | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [highlight, setHighlight] = useState<number>(-1);

    // debounce search
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

    useEffect(() => {
        if (open) {
            // preload lần đầu
            if (!options.length && !q.trim()) {
                (async () => {
                    setLoading(true);
                    try {
                        const res = await fetchOptions("");
                        setOptions(res);
                    } finally {
                        setLoading(false);
                    }
                })();
            }
        }
    }, [open]); // eslint-disable-line

    // đóng dropdown khi scroll để tránh đè layout
    useEffect(() => {
        const onScroll = () => setOpen(false);
        if (open) {
            window.addEventListener("scroll", onScroll, { passive: true });
        }
        return () => window.removeEventListener("scroll", onScroll as any);
    }, [open]);

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
                    onBlur={() => setOpen(false)}
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
                        {loading && (
                            <div className="px-3 py-2 text-sm text-gray-500">Đang tải...</div>
                        )}
                        {!loading && options.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
                        )}
                        {!loading &&
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
}: {
    open: boolean;
    onClose: () => void;
    initial?: Partial<ImplementationTaskRequestDTO> & { id?: number; hospitalName?: string | null; picDeploymentName?: string | null };
    onSubmit: (payload: ImplementationTaskRequestDTO, id?: number) => Promise<void>;
}) {
    // ===== Fetchers cho RemoteSelect =====
    const searchHospitals = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/admin/hospitals/search?name=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((h: { id?: number; label?: string; name?: string }) => ({ id: Number(h.id), name: String(h.label ?? h.name ?? h?.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
        },
        []
    );

    const searchPICs = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/admin/users/search?name=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((u: { id?: number; label?: string; name?: string }) => ({ id: Number(u.id), name: String(u.label ?? u.name ?? u?.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
        },
        []
    );

    const searchAgencies = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/admin/agencies/search?search=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((a: { id?: number; label?: string; name?: string }) => ({ id: Number(a.id), name: String(a.label ?? a.name ?? a?.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
        },
        []
    );

    const searchHisSystems = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/admin/his/search?search=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((h: { id?: number; label?: string; name?: string }) => ({ id: Number(h.id), name: String(h.label ?? h.name ?? h?.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
        },
        []
    );

    const searchHardwares = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/admin/hardware/search?search=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((h: { id?: number; label?: string; name?: string }) => ({ id: Number(h.id), name: String(h.label ?? h.name ?? h?.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name);
        },
        []
    );

    const [model, setModel] = useState<ImplementationTaskRequestDTO>(() => {
        const isNew = !(initial?.id);
        const nowIso = new Date().toISOString();
        const rawStatus = typeof initial?.status === "string" && initial.status.trim() ? initial.status : "NOT_STARTED";
        const normalizedStatus = rawStatus.toString().trim().toUpperCase();
        const completionDefault = isCompletionStatus(rawStatus)
            ? (initial?.completionDate ?? nowIso)
            : (initial?.completionDate ?? "");
        return {
            name: initial?.name || "",
            hospitalId: (initial?.hospitalId as number) || 0,
            picDeploymentId: (initial?.picDeploymentId as number) || 0,
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
    const [picOpt, setPicOpt] = useState<{ id: number; name: string } | null>(() => {
        const id = (initial?.picDeploymentId as number) || 0;
        const nm = (initial?.picDeploymentName as string) || "";
        return id ? { id, name: nm || String(id) } : null;
    });
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

    useEffect(() => {
        if (open) {
            const isNew = !(initial?.id);
            const nowIso = new Date().toISOString();
            const rawStatus = typeof initial?.status === "string" && initial.status.trim() ? initial.status : "NOT_STARTED";
            const normalizedStatus = rawStatus.toString().trim().toUpperCase();
            const completionDefault = isCompletionStatus(rawStatus)
                ? (initial?.completionDate ?? nowIso)
                : (initial?.completionDate ?? "");

            setModel({
                name: initial?.name || "",
                hospitalId: (initial?.hospitalId as number) || 0,
                picDeploymentId: (initial?.picDeploymentId as number) || 0,
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
            });

            const hid = (initial?.hospitalId as number) || 0;
            const hnm = (initial?.hospitalName as string) || "";
            setHospitalOpt(hid ? { id: hid, name: hnm || String(hid) } : null);

            const pid = (initial?.picDeploymentId as number) || 0;
            const pnm = (initial?.picDeploymentName as string) || "";
            setPicOpt(pid ? { id: pid, name: pnm || String(pid) } : null);
            const aid = (initial?.agencyId as number) || 0;
            setAgencyOpt(aid ? { id: aid, name: String(aid) } : null);

            const hid2 = (initial?.hisSystemId as number) || 0;
            setHisOpt(hid2 ? { id: hid2, name: String(hid2) } : null);

            const hwid = (initial?.hardwareId as number) || 0;
            setHardwareOpt(hwid ? { id: hwid, name: String(hwid) } : null);
        }
    }, [open, initial]);

    // Khi sửa: resolve tên cho Agency/HIS/Hardware nếu chỉ có ID
    useEffect(() => {
        if (!open) return;
        async function resolveById(
            id: number | null | undefined,
            setOpt: (v: { id: number; name: string } | null) => void,
            detailPath: string,
            nameKeys: string[]
        ) {
            if (!id || id <= 0) return;

            const current = ((): { id: number; name: string } | null => {
                if (setOpt === setAgencyOpt) return agencyOpt;
                if (setOpt === setHisOpt) return hisOpt;
                if (setOpt === setHardwareOpt) return hardwareOpt;
                return null;
            })();
            if (current && current.name && current.name !== String(id)) return;

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

            // 1) Thử endpoint chi tiết
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
            } catch { /* ignore */ }

            // 2) Fallback: query list theo từ khóa và khớp id
            try {
                const res = await fetch(`${API_ROOT}${detailPath}?search=${encodeURIComponent(String(id))}&page=0&size=50`, { headers: authHeaders(), credentials: "include" });
                if (res.ok) {
                    const obj = await res.json();
                    const list = Array.isArray(obj?.content) ? obj.content : Array.isArray(obj) ? obj : [];
                    const found = list.find((it: any) => Number(it?.id) === Number(id));
                    if (found) {
                        const name = extractName(found) || String((found as any).name ?? found[id]);
                        if (name) {
                            setOpt({ id, name });
                            return;
                        }
                    }
                }
            } catch { /* ignore */ }

            // 3) Last resort: dùng search loaders đã có
            try {
                const fetcher = setOpt === setAgencyOpt ? searchAgencies : setOpt === setHisOpt ? searchHisSystems : searchHardwares;
                const opts: Array<{ id: number; name: string }> = await fetcher("");
                const found = opts.find((o: { id: number; name: string }) => o.id === id);
                if (found) setOpt(found);
            } catch { /* ignore */ }
        }

        resolveById((initial?.agencyId as number) || null, setAgencyOpt, "/api/v1/admin/agencies", ["name", "agencyName", "label"]);
        resolveById((initial?.hisSystemId as number) || null, setHisOpt, "/api/v1/admin/his", ["name", "hisName", "label"]);
        resolveById((initial?.hardwareId as number) || null, setHardwareOpt, "/api/v1/admin/hardware", ["name", "hardwareName", "label"]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, agencyOpt?.name, hisOpt?.name, hardwareOpt?.name]);

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
        if (!model.name?.trim()) {
            toast.error("Tên dự án không được để trống");
            return;
        }
        if (!hospitalOpt?.id) {
            toast.error("Bệnh viện không được để trống");
            return;
        }
        if (!picOpt?.id) {
            toast.error("Người phụ trách không được để trống");
            return;
        }

        const normalizedStatus = (model.status || "NOT_STARTED").toString().trim().toUpperCase();

        const isNew = !(initial?.id);
        const startDateRaw = model.startDate || (isNew ? new Date().toISOString() : "");
        const completionRaw = isCompletionStatus(normalizedStatus)
            ? (model.completionDate && String(model.completionDate).trim() ? model.completionDate : new Date().toISOString())
            : "";

        const payload: ImplementationTaskRequestDTO = {
            ...model,
            hospitalId: hospitalOpt.id,
            picDeploymentId: picOpt.id,
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
                        <form onSubmit={handleSubmit} className="px-6 pt-0 pb-6 grid gap-4 max-h-[80vh] overflow-y-auto no-scrollbar">
                            <div className="sticky top-0 z-[100] -mx-3 px-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                                <div className="flex items-center justify-between py-3">
                                    <h3 className="text-lg font-semibold">{initial?.id ? (initial?.name || "") : "Tạo tác vụ"}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Tên dự án" required>
                                    <TextInput
                                        value={model.name}
                                        onChange={(e) => setModel((s) => ({ ...s, name: e.target.value }))}
                                        placeholder="Nhập tên dự án"
                                    />
                                </Field>

                                {/* Bệnh viện theo TÊN */}
                                <RemoteSelect
                                    label="Bệnh viện"
                                    required
                                    placeholder="Nhập tên bệnh viện để tìm…"
                                    fetchOptions={searchHospitals}
                                    value={hospitalOpt}
                                    onChange={setHospitalOpt}
                                />

                                {/* PIC theo TÊN */}
                                <RemoteSelect
                                    label="Người phụ trách ("
                                    required
                                    placeholder="Nhập tên người phụ trách để tìm…"
                                    fetchOptions={searchPICs}
                                    value={picOpt}
                                    onChange={setPicOpt}
                                />

                                <Field label="Số lượng">
                                    <TextInput
                                        type="number"
                                        value={model.quantity ?? ""}
                                        onChange={(e) => setModel((s) => ({ ...s, quantity: e.target.value ? Number(e.target.value) : null }))}
                                    />
                                </Field>
                                <RemoteSelect
                                    label="Agency"
                                    placeholder="Nhập tên agency để tìm…"
                                    fetchOptions={searchAgencies}
                                    value={agencyOpt}
                                    onChange={(v) => { setAgencyOpt(v); setModel((s) => ({ ...s, agencyId: v ? v.id : null })); }}
                                />
                                <RemoteSelect
                                    label="HIS System"
                                    placeholder="Nhập tên HIS để tìm…"
                                    fetchOptions={searchHisSystems}
                                    value={hisOpt}
                                    onChange={(v) => { setHisOpt(v); setModel((s) => ({ ...s, hisSystemId: v ? v.id : null })); }}
                                />
                                <RemoteSelect
                                    label="Hardware"
                                    placeholder="Nhập tên hardware để tìm…"
                                    fetchOptions={searchHardwares}
                                    value={hardwareOpt}
                                    onChange={(v) => { setHardwareOpt(v); setModel((s) => ({ ...s, hardwareId: v ? v.id : null })); }}
                                />
                                {/* <Field label="API URL">
                                    <TextInput
                                        value={model.apiUrl ?? ""}
                                        onChange={(e) => setModel((s) => ({ ...s, apiUrl: e.target.value }))}
                                        placeholder="https://..."
                                    />
                                </Field> */}
                                {/* <Field label="Trạng thái API Test">
                                    <TextInput
                                        value={model.apiTestStatus ?? ""}
                                        onChange={(e) => setModel((s) => ({ ...s, apiTestStatus: e.target.value }))}
                                        placeholder="PASSED / FAILED / PENDING..."
                                    />
                                </Field> */}
                                <Field label="BHYT Port Check Info">
                                    <TextInput
                                        value={model.bhytPortCheckInfo ?? ""}
                                        onChange={(e) => setModel((s) => ({ ...s, bhytPortCheckInfo: e.target.value }))}
                                    />
                                </Field>
                                <Field label="Trạng thái" required>
                                    <select
                                        className={clsx(
                                            "h-10 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 outline-none",
                                            "focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                                        )}
                                        value={model.status ?? ""}
                                        onChange={(e) => {
                                            const rawValue = (e.target as HTMLSelectElement).value || "NOT_STARTED";
                                            setModel((s) => {
                                                const nextStatus = rawValue || "NOT_STARTED";
                                                const nowIso = new Date().toISOString();
                                                const wasCompleted = isCompletionStatus(s.status);
                                                const willBeCompleted = isCompletionStatus(nextStatus);
                                                const nextCompletion = willBeCompleted
                                                    ? (s.completionDate && s.completionDate.toString().trim() ? s.completionDate : nowIso)
                                                    : (!willBeCompleted && wasCompleted ? "" : s.completionDate ?? "");
                                                return {
                                                    ...s,
                                                    status: nextStatus,
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

// Chi tiết (Detail) modal
// =====================
// DetailModal (đẹp + chuẩn bố cục 2 cột, màu sắc rõ ràng)
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
    if (!open || !item) return null;

    const fmt = (d?: string | null) =>
        d ? new Date(d).toLocaleString("vi-VN") : "—";

    // Tô màu badge theo trạng thái
    const statusBadge = (status?: string | null) =>
        `px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${statusBadgeClasses(status)}`;

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
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        📋 Chi tiết tác vụ DEV
                    </h2>
                    {/* <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition"
                    >
                        ✕
                    </button> */}
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 text-sm text-gray-800 dark:text-gray-200">
                    {/* Grid Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
                        <Info icon={<FiTag />} label="Tên" value={item.name} />
                        <Info icon={<FaHospital />} label="Bệnh viện" value={item.hospitalName} />
                        <Info icon={<FiUser />} label="Người phụ trách" value={item.picDeploymentName} />

                        <Info
                            icon={<FiTag />}
                            label="Trạng thái"
                            value={(
                                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusBadge(item.status)}`}>
                                    {statusLabel(item.status)}
                                </span>
                            )}
                        />

                        <Info
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
                        />
                        <Info icon={<FiTag />} label="API Test" value={item.apiTestStatus || "—"} />
                        <Info icon={<FiTag />} label="Số lượng" value={item.quantity ?? "—"} />
                        <Info icon={<FiClock />} label="Deadline" value={fmt(item.deadline)} />
                        <Info icon={<FiClock />} label="Ngày bắt đầu" value={fmt(item.startDate)} />
                        <Info icon={<FiClock />} label="Ngày nghiệm thu" value={fmt(item.acceptanceDate)} />
                        <Info icon={<FiClock />} label="Ngày hoàn thành" value={fmt(item.completionDate)} />
                        <Info icon={<FiClock />} label="Tạo lúc" value={fmt(item.createdAt)} />
                        <Info icon={<FiClock />} label="Cập nhật lúc" value={fmt(item.updatedAt)} />
                    </div>

                    {/* Additional request */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                        <p className="text-gray-500 mb-2">Nội dung công việc:</p>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-gray-800 dark:text-gray-300 min-h-[60px] whitespace-pre-wrap break-words">
                            {item.additionalRequest || "—"}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-10 dark:bg-gray-800/40">
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


// Component con để render label + value cân đối
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
            <div className="flex items-start gap-3">
                {icon && <div className="min-w-[36px] flex items-center justify-center text-gray-500">{icon}</div>}
                <div className="flex-1">
                    <div className="min-w-[140px] font-semibold text-gray-900 dark:text-gray-100">{label}</div>
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
                <div className="text-gray-700 dark:text-gray-300 flex-1 text-right break-words">{value ?? "—"}</div>
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
    const [sortBy, setSortBy] = useState("id");
    const [sortDir, setSortDir] = useState("asc");
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(10);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [enableItemAnimation, setEnableItemAnimation] = useState<boolean>(true);
    const [hospitalQuery, setHospitalQuery] = useState<string>("");
    const [hospitalOptions, setHospitalOptions] = useState<Array<{ id: number; label: string }>>([]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailItem, setDetailItem] = useState<ImplementationTaskResponseDTO | null>(null);
    const [hospitalCount, setHospitalCount] = useState<number | null>(null);
    const [hospitalCountLoading, setHospitalCountLoading] = useState<boolean>(false);
    const searchDebounce = useRef<number | null>(null);
    const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

    const readStored = <T = unknown>(key: string): T | null => {
        try {
            const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    };

    const currentUser = readStored<{ id?: number; username?: string; team?: string; roles?: unknown[] }>("user") || null;
    const userRoles = (readStored<string[]>("roles") || (currentUser?.roles as string[] | undefined)) || [];
    const userTeam = (currentUser?.team || "").toString().toUpperCase();
    const isSuperAdmin = userRoles.some((r: any) => (typeof r === "string" ? r : (r as any).roleName)?.toUpperCase() === "SUPERADMIN");
    const filtered = useMemo(() => data, [data]);

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

            const url = `${apiBase}?${params.toString()}`;
            const res = await fetch(url, { method: "GET", headers: authHeaders(), credentials: "include" });
            if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
            const resp = await res.json();
            const items = Array.isArray(resp?.content) ? resp.content : Array.isArray(resp) ? resp : [];
            setData(items);
            if (resp && typeof resp.totalElements === "number") setTotalCount(resp.totalElements);
            else setTotalCount(Array.isArray(resp) ? resp.length : null);

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

    const fetchHospitalCount = useCallback(async () => {
        setHospitalCountLoading(true);
        try {
            const pageSize = 500;
            const maxPages = 40; // safety guard (~20k records)
            const unique = new Set<string>();
            let pageCursor = 0;

            while (pageCursor < maxPages) {
                const params = new URLSearchParams({
                    page: String(pageCursor),
                    size: String(pageSize),
                    sortBy: "id",
                    sortDir: "asc",
                });
                const url = `${apiBase}?${params.toString()}`;
                const res = await fetch(url, {
                    method: "GET",
                    headers: authHeaders(),
                    credentials: "include",
                });
                if (!res.ok) break;
                const payload = await res.json();
                const items = Array.isArray(payload?.content)
                    ? payload.content
                    : Array.isArray(payload)
                    ? payload
                    : [];
                for (const item of items as Array<Record<string, unknown>>) {
                    const name = String(item?.hospitalName ?? "").trim();
                    if (name) unique.add(name);
                }
                const totalElements =
                    typeof payload?.totalElements === "number"
                        ? (payload.totalElements as number)
                        : null;
                if (items.length < pageSize) {
                    break;
                }
                if (totalElements !== null && (pageCursor + 1) * pageSize >= totalElements) {
                    break;
                }
                pageCursor += 1;
            }

            setHospitalCount(unique.size);
        } catch {
            setHospitalCount(null);
        } finally {
            setHospitalCountLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(); /* eslint-disable-line */ }, []);
    useEffect(() => { fetchList(); /* eslint-disable-line */ }, [page, size]);
    useEffect(() => { setPage(0); }, [searchTerm, statusFilter, sortBy, sortDir]);
    useEffect(() => { fetchHospitalCount(); }, [fetchHospitalCount]);
    useEffect(() => {
        if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
        searchDebounce.current = window.setTimeout(() => { fetchList(); }, 600);
        return () => { if (searchDebounce.current) window.clearTimeout(searchDebounce.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm]);
    useEffect(() => { fetchList(); /* eslint-disable-line */ }, [statusFilter]);
    useEffect(() => { fetchList(); /* eslint-disable-line */ }, [sortBy, sortDir]);

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
        await fetchList();
        await fetchHospitalCount();
    };

    const handleDelete = async (id: number) => {
        const ok = await askConfirm({
            title: "Xóa công việc?",
            message: "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác.",
            variant: "danger",
            confirmLabel: "Xóa",
        });
        if (!ok) return;
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
        await fetchHospitalCount();
    };

    return (
        <div className="p-6 xl:p-10">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center">
                    <h1 className="text-3xl font-extrabold text-gray-900">Tác vụ DEV</h1>
                </div>
                {/* project name shown inside card; removed duplicate header pill */}
            </div>

            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

            <div className="mb-6 rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Thao tác</h3>
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
                                    onBlur={() => { /* keep search as-is */ }}
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
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                                Tổng task:
                                <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                                    {loading ? "..." : totalCount ?? data.length}
                                </span>
                            </span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                                Tổng bệnh viện:
                                <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                                    {hospitalCountLoading ? "..." : hospitalCount ?? 0}
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <select className="rounded-lg border px-3 py-2 text-sm border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(0); }}>
                                <option value="id">Sắp xếp theo: id</option>
                                <option value="hospitalName">Sắp xếp theo: bệnh viện</option>
                                <option value="deadline">Sắp xếp theo: deadline</option>
                            </select>
                            <select className="rounded-lg border px-3 py-2 text-sm border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900" value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                                <option value="asc">Tăng dần</option>
                                <option value="desc">Giảm dần</option>
                            </select>
                        </div>

                        {isSuperAdmin || userTeam === "DEV" ? (
                            <button
                                className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700 flex items-center gap-2"
                                onClick={() => { setEditing(null); setModalOpen(true); }}
                            >
                                <PlusIcon />
                                <span>Thêm mới</span>
                            </button>
                        ) : (
                            <button disabled className="rounded-xl bg-gray-200 text-gray-500 px-5 py-2 shadow-sm flex items-center gap-2" title="Không có quyền">
                                <PlusIcon />
                                <span>Thêm mới</span>
                            </button>
                        )}
                        
                    </div>
                </div>
            </div>

            <div>
                <style>{`
          @keyframes fadeInUp { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
        `}</style>

                <div className="space-y-3">
                    {loading && isInitialLoad ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse" aria-hidden="true">TAG</div>
                        </div>
                    ) : (
                        filtered.length === 0 ? (
                            <div className="px-4 py-6 text-center text-gray-500">Không có dữ liệu</div>
                        ) : (
                            filtered.map((row, idx) => (
                                <TaskCardNew
                                    key={row.id}
                                    task={row as any}
                                    idx={page * size + idx + 1}
                                    animate={enableItemAnimation}
                                    onOpen={(t) => { setDetailItem(t as any); setDetailOpen(true); }}
                                    onEdit={(t) => { setEditing(t as any); setModalOpen(true); }}
                                    onDelete={(id) => handleDelete(id)}
                                    canEdit={isSuperAdmin || userTeam === "DEV"}
                                    canDelete={isSuperAdmin || userTeam === "DEV"}
                                    statusLabelOverride={statusLabel}
                                    statusClassOverride={statusBadgeClasses}
                                />
                            ))
                        )
                    )}
                </div>
            </div>

                    <div className="mt-4 flex items-center justify-between py-3">
                        <div className="text-sm text-gray-600">
                            {totalCount === null ? (
                                <span>Hiển thị 0 trong tổng số 0 mục</span>
                            ) : (
                                (() => {
                                    const total = totalCount || 0;
                                    const from = page * size + 1;
                                    const to = Math.min((page + 1) * size, total);
                                    return <span>Hiển thị {from} đến {to} trong tổng số {total} mục</span>;
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

                                <button onClick={() => setPage((p) => Math.min(Math.max(0, Math.ceil((totalCount || 0) / size) - 1), p + 1))} disabled={(page + 1) * size >= (totalCount || 0)} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Tiếp">›</button>
                                <button onClick={() => setPage(Math.max(0, Math.ceil((totalCount || 0) / size) - 1))} disabled={(page + 1) * size >= (totalCount || 0)} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Cuối">»</button>
                            </div>
                        </div>
                    </div>

            <TaskFormModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                initial={editing as any || undefined}
                onSubmit={handleSubmit}
            />

            <DetailModal open={detailOpen} onClose={() => setDetailOpen(false)} item={detailItem} />
            {genericConfirmDialog}
        </div>
    );
};

export default ImplementationTasksPage;
