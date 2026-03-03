import { useEffect, useState } from "react";
import {
  CloseIcon,
  FileIcon,
  CalenderIcon,
  UserIcon,
  TimeIcon,
  ChatIcon,
  ChevronDownIcon,
  CheckLineIcon,
  PaperPlaneIcon,
  PencilIcon,
} from "../../../icons";

export type TaskDetail = {
  id: string;
  title: string;
  description: string;
  assignee: string;
  assigneeInitials?: string;
  startDate?: string;
  dueDate?: string;
  /** Task creation date (display format) */
  createdAt?: string;
  /** Task completion date (display format) */
  completedAt?: string;
  status: "todo" | "in_progress" | "completed" | "blocked";
  isBlocked?: boolean;
  blockedReason?: string;
  estimatedResolution?: string;
};

export type ActivityLogItem = {
  id: number;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  user: string | null;
  createdAt: string;
  highlight: boolean;
};

export type CommentItem = {
  id: number;
  user: string;
  userInitials: string;
  content: string;
  createdAt: string;
};

type ViewTaskPhaseImplementationProps = {
  task: TaskDetail | null;
  activityLog?: ActivityLogItem[];
  comments?: CommentItem[];
  onSendComment?: (content: string) => void | Promise<void>;
  isOpen: boolean;
  onClose: () => void;
};

const STATUS_OPTIONS = [
  { value: "todo", label: "Cần làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "completed", label: "Hoàn thành" },
  { value: "blocked", label: "Đang bị chặn" },
];

/** Map status code to Vietnamese label for activity log */
function statusToLabel(status: string | null | undefined): string {
  if (status == null || status === "") return "—";
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label ?? status;
}

/** Parse DD/MM/YYYY or DD/MM to [year, month, day] for comparison; returns null if not parseable */
function parseDateDMY(s: string): [number, number, number] | null {
  if (!s || typeof s !== "string") return null;
  const parts = s.trim().split("/").map(Number);
  if (parts.length >= 2 && parts.every((n) => !Number.isNaN(n))) {
    const day = parts[0];
    const month = parts[1] - 1;
    const year = parts[2] && !Number.isNaN(parts[2]) ? parts[2] : new Date().getFullYear();
    return [year, month, day];
  }
  return null;
}

/** Format ISO date/datetime or YYYY-MM-DD to "ngày-tháng-năm" (DD-MM-YYYY), no time */
function formatDateDMY(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const s = String(value).trim();
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) return s;
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

/** Returns "before" | "after" | null when task is completed and both dates are parseable */
function getCompletedBeforeOrAfter(completedAt?: string, dueDate?: string): "before" | "after" | null {
  if (!completedAt || !dueDate) return null;
  const c = new Date(completedAt).getTime();
  const d = new Date(dueDate).getTime();
  if (Number.isNaN(c) || Number.isNaN(d)) return null;
  if (c <= d) return "before";
  return "after";
}

/** Map event_type to display message */
function formatActivityMessage(a: ActivityLogItem): { user: string; action: string; highlight: string; highlightClass: string } {
  const user = a.user ?? "Hệ thống";
  const time = a.createdAt ? new Date(a.createdAt).toLocaleString("vi-VN") : "";
  if (a.eventType === "STATUS_CHANGED") {
    const raw = a.newValue ?? a.oldValue ?? "—";
    return { user, action: "đã đổi trạng thái thành", highlight: statusToLabel(raw), highlightClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
  }
  if (a.eventType === "DUE_DATE_CHANGED") {
    return { user, action: "đã cập nhật hạn chót", highlight: formatDateDMY(a.newValue ?? a.oldValue) || "—", highlightClass: "text-red-600 dark:text-red-400" };
  }
  if (a.eventType === "ASSIGNEE_CHANGED") {
    return { user, action: "đã đổi người phụ trách", highlight: a.newValue ?? a.oldValue ?? "—", highlightClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
  }
  if (a.eventType === "CREATED") {
    return { user, action: "đã tạo công việc", highlight: "", highlightClass: "" };
  }
  if (a.eventType === "COMMENT_ADDED") {
    return { user, action: "đã thêm bình luận", highlight: "", highlightClass: "" };
  }
  return { user, action: a.eventType, highlight: a.newValue ?? a.oldValue ?? "", highlightClass: "bg-slate-100 dark:bg-slate-800" };
}

/**
 * Task detail popup - slides in from right when user clicks "Xem" on a task
 */
export default function ViewTaskPhaseImplementation({
  task,
  activityLog = [],
  comments = [],
  onSendComment,
  isOpen,
  onClose,
}: ViewTaskPhaseImplementationProps) {
  const [commentText, setCommentText] = useState("");
  const [isEntered, setIsEntered] = useState(false);
  const [sending, setSending] = useState(false);

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

  // Slide-in from right: render off-screen first, then transition in
  useEffect(() => {
    if (!isOpen) {
      setIsEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const handleSendComment = async () => {
    if (!commentText.trim() || !onSendComment) return;
    setSending(true);
    try {
      await onSendComment(commentText.trim());
      setCommentText("");
    } finally {
      setSending(false);
    }
  };

  if (!task) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-slate-900/30 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel - slide in from right */}
      <div
        className={`fixed right-0 top-0 z-[9999] flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 ${
          isOpen && isEntered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <FileIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Chi tiết công việc
              </h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                #{task.id}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              title="Chia sẻ"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Đóng"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Title */}
          <h1 className="mb-5 text-lg font-bold text-slate-900 dark:text-slate-100">
            {task.title}
          </h1>

          {/* Description */}
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mô tả
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {task.description}
            </p>
          </section>

          {/* Key details card */}
          <section className="mb-5 rounded-xl bg-blue-50/80 p-4 dark:bg-blue-900/10">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Người thực hiện
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-slate-600 dark:text-slate-200">
                    {task.assigneeInitials ?? task.assignee.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {task.assignee}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Thời gian
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <CalenderIcon className="size-3.5 shrink-0 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      Hạn chót: {formatDateDMY(task.dueDate)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Trạng thái
                </h3>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {STATUS_OPTIONS.find((o) => o.value === task.status)?.label ?? task.status}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-blue-200/60 pt-4 dark:border-blue-800/40">
              <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                <CalenderIcon className="size-3.5 shrink-0 text-slate-500" />
                Ngày tạo: {formatDateDMY(task.createdAt)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                <CalenderIcon className="size-3.5 shrink-0 text-green-500" />
                Ngày hoàn thành: {formatDateDMY(task.completedAt)}
              </div>
            </div>
            {task.status === "completed" && (() => {
              const beforeAfter = getCompletedBeforeOrAfter(task.completedAt, task.dueDate);
              if (!beforeAfter) return null;
              return (
                <div className="mt-3 flex justify-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      beforeAfter === "before"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                  >
                    {beforeAfter === "before" ? (
                      <>
                        <CheckLineIcon className="size-3.5" />
                        Hoàn thành trước hạn
                      </>
                    ) : (
                      <>
                        <TimeIcon className="size-3.5" />
                        Hoàn thành sau hạn
                      </>
                    )}
                  </span>
                </div>
              );
            })()}
          </section>

          {/* Blocked card */}
          {(task.isBlocked ?? task.status === "blocked") && task.blockedReason && (
            <section className="mb-5 rounded-xl border border-red-100 bg-red-50/80 p-4 dark:border-red-900/30 dark:bg-red-900/10">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">
                    <svg className="size-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">
                    Đang bị chặn
                  </span>
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Có</span>
                  <div className="h-6 w-11 rounded-full bg-red-500" />
                </label>
              </div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                Lý do chặn
              </p>
              <p className="mb-2 text-sm text-red-900 dark:text-red-200">{task.blockedReason}</p>
              {task.estimatedResolution && (
                <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                  <TimeIcon className="size-4 shrink-0 text-red-500" />
                  Dự kiến giải quyết: {formatDateDMY(task.estimatedResolution)}
                </div>
              )}
            </section>
          )}

          {/* Activity log */}
          <section className="mb-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <TimeIcon className="size-4 text-slate-500" />
              Nhật ký hoạt động
            </h3>
            <div className="space-y-3">
              {activityLog.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Chưa có hoạt động</p>
              ) : (
                activityLog.map((activity) => {
                  const msg = formatActivityMessage(activity);
                  return (
                    <div
                      key={activity.id}
                      className="flex gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <div className="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5" />
                      <div>
                        <p className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{msg.user}</span> {msg.action}
                          {msg.highlight && (
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${msg.highlightClass}`}>
                              {msg.highlight}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {formatDateDMY(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Comments */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ChatIcon className="size-4 text-slate-500" />
              Bình luận ({comments.length})
            </h3>
            <div className="space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Chưa có bình luận</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-600 dark:text-slate-200">
                      {comment.userInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {comment.user}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatDateDMY(comment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment input - modern interface */}
            
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="relative shrink-0">
                <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-200">
                    {task.assigneeInitials ?? task.assignee.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  className="absolute -bottom-0.5 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-slate-300 text-slate-600 hover:bg-slate-400 dark:bg-slate-500 dark:text-slate-200"
                  title="Tùy chọn người dùng"
                >
                  <ChevronDownIcon className="size-2.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Viết bình luận..."
                  rows={2}
                  className="w-full resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleSendComment}
                    disabled={!commentText.trim() || !onSendComment || sending}
                    className="rounded-lg bg-blue-600 p-1.5 text-white transition hover:bg-blue-600/90 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-500/90"
                    title="Gửi"
                  >
                    <PaperPlaneIcon className="size-4" />
                  </button>
                </div>
              </div>
            </div>
      </div>
    </>
  );
}
