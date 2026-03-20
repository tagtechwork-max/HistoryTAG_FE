import { useEffect, useState } from "react";
import {
  CloseIcon,
  PlusIcon,
  CalenderIcon,
  CheckLineIcon,
  PencilIcon,
} from "../../../icons";
import {
  searchHospitalsWithCode,
  searchUsersForDeployment,
} from "../../../api/api";
import { getUserAccount } from "../../../api/auth.api";
import { isSuperAdmin } from "../../../utils/permission";

/** Get current logged-in user id from storage (for default PM) */
function getCurrentUserIdFromStorage(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const userIdRaw =
      localStorage.getItem("userId") ||
      sessionStorage.getItem("userId");
    if (userIdRaw) {
      const n = Number(userIdRaw);
      if (Number.isFinite(n)) return n;
    }
    const userJson =
      localStorage.getItem("user") || sessionStorage.getItem("user");
    if (userJson) {
      const parsed = JSON.parse(userJson) as {
        id?: number | string;
        userId?: number | string;
      };
      const candidate = parsed.id ?? parsed.userId;
      if (candidate != null) {
        const n = Number(candidate);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Form state for create/edit - uses IDs per API spec §9 */
export type HospitalFormValues = {
  hospitalId: number | null;
  projectCode: string;
  startDate: string;
  reportDeadline: string;
  goLiveDeadline: string;
  pmUserId: number | null;
  engineerUserId: number | null;
};

/** Payload sent to parent on submit - maps to create/update API */
export type HospitalFormSubmitPayload = {
  hospitalId?: number;
  projectCode?: string;
  startDate?: string;
  reportDeadline?: string;
  goLiveDeadline?: string;
  pmUserId?: number;
  engineerUserId?: number;
  version?: number;
};

export type EditHospitalInitial = HospitalFormValues & {
  id: string;
  _version?: number;
  hospitalName?: string;
  pmName?: string;
  engineerName?: string;
};

type AddHospitalImplementationProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: HospitalFormSubmitPayload, taskId?: string) => void | Promise<void>;
  /** When set, form opens in edit mode with these values */
  editHospital?: EditHospitalInitial | null;
  /** Force-enable deadline edit (used for superadmin route) */
  forceDeadlineEdit?: boolean;
};

const initialValues: HospitalFormValues = {
  hospitalId: null,
  projectCode: "",
  startDate: "",
  reportDeadline: "",
  goLiveDeadline: "",
  pmUserId: null,
  engineerUserId: null,
};

/** Searchable select - type to search, min 2 chars (like implementation-tasks RemoteSelect) */
function SearchableSelect({
  label,
  placeholder,
  fetchOptions,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
  value: { id: number; name: string } | null;
  onChange: (v: { id: number; name: string } | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  useEffect(() => {
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

  if (disabled) {
    return (
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {value?.name ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder ?? "Nhập để tìm..."}
          value={open ? q : value?.name ?? ""}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
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
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => onChange(null)}
            aria-label="Clear"
          >
            ✕
          </button>
        )}
        {open && (
          <div
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
            onMouseLeave={() => setHighlight(-1)}
          >
            {loading && (
              <div className="px-3 py-2 text-sm text-slate-500">Đang tìm...</div>
            )}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-500">
                {q.trim().length < 2 ? "Nhập ít nhất 2 ký tự để tìm kiếm" : "Không tìm thấy"}
              </div>
            )}
            {!loading &&
              options.length > 0 &&
              options.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    idx === highlight ? "bg-slate-100 dark:bg-slate-700" : ""
                  }`}
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
    </div>
  );
}

/**
 * Add/Edit hospital form - right-side panel for "Thêm bệnh viện" and "Sửa" on deployment list.
 * Per spec §9: sends hospitalId, pmUserId, engineerUserId; backend computes phase, progress, health.
 */
export default function AddHospitalImplementation({
  isOpen,
  onClose,
  onSubmit,
  editHospital = null,
  forceDeadlineEdit = false,
}: AddHospitalImplementationProps) {
  const [form, setForm] = useState<HospitalFormValues>(initialValues);
  const [isEntered, setIsEntered] = useState(false);
  const [hospitalOpt, setHospitalOpt] = useState<{ id: number; name: string } | null>(null);
  const [pmOpt, setPmOpt] = useState<{ id: number; name: string } | null>(null);
  const [engineerOpt, setEngineerOpt] = useState<{ id: number; name: string } | null>(null);
  /** Only team lead (LEADER in teamRoles) can edit report deadline and go-live deadline */
  const [canEditDeadlines, setCanEditDeadlines] = useState(false);
  const isEditMode = Boolean(editHospital?.id);
  const canEditDeadlineFields = forceDeadlineEdit || canEditDeadlines;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsEntered(false);
      setForm(initialValues);
      setHospitalOpt(null);
      setPmOpt(null);
      setEngineerOpt(null);
      setCanEditDeadlines(false);
    } else if (editHospital) {
      setForm({
        hospitalId: null,
        projectCode: editHospital.projectCode ?? "",
        startDate: editHospital.startDate ?? "",
        reportDeadline: editHospital.reportDeadline ?? "",
        goLiveDeadline: editHospital.goLiveDeadline ?? "",
        pmUserId: editHospital.pmUserId ?? null,
        engineerUserId: editHospital.engineerUserId ?? null,
      });
      setHospitalOpt(null);
      setPmOpt(
        editHospital.pmUserId
          ? { id: editHospital.pmUserId, name: editHospital.pmName ?? `User #${editHospital.pmUserId}` }
          : null
      );
      setEngineerOpt(
        editHospital.engineerUserId
          ? { id: editHospital.engineerUserId, name: editHospital.engineerName ?? `User #${editHospital.engineerUserId}` }
          : null
      );
      // Edit mode: fetch current user to know if team lead; Super Admin from JWT token
      const userId = getCurrentUserIdFromStorage();
      if (userId != null) {
        getUserAccount(userId)
          .then((user) => {
            const isTeamLead =
              user?.teamRoles && Object.values(user.teamRoles).some((r) => String(r).toUpperCase() === "LEADER");
            setCanEditDeadlines(Boolean(isTeamLead || isSuperAdmin()));
          })
          .catch(() => setCanEditDeadlines(isSuperAdmin()));
      } else {
        setCanEditDeadlines(isSuperAdmin());
      }
    } else {
      // Create mode: default PM to current logged-in user (fetch fullname from API)
      const userId = getCurrentUserIdFromStorage();
      setForm({
        ...initialValues,
        pmUserId: userId ?? null,
      });
      setHospitalOpt(null);
      setPmOpt(null);
      setEngineerOpt(null);
      if (userId != null) {
        getUserAccount(userId)
          .then((user) => {
            const displayName =
              (user.fullname || user.username || `User #${userId}`).trim();
            setPmOpt({ id: user.id, name: displayName });
            const isTeamLead =
              user?.teamRoles && Object.values(user.teamRoles).some((r) => String(r).toUpperCase() === "LEADER");
            setCanEditDeadlines(Boolean(isTeamLead || isSuperAdmin()));
          })
          .catch(() => {
            setPmOpt({ id: userId, name: `User #${userId}` });
            setCanEditDeadlines(isSuperAdmin());
          });
      } else {
        setCanEditDeadlines(isSuperAdmin());
      }
    }
  }, [isOpen, editHospital]);

  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const update = (partial: Partial<HospitalFormValues>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode) {
      const payload: HospitalFormSubmitPayload = {
        projectCode: form.projectCode,
        startDate: form.startDate || undefined,
        reportDeadline: form.reportDeadline || undefined,
        goLiveDeadline: form.goLiveDeadline || undefined,
        pmUserId: form.pmUserId ?? undefined,
        engineerUserId: form.engineerUserId ?? undefined,
        version: editHospital?._version,
      };
      setSubmitting(true);
      try {
        await onSubmit(payload, editHospital?.id);
        onClose();
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!form.hospitalId) return;
      const payload: HospitalFormSubmitPayload = {
        hospitalId: form.hospitalId,
        projectCode: form.projectCode,
        startDate: form.startDate || undefined,
        reportDeadline: form.reportDeadline || undefined,
        goLiveDeadline: form.goLiveDeadline || undefined,
        pmUserId: form.pmUserId ?? undefined,
        engineerUserId: form.engineerUserId ?? undefined,
      };
      setSubmitting(true);
      try {
        await onSubmit(payload);
        onClose();
      } finally {
        setSubmitting(false);
      }
    }
  };

  const canSubmit = isEditMode
    ? true
    : Boolean(form.hospitalId);

  return (
    <>
      <div
        className={`fixed inset-0 z-[9998] bg-slate-900/30 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed right-0 top-0 z-[9999] flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 ${
          isOpen && isEntered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${
                isEditMode
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400"
                  : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
              }`}
            >
              {isEditMode ? (
                <PencilIcon className="size-5" />
              ) : (
                <PlusIcon className="size-5" />
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isEditMode ? "Sửa bệnh viện" : "Thêm bệnh viện vào danh sách triển khai"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Đóng"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              {isEditMode ? (
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Tên bệnh viện
                  </label>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {editHospital?.hospitalName ?? "—"}
                  </p>
                </div>
              ) : (
                <SearchableSelect
                  label="Tên bệnh viện"
                  placeholder="Nhập tên bệnh viện để tìm…"
                  required
                  fetchOptions={searchHospitalsWithCode}
                  value={hospitalOpt}
                  onChange={(v) => {
                    setHospitalOpt(v);
                    const code = v && "code" in v ? (v as { id: number; name: string; code?: string }).code : undefined;
                    update({
                      hospitalId: v?.id ?? null,
                      ...(code ? { projectCode: code } : {}),
                    });
                  }}
                />
              )}

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mã dự án / Mã BV
                </label>
                <input
                  type="text"
                  value={form.projectCode}
                  onChange={(e) => update({ projectCode: e.target.value })}
                  placeholder="VD: TA-2023-01"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Ngày bắt đầu
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => update({ startDate: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <CalenderIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Hạn báo cáo
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={form.reportDeadline}
                      onChange={(e) => update({ reportDeadline: e.target.value })}
                      disabled={!canEditDeadlineFields}
                      readOnly={!canEditDeadlineFields}
                      title={!canEditDeadlineFields ? "Chỉ trưởng team hoặc Super Admin mới được chỉnh sửa" : undefined}
                      className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm dark:text-slate-100 ${
                        canEditDeadlineFields
                          ? "border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                          : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                      }`}
                    />
                    <CalenderIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Hạn go-live
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={form.goLiveDeadline}
                      onChange={(e) => update({ goLiveDeadline: e.target.value })}
                      disabled={!canEditDeadlineFields}
                      readOnly={!canEditDeadlineFields}
                      title={!canEditDeadlineFields ? "Chỉ trưởng team hoặc Super Admin mới được chỉnh sửa" : undefined}
                      className={`w-full rounded-lg border py-2 pl-9 pr-3 text-sm dark:text-slate-100 ${
                        canEditDeadlineFields
                          ? "border-slate-200 bg-white text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                          : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                      }`}
                    />
                    <CalenderIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>
              </div>

              <SearchableSelect
                label="Phụ trách chính (PM)"
                placeholder="Nhập tên PM để tìm…"
                fetchOptions={searchUsersForDeployment}
                value={pmOpt}
                onChange={(v) => {
                  setPmOpt(v);
                  update({ pmUserId: v?.id ?? null });
                }}
              />

              <SearchableSelect
                label="Người hỗ trợ"
                placeholder="Nhập tên kỹ sư để tìm…"
                fetchOptions={searchUsersForDeployment}
                value={engineerOpt}
                onChange={(v) => {
                  setEngineerOpt(v);
                  update({ engineerUserId: v?.id ?? null });
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckLineIcon className="size-4" />
              {submitting ? "Đang lưu..." : isEditMode ? "Lưu thay đổi" : "Thêm bệnh viện"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
