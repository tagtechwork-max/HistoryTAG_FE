/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ImplementationTaskRequestDTO } from "../../api/superadmin.api";

/** Curator-style maintenance / task drawer shell + form fields (used by TaskFormModal when curatorLayout). */
export function TaskFormModalCuratorView(props: {
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    submitting: boolean;
    readOnly?: boolean;
    initial?: {
        id?: number;
        name?: string;
        hospitalName?: string | null;
        hccFacilityName?: string | null;
    };
    fromBusinessContract: boolean;
    lockHospital: boolean;
    isTransferred: boolean;
    model: Partial<ImplementationTaskRequestDTO>;
    setModel: React.Dispatch<React.SetStateAction<Partial<ImplementationTaskRequestDTO>>>;
    hospitalOpt: { id: number; name: string; facilityType?: "HOSPITAL" | "HCC" } | null;
    setHospitalOpt: (v: { id: number; name: string; facilityType?: "HOSPITAL" | "HCC" } | null) => void;
    picOpts: Array<{ id: number; name: string; _uid: string }>;
    removePic: (uid: string) => void;
    /** Move PIC with this uid to index 0 (primary). */
    onMakePicPrimary: (uid: string) => void;
    currentPicInput: { id: number; name: string } | null;
    setCurrentPicInput: (v: { id: number; name: string } | null) => void;
    setPicOpts: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; _uid: string }>>>;
    searchHospitals: (term: string) => Promise<Array<{ id: number; name: string; facilityType?: "HOSPITAL" | "HCC" }>>;
    /** When set, hospital dropdown uses this list (same as hospital page) instead of API search. */
    hospitalStaticOptions?: Array<{ id: number; name: string }>;
    /** Merged into static-filtered options (superadmin HCC search). */
    hospitalRemoteSupplement?: (term: string) => Promise<Array<{ id: number; name: string }>>;
    searchPICs: (term: string) => Promise<Array<{ id: number; name: string }>>;
    excludeAccepted: boolean;
    STATUS_OPTIONS: Array<{ value: string; label: string }>;
    normalizeStatus: (s?: string | null) => string | undefined;
    toLocalInputValue: (v?: string | null) => string;
    localInputFromDate: (d: Date) => string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Field: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TextInput: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TextArea: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Select: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Button: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RemoteSelect: any;
    clsx: (...a: Array<string | false | undefined>) => string;
}) {
    const {
        onClose,
        onSubmit,
        submitting,
        readOnly,
        initial,
        fromBusinessContract,
        lockHospital,
        isTransferred,
        model,
        setModel,
        hospitalOpt,
        setHospitalOpt,
        picOpts,
        removePic,
        onMakePicPrimary,
        currentPicInput,
        setCurrentPicInput,
        setPicOpts,
        searchHospitals,
        hospitalStaticOptions,
        hospitalRemoteSupplement,
        searchPICs,
        excludeAccepted,
        STATUS_OPTIONS,
        normalizeStatus,
        toLocalInputValue,
        localInputFromDate,
        Field,
        TextInput,
        TextArea,
        Select,
        Button,
        RemoteSelect,
        clsx,
    } = props;

    const statusOpts = excludeAccepted ? STATUS_OPTIONS.filter((o) => String(o.value) !== "ACCEPTED") : STATUS_OPTIONS;
    const lockedFacilityLabel =
        hospitalOpt?.name ||
        (typeof initial?.hccFacilityName === "string" && initial.hccFacilityName.trim()) ||
        (typeof initial?.hospitalName === "string" && initial.hospitalName.trim()) ||
        "-";

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="min-w-0 flex-1 bg-slate-900/25 backdrop-blur-md" onMouseDown={onClose} aria-hidden />
            <AnimatePresence initial={false}>
                <motion.div
                    key="curator-drawer"
                    initial={{ x: 56, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 56, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 30 }}
                    className="relative flex h-full min-w-0 w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl border-l border-slate-200/90"
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
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Close"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                            </svg>
                        </button>
                    </header>

                    <form onSubmit={onSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 py-5 [overflow-wrap:anywhere]">
                            <Field label="Tên công việc" required variant="curator">
                                <TextInput
                                    curator
                                    disabled={readOnly || fromBusinessContract}
                                    value={model.name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel((s) => ({ ...s, name: e.target.value }))}
                                    placeholder="Ví dụ: Kiểm tra thiết bị,..."
                                />
                            </Field>

                            <div className="grid min-w-0 max-w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
                                {lockHospital ? (
                                    <Field label="Bệnh viện / HCC" required variant="curator">
                                        <div className="flex min-h-[2.75rem] min-w-0 max-w-full items-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal leading-snug text-slate-900 whitespace-normal break-words dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100">
                                            {lockedFacilityLabel}
                                        </div>
                                    </Field>
                                ) : (
                                    <RemoteSelect
                                        label="Bệnh viện / HCC"
                                        fieldVariant="curator"
                                        curator
                                        trailing="chevron"
                                        required
                                        placeholder="Tìm bệnh viện hoặc HCC…"
                                        fetchOptions={searchHospitals}
                                        staticOptions={
                                            hospitalStaticOptions && hospitalStaticOptions.length > 0
                                                ? hospitalStaticOptions
                                                : undefined
                                        }
                                        remoteSupplement={hospitalRemoteSupplement}
                                        value={hospitalOpt}
                                        onChange={setHospitalOpt}
                                        disabled={readOnly || lockHospital}
                                        wrapSelectedLabel
                                    />
                                )}

                                <div className="min-w-0 max-w-full sm:col-span-1">
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
                                                    onChange={(selected: { id: number; name: string } | null) => {
                                                        if (selected) {
                                                            const alreadySelected = picOpts.some((p) => p.id === selected.id);
                                                            if (!alreadySelected) {
                                                                const newPic = {
                                                                    ...selected,
                                                                    _uid: `pic-${Date.now()}-${selected.id}-${Math.random().toString(36).substring(2, 9)}`,
                                                                };
                                                                setPicOpts((prev) => [...prev, newPic]);
                                                                setCurrentPicInput(null);
                                                            }
                                                        }
                                                    }}
                                                    disabled={readOnly}
                                                    excludeIds={picOpts.map((p) => p.id)}
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
                                                            if (!readOnly && index > 0) onMakePicPrimary(pic._uid);
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
                                    <Select
                                        curator
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
                                                let nextCompletion = s.completionDate ?? "";
                                                if (becameCompleted) {
                                                    if (!nextCompletion || !nextCompletion.trim()) {
                                                        nextCompletion = nowLocal;
                                                    }
                                                } else if (!becameCompleted && wasCompleted) {
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
                                        {statusOpts.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Hạn chót" variant="curator">
                                    <TextInput
                                        curator
                                        disabled={readOnly || isTransferred}
                                        type="datetime-local"
                                        value={toLocalInputValue(model.deadline)}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            setModel((s) => ({ ...s, deadline: e.target.value }))
                                        }
                                    />
                                </Field>
                            </div>

                            <div className="min-w-0 max-w-full rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Thời gian xử lý: </p>
                                <div className="mt-3 grid min-w-0 max-w-full grid-cols-1 items-start gap-4 sm:grid-cols-2">
                                    <Field label="Bắt đầu" variant="curator">
                                        <TextInput
                                            curator
                                            disabled={readOnly || isTransferred}
                                            type="datetime-local"
                                            value={toLocalInputValue(model.startDate)}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setModel((s) => ({ ...s, startDate: e.target.value }))
                                            }
                                        />
                                    </Field>
                                    <Field label="Kết thúc" variant="curator">
                                        <TextInput
                                            curator
                                            disabled={readOnly || isTransferred}
                                            type="datetime-local"
                                            value={toLocalInputValue(model.completionDate)}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setModel((s) => ({ ...s, completionDate: e.target.value }))
                                            }
                                        />
                                    </Field>
                                </div>
                            </div>

                            <Field label="Yêu cầu bổ sung" variant="curator">
                                <TextArea
                                    curator
                                    disabled={readOnly}
                                    value={model.additionalRequest ?? ""}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                        setModel((s) => ({ ...s, additionalRequest: e.target.value }))
                                    }
                                    placeholder="Nhập các yêu cầu kỹ thuật hoặc lưu ý đặc biệt tại đây..."
                                />
                            </Field>
                        </div>

                        <footer className="flex min-w-0 shrink-0 items-center justify-between gap-3 overflow-x-hidden border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
                            {readOnly ? (
                                <Button type="button" variant="ghost" onClick={onClose} className="!h-10 !rounded-lg !border-0 text-slate-600 hover:bg-slate-100">
                                    Đóng
                                </Button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
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
            </AnimatePresence>
        </div>
    );
}
