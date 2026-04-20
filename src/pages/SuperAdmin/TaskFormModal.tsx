/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { ImplementationTaskRequestDTO } from "../../api/superadmin.api";
import { TaskFormModalCuratorView } from "./TaskFormModalCuratorFragment";

const API_ROOT = import.meta.env.VITE_API_URL || "";

function authHeaders(extra?: Record<string, string>) {
    const token = localStorage.getItem("access_token");
    return {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extra || {}),
    };
}

function clsx(...arr: Array<string | false | undefined>) {
    return arr.filter(Boolean).join(" ");
}

/** Logged-in user for default PIC on new maintenance tasks (localStorage). */
function readStoredCurrentUser(): { id: number | null; name: string } {
    const parseNumber = (value: unknown): number | null => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
    };
    try {
        const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
        const storedUser = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        let id =
            storedUser && typeof storedUser === "object"
                ? parseNumber(storedUser.id ?? storedUser.userId)
                : null;
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
        if (!name && storedUser && typeof (storedUser as any).email === "string") {
            name = String((storedUser as any).email).trim();
        }
        return { id: id ?? null, name };
    } catch {
        return { id: null, name: "" };
    }
}

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

const CURATOR_INPUT =
    "box-border min-w-0 max-w-full h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal leading-snug text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100/90 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40";
const CURATOR_TEXTAREA =
    "box-border min-h-[120px] min-w-0 max-w-full w-full resize-y overflow-x-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-normal leading-snug text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100/90 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40";

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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { curator?: boolean }) {
    const { curator, className, ...rest } = props as React.SelectHTMLAttributes<HTMLSelectElement> & { curator?: boolean };
    return (
        <select
            {...rest}
            className={clsx(
                curator
                    ? `${CURATOR_INPUT} appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-10`
                    : "h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm font-normal leading-snug outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
                className || ""
            )}
            style={
                curator
                    ? {
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M8 9l4-4 4 4m0 6l-4 4-4-4'/%3E%3C/svg%3E")`,
                      }
                    : undefined
            }
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

// canonical map is defined elsewhere; avoid duplicate constants in this module

// Note: normalizeStatus is defined in other shared modules; avoid duplicate definition here to prevent unused symbol

// Extracted RemoteSelect component to top-level to avoid remounting on parent renders.
/** Curator maintenance: hospital (positive id) or HCC (negative id, label includes "(HCC)"). */
type FacilityPickerOption = { id: number; name: string; facilityType?: "HOSPITAL" | "HCC" };

async function fetchSuperadminHccFacilityOptions(term: string): Promise<FacilityPickerOption[]> {
    const res = await fetch(
        `${API_ROOT}/api/v1/superadmin/hcc-facilities?search=${encodeURIComponent(term)}&page=0&size=20`,
        { headers: authHeaders(), credentials: "include" }
    );
    if (!res.ok) return [];
    const payload = await res.json();
    const list = Array.isArray(payload?.content) ? payload.content : [];
    return list
        .map((f: { id?: number; name?: string }) => ({
            id: -Math.abs(Number(f.id)),
            name: `${String(f.name ?? f.id)} (HCC)`,
            facilityType: "HCC" as const,
        }))
        .filter((x: FacilityPickerOption) => Number.isFinite(x.id) && x.id !== 0 && x.name);
}

function filterStaticOptions(
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

function RemoteSelect({
    label,
    placeholder,
    fetchOptions,
    value,
    onChange,
    required,
    disabled,
    hideLabel,
    excludeIds,
    curator,
    trailing,
    fieldVariant,
    staticOptions,
    wrapSelectedLabel,
    /** With staticOptions: merge these results (e.g. HCC search) into the filtered static list. */
    remoteSupplement,
}: {
    label: string;
    placeholder?: string;
    fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
    value: { id: number; name: string } | null;
    onChange: (v: { id: number; name: string } | null) => void;
    required?: boolean;
    disabled?: boolean;
    hideLabel?: boolean;
    excludeIds?: number[];
    curator?: boolean;
    trailing?: "chevron" | "search";
    fieldVariant?: "default" | "curator";
    /** When set and non-empty, options are filtered from this page list (no API); still requires 2+ typed chars before showing matches. */
    staticOptions?: Array<{ id: number; name: string }>;
    /** When true, closed state shows the full selected label with wrapping (single-line inputs cannot wrap). */
    wrapSelectedLabel?: boolean;
    remoteSupplement?: (q: string) => Promise<Array<{ id: number; name: string }>>;
}) {
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [highlight, setHighlight] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Filter out excluded IDs from options
    const filteredOptions = React.useMemo(() => {
        if (!excludeIds || excludeIds.length === 0) return options;
        return options.filter(opt => !excludeIds.includes(opt.id));
    }, [options, excludeIds]);

    // Reset highlight when filtered options change
    React.useEffect(() => {
        if (highlight >= filteredOptions.length) {
            setHighlight(-1);
        }
    }, [filteredOptions.length, highlight]);

    const useStaticHospitalList = Boolean(staticOptions && staticOptions.length > 0);

    // Static list: full page hospitals, filter only after 2+ chars (same UX as API search); API mode: debounce + 2+ chars
    useEffect(() => {
        if (useStaticHospitalList && staticOptions) {
            if (!q.trim() || q.trim().length < 2) {
                setOptions([]);
                setLoading(false);
                return;
            }
            const filtered = filterStaticOptions(staticOptions, q);
            if (!remoteSupplement) {
                setOptions(filtered);
                setLoading(false);
                return;
            }
            let alive = true;
            setLoading(true);
            void (async () => {
                try {
                    const extra = await remoteSupplement(q.trim());
                    if (!alive) return;
                    setOptions([...filtered, ...(Array.isArray(extra) ? extra : [])]);
                } catch {
                    if (alive) setOptions(filtered);
                } finally {
                    if (alive) setLoading(false);
                }
            })();
            return () => {
                alive = false;
            };
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
                if (alive) setOptions(res);
            } finally {
                if (alive) setLoading(false);
            }
        }, 500);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [q, fetchOptions, staticOptions, useStaticHospitalList, remoteSupplement]);

    // KHÔNG load initial options khi mở - chỉ load khi user nhập ít nhất 2 ký tự
    // useEffect(() => {
    //     if (open && !prevOpenRef.current) {
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
    //     prevOpenRef.current = open;
    // }, [open, options.length, q, fetchOptions]);

    // Capture phase: parent dialogs use stopPropagation on bubble, which would block a bubble listener on document.
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
        <>
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
                        placeholder={placeholder || "Gõ để tìm..."}
                        value={(open || focused) ? q : value?.name || ""}
                        onChange={(e) => {
                            setQ(e.target.value);
                            if (!open) setOpen(true);
                        }}
                        onFocus={() => { setOpen(true); setFocused(true); }}
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
                {value && !open && (
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
                            "absolute z-50 mt-1 max-h-64 w-full overflow-y-auto border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900",
                            curator ? "rounded-lg border-slate-200" : "rounded-xl border-gray-200"
                        )}
                        onMouseLeave={() => setHighlight(-1)}
                        style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 #f1f5f9" }}
                    >
                        {filteredOptions.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                                {useStaticHospitalList
                                    ? q.trim().length < 2
                                        ? "Nhập ít nhất 2 ký tự để tìm kiếm"
                                        : "Không tìm thấy"
                                    : q.trim().length < 2
                                      ? "Nhập ít nhất 2 ký tự để tìm kiếm"
                                      : "Không tìm thấy"}
                            </div>
                        )}
                        {filteredOptions.length > 0 && filteredOptions.map((opt, idx) => (
                            <div key={opt.id} className={clsx("px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800", idx === highlight ? "bg-gray-100 dark:bg-gray-800" : "")} onMouseEnter={() => setHighlight(idx)} onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); setQ(""); }}>
                                {opt.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );

    const fv = fieldVariant ?? "default";

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

export default function TaskFormModal({
    open,
    onClose,
    initial,
    onSubmit,
    readOnly,
    excludeAccepted = false,
    transferred = false,
    curatorLayout = false,
    pageHospitalOptions,
}: {
    open: boolean;
    onClose: () => void;
    initial?: Partial<ImplementationTaskRequestDTO> & {
        id?: number;
        hospitalName?: string | null;
        picDeploymentName?: string | null;
        hccFacilityId?: number | null;
        hccFacilityName?: string | null;
    };
    onSubmit: (payload: ImplementationTaskRequestDTO, id?: number) => Promise<void>;
    readOnly?: boolean;
    excludeAccepted?: boolean;
    transferred?: boolean;
    /** Curator-style drawer + form chrome (maintenance task flows). */
    curatorLayout?: boolean;
    /** Hospitals from the maintenance hospital list page (id + display name). When provided, hospital field uses this list instead of search API. */
    pageHospitalOptions?: Array<{ id: number; name: string }>;
}) {
    // Fetchers for RemoteSelect (minimal: hospitals and PICs)
    const searchHospitals = useMemo(
        () => async (term: string) => {
            const url = `${API_ROOT}/api/v1/superadmin/hospitals/search?name=${encodeURIComponent(term)}`;
            const hospitalRes = await fetch(url, { headers: authHeaders(), credentials: "include" });
            const hospitals: FacilityPickerOption[] = hospitalRes.ok
                ? ((await hospitalRes.json()) as Array<{ id?: number; label?: string }>)
                      .map((h) => ({
                          id: Number(h.id),
                          name: String(h.label ?? h.id),
                          facilityType: "HOSPITAL" as const,
                      }))
                      .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.name)
                : [];
            if (!curatorLayout) {
                return hospitals;
            }
            const hccs = await fetchSuperadminHccFacilityOptions(term);
            return [...hospitals, ...hccs];
        },
        [curatorLayout]
    );

    const searchPICs = useMemo(
        () => async (term: string) => {
            // Backend doesn't filter by role in /users/search; filter client-side by name
            const url = `${API_ROOT}/api/v1/superadmin/users/search?name=${encodeURIComponent(term)}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return [];
            const list = await res.json();
            const mapped = Array.isArray(list)
                ? list.map((u: { id?: number; label?: string }) => ({ id: Number(u.id), name: String(u.label ?? u.id) }))
                : [];
            return mapped.filter((x: { id: number; name: string }) => Number.isFinite(x.id) && x.name) as Array<{ id: number; name: string }>;
        },
        []
    );

    // Hàm fetch thông tin user từ ID
    const fetchUserById = async (userId: number): Promise<{ id: number; name: string } | null> => {
        try {
            const url = `${API_ROOT}/api/v1/superadmin/users/${userId}`;
            const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
            if (!res.ok) return null;
            const user = await res.json();
            const name = user.fullName || user.fullname || user.name || user.username || user.email || String(userId);
            return { id: userId, name: String(name) };
        } catch {
            return null;
        }
    };

    // Removed: searchAgencies, searchHisSystems, searchHardwares as related fields are hidden

    const [model, setModel] = useState<Partial<ImplementationTaskRequestDTO>>(() => ({
        name: initial?.name || "",
        hospitalId: initial?.hospitalId || 0,
        picDeploymentId: initial?.picDeploymentId || 0,
        // removed optional fields from form (kept nulls on submit)
        apiTestStatus: initial?.apiTestStatus ?? "",
        // removed from form
        additionalRequest: initial?.additionalRequest ?? "",
        // removed from form
        deadline: initial?.deadline ?? "",
        completionDate: initial?.completionDate ?? "",
        status: initial?.status ?? "",
        startDate: initial?.startDate ?? "",
    }));

    const [hospitalOpt, setHospitalOpt] = useState<FacilityPickerOption | null>(() => {
        const hccId = Number((initial as { hccFacilityId?: number | null } | undefined)?.hccFacilityId || 0);
        if (hccId > 0) {
            const nm =
                String((initial as { hccFacilityName?: string | null } | undefined)?.hccFacilityName || "").trim() ||
                String(initial?.hospitalName || "").trim();
            return { id: -hccId, name: nm ? `${nm} (HCC)` : `HCC #${hccId}`, facilityType: "HCC" };
        }
        const id = initial?.hospitalId || 0;
        const nm = initial?.hospitalName || "";
        return id ? { id, name: nm || String(id), facilityType: "HOSPITAL" } : null;
    });
    const [picOpts, setPicOpts] = useState<Array<{ id: number; name: string; _uid: string }>>(() => {
        const id = initial?.picDeploymentId || 0;
        const nm = initial?.picDeploymentName || "";
        return id ? [{ id, name: nm || String(id), _uid: `pic-${Date.now()}-${id}` }] : [];
    });
    const [currentPicInput, setCurrentPicInput] = useState<{ id: number; name: string } | null>(null);
    // Removed: agencyOpt, hisOpt, hardwareOpt states

    // Helper function to normalize status (similar to admin form)
    function normalizeStatus(status?: string | null): "RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED" | undefined {
        if (!status) return undefined;
        const s = String(status).trim().toUpperCase();
        if (s === "RECEIVED" || s === "NOT_STARTED") return "RECEIVED";
        if (s === "IN_PROCESS" || s === "IN_PROGRESS" || s === "API_TESTING" || s === "INTEGRATING") return "IN_PROCESS";
        if (s === "COMPLETED" || s === "WAITING_FOR_DEV" || s === "ACCEPTED") return "COMPLETED";
        if (s === "ISSUE" || s === "WAITING_FOR_DEV") return "ISSUE";
        if (s === "CANCELLED") return "CANCELLED";
        return undefined;
    }

    // Init form only when modal first opens or when the task ID actually changes.
    const prevOpenRef = React.useRef<boolean>(false);
    const prevInitialIdRef = React.useRef<number | undefined>(initial?.id);
    useEffect(() => {
        const shouldInit = open && (!prevOpenRef.current || prevInitialIdRef.current !== initial?.id);
        if (!shouldInit) {
            prevOpenRef.current = open;
            prevInitialIdRef.current = initial?.id;
            return;
        }

        const isNew = !(initial?.id);
        const normalizedStatus = normalizeStatus(initial?.status) ?? "RECEIVED";
        const completionDefault =
            normalizedStatus === "COMPLETED"
                ? (initial?.completionDate ? toLocalInputValue(initial.completionDate) : localInputFromDate(new Date()))
                : (initial?.completionDate ? toLocalInputValue(initial.completionDate) : "");
        const defaultStart = initial?.startDate ? toLocalInputValue(initial.startDate) : (isNew ? localInputFromDate(new Date()) : "");

        setModel({
            name: initial?.name || "",
            hospitalId: initial?.hospitalId || 0,
            picDeploymentId: initial?.picDeploymentId || 0,
            apiTestStatus: initial?.apiTestStatus ?? "",
            additionalRequest: initial?.additionalRequest ?? "",
            deadline: initial?.deadline ? toLocalInputValue(initial.deadline) : "",
            completionDate: completionDefault,
            status: normalizedStatus,
            startDate: defaultStart,
        });

        const hccInit = Number((initial as { hccFacilityId?: number | null } | undefined)?.hccFacilityId || 0);
        if (hccInit > 0) {
            const hccNm =
                String((initial as { hccFacilityName?: string | null } | undefined)?.hccFacilityName || "").trim() ||
                String(initial?.hospitalName || "").trim();
            setHospitalOpt({
                id: -hccInit,
                name: hccNm ? `${hccNm} (HCC)` : `HCC #${hccInit}`,
                facilityType: "HCC",
            });
        } else {
            const hid = initial?.hospitalId || 0;
            const hnm = initial?.hospitalName || "";
            setHospitalOpt(hid ? { id: hid, name: hnm || String(hid), facilityType: "HOSPITAL" } : null);
        }

        const pid = initial?.picDeploymentId || 0;
        const pnm = initial?.picDeploymentName || "";

        // Ưu tiên lấy từ picDeploymentIds trong response (backend mới)
        // Fallback về parse từ additionalRequest (backward compatible với dữ liệu cũ)
        let allPicIds: number[] = [];

        // Nếu có picDeploymentIds trong response, dùng nó (backend mới)
        if (initial && 'picDeploymentIds' in initial && Array.isArray((initial as any).picDeploymentIds)) {
            const responsePicIds = (initial as any).picDeploymentIds as number[];
            allPicIds = [...new Set([pid, ...responsePicIds].filter(id => id && id > 0))];
        } else {
            // Fallback: Parse từ additionalRequest (backward compatible)
            const additionalReq = initial?.additionalRequest || "";
            if (pid) allPicIds.push(pid);
            const picIdsMatches = additionalReq.matchAll(/\[PIC_IDS:\s*([^\]]+)\]/g);
            for (const match of picIdsMatches) {
                if (match[1]) {
                    const ids = match[1].split(',').map(id => Number(id.trim())).filter(id => !isNaN(id) && id > 0);
                    allPicIds.push(...ids);
                }
            }
            allPicIds = pid ? [pid, ...allPicIds.filter(id => id !== pid)] : [...new Set(allPicIds)];
        }

        if (allPicIds.length > 0) {
            const initialPicOpts = allPicIds.map((id, idx) => ({
                id,
                name: idx === 0 && pnm ? pnm : String(id),
                _uid: `pic-${Date.now()}-${id}-${idx}`
            }));
            setPicOpts(initialPicOpts);

            if (allPicIds.length > 1) {
                Promise.all(
                    allPicIds.slice(1).map(async (id) => {
                        const userInfo = await fetchUserById(id);
                        return userInfo ? { id, name: userInfo.name } : null;
                    })
                ).then((results) => {
                    setPicOpts((prev) => {
                        return prev.map((pic, idx) => {
                            if (idx === 0) return pic;
                            const fetched = results[idx - 1];
                            return fetched ? { ...pic, name: fetched.name } : pic;
                        });
                    });
                }).catch(() => {
                    // ignore
                });
            }
        } else {
            if (
                isNew &&
                curatorLayout &&
                pageHospitalOptions &&
                pageHospitalOptions.length > 0
            ) {
                const cu = readStoredCurrentUser();
                if (cu.id) {
                    setPicOpts([
                        {
                            id: cu.id,
                            name: cu.name || String(cu.id),
                            _uid: `pic-${Date.now()}-${cu.id}-primary`,
                        },
                    ]);
                } else {
                    setPicOpts([]);
                }
            } else {
                setPicOpts([]);
            }
        }
        setCurrentPicInput(null);

        prevOpenRef.current = open;
        prevInitialIdRef.current = initial?.id;
    }, [open, initial?.id, curatorLayout, pageHospitalOptions]);

    // When editing: resolve names for Agency/HIS/Hardware if we only have IDs
    // Removed: resolveById logic for agency/his/hardware

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const pad = (n: number) => String(n).padStart(2, "0");

    function toLocalISOString(date: Date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const hh = pad(date.getHours());
        const mm = pad(date.getMinutes());
        const ss = pad(date.getSeconds());
        return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    }

    function localInputFromDate(date: Date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

    function toLocalInputValue(v?: string | null) {
        if (!v) return "";
        try {
            const raw = String(v).trim();
            if (!raw) return "";

            // If has timezone info (Z or +/-), parse and convert to local
            if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
                const date = new Date(raw);
                if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
                return localInputFromDate(date);
            }

            // If already in datetime-local format (YYYY-MM-DDTHH:mm), return as is
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
                return raw.slice(0, 16);
            }

            // Try to parse as ISO and convert
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) {
                return localInputFromDate(parsed);
            }

            return raw;
        } catch {
            return "";
        }
    }

    const [submitting, setSubmitting] = useState(false);

    const removePic = React.useCallback((uid: string) => {
        setPicOpts((prev) => prev.filter(p => p._uid !== uid));
    }, []);

    const makePicPrimary = React.useCallback((uid: string) => {
        setPicOpts((prev) => {
            const idx = prev.findIndex((p) => p._uid === uid);
            if (idx < 0 || idx === 0) return prev;
            const chosen = prev[idx];
            return [chosen, ...prev.filter((_, i) => i !== idx)];
        });
    }, []);

    if (!open) return null;

    const fromBusinessContract =
        Boolean((initial as any)?.fromBusinessContract) || Boolean((initial as any)?.businessProjectId);

    const lockHospital =
        fromBusinessContract ||
        (!initial?.id &&
            (Boolean(initial?.hospitalId) ||
                Boolean(initial?.hospitalName) ||
                Boolean((initial as { hccFacilityId?: number | null } | undefined)?.hccFacilityId)));

    // Determine if this task has been transferred to maintenance.
    // Sources: explicit prop, initial payload flag, or status === 'TRANSFERRED'
    const isTransferred = Boolean(
        transferred ||
        (initial && ((initial as any).transferredToMaintenance || String(initial.status ?? "").toUpperCase() === "TRANSFERRED"))
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!model.name?.trim()) {
            toast.error("Tên công việc không được để trống");
            return;
        }
        if (!hospitalOpt?.id) {
            toast.error(curatorLayout ? "Vui lòng chọn bệnh viện hoặc cơ sở HCC" : "Bệnh viện không được để trống");
            return;
        }
        if (picOpts.length === 0) {
            toast.error("Vui lòng thêm ít nhất một người phụ trách");
            return;
        }
        if (!model.status) {
            toast.error("Trạng thái không được để trống");
            return;
        }

        // Use startDate from model if provided, otherwise use current date for new tasks
        const startDateIso = toISOOrNull(model.startDate);
        const finalStartDate = startDateIso ?? (initial?.id ? null : toLocalISOString(new Date()));

        // Use completionDate from model if provided, otherwise auto-set if status is COMPLETED
        const normalizedStatus = normalizeStatus(model.status);
        const completionIso = toISOOrNull(model.completionDate);
        const derivedCompletion = completionIso ?? (normalizedStatus === "COMPLETED" ? toLocalISOString(new Date()) : null);

        // Tạo payload với PIC đầu tiên làm chính
        // Loại bỏ [PIC_IDS: ...] cũ khỏi additionalRequest (backward compatible với dữ liệu cũ)
        let cleanedAdditionalRequest = model.additionalRequest || "";
        if (cleanedAdditionalRequest) {
            // Loại bỏ tất cả các [PIC_IDS: ...] cũ vì giờ dùng picDeploymentIds
            cleanedAdditionalRequest = cleanedAdditionalRequest.replace(/\[PIC_IDS:\s*[^\]]+\]\s*/g, "").trim();
        }

        // Tạo danh sách tất cả PIC IDs (bao gồm PIC chính + các PIC bổ sung)
        const allPicIds = picOpts.map(p => p.id);

        const isHccFacility =
            curatorLayout &&
            (hospitalOpt.facilityType === "HCC" || hospitalOpt.id < 0);
        const payload =
            curatorLayout
                ? {
                      name: model.name!.trim(),
                      hospitalId: isHccFacility ? null : hospitalOpt.id,
                      hccFacilityId: isHccFacility ? Math.abs(hospitalOpt.id) : null,
                      picDeploymentId: picOpts[0].id,
                      picDeploymentIds: allPicIds,
                      agencyId: null,
                      hisSystemId: null,
                      hardwareId: null,
                      quantity: null,
                      apiTestStatus: model.apiTestStatus ?? null,
                      bhytPortCheckInfo: null,
                      additionalRequest: cleanedAdditionalRequest || null,
                      apiUrl: null,
                      deadline: toISOOrNull(model.deadline) ?? null,
                      completionDate: derivedCompletion,
                      status: model.status ?? null,
                      startDate: finalStartDate,
                  }
                : {
                      name: model.name!.trim(),
                      hospitalId: hospitalOpt.id,
                      picDeploymentId: picOpts[0].id,
                      picDeploymentIds: allPicIds,
                      agencyId: null,
                      hisSystemId: null,
                      hardwareId: null,
                      quantity: null,
                      apiTestStatus: model.apiTestStatus ?? null,
                      bhytPortCheckInfo: null,
                      additionalRequest: cleanedAdditionalRequest || null,
                      apiUrl: null,
                      deadline: toISOOrNull(model.deadline) ?? null,
                      completionDate: derivedCompletion,
                      status: model.status ?? null,
                      startDate: finalStartDate,
                  };

        try {
            setSubmitting(true);
            // console.log('Submitting with PICs:', picOpts.map(p => ({ id: p.id, name: p.name })));
            // console.log('Payload additionalRequest:', payload.additionalRequest);
            await onSubmit(payload as ImplementationTaskRequestDTO, initial?.id);
            // Không hiển thị toast ở đây vì handleSubmit trong implementsuper-task.tsx đã có toast rồi
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(msg || "Lỗi lưu");
        } finally {
            setSubmitting(false);
        }
    };

    // Minimal RemoteSelect UI (inline simple dropdown)
    // Inner RemoteSelect removed - top-level RemoteSelect is used instead to avoid remounts

    if (curatorLayout) {
        return (
            <TaskFormModalCuratorView
                onClose={onClose}
                onSubmit={handleSubmit}
                submitting={submitting}
                readOnly={readOnly}
                initial={initial}
                fromBusinessContract={fromBusinessContract}
                lockHospital={lockHospital}
                isTransferred={isTransferred}
                model={model}
                setModel={setModel}
                hospitalOpt={hospitalOpt}
                setHospitalOpt={setHospitalOpt}
                picOpts={picOpts}
                removePic={removePic}
                currentPicInput={currentPicInput}
                setCurrentPicInput={setCurrentPicInput}
                setPicOpts={setPicOpts}
                searchHospitals={searchHospitals}
                hospitalStaticOptions={pageHospitalOptions}
                hospitalRemoteSupplement={fetchSuperadminHccFacilityOptions}
                searchPICs={searchPICs}
                excludeAccepted={excludeAccepted}
                STATUS_OPTIONS={STATUS_OPTIONS}
                normalizeStatus={normalizeStatus}
                toLocalInputValue={toLocalInputValue}
                localInputFromDate={localInputFromDate}
                Field={Field}
                TextInput={TextInput}
                TextArea={TextArea}
                Select={Select}
                Button={Button}
                RemoteSelect={RemoteSelect}
                clsx={clsx}
                onMakePicPrimary={makePicPrimary}
            />
        );
    }

    return (
        <>
            <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <AnimatePresence initial={false}>
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                        {/* Header placed outside the scrollable form so buttons don't overlap content while scrolling */}



                        {/* form content starts near top; header removed - only floating close button remains */}
                        <form onSubmit={handleSubmit} className=" px-6 pb-6 grid gap-4 max-h-[72vh] overflow-y-auto">
                            <div className="sticky top-0 z-[100] -mx-3 px-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                                <div className="flex items-center justify-between py-3">
                                    <h3 className="text-lg font-semibold">
                                        {initial?.id ? (initial?.name || "") : "Tạo tác vụ"}
                                    </h3>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">

                                <Field label="Tên công việc" required>
                                    <TextInput
                                        disabled={readOnly || fromBusinessContract}
                                        value={model.name}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            setModel((s) => ({ ...s, name: e.target.value }))
                                        }
                                        placeholder="Nhập tên công việc"
                                    />
                                </Field>

                                <RemoteSelect
                                    label="Bệnh viện"
                                    required
                                    placeholder="Nhập tên bệnh viện để tìm…"
                                    fetchOptions={searchHospitals}
                                    staticOptions={pageHospitalOptions && pageHospitalOptions.length > 0 ? pageHospitalOptions : undefined}
                                    value={hospitalOpt}
                                    onChange={setHospitalOpt}
                                    disabled={readOnly || lockHospital}
                                    wrapSelectedLabel
                                />

                                <div className="col-span-2">
                                    {/* Dùng <div> thay vì <Field> (<label>) để tránh label forward click vào nút ✕ */}
                                    <div className="grid gap-1">
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            Người phụ trách (PIC) <span className="text-red-500">*</span>
                                        </span>
                                        <div className="flex flex-col gap-2">
                                            {!readOnly && (
                                                <div>
                                                    <RemoteSelect
                                                        label=""
                                                        hideLabel={true}
                                                        placeholder="Nhập tên người phụ trách để tìm…"
                                                        fetchOptions={searchPICs}
                                                        value={currentPicInput}
                                                        onChange={(selected) => {
                                                            if (selected) {
                                                                // Kiểm tra xem PIC đã được chọn chưa
                                                                const alreadySelected = picOpts.some(p => p.id === selected.id);
                                                                if (!alreadySelected) {
                                                                    const newPic = { ...selected, _uid: `pic-${Date.now()}-${selected.id}-${Math.random().toString(36).substring(2, 9)}` };
                                                                    setPicOpts((prev) => {
                                                                        const updated = [...prev, newPic];
                                                                        // console.log('Added PIC:', selected.name, 'Total PICs:', updated.length);
                                                                        return updated;
                                                                    });
                                                                    setCurrentPicInput(null);
                                                                } else {
                                                                    // console.log('PIC already selected:', selected.name);
                                                                }
                                                            }
                                                        }}
                                                        disabled={readOnly}
                                                        excludeIds={picOpts.map(p => p.id)} // Loại bỏ các PIC đã được chọn
                                                    />
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {picOpts.map((pic, index) => (
                                                    <div
                                                        key={pic._uid}
                                                        role="presentation"
                                                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${index === 0
                                                            ? "bg-blue-100 border-blue-200 text-blue-800 font-bold"
                                                            : `bg-gray-50 dark:bg-gray-800 border-gray-200 text-gray-700 ${!readOnly ? "cursor-pointer hover:ring-2 hover:ring-slate-300/80" : ""}`
                                                            }`}
                                                        onClick={() => {
                                                            if (!readOnly && index > 0) makePicPrimary(pic._uid);
                                                        }}
                                                        title={!readOnly && index > 0 ? "Nhấn để đặt làm PIC chính" : index === 0 ? "PIC chính" : undefined}
                                                    >

                                                        <span className="max-w-[12rem] truncate block">
                                                            {pic.name || (pic as any).fullName || (pic as any).label || (pic as any).username || String(pic.id) || "Không có tên"}
                                                            {index === 0 && " (Chính)"}
                                                        </span>
                                                        {!readOnly && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePic(pic._uid); }}
                                                                className="text-red-500 hover:text-red-700 text-xs px-1"
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

                                {/* Removed fields: Số lượng, Agency, HIS, Hardware, API URL, BHYT */}

                                <Field label="Trạng thái" required>
                                    <Select
                                        disabled={readOnly || isTransferred}
                                        value={model.status ?? ""}
                                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                            const nextStatus = e.target.value || null;
                                            setModel((s) => {
                                                const prevNormalized = normalizeStatus(s.status);
                                                const nextNormalized = normalizeStatus(nextStatus) ?? "RECEIVED";
                                                const nowLocal = localInputFromDate(new Date());
                                                const becameCompleted = nextNormalized === "COMPLETED";
                                                const wasCompleted = prevNormalized === "COMPLETED";

                                                // Auto-set completionDate if status becomes COMPLETED
                                                let nextCompletion = s.completionDate ?? "";
                                                if (becameCompleted) {
                                                    // If status becomes COMPLETED, set completionDate to now if empty or missing
                                                    if (!nextCompletion || !nextCompletion.trim()) {
                                                        nextCompletion = nowLocal;
                                                    }
                                                } else if (!becameCompleted && wasCompleted) {
                                                    // If changing away from COMPLETED, clear completionDate
                                                    nextCompletion = "";
                                                }

                                                return {
                                                    ...s,
                                                    status: nextStatus,
                                                    completionDate: nextCompletion,
                                                };
                                            });
                                        }}
                                    >
                                        <option value="">— Chọn trạng thái —</option>
                                        {(excludeAccepted ? STATUS_OPTIONS.filter(o => String(o.value) !== 'ACCEPTED') : STATUS_OPTIONS).map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Deadline (ngày)">
                                    <TextInput disabled={readOnly || isTransferred} type="datetime-local" value={toLocalInputValue(model.deadline)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel((s) => ({ ...s, deadline: e.target.value }))} />
                                </Field>

                                <Field label="Ngày bắt đầu">
                                    <TextInput disabled={readOnly || isTransferred} type="datetime-local" value={toLocalInputValue(model.startDate)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel((s) => ({ ...s, startDate: e.target.value }))} />
                                </Field>

                                <Field label="Ngày hoàn thành">
                                    <TextInput disabled={readOnly || isTransferred} type="datetime-local" value={toLocalInputValue(model.completionDate)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel((s) => ({ ...s, completionDate: e.target.value }))} />
                                </Field>
                            </div>

                            <Field label="Yêu cầu bổ sung">
                                <TextArea disabled={readOnly} value={model.additionalRequest ?? ""} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setModel((s) => ({ ...s, additionalRequest: e.target.value }))} placeholder="Mô tả chi tiết yêu cầu" />
                            </Field>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                {readOnly ? (
                                    <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
                                ) : (
                                    <>
                                        <Button type="button" variant="ghost" onClick={onClose}>Hủy</Button>
                                        <Button type="submit" disabled={submitting}>{submitting ? "Đang lưu..." : initial?.id ? "Cập nhật" : "Tạo mới"}</Button>
                                    </>
                                )}
                            </div>
                        </form>
                    </motion.div>
                </AnimatePresence>
            </div>
        </>
    );
}
