import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import PageMeta from "../../../components/common/PageMeta";
import ViewTaskPhaseImplementation, { type TaskDetail } from "../view/ViewTaskPhaseImplementation";
import type { WorkItemDetailDto } from "../../../api/api";
import AddTaskPhaseImplementation from "../form/AddTaskPhaseImplementation";
import type { AddTaskFormValues, EditTaskInitial } from "../form/AddTaskPhaseImplementation";
import { PlusIcon, CheckLineIcon, UserIcon, UserCircleIcon, PencilIcon, TrashBinIcon, BoxIconLine, ChevronDownIcon, EyeIcon } from "../../../icons";
import {
  fetchImplementationTaskDetail,
  fetchMilestones,
  fetchWorkItems,
  fetchWorkItemDetail,
  addWorkItemComment,
  createWorkItem,
  updateWorkItem,
  deleteWorkItem,
  moveWorkItem,
  completeMilestone,
  type WorkItemListDto,
  type MilestoneDto,
} from "../../../api/api";
import { implTasksListTo, parseListSearchFromState } from "./implListNav";

const COLUMN_IDS = ["todo", "in_progress", "completed", "blocked"] as const;

const AVATAR_COLORS: Record<string, string> = {
  NV: "bg-orange-100 text-orange-600 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  TB: "bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600",
  LC: "bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600",
  PT: "bg-green-100 text-green-600 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  HD: "bg-slate-200 text-slate-500 dark:bg-slate-600 dark:text-slate-400",
  VM: "bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600",
};

const COLUMN_CONFIG: Record<string, { title: string; header: string; pill: string; bg: string }> = {
  todo: {
    title: "Cần làm",
    header: "text-slate-600 dark:text-slate-400",
    pill: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    bg: "bg-slate-100/50 dark:bg-slate-900/50",
  },
  in_progress: {
    title: "Đang làm",
    header: "text-blue-600 dark:text-blue-400",
    pill: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/5 border border-blue-500/10 dark:bg-blue-500/5 dark:border-blue-500/20",
  },
  completed: {
    title: "Hoàn thành",
    header: "text-green-600 dark:text-green-400",
    pill: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
    bg: "bg-green-50/50 dark:bg-green-900/10",
  },
  blocked: {
    title: "Đang bị chặn",
    header: "text-red-600 dark:text-red-400",
    pill: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    bg: "bg-red-50/50 dark:bg-red-900/10 border-2 border-dashed border-red-200 dark:border-red-900/30",
  },
};

function workItemsToColumns(items: WorkItemListDto[]) {
  const byStatus: Record<string, WorkItemListDto[]> = { todo: [], in_progress: [], completed: [], blocked: [] };
  items.forEach((w) => {
    if (byStatus[w.status]) byStatus[w.status].push(w);
  });
  return COLUMN_IDS.map((id) => ({
    id,
    title: COLUMN_CONFIG[id]?.title ?? id,
    count: byStatus[id]?.length ?? 0,
    tasks: byStatus[id] ?? [],
  }));
}

/** Format ISO or YYYY-MM-DD to DD-MM-YYYY (ngày-tháng-năm), no time */
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

function toTaskCard(w: WorkItemListDto) {
  return {
    id: String(w.id),
    title: w.title,
    tags: w.tags ?? [],
    assignee: w.assignee ?? "—",
    assigneeInitials: w.assigneeInitials ?? "—",
    usePersonIcon: !w.assigneeInitials,
    dueDate: w.dueDate,
    isOverdue: w.isOverdue ?? false,
    impact: w.impact,
    description: w.description ?? undefined,
    blockedReason: w.blockedReason ?? undefined,
    blockedReasonTag: w.blockedReasonTag ?? undefined,
    estimatedResolution: w.estimatedResolution ?? undefined,
    createdAt: w.createdAt ?? undefined,
    completedAt: w.completedAt ?? undefined,
  };
}

/** MOCK phases when milestones API returns empty (same as PhaseImplementation) */
const MOCK_PHASES_FALLBACK: MilestoneDto[] = [
  { id: 1, number: 1, status: "in_progress", label: "Giai đoạn 1: Thu thập thông tin", progress: 0, openTasks: 0 },
  { id: 2, number: 2, status: "not_started", label: "Giai đoạn 2: Cài đặt cơ bản", progress: 0, estimatedTasks: 0 },
  { id: 3, number: 3, status: "not_started", label: "Giai đoạn 3: Giám sát & Khắc phục", progress: 0, estimatedTasks: 15 },
  { id: 4, number: 4, status: "not_started", label: "Giai đoạn 4: Nghiệm thu & Vận hành", progress: 0, estimatedTasks: 8 },
];

/**
 * Task Phase Implementation - Kanban board for phase tasks
 * Shown when user clicks a phase card in PhaseImplementation
 */
const MENU_HEIGHT = 140;

export default function TaskPhaseImplementation() {
  const { hospitalId, phaseId } = useParams<{ hospitalId: string; phaseId: string }>();
  const [task, setTask] = useState<{ hospitalName: string } | null>(null);
  const [phase, setPhase] = useState<MilestoneDto | null>(null);
  const [resolvedMilestoneId, setResolvedMilestoneId] = useState<string | null>(null);
  const [workItems, setWorkItems] = useState<WorkItemListDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [workItemDetail, setWorkItemDetail] = useState<WorkItemDetailDto | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<EditTaskInitial | null>(null);
  const [showCompletePhaseConfirm, setShowCompletePhaseConfirm] = useState(false);
  const [completingPhase, setCompletingPhase] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openMenu = useCallback((taskId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setMenuAnchor(rect);
    setOpenMenuTaskId(taskId);
    triggerRef.current = button;
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuTaskId(null);
    setMenuAnchor(null);
    triggerRef.current = null;
  }, []);

  // Step 1: fetch detail + milestones, resolve phase. Step 2: fetch work items with real milestone id
  useEffect(() => {
    if (!hospitalId || !phaseId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchImplementationTaskDetail(hospitalId), fetchMilestones(hospitalId)])
      .then(([detail, milestones]) => {
        if (cancelled) return;
        setTask({ hospitalName: detail.hospitalName ?? detail.name ?? "—" });
        const m =
          milestones.find((x) => String(x.id) === phaseId) ??
          milestones.find((x) => String(x.number) === phaseId);
        const mockPhase = !m && ["1", "2", "3", "4"].includes(phaseId)
          ? MOCK_PHASES_FALLBACK.find((x) => String(x.id) === phaseId || String(x.number) === phaseId)
          : null;
        const resolvedPhase = m ?? mockPhase ?? null;
        setPhase(resolvedPhase);
        const milestoneIdForApi = m ? String(m.id) : phaseId;
        setResolvedMilestoneId(milestoneIdForApi);
        if (!resolvedPhase) {
          setLoading(false);
          return;
        }
        return fetchWorkItems({ implementationTaskId: hospitalId, milestoneId: milestoneIdForApi })
          .catch((e) => {
            if (mockPhase && (e as { response?: { status?: number } })?.response?.status === 404) {
              return [];
            }
            throw e;
          });
      })
      .then((items) => {
        if (cancelled) return;
        if (Array.isArray(items)) setWorkItems(items);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
          const status = err?.response?.status;
          const msg = err?.response?.data?.message ?? err?.message ?? (e instanceof Error ? e.message : "Lỗi tải dữ liệu");
          let display = msg;
          if (status === 404) display = msg || "Không tìm thấy. Kiểm tra ID hoặc backend.";
          else if (status === 403) display = msg || "Không có quyền (cần team DEPLOYMENT).";
          setError(display);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId, phaseId]);

  const columns = workItems.length > 0 ? workItemsToColumns(workItems) : workItemsToColumns([]);

  // Completion % = completed tasks / all tasks in this phase (user request: "tính theo phần trăm hoàn thành trên tất cả")
  const totalTasks = workItems.length;
  const completedCount = workItems.filter((w) => w.status === "completed").length;
  const phaseProgressPercent =
    totalTasks === 0 ? (phase?.progress ?? 0) : Math.round((completedCount / totalTasks) * 100);
  // Allow "Hoàn thành" phase only when all tasks in this phase are completed (and there is at least one task)
  const allTasksCompleted = totalTasks > 0 && completedCount === totalTasks;

  const getTaskById = useCallback((id: string) => {
    const w = workItems.find((x) => String(x.id) === id);
    return w ? toTaskCard(w) : null;
  }, [workItems]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        openMenuTaskId &&
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuTaskId, closeMenu]);

  const handleTaskAction = async (taskId: string, action: "add" | "edit" | "delete") => {
    closeMenu();
    const numId = Number(taskId);
    if (action === "add") {
      try {
        const detail = await fetchWorkItemDetail(taskId);
        const w = workItems.find((x) => x.id === numId);
        const detailTaskData: TaskDetail = {
          id: String(detail.id),
          title: detail.title,
          description: detail.description ?? detail.title,
          assignee: detail.assignee ?? "—",
          assigneeInitials: detail.assigneeInitials ?? "—",
          startDate: detail.createdAt ?? "",
          dueDate: detail.dueDate ?? undefined,
          createdAt: detail.createdAt,
          completedAt: detail.completedAt,
          status: (w?.status as TaskDetail["status"]) ?? (detail.status as TaskDetail["status"]) ?? "todo",
          isBlocked: (detail.status ?? w?.status) === "blocked",
          blockedReason: detail.blockedReason ?? undefined,
          estimatedResolution: detail.estimatedResolution ?? undefined,
        };
        setDetailTask(detailTaskData);
        setWorkItemDetail(detail);
        setIsDetailOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải chi tiết");
      }
      return;
    }
    if (action === "edit") {
      const w = workItems.find((x) => String(x.id) === taskId);
      if (!w) return;
      const impact = w.impact === "critical" ? "critical" : w.impact === "normal" ? "normal" : null;
      const editInitial: EditTaskInitial = {
        id: String(w.id),
        title: w.title,
        description: w.description ?? "",
        status: w.status,
        assignee: w.assignee ?? "",
        assigneeInitials: w.assigneeInitials ?? "—",
        assigneeUserId: w.assigneeUserId ?? undefined,
        dueDate: w.dueDate ? (w.dueDate.includes("-") ? w.dueDate.slice(0, 10) : "") : "",
        tags: w.tags ?? [],
        impact,
        blockedReason: w.blockedReason ?? undefined,
        estimatedResolution: w.estimatedResolution ?? undefined,
        version: w.version ?? undefined,
      };
      setEditTask(editInitial);
      setIsAddTaskOpen(true);
      return;
    }
    if (action === "delete") {
      if (!window.confirm("Bạn có chắc muốn xóa công việc này?")) return;
      try {
        await deleteWorkItem(taskId);
        const mid = resolvedMilestoneId ?? phaseId;
        const items = await fetchWorkItems({ implementationTaskId: hospitalId!, milestoneId: mid });
        setWorkItems(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi xóa");
      }
    }
  };

  const handleDrop = useCallback(async (targetStatus: string, workItemId: string) => {
    const w = workItems.find((x) => String(x.id) === workItemId);
    if (!w || w.status === targetStatus) return;
    const targetCol = columns.find((c) => c.id === targetStatus);
    const newOrder = (targetCol?.tasks.length ?? 0);
    try {
      await moveWorkItem(workItemId, targetStatus, newOrder);
      const mid = resolvedMilestoneId ?? phaseId;
      const items = await fetchWorkItems({ implementationTaskId: hospitalId!, milestoneId: mid });
      setWorkItems(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi di chuyển");
    }
  }, [workItems, columns, hospitalId, phaseId, resolvedMilestoneId]);

  const handleAddTaskSubmit = async (values: AddTaskFormValues, taskId?: string) => {
    const mid = resolvedMilestoneId ?? phaseId;
    if (!hospitalId || !mid) return;
    try {
      if (taskId) {
        const edit = editTask;
        const payload = { ...values, assigneeUserId: values.assigneeUserId ?? edit?.assigneeUserId, version: edit?.version };
        await updateWorkItem(taskId, payload);
      } else {
        await createWorkItem({
          implementationTaskId: hospitalId,
          milestoneId: mid,
          values,
        });
      }
      const items = await fetchWorkItems({ implementationTaskId: hospitalId, milestoneId: mid });
      setWorkItems(items);
      setIsAddTaskOpen(false);
      setEditTask(null);
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string };
      const status = err?.response?.status;
      const msg = err?.message ?? (e instanceof Error ? e.message : "Lỗi lưu");
      if (status === 404) {
        setError("API thêm công việc chưa có trên server (404). Backend cần triển khai POST /api/v1/work-items hoặc POST .../implementation-tasks/:id/work-items.");
      } else {
        setError(msg);
      }
    }
  };

  const isSuperAdmin = window.location.pathname.startsWith("/superadmin");
  const basePath = isSuperAdmin
    ? "/superadmin/implementation-tasks-new"
    : "/implementation-tasks-new";
  const navigate = useNavigate();
  const location = useLocation();
  const listPath = implTasksListTo(basePath, parseListSearchFromState(location.state));

  const handleCompletePhaseClick = () => {
    setShowCompletePhaseConfirm(true);
  };

  const handleCompletePhaseConfirm = async () => {
    if (!hospitalId || !phase || !resolvedMilestoneId) return;
    setCompletingPhase(true);
    setError(null);
    try {
      await completeMilestone(hospitalId, resolvedMilestoneId);
      setShowCompletePhaseConfirm(false);
      const nextPhase = phase.number + 1;
      if (nextPhase <= 4) {
        navigate(`${basePath}/${hospitalId}/${nextPhase}`, { state: location.state });
      } else {
        navigate(`${basePath}/${hospitalId}`, { state: location.state });
      }
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string };
      const status = err?.response?.status;
      // 404/501 = backend chưa có API; vẫn chuyển trang
      if (status === 404 || status === 501) {
        setShowCompletePhaseConfirm(false);
        const nextPhase = phase.number + 1;
        if (nextPhase <= 4) {
          navigate(`${basePath}/${hospitalId}/${nextPhase}`, { state: location.state });
        } else {
          navigate(`${basePath}/${hospitalId}`, { state: location.state });
        }
      } else {
        const msg = e instanceof Error ? e.message : "Không thể hoàn thành giai đoạn.";
        setError(msg);
        setShowCompletePhaseConfirm(false);
      }
    } finally {
      setCompletingPhase(false);
    }
  };

  const handleCompletePhaseCancel = () => {
    setShowCompletePhaseConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !task || !phase) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error ?? "Không tìm thấy dữ liệu"}
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          {hospitalId && (
            <Link
              to={`${basePath}/${hospitalId}`}
              state={location.state}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              ← Quay lại lộ trình giai đoạn
            </Link>
          )}
          <Link to={listPath} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title={`${phase.label} | ${task.hospitalName} | TAGTECH`}
        description="Kanban bảng công việc theo giai đoạn"
      />

      {/* Confirm complete phase modal */}
      {showCompletePhaseConfirm && phase && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-phase-title"
          onClick={handleCompletePhaseCancel}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="complete-phase-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
              Xác nhận hoàn thành giai đoạn
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {phase.number < 4
                ? `Bạn có muốn hoàn thành công việc của giai đoạn ${phase.number} để sang giai đoạn ${phase.number + 1}?`
                : "Bạn có muốn hoàn thành công việc của giai đoạn 4? Sau đó bạn sẽ quay lại lộ trình giai đoạn."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCompletePhaseCancel}
                disabled={completingPhase}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCompletePhaseConfirm}
                disabled={completingPhase}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {completingPhase ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Đang xử lý...
                  </>
                ) : (
                  "Có"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-1.5 px-4 pt-4 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Link to={listPath} className="hover:text-blue-600 dark:hover:text-blue-400">
                  Bệnh viện
                </Link>
                <span className="text-slate-400">›</span>
                <Link
                  to={`${basePath}/${hospitalId}`}
                  state={location.state}
                  className="hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {task.hospitalName}
                </Link>
                <span className="text-slate-400">›</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Giai đoạn {phase.number}
                </span>
              </nav>
        {/* Sticky Header - Grid layout (Jira/Linear style) */}
        <header className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto grid max-w-7xl grid-cols-12 gap-x-4 gap-y-3">
            {/* LEFT: Phase title + progress (6 cols) */}
            <div className="col-span-12 space-y-2 lg:col-span-6">
              <div className="flex items-center justify-between gap-3">
                <h1 className="flex min-w-0 items-center gap-1.5 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  <BoxIconLine className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="truncate">{phase.label ?? `Giai đoạn ${phase.number}`}</span>
                </h1>
                <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  {phaseProgressPercent}% Hoàn tất
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500 dark:bg-blue-500"
                  style={{ width: `${phaseProgressPercent}%` }}
                />
              </div>
            </div>

            {/* CENTER: Search (3 cols) */}
            {/* <div className="col-span-8 sm:col-span-6 lg:col-span-3">
              <div className="relative w-full">
                <svg
                  className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Tìm kiếm công việc..."
                  className="w-full rounded-lg border-0 bg-slate-100 py-1.5 pl-9 pr-3 text-xs placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/50 dark:bg-slate-800 dark:placeholder:text-slate-400"
                />
              </div>
            </div> */}

            

            {/* Row 2: Filters (left) + Add task + Report issue (right) */}
            <div className="col-span-12 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Lọc theo Danh mục
                  <ChevronDownIcon className="size-3.5 shrink-0 text-slate-500" />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <UserIcon className="size-3.5 shrink-0" />
                  Phụ trách
                  <ChevronDownIcon className="size-3.5 shrink-0 text-slate-500" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTaskOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-600/90"
                >
                  <PlusIcon className="size-3.5" />
                  Thêm công việc
                </button>
                <button
                  type="button"
                  disabled={!allTasksCompleted}
                  onClick={handleCompletePhaseClick}
                  title={allTasksCompleted ? "Đánh dấu hoàn thành giai đoạn" : "Chỉ bấm được khi toàn bộ công việc đã hoàn thành"}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                    allTasksCompleted
                      ? "border-green-200 bg-green-50 text-green-600 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
                      : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                  }`}
                >
                  <CheckLineIcon className="size-3.5 shrink-0" />
                  Hoàn thành
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Kanban board */}
        <main className="flex-1 overflow-x-auto p-4">
          <div className="flex min-h-[calc(100vh-200px)] gap-10 justify-center">
            {columns.map((col) => {
              const cfg = COLUMN_CONFIG[col.id] ?? COLUMN_CONFIG.todo;
              return (
                <div
                  key={col.id}
                  className="flex min-w-[260px] w-[260px] flex-col gap-2"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-blue-400"); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-blue-400"); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("ring-2", "ring-blue-400");
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) handleDrop(col.id, id);
                  }}
                >
                  {/* Column header */}
                  <div className="px-0.5">
                    <h3 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${cfg?.header ?? ""}`}>
                      {col.title}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${cfg?.pill ?? ""}`}>
                        {col.count}
                      </span>
                    </h3>
                  </div>

                  {/* Task cards container */}
                  <div className={`flex flex-1 flex-col gap-2 rounded-lg p-1.5 ${cfg?.bg ?? ""}`}>
                    {col.tasks.map((w) => {
                      const task = toTaskCard(w);
                      const isBlockedCard = col.id === "blocked";
                      const isCompletedCard = task.impact === "done";
                      const isCriticalTodo = col.id === "todo" && task.impact === "critical";
                      return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }}
                        className={`group flex flex-col gap-2 rounded-lg p-3 shadow-sm transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing ${
                          isBlockedCard
                            ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/25"
                            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 " + (isCriticalTodo ? "border-l-4 border-l-red-500" : "")
                        } ${isCompletedCard ? "opacity-75 hover:opacity-100" : ""}`}
                      >
                        {/* Card header */}
                        <div className="flex items-start justify-between">
                          <div className="flex flex-wrap gap-1.5">
                            {task.impact === "critical" && (
                              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${
                                isBlockedCard
                                  ? "bg-red-600 text-white shadow-sm"
                                  : "border border-red-200 bg-red-100 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                              }`}>
                                Khẩn cấp
                              </span>
                            )}
                            {isBlockedCard && task.impact !== "critical" && (
                              <span className="rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300">
                                Đang chặn
                              </span>
                            )}
                            {task.impact === "normal" && (
                              <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                Bình thường
                              </span>
                            )}
                            {task.impact === "done" && (
                              <span className="rounded border border-green-100 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Xong
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {task.impact === "done" && (
                              <CheckLineIcon className="size-5 text-green-500" />
                            )}
                            {isBlockedCard && (
                              <svg className="size-5 font-bold text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            {/* {isCriticalTodo && (
                              <span className="cursor-grab text-slate-300 group-hover:text-slate-500">
                                <svg className="size-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"/></svg>
                              </span>
                            )} */}
                            <button
                              type="button"
                              onClick={(e) => {
                                if (openMenuTaskId === task.id) {
                                  closeMenu();
                                } else {
                                  openMenu(task.id, e.currentTarget);
                                }
                              }}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                              aria-label="Mở menu thao tác"
                            >
                              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                            </button>
                          </div>
                        </div>

                        <p className={`text-xs font-bold leading-snug text-slate-800 dark:text-slate-200 ${isCompletedCard ? "line-through text-slate-400" : ""}`}>
                          {task.title}
                        </p>

                        {/* Blocked reason box - red style like reference */}
                        {task.blockedReason && (
                          <div className="flex flex-col gap-1.5 rounded border border-red-100 bg-red-50 p-2 dark:border-red-800 dark:bg-red-900/30">
                            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                              <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[11px] font-bold uppercase">Lý do chặn:</span>
                            </div>
                            <p className="text-xs leading-tight text-red-900 dark:text-red-200">{task.blockedReason}</p>
                            <div className="mt-1 flex items-center justify-between">
                              {(task as { blockedReasonTag?: string }).blockedReasonTag && (
                                <span className="rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:border-red-800 dark:bg-red-900 dark:text-red-300">
                                  {(task as { blockedReasonTag?: string }).blockedReasonTag}
                                </span>
                              )}
                              {(task as { estimatedResolution?: string }).estimatedResolution && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-bold uppercase tracking-tighter text-red-500">Dự kiến xử lý</span>
                                  <span className="text-[11px] font-bold text-red-700 dark:text-red-400">
                                    {formatDateDMY((task as { estimatedResolution?: string }).estimatedResolution)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tags - match reference: HIS=slate, Mạng=blue, Lắp đặt=slate, Phần cứng=indigo, Đào tạo=yellow, Nghiệm thu=slate */}
                        <div className="flex flex-wrap gap-1.5">
                          {task.tags.map((tag) => {
                            const tagClass =
                              tag === "Đào tạo"
                                ? "border border-yellow-100 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : tag === "Nghiệm thu"
                                  ? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                                  : tag === "Mạng"
                                    ? "border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                    : tag === "Phần cứng"
                                      ? "border border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
                            return (
                              <span key={tag} className={`rounded px-2 py-0.5 text-[10px] font-medium ${tagClass}`}>
                                {tag}
                              </span>
                            );
                          })}
                        </div>

                        {/* Assignee + Due date */}
                        <div className="mt-1.5 flex items-center justify-between border-t border-slate-50 pt-2 dark:border-slate-700">
                          <div className="flex min-w-0 items-center gap-2">
                            {(task as { usePersonIcon?: boolean }).usePersonIcon ? (
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-700">
                                <UserIcon className="size-2.5" />
                              </div>
                            ) : (
                              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${AVATAR_COLORS[task.assigneeInitials] ?? "bg-blue-100 text-blue-600"}`}>
                                {task.assigneeInitials}
                              </div>
                            )}
                            <span className="truncate text-[10px] font-medium text-slate-500">{task.assignee}</span>
                          </div>
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 text-[10px] ${task.isOverdue ? "font-bold italic text-red-500" : "font-medium text-slate-400"}`}>
                              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDateDMY(task.dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                    })}

                    
                  </div>
                </div>
              );
            })}
            {/* Add new column button */}
            {/* <div className="flex min-w-[260px] w-[260px] flex-col justify-start">
              <button
                type="button"
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-200/40 font-bold text-xs text-slate-500 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800"
              >
                <PlusIcon className="size-3.5" />
                Thêm cột mới
              </button>
            </div> */}
          </div>
        </main>

        {/* Footer stats bar */}
        <footer className="flex items-center justify-between rounded-b-xl border-t border-slate-200 bg-white px-4 py-3 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              <span>4 Công việc Đang làm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>1 Công việc bị chặn khẩn cấp</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>12 Công việc Hoàn thành</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* <span className="flex items-center gap-1">
              <UserCircleIcon className="size-3.5" />
              5 người đang trực tuyến
            </span> */}
            <span className="flex items-center gap-1">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Cập nhật 2 phút trước
            </span>
          </div>
        </footer>
      </div>

      {/* Task detail panel - right-side popup */}
      <ViewTaskPhaseImplementation
        task={detailTask}
        activityLog={workItemDetail?.activityLog}
        comments={workItemDetail?.comments}
        onSendComment={detailTask ? async (content) => {
          await addWorkItemComment(detailTask.id, content);
          const refreshed = await fetchWorkItemDetail(detailTask.id);
          setWorkItemDetail(refreshed);
        } : undefined}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setDetailTask(null);
          setWorkItemDetail(null);
        }}
      />

      {/* Add task panel - right-side popup */}
      <AddTaskPhaseImplementation
        isOpen={isAddTaskOpen}
        onClose={() => {
          setIsAddTaskOpen(false);
          setEditTask(null);
        }}
        onSubmit={handleAddTaskSubmit}
        editTask={editTask}
      />

      {/* Task action menu portal */}
      {openMenuTaskId &&
        menuAnchor &&
        createPortal(
          (() => {
            const task = getTaskById(openMenuTaskId);
            if (!task) return null;
            const spaceBelow = window.innerHeight - (menuAnchor.bottom + 8);
            const openUpward = spaceBelow < MENU_HEIGHT;
            const top = openUpward
              ? menuAnchor.top - MENU_HEIGHT - 4
              : menuAnchor.bottom + 4;
            const left = Math.max(
              8,
              Math.min(
                menuAnchor.right - 160,
                window.innerWidth - 160 - 8
              )
            );
            return (
              <div
                ref={dropdownRef}
                className="fixed z-[9999] min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                style={{ top, left }}
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => handleTaskAction(task.id, "add")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <EyeIcon className="size-3.5 shrink-0" />
                  Xem
                </button>
                <button
                  type="button"
                  onClick={() => handleTaskAction(task.id, "edit")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <PencilIcon className="size-3.5 shrink-0" />
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => handleTaskAction(task.id, "delete")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <TrashBinIcon className="size-3.5 shrink-0" />
                  Xóa
                </button>
              </div>
            );
          })(),
          document.body
        )}
    </>
  );
}
