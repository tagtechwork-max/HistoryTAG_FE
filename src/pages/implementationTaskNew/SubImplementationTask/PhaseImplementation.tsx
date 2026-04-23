import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import flatpickr from "flatpickr";
import { Vietnamese } from "flatpickr/dist/l10n/vn";
import PageMeta from "../../../components/common/PageMeta";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import {
  CalenderIcon,
  UserIcon,
  ListIcon,
  CheckLineIcon,
  DownloadIcon,
  PlusIcon,
  ArrowRightIcon,
  BoxIconLine,
  PlugInIcon,
} from "../../../icons";
import {
  fetchImplementationTaskDetail,
  fetchMilestones,
  fetchWorkItems,
  fetchWorkItemDetail,
  fetchSupplementalTasks,
  fetchSupplementalTaskAssignees,
  createSupplementalTask,
  updateSupplementalTask,
  deleteSupplementalTask,
  type ImplementationTaskDetail,
  type MilestoneDto,
  type WorkItemListDto,
  type SupplementalTaskAssigneeOption,
  type SupplementalTaskItem,
} from "../../../api/api";
import { implTasksListTo, parseListSearchFromState } from "./implListNav";

function formatDate(d: string | null): string {
  if (!d) return "—";
  if (d.includes("T")) return d.slice(0, 10).split("-").reverse().join("/");
  return d.split("-").reverse().join("/");
}

function toDateInputValue(d: string | null | undefined): string {
  if (!d) return "";
  return d.includes("T") ? d.slice(0, 10) : d;
}

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type PhaseStatus = "completed" | "in_progress" | "not_started";

/** Default for new hospital: Phase 1 in progress, others not started */
const MOCK_PHASES_FALLBACK: (MilestoneDto & { status: PhaseStatus })[] = [
  {
    id: 1,
    number: 1,
    status: "in_progress",
    label: "Giai đoạn 1: Thu thập thông tin",
    progress: 0,
    openTasks: 0,
  },
  {
    id: 2,
    number: 2,
    status: "not_started",
    label: "Giai đoạn 2: Cài đặt cơ bản",
    progress: 0,
    estimatedTasks: 0,
  },
  {
    id: 3,
    number: 3,
    status: "not_started",
    label: "Giai đoạn 3: Giám sát & Khắc phục",
    progress: 0,
    estimatedTasks: 15,
  },
  {
    id: 4,
    number: 4,
    status: "not_started",
    label: "Giai đoạn 4: Nghiệm thu & Vận hành",
    progress: 0,
    estimatedTasks: 8,
  },
];

const MOCK_TASKS = [
  {
    id: "1",
    title: "Cấu hình tường lửa phần cứng",
    assignedTo: "Đội ngũ kỹ thuật",
    status: "blocked",
    icon: "alert",
  },
  {
    id: "2",
    title: "Kiểm tra nguồn điện tại địa điểm",
    assignedTo: "Rachel Z.",
    status: "in_progress",
    icon: "clock",
  },
  {
    id: "3",
    title: "Lập bản đồ sơ đồ mạng",
    completedBy: "Mike Ross",
    status: "completed",
    icon: "check",
  },
];

/** Status config for work item list - include todo */
const WORK_ITEM_STATUS_CONFIG: Record<
  string,
  { label: string; icon: "alert" | "clock" | "check" | "todo"; pillClass: string }
> = {
  blocked: {
    label: "ĐANG CHẶN",
    icon: "alert",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  in_progress: {
    label: "ĐANG THỰC HIỆN",
    icon: "clock",
    pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  completed: {
    label: "HOÀN THÀNH",
    icon: "check",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  todo: {
    label: "CẦN LÀM",
    icon: "todo",
    pillClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

const PHASE_STATUS_CONFIG: Record<
  PhaseStatus,
  { label: string; circleClass: string; pillClass: string }
> = {
  completed: {
    label: "HOÀN THÀNH",
    circleClass: "bg-emerald-500 text-white",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  in_progress: {
    label: "ĐANG THỰC HIỆN",
    circleClass: "bg-blue-500 text-white",
    pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  not_started: {
    label: "CHƯA BẮT ĐẦU",
    circleClass: "bg-slate-300 text-slate-600 dark:bg-slate-600 dark:text-slate-200",
    pillClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

/** Health status for overview card: label + pill style (25% per completed phase, 100% when all 4 done) */
const HEALTH_DISPLAY: Record<
  string,
  { label: string; pillClass: string; dotClass: string }
> = {
  completed: {
    label: "Hoàn thành",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  in_progress: {
    label: "Đang triển khai",
    pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  at_risk: {
    label: "Có rủi ro",
    pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    dotClass: "bg-amber-500",
  },
  blocked: {
    label: "Đang bị chặn",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    dotClass: "bg-red-500",
  },
};

const TASK_STATUS_CONFIG: Record<
  string,
  { label: string; icon: string; pillClass: string }
> = {
  blocked: {
    label: "ĐANG CHẶN",
    icon: "alert",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  in_progress: {
    label: "ĐANG THỰC HIỆN",
    icon: "clock",
    pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  completed: {
    label: "HOÀN THÀNH",
    icon: "check",
    pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};

type SupplementalFormState = {
  taskName: string;
  assigneeUserId: string;
  startDate: string;
  deadline: string;
  status: string;
  note: string;
};

const SUPPLEMENTAL_STATUS_OPTIONS = [
  { value: "RECEIVED", label: "Đã tiếp nhận" },
  { value: "IN_PROCESS", label: "Đang xử lý" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "ISSUE", label: "Gặp sự cố" },
  { value: "CANCELLED", label: "Hủy" },
];

const SUPPLEMENTAL_STATUS_BADGE_CLASS: Record<string, string> = {
  RECEIVED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  IN_PROCESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  ISSUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

/**
 * Phase Implementation - Chi tiết triển khai theo giai đoạn
 * Màn hình chi tiết viện với đầu mục (phases) và task con
 */
export default function PhaseImplementation() {
  const { hospitalId } = useParams<{ hospitalId: string }>();
  const location = useLocation();
  const [task, setTask] = useState<ImplementationTaskDetail | null>(null);
  const [phases, setPhases] = useState<(MilestoneDto & { status: PhaseStatus })[]>([]);
  const [recentWorkItems, setRecentWorkItems] = useState<WorkItemListDto[]>([]);
  const [currentPhaseCommentCount, setCurrentPhaseCommentCount] = useState(0);
  const [supplementalTasks, setSupplementalTasks] = useState<SupplementalTaskItem[]>([]);
  const [supplementalAssignees, setSupplementalAssignees] = useState<SupplementalTaskAssigneeOption[]>([]);
  const [supplementalLoading, setSupplementalLoading] = useState(false);
  const [supplementalModalOpen, setSupplementalModalOpen] = useState(false);
  const [editingSupplementalTask, setEditingSupplementalTask] = useState<SupplementalTaskItem | null>(null);
  const [detailModalTask, setDetailModalTask] = useState<SupplementalTaskItem | null>(null);
  const [savingSupplementalTask, setSavingSupplementalTask] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupplementalTaskItem | null>(null);
  const [deletingSupplementalTask, setDeletingSupplementalTask] = useState(false);
  const [supplementalForm, setSupplementalForm] = useState<SupplementalFormState>({
    taskName: "",
    assigneeUserId: "",
    startDate: "",
    deadline: "",
    status: "RECEIVED",
    note: "",
  });
  const deadlineDateRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = window.location.pathname.startsWith("/superadmin");
  const basePath = isSuperAdmin ? "/superadmin/implementation-tasks-new" : "/implementation-tasks-new";
  const listPath = implTasksListTo(basePath, parseListSearchFromState(location.state));

  useEffect(() => {
    if (!hospitalId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchImplementationTaskDetail(hospitalId),
      fetchMilestones(hospitalId),
    ])
      .then(([detail, milestones]) => {
        if (cancelled) return;
        setTask(detail);
        // Phase status from API only: "completed" only when user clicked "Hoàn thành" in Kanban (completeMilestone). Do not derive from work items %.
        const phaseList = milestones.map((m) => {
          let status: PhaseStatus = "not_started";
          if (m.status === "completed") status = "completed";
          else if (m.status === "in_progress") status = "in_progress";
          return { ...m, status };
        });
        setPhases(phaseList.length > 0 ? phaseList : MOCK_PHASES_FALLBACK);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
          const status = err?.response?.status;
          const msg = err?.response?.data?.message ?? err?.message ?? (e instanceof Error ? e.message : "Lỗi tải dữ liệu");
          let display = msg;
          if (status === 404) {
            display = msg || "Không tìm thấy dữ liệu. Kiểm tra ID hoặc backend API đã chạy chưa.";
          } else if (status === 403) {
            display = msg || "Không có quyền truy cập. Cần team DEPLOYMENT.";
          } else if (status === 401) {
            display = msg || "Chưa đăng nhập hoặc phiên hết hạn.";
          }
          setError(display);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  useEffect(() => {
    if (!supplementalModalOpen) return;
    const deadlineEl = deadlineDateRef.current;
    if (!deadlineEl) return;

    const fp = flatpickr(deadlineEl, {
      locale: Vietnamese,
      dateFormat: "Y-m-d",
      defaultDate: supplementalForm.deadline || undefined,
      static: true,
      monthSelectorType: "static",
      onChange: (selectedDates) => {
        const d = selectedDates?.[0];
        if (!d) return;
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        setSupplementalForm((prev) => ({ ...prev, deadline: v }));
      },
    });
    return () => {
      fp.destroy();
    };
  }, [supplementalModalOpen, supplementalForm.deadline]);

  // Fetch 3 most recently added work items for current phase (after we have phases + hospital)
  useEffect(() => {
    if (!hospitalId || phases.length === 0 || !task) {
      setRecentWorkItems([]);
      setCurrentPhaseCommentCount(0);
      return;
    }
    const completedCount = phases.filter((p) => p.status === "completed").length;
    const currentPhaseNumber =
      phases.length === 4 && completedCount === 4 ? 4 : (task.currentPhase ?? 1);
    const currentPhase = phases.find((p) => p.number === currentPhaseNumber);
    if (!currentPhase) {
      setRecentWorkItems([]);
      return;
    }
    let cancelled = false;
    fetchWorkItems({ implementationTaskId: hospitalId, milestoneId: String(currentPhase.id) })
      .then(async (items) => {
        if (cancelled) return;
        // Sort by createdAt desc (newest first), then take 3
        const sorted = [...items].sort((a, b) => {
          const aAt = a.createdAt ?? "";
          const bAt = b.createdAt ?? "";
          if (aAt !== bAt) return bAt.localeCompare(aAt);
          return (b.id ?? 0) - (a.id ?? 0);
        });
        setRecentWorkItems(sorted.slice(0, 3));
        if (!items.length) {
          setCurrentPhaseCommentCount(0);
          return;
        }
        const details = await Promise.all(
          items.map((item) =>
            fetchWorkItemDetail(item.id).catch(() => null)
          )
        );
        if (cancelled) return;
        const totalComments = details.reduce((sum, detail) => {
          if (!detail || !Array.isArray(detail.comments)) return sum;
          return sum + detail.comments.length;
        }, 0);
        setCurrentPhaseCommentCount(totalComments);
      })
      .catch(() => {
        if (!cancelled) {
          setRecentWorkItems([]);
          setCurrentPhaseCommentCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId, phases, task]);

  useEffect(() => {
    if (!hospitalId) return;
    let cancelled = false;
    setSupplementalLoading(true);
    Promise.all([fetchSupplementalTasks(hospitalId), fetchSupplementalTaskAssignees()])
      .then(([tasks, assignees]) => {
        if (cancelled) return;
        setSupplementalTasks(tasks);
        setSupplementalAssignees(assignees);
      })
      .catch(() => {
        if (cancelled) return;
        setSupplementalTasks([]);
        setSupplementalAssignees([]);
      })
      .finally(() => {
        if (!cancelled) setSupplementalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  const assigneeNameById = useMemo(() => {
    const map = new Map<number, string>();
    supplementalAssignees.forEach((a) => map.set(a.id, a.fullName));
    return map;
  }, [supplementalAssignees]);

  const hospital = task && phases.length > 0
    ? (() => {
        const completedPhaseCount = phases.filter((p) => p.status === "completed").length;
        // 25% per completed phase (1=25%, 2=50%, 3=75%, 4=100%)
        const progressFromPhases =
          phases.length === 4 ? Math.round((completedPhaseCount / 4) * 100) : Number(task.progress ?? 0);
        const allPhasesCompleted = phases.length === 4 && completedPhaseCount === 4;
        const health = allPhasesCompleted ? "completed" : (task.health ?? "in_progress");
        const healthDisplay = HEALTH_DISPLAY[health] ?? HEALTH_DISPLAY.in_progress;
        return {
          name: task.hospitalName ?? task.name ?? "—",
          operationDate: formatDate(task.operationDate ?? task.startDate ?? null),
          pmName: task.pmName ?? "—",
          supportEngineerNames: task.supportEngineerNames ?? (task.engineerName ? [task.engineerName] : []),
          health,
          healthLabel: healthDisplay.label,
          healthPillClass: healthDisplay.pillClass,
          healthDotClass: healthDisplay.dotClass,
          currentPhase: allPhasesCompleted ? 4 : (task.currentPhase ?? 1),
          currentPhaseLabel: allPhasesCompleted
            ? "Tất cả giai đoạn đã hoàn thành"
            : (task.currentPhaseLabel ?? "Giai đoạn 1"),
          progress: progressFromPhases,
        };
      })()
    : task
      ? {
          name: task.hospitalName ?? task.name ?? "—",
          operationDate: formatDate(task.operationDate ?? task.startDate ?? null),
          pmName: task.pmName ?? "—",
          supportEngineerNames: task.supportEngineerNames ?? (task.engineerName ? [task.engineerName] : []),
          health: task.health ?? "in_progress",
          healthLabel: (HEALTH_DISPLAY[task.health ?? "in_progress"] ?? HEALTH_DISPLAY.in_progress).label,
          healthPillClass: (HEALTH_DISPLAY[task.health ?? "in_progress"] ?? HEALTH_DISPLAY.in_progress).pillClass,
          healthDotClass: (HEALTH_DISPLAY[task.health ?? "in_progress"] ?? HEALTH_DISPLAY.in_progress).dotClass,
          currentPhase: task.currentPhase ?? 1,
          currentPhaseLabel: task.currentPhaseLabel ?? "Giai đoạn 1",
          progress: Number(task.progress ?? 0),
        }
      : null;

  const openCreateSupplementalModal = () => {
    const defaultAssigneeId = task?.pmUserId ? String(task.pmUserId) : "";
    setEditingSupplementalTask(null);
    setSupplementalForm({
      taskName: "",
      assigneeUserId: defaultAssigneeId,
      startDate: todayIsoDate(),
      deadline: "",
      status: "RECEIVED",
      note: "",
    });
    setSupplementalModalOpen(true);
  };

  const openEditSupplementalModal = (item: SupplementalTaskItem) => {
    setEditingSupplementalTask(item);
    setSupplementalForm({
      taskName: item.taskName ?? "",
      assigneeUserId: item.assigneeUserId ? String(item.assigneeUserId) : "",
      startDate: toDateInputValue(item.startDate),
      deadline: toDateInputValue(item.deadline),
      status: item.status ?? "RECEIVED",
      note: item.note ?? "",
    });
    setSupplementalModalOpen(true);
  };

  const submitSupplementalTask = async () => {
    if (!hospitalId) return;
    if (!supplementalForm.taskName.trim()) {
      toast.error("Vui lòng nhập tên công việc.");
      return;
    }
    if (!supplementalForm.assigneeUserId) {
      toast.error("Vui lòng chọn người phụ trách.");
      return;
    }
    if (supplementalForm.startDate && supplementalForm.deadline && supplementalForm.deadline < supplementalForm.startDate) {
      toast.error("Deadline phải lớn hơn hoặc bằng thời gian bắt đầu.");
      return;
    }
    const assigneeUserId = Number(supplementalForm.assigneeUserId);
    if (!Number.isFinite(assigneeUserId) || assigneeUserId <= 0) {
      toast.error("Người phụ trách không hợp lệ.");
      return;
    }
    setSavingSupplementalTask(true);
    try {
      const payload = {
        taskName: supplementalForm.taskName.trim(),
        assigneeUserId,
        startDate: editingSupplementalTask ? (supplementalForm.startDate || null) : todayIsoDate(),
        deadline: supplementalForm.deadline || null,
        status: supplementalForm.status,
        note: supplementalForm.note.trim() || null,
        version: editingSupplementalTask?.version,
      };
      if (editingSupplementalTask) {
        const updated = await updateSupplementalTask(hospitalId, editingSupplementalTask.id, payload);
        setSupplementalTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        toast.success("Cập nhật công việc bổ sung thành công.");
      } else {
        const created = await createSupplementalTask(hospitalId, payload);
        setSupplementalTasks((prev) => [...prev, created]);
        toast.success("Thêm công việc bổ sung thành công.");
      }
      setSupplementalModalOpen(false);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message ?? err?.message ?? "Không thể lưu công việc bổ sung.");
    } finally {
      setSavingSupplementalTask(false);
    }
  };

  const confirmDeleteSupplementalTask = async () => {
    if (!hospitalId || !deleteTarget) return;
    setDeletingSupplementalTask(true);
    try {
      await deleteSupplementalTask(hospitalId, deleteTarget.id);
      setSupplementalTasks((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Đã xóa công việc bổ sung.");
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message ?? err?.message ?? "Không thể xóa công việc bổ sung.");
    } finally {
      setDeletingSupplementalTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !hospital) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error ?? "Không tìm thấy dữ liệu"}
        </div>
        <Link
          to={listPath}
          className="mt-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title={`${hospital.name} | Triển khai Kiosk | TAGTECH`}
        description="Chi tiết triển khai theo giai đoạn"
      />
      <div className="p-4">
        {/* Breadcrumbs */}
        <nav className="mb-4 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Link
            to={listPath}
            className="hover:text-blue-600 dark:hover:text-blue-400"
          >
            Bệnh viện
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{hospital.name}</span>
        </nav>

        {/* Hospital Overview Card */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                <BoxIconLine className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {hospital.name}
                </h1>
                <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <CalenderIcon className="size-3.5 shrink-0" />
                    <span>Ngày vận hành: {hospital.operationDate}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserIcon className="size-3.5 shrink-0" />
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      PTC: {hospital.pmName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlugInIcon className="size-3.5 shrink-0" />
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Kỹ thuật hỗ trợ:{" "}
                      {hospital.supportEngineerNames.length > 0
                        ? hospital.supportEngineerNames.join(", ")
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${hospital.healthPillClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${hospital.healthDotClass}`} />
                TÌNH TRẠNG: {hospital.healthLabel}
              </span>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Giai đoạn hiện tại
                </p>
                <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">
                  {hospital.currentPhaseLabel}
                </p>
                {currentPhaseCommentCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                    {currentPhaseCommentCount} bình luận mới
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-xs font-bold text-blue-600 dark:bg-slate-900 dark:text-blue-400">
                    {hospital.progress}%
                  </div>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
                    title="Tải xuống"
                  >
                    <DownloadIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    Báo cáo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Implementation Roadmap */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <BoxIconLine className="size-4" />
            Lộ trình triển khai hệ thống
          </h2>
          <div className="flex flex-wrap items-stretch">
            {phases.map((phase, index) => {
              const cfg = PHASE_STATUS_CONFIG[phase.status];
              // When all 4 phases are completed, no phase is "current" – all dimmed and not clickable
              const allPhasesCompleted =
                phases.length === 4 && phases.every((p) => p.status === "completed");
              const isCurrentPhase =
                !allPhasesCompleted && phase.number === hospital.currentPhase;
              const baseClasses = `min-w-[200px] flex-1 rounded-lg border p-3 block ${
                isCurrentPhase
                  ? "border-blue-500 bg-blue-50/50 transition hover:border-blue-400 hover:shadow-md dark:border-blue-500 dark:bg-blue-900/10 dark:hover:border-blue-600"
                  : "cursor-not-allowed border-slate-200 opacity-60 dark:border-slate-700"
              }`;
              const content = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${cfg.circleClass}`}
                    >
                      {phase.number}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.pillClass}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {phase.label}
                  </p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p>
                      Tiến độ:{" "}
                      <span
                        className={`font-semibold ${
                          phase.status === "completed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : phase.status === "in_progress"
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {phase.progress}%
                      </span>
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {phase.status === "not_started"
                        ? `${phase.estimatedTasks ?? 0} tác vụ dự kiến`
                        : `${phase.openTasks ?? 0} tác vụ mở`}
                    </p>
                  </div>
                  {isCurrentPhase && phase.openTasks && phase.openTasks > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <svg
                        className="size-3.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-[10px] font-medium">
                        {phase.openTasks} tác vụ mở
                      </span>
                    </div>
                  )}
                </>
              );
              return (
                <Fragment key={phase.id}>
                  {isCurrentPhase ? (
                    <Link
                      to={`${basePath}/${hospitalId}/${phase.id}`}
                      state={location.state}
                      className={baseClasses}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={baseClasses} title="Chỉ giai đoạn hiện tại mới có thể thao tác">
                      {content}
                    </div>
                  )}
                  {/* Connector line between phases */}
                  {index < phases.length - 1 && (
                    <div className="hidden shrink-0 items-center px-1.5 py-3 lg:flex lg:w-10 xl:w-12">
                      <div className="h-0.5 flex-1 border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                      <ArrowRightIcon className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <div className="h-0.5 flex-1 border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Two columns: Work Status + Issue Dashboard */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Detailed Work Status */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <ListIcon className="size-4" />
                Trạng thái công việc chi tiết
              </h2>
              {(() => {
                const currentPhase = phases.find((p) => p.number === hospital.currentPhase);
                const viewAllUrl = currentPhase
                  ? `${basePath}/${hospitalId}/${currentPhase.id}`
                  : basePath;
                return (
                  <Link
                    to={viewAllUrl}
                    state={location.state}
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Xem tất cả công việc
                  </Link>
                );
              })()}
            </div>
            <ul className="space-y-2">
              {recentWorkItems.length === 0 ? (
                <li className="rounded-lg border border-slate-100 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Chưa có công việc nào trong giai đoạn hiện tại
                </li>
              ) : (
                recentWorkItems.map((workItem) => {
                  const status = workItem.status ?? "todo";
                  const cfg = WORK_ITEM_STATUS_CONFIG[status] ?? WORK_ITEM_STATUS_CONFIG.todo;
                  const assigneeText = workItem.assignee ?? "—";
                  const subText =
                    status === "completed"
                      ? `Hoàn thành bởi: ${assigneeText}`
                      : `Được giao cho: ${assigneeText}`;
                  const isBlocked = status === "blocked";
                  return (
                    <li
                      key={workItem.id}
                      className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                        isBlocked
                          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/25"
                          : "border-slate-100 dark:border-slate-700"
                      }`}
                    >
                      {cfg.icon === "alert" && (
                        <span className="mt-0.5 text-red-500">
                          <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                      {cfg.icon === "clock" && (
                        <span className="mt-0.5 text-amber-500">
                          <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                      {cfg.icon === "check" && (
                        <CheckLineIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      )}
                      {cfg.icon === "todo" && (
                        <span className="mt-0.5 text-slate-400">
                          <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          {workItem.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {subText}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.pillClass}`}
                      >
                        {cfg.label}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {/* Right: Supplemental Tasks */}
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  Công việc ngoài dự án / bổ sung
                </h2>
                <button
                  type="button"
                  onClick={openCreateSupplementalModal}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <PlusIcon className="size-3.5" />
                  Thêm công việc
                </button>
              </div>
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-left text-xs">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      <th className="px-2 py-2 font-semibold">Nội dung công việc</th>
                      <th className="px-2 py-2 font-semibold">Người phụ trách</th>
                      <th className="px-2 py-2 font-semibold">Bắt đầu</th>
                      <th className="px-2 py-2 font-semibold">Deadline</th>
                      <th className="px-2 py-2 font-semibold">Trạng thái</th>
                      <th className="px-2 py-2 font-semibold">Ghi chú</th>
                      <th className="px-2 py-2 font-semibold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplementalLoading ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-6 text-center text-slate-500 dark:text-slate-400">
                          Đang tải...
                        </td>
                      </tr>
                    ) : supplementalTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-6 text-center text-slate-500 dark:text-slate-400">
                          Chưa có công việc bổ sung
                        </td>
                      </tr>
                    ) : (
                      supplementalTasks.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-2 align-top font-medium text-slate-800 dark:text-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailModalTask(item);
                              }}
                              className="w-full truncate text-left hover:text-blue-600 dark:hover:text-blue-300"
                              title={item.taskName}
                            >
                              {item.taskName}
                            </button>
                          </td>
                          <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                            {item.assigneeName ?? (item.assigneeUserId ? assigneeNameById.get(item.assigneeUserId) : null) ?? "—"}
                          </td>
                          <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">{formatDate(item.startDate)}</td>
                          <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">{formatDate(item.deadline)}</td>
                          <td className="px-2 py-2 align-top">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SUPPLEMENTAL_STATUS_BADGE_CLASS[item.status] ?? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}
                            >
                              {item.statusLabel}
                            </span>
                          </td>
                          <td className="px-2 py-2 align-top text-slate-600 dark:text-slate-300">
                            {item.note ? (
                              <span className="block w-full truncate" title={item.note}>
                                {item.note}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-right">
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => openEditSupplementalModal(item)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="rounded-md border border-red-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Request new phase card */}
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                  <PlusIcon className="size-5" />
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Yêu cầu một cột mốc triển khai mới cho bệnh viện này.
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  Tạo yêu cầu
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {supplementalModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h3 className="text-[28px] font-semibold text-slate-800 dark:text-slate-100">
                {editingSupplementalTask ? "Chỉnh sửa công việc bổ sung" : "Thêm công việc bổ sung"}
              </h3>
              <button
                type="button"
                onClick={() => setSupplementalModalOpen(false)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tên công việc</label>
                <input
                  type="text"
                  value={supplementalForm.taskName}
                  onChange={(e) => setSupplementalForm((prev) => ({ ...prev, taskName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder="Nhập tên công việc"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Người phụ trách</label>
                  <select
                    value={supplementalForm.assigneeUserId}
                    onChange={(e) => setSupplementalForm((prev) => ({ ...prev, assigneeUserId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="">-- Chọn người phụ trách --</option>
                    {supplementalAssignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trạng thái</label>
                  <select
                    value={supplementalForm.status}
                    onChange={(e) => setSupplementalForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    {SUPPLEMENTAL_STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ngày bắt đầu</label>
                  <input
                    type="text"
                    value={supplementalForm.startDate}
                    readOnly
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hạn chót</label>
                  <input
                    ref={deadlineDateRef}
                    type="text"
                    readOnly
                    value={supplementalForm.deadline}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ghi chú chi tiết</label>
                <textarea
                  rows={4}
                  value={supplementalForm.note}
                  onChange={(e) => setSupplementalForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder="Nhập ghi chú..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setSupplementalModalOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                disabled={savingSupplementalTask}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void submitSupplementalTask()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
                disabled={savingSupplementalTask}
              >
                {savingSupplementalTask ? "Đang lưu..." : editingSupplementalTask ? "Lưu thay đổi" : "Thêm công việc"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailModalTask && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h3 className="text-[28px] font-semibold text-slate-800 dark:text-slate-100">Chi tiết công việc bổ sung</h3>
              <button
                type="button"
                onClick={() => setDetailModalTask(null)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tên công việc</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[30px] font-semibold leading-tight text-slate-800 dark:text-slate-100">
                  {detailModalTask.taskName}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Người phụ trách</p>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{detailModalTask.assigneeName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trạng thái</p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${SUPPLEMENTAL_STATUS_BADGE_CLASS[detailModalTask.status] ?? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}
                    >
                      {detailModalTask.statusLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                <div className="border-r border-slate-200 px-4 py-3 dark:border-slate-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ngày bắt đầu</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{formatDate(detailModalTask.startDate)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hạn chót</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{formatDate(detailModalTask.deadline)}</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ghi chú chi tiết</p>
                </div>
                <div className="rounded-md border-l-4 border-slate-700 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-200">
                  <p className="whitespace-pre-wrap break-words">{detailModalTask.note || "—"}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  openEditSupplementalModal(detailModalTask);
                  setDetailModalTask(null);
                }}
                className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
              >
                Chỉnh sửa
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDetailModalTask(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa công việc bổ sung"
        message={`Bạn có chắc muốn xóa "${deleteTarget?.taskName ?? ""}" không?`}
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        confirmLoading={deletingSupplementalTask}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSupplementalTask}
      />
    </>
  );
}
