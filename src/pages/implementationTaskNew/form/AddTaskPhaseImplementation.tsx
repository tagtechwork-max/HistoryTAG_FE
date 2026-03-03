import { useEffect, useState } from "react";
import {
  CloseIcon,
  PlusIcon,
  CalenderIcon,
  ChevronDownIcon,
  CheckLineIcon,
  PencilIcon,
} from "../../../icons";
import { searchUsersForDeployment } from "../../../api/api";

export type AddTaskFormValues = {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "completed" | "blocked";
  assignee: string;
  assigneeInitials: string;
  assigneeUserId?: number;
  dueDate: string;
  tags: string[];
  impact: "critical" | "normal" | null;
  blockedReason?: string;
  estimatedResolution?: string;
};

export type EditTaskInitial = AddTaskFormValues & { id: string; assigneeUserId?: number; version?: number };

type AddTaskPhaseImplementationProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: AddTaskFormValues, taskId?: string) => void;
  /** When set, form opens in edit mode with these values */
  editTask?: EditTaskInitial | null;
};

const STATUS_OPTIONS = [
  { value: "todo", label: "Cần làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "completed", label: "Hoàn thành" },
  { value: "blocked", label: "Đang bị chặn" },
];

const IMPACT_OPTIONS = [
  { value: "", label: "Không đặt" },
  { value: "normal", label: "Bình thường" },
  { value: "critical", label: "Khẩn cấp" },
];

/** Derive 2-char initials from display name (e.g. "Nguyễn Văn A" -> "NV") */
function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "").toUpperCase();
}

/** Searchable user select - type to search, min 2 chars, returns { id, name } for assigneeUserId */
function AssigneeSearch({
  value,
  onChange,
}: {
  value: { id: number; name: string } | null;
  onChange: (v: { id: number; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) {
      setOptions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchUsersForDeployment(q.trim());
        if (alive) setOptions(res);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Nhập tên để tìm người phụ trách..."
        value={open ? q : value?.name ?? ""}
        onChange={(e) => {
          setQ(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
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
          onMouseDown={(e) => e.preventDefault()}
        >
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Đang tìm...</div>}
          {!loading && q.trim().length < 2 && (
            <div className="px-3 py-2 text-sm text-slate-500">Nhập ít nhất 2 ký tự để tìm kiếm</div>
          )}
          {!loading && q.trim().length >= 2 && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">Không tìm thấy</div>
          )}
          {!loading &&
            options.map((opt) => (
              <div
                key={opt.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
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
  );
}

const SUGGESTED_TAGS = ["HIS", "Mạng", "Lắp đặt", "Phần cứng", "Đào tạo", "Nghiệm thu"];

const initialValues: AddTaskFormValues = {
  title: "",
  description: "",
  status: "todo",
  assignee: "",
  assigneeInitials: "",
  dueDate: "",
  tags: [],
  impact: null,
};

/**
 * Add task form - right-side panel when user clicks "Thêm công việc"
 */
export default function AddTaskPhaseImplementation({
  isOpen,
  onClose,
  onSubmit,
  editTask = null,
}: AddTaskPhaseImplementationProps) {
  const [form, setForm] = useState<AddTaskFormValues>(initialValues);
  const [tagInput, setTagInput] = useState("");
  const isEditMode = Boolean(editTask?.id);

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
      setForm(initialValues);
    } else if (editTask) {
      const { id: _id, ...rest } = editTask;
      setForm(rest);
    } else {
      setForm(initialValues);
    }
  }, [isOpen, editTask]);

  const update = (partial: Partial<AddTaskFormValues>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || form.tags.includes(t)) return;
    setForm((prev) => ({ ...prev, tags: [...prev.tags, t] }));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const assigneeOpt: { id: number; name: string } | null =
    form.assigneeUserId && form.assignee
      ? { id: form.assigneeUserId, name: form.assignee }
      : null;

  const handleAssigneeChange = (v: { id: number; name: string } | null) => {
    if (!v) {
      update({ assignee: "", assigneeInitials: "", assigneeUserId: undefined });
      return;
    }
    update({
      assignee: v.name,
      assigneeInitials: toInitials(v.name),
      assigneeUserId: v.id,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form, editTask?.id);
    onClose();
  };

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
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`flex size-9 items-center justify-center rounded-lg ${isEditMode ? "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400" : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"}`}>
              {isEditMode ? <PencilIcon className="size-5" /> : <PlusIcon className="size-5" />}
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {isEditMode ? "Sửa công việc" : "Thêm công việc"}
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
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tiêu đề <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Nhập tiêu đề công việc..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mô tả
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Mô tả chi tiết công việc (tùy chọn)"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Trạng thái
                </label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) => update({ status: e.target.value as AddTaskFormValues["status"] })}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Người phụ trách
                </label>
                <AssigneeSearch value={assigneeOpt} onChange={handleAssigneeChange} />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Hạn chót
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => update({ dueDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <CalenderIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mức độ ưu tiên
                </label>
                <div className="relative">
                  <select
                    value={form.impact ?? ""}
                    onChange={(e) =>
                      update({ impact: (e.target.value || null) as AddTaskFormValues["impact"] })
                    }
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {IMPACT_OPTIONS.map((opt) => (
                      <option key={opt.value || "none"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Danh mục / Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        <CloseIcon className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder="Thêm tag..."
                    className="w-24 min-w-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {SUGGESTED_TAGS.filter((t) => !form.tags.includes(t)).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              {form.status === "blocked" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Lý do chặn
                    </label>
                    <textarea
                      value={form.blockedReason ?? ""}
                      onChange={(e) => update({ blockedReason: e.target.value })}
                      placeholder="Mô tả lý do công việc bị chặn"
                      rows={2}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Dự kiến giải quyết
                    </label>
                    <input
                      type="date"
                      value={form.estimatedResolution ?? ""}
                      onChange={(e) => update({ estimatedResolution: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </>
              )}
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
              disabled={!form.title.trim()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckLineIcon className="size-4" />
              {isEditMode ? "Lưu thay đổi" : "Thêm công việc"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
