import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import AddHospitalImplementation from "./form/AddHospitalImplementation";
import type { EditHospitalInitial, HospitalFormSubmitPayload } from "./form/AddHospitalImplementation";
import { PlusIcon, EyeIcon, PencilIcon, TrashBinIcon } from "../../icons";
import {
  fetchImplementationTasks,
  fetchImplementationTaskDetail,
  fetchMilestones,
  createImplementationTask,
  updateImplementationTask,
  deleteImplementationTask,
  fetchCareStatusSummary,
  type ImplementationTaskListItem,
  type MilestoneDto,
} from "../../api/api";
import api from "../../api/client";
import { useWebSocket } from "../../contexts/WebSocketContext";
import toast from "react-hot-toast";

type PendingImplementationTask = {
  id: number;
  name?: string | null;
  hospitalId?: number | null;
  hospitalName?: string | null;
  receivedById?: number | null;
  receivedByName?: string | null;
};

type PendingGroup = {
  hospitalName: string;
  hospitalId: number | null;
  tasks: PendingImplementationTask[];
};

function toLocalISOString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosLike = error as {
    message?: string;
    response?: {
      data?: unknown;
      status?: number;
    };
  };

  const data = axiosLike?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const maybeMessage = (data as { message?: unknown; error?: unknown }).message;
    const maybeError = (data as { message?: unknown; error?: unknown }).error;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage.trim();
    if (typeof maybeError === "string" && maybeError.trim()) return maybeError.trim();
  }

  if (typeof axiosLike?.message === "string" && axiosLike.message.trim()) {
    return axiosLike.message.trim();
  }
  return fallback;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  if (d.includes("T")) return d.slice(0, 10).split("-").reverse().join("/");
  return d.split("-").reverse().join("/");
}

/** Parse ISO date string to local date (YYYY-MM-DD) for comparison. Returns null if invalid. */
function parseDateOnly(s: string | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const raw = s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
  const d = new Date(raw + "T12:00:00"); // noon to avoid DST edge cases
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Completion vs go-live deadline: show "Đúng hạn" if completed on or before deadline,
 * else "Hoàn thành sau hạn X ngày".
 */
function getCompletionDeadlineLabel(
  completionDate: string | null,
  goLiveDeadline: string | null
): { dateText: string; statusLabel: string | null; isOnTime: boolean | null } {
  if (!completionDate) {
    return { dateText: "-", statusLabel: null, isOnTime: null };
  }
  const dateText = formatDate(completionDate) || "-";
  const completion = parseDateOnly(completionDate);
  const deadline = parseDateOnly(goLiveDeadline);
  if (!completion) return { dateText, statusLabel: null, isOnTime: null };
  if (!deadline) return { dateText, statusLabel: null, isOnTime: null };
  const compTs = completion.getTime();
  const deadTs = deadline.getTime();
  if (compTs <= deadTs) {
    return { dateText, statusLabel: "Đúng hạn", isOnTime: true };
  }
  const daysLate = Math.round((compTs - deadTs) / (24 * 60 * 60 * 1000));
  return {
    dateText,
    statusLabel: `Quá hạn ${daysLate} ngày`,
    isOnTime: false,
  };
}

/** Display value or "-" when empty (no data) */
function orDash(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value).trim() : "-";
}

/** Returns "overdue" | "near" | null. Near = within 3 days. Only for non-completed tasks. */
function getDeadlineStatus(
  deadline: string | null,
  health: string
): "overdue" | "near" | null {
  if (health === "completed" || !deadline) return null;
  const d = new Date(deadline.includes("T") ? deadline : deadline + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff < 0) return "overdue";
  if (dayDiff <= 3) return "near";
  return null;
}

const PHASE_COLORS: Record<string, string> = {
  blue: "bg-blue-500 text-white",
  purple: "bg-purple-500 text-white",
  yellow: "bg-amber-400 text-amber-900",
  green: "bg-green-500 text-white",
};

const DEFAULT_PHASE_LABELS: Record<number, string> = {
  1: "Thu thập thông tin",
  2: "Lắp đặt cơ bản",
  3: "Giám sát & Khắc phục",
  4: "Nghiệm thu & Vận hành",
};

const HEALTH_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  in_progress: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  at_risk: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
  blocked: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  completed: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

function getStatusDisplay(row: ImplementationTaskListItem, health: string, healthLabel: string) {
  if (row.transferredToMaintenance === true) {
    if (row.acceptedByMaintenance === true) {
      return {
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        text: "text-emerald-700 dark:text-emerald-300",
        dot: "bg-emerald-500",
        label: "Đã chuyển sang bảo trì",
      };
    }

    return {
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
      text: "text-yellow-700 dark:text-yellow-300",
      dot: "bg-yellow-500",
      label: "Chờ tiếp nhận",
    };
  }

  const cfg = HEALTH_CONFIG[health] ?? HEALTH_CONFIG.in_progress;
  return {
    ...cfg,
    label: healthLabel || "-",
  };
}

function getCurrentPhaseNumberFromMilestones(
  row: ImplementationTaskListItem,
  milestones?: MilestoneDto[]
): number {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return Number.isFinite(row.phase) ? row.phase : 1;
  }

  const sorted = [...milestones]
    .filter((m) => Number.isFinite(m.number))
    .sort((a, b) => a.number - b.number);

  if (sorted.length === 0) {
    return Number.isFinite(row.phase) ? row.phase : 1;
  }

  const firstIncomplete = sorted.find((m) => m.status !== "completed");
  if (firstIncomplete) return firstIncomplete.number;

  return sorted[sorted.length - 1]?.number ?? (Number.isFinite(row.phase) ? row.phase : 1);
}

/** Derive phase label, progress %, health and label from row + milestones.
 * When we have milestones and all 4 are completed, show "Hoàn thành" even if API list did not set health (backend may compute health from other source). */
function getRowDisplay(
  row: ImplementationTaskListItem,
  milestones?: MilestoneDto[]
): {
  phaseLabel: string;
  progress: number;
  phaseColor: "blue" | "purple" | "yellow" | "green";
  health: string;
  healthLabel: string;
} {
  const resolvePhaseLabel = () => {
    const rawPhaseLabel = (row.phaseLabel ?? "").trim();
    const milestoneLabel = milestones
      ?.find((milestone) => milestone.number === row.phase)
      ?.label?.trim();

    if (milestoneLabel) {
      const compactMilestoneLabel = milestoneLabel.replace(/^giai đoạn\s*\d+\s*:\s*/i, "").trim();
      return compactMilestoneLabel
        ? `Giai đoạn ${row.phase}: ${compactMilestoneLabel}`
        : `Giai đoạn ${row.phase}`;
    }

    if (rawPhaseLabel) {
      if (/^giai đoạn\s*\d+[.:]?$/i.test(rawPhaseLabel) && Number.isFinite(row.phase)) {
        const fallback = DEFAULT_PHASE_LABELS[row.phase];
        if (fallback) return `Giai đoạn ${row.phase}: ${fallback}`;
      }
      return rawPhaseLabel;
    }

    if (Number.isFinite(row.phase)) {
      const fallback = DEFAULT_PHASE_LABELS[row.phase];
      return fallback ? `Giai đoạn ${row.phase}: ${fallback}` : `Giai đoạn ${row.phase}`;
    }

    return "-";
  };

  const progressFromMilestones =
    milestones && milestones.length === 4
      ? Math.round((milestones.filter((m) => m.status === "completed").length / 4) * 100)
      : typeof row.progress === "number"
        ? row.progress
        : 0;

  const allFourCompleted =
    milestones && milestones.length === 4 && milestones.every((m) => m.status === "completed");

  const health = allFourCompleted ? "completed" : row.health;
  const healthLabel = allFourCompleted ? "Hoàn thành" : (row.healthLabel ?? "-");
  const phaseLabel =
    health === "completed"
      ? "Tất cả giai đoạn đã hoàn thành"
      : resolvePhaseLabel();

  return {
    phaseLabel,
    progress: progressFromMilestones,
    phaseColor: row.phaseColor,
    health,
    healthLabel,
  };
}

/**
 * Kiosk Deployment Tracking Board - Bảng theo dõi triển khai Kiosk.
 * New implementation tasks flow per IMPLEMENTATION_TASKS_NEW_FLOW_ANALYSIS.md
 */
export default function ListHospitalImplementation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { subscribe } = useWebSocket();
  const isSuperAdmin = location.pathname.startsWith("/superadmin");
  const [search, setSearch] = useState("");
  const [ownerFilterIds, setOwnerFilterIds] = useState<string[]>([]);
  const [projectOwnerOptions, setProjectOwnerOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [ownerFilterOpen, setOwnerFilterOpen] = useState(false);
  const [ownerFilterQuery, setOwnerFilterQuery] = useState("");
  const [ownerFilterPage, setOwnerFilterPage] = useState(0);
  const ownerFilterItemsPerPage = 5;
  const ownerFilterDropdownRef = useRef<HTMLDivElement | null>(null);
  const ownerAutoFilterSetRef = useRef(false);
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("all");
  const [deadline, setDeadline] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editHospital, setEditHospital] = useState<EditHospitalInitial | null>(null);
  const [data, setData] = useState<ImplementationTaskListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  /** Summary of hospitals/kiosks in "chăm sóc" status from business (phòng kinh doanh). Filled by API when available. */
  const [careStatusSummary, setCareStatusSummary] = useState<{ hospitalCount: number; kioskCount: number }>({
    hospitalCount: 0,
    kioskCount: 0,
  });
  const pendingCountRef = useRef<number>(0);
  /** Milestones per task id for current page – used to derive progress/health when all 4 phases completed */
  const [milestonesByTaskId, setMilestonesByTaskId] = useState<Record<string, MilestoneDto[]>>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startItem = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const loadData = useCallback(async (pageOverride?: number) => {
    const page = pageOverride ?? currentPage;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchImplementationTasks({
        search: search || undefined,
        projectOwner: ownerFilterIds.length === 1 ? ownerFilterIds[0] : undefined,
        phase: phase !== "all" ? phase : undefined,
        status: status !== "all" ? status : undefined,
        deadline: deadline !== "all" ? deadline : undefined,
        page,
        size: itemsPerPage,
      });
      // Exclude only clearly deleted tasks (so re-added task shows); do not exclude items without deletedAt
      const filtered = result.items.filter((item) => {
        if (item.deleted === true) return false;
        const deletedAt = item.deletedAt;
        if (deletedAt == null) return true;
        const s = String(deletedAt).trim().toLowerCase();
        if (s === "" || s === "null") return true;
        return false;
      });
      setData(filtered);
      setTotalItems(result.total);
      if (pageOverride != null) setCurrentPage(pageOverride);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [search, ownerFilterIds, phase, status, deadline, currentPage, itemsPerPage]);

  useEffect(() => {
    const fetchProjectOwnerOptions = async () => {
      try {
        const { data } = await api.get<unknown[]>("/api/v1/admin/users/search", {
          params: { department: "IT" },
        });
        const list = Array.isArray(data) ? data : [];
        const options = list
          .map((u) => {
            const user = u as {
              id?: number | string | null;
              fullname?: string | null;
              fullName?: string | null;
              username?: string | null;
              email?: string | null;
              label?: string | null;
            };
            if (user.id == null) return null;
            const labelRaw = user.fullname ?? user.fullName ?? user.label ?? user.username ?? user.email;
            const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
            if (!label) return null;
            return { id: String(user.id), label };
          })
          .filter((item): item is { id: string; label: string } => Boolean(item));

        options.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
        setProjectOwnerOptions(options);
      } catch {
        setProjectOwnerOptions([]);
      }
    };

    void fetchProjectOwnerOptions();
  }, []);

  useEffect(() => {
    if (isSuperAdmin) return;
    if (ownerAutoFilterSetRef.current) return;
    if (ownerFilterIds.length > 0) return;
    if (projectOwnerOptions.length === 0) return;

    let userId: string | null =
      localStorage.getItem("userId") || sessionStorage.getItem("userId");

    if (!userId) {
      try {
        const rawUser = localStorage.getItem("user") || sessionStorage.getItem("user");
        if (rawUser) {
          const parsed = JSON.parse(rawUser) as { id?: number | string; userId?: number | string };
          const candidate = parsed.id ?? parsed.userId;
          if (candidate != null) userId = String(candidate);
        }
      } catch {
        // ignore parse failures
      }
    }

    if (!userId) return;

    const normalizedUserId = String(userId).trim();
    if (!normalizedUserId) return;

    const matched = projectOwnerOptions.find((option) => {
      const optionId = String(option.id).trim();
      return (
        optionId === normalizedUserId ||
        optionId === String(Number(normalizedUserId)) ||
        String(Number(optionId)) === normalizedUserId
      );
    });

    if (matched) {
      setOwnerFilterIds([matched.id]);
      setCurrentPage(1);
      ownerAutoFilterSetRef.current = true;
    }
  }, [isSuperAdmin, ownerFilterIds.length, projectOwnerOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ownerFilterDropdownRef.current && !ownerFilterDropdownRef.current.contains(event.target as Node)) {
        setOwnerFilterOpen(false);
      }
    };

    if (ownerFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [ownerFilterOpen]);

  useEffect(() => {
    if (!ownerFilterOpen) {
      setOwnerFilterQuery("");
      setOwnerFilterPage(0);
    }
  }, [ownerFilterOpen]);

  useEffect(() => {
    setOwnerFilterPage(0);
  }, [ownerFilterQuery]);

  const ownerLabelMap = new Map<string, string>();
  projectOwnerOptions.forEach((option) => {
    ownerLabelMap.set(option.id, option.label);
  });

  const filteredOwnerOptions = (() => {
    const q = ownerFilterQuery.trim().toLowerCase();
    if (!q) return projectOwnerOptions;
    return projectOwnerOptions.filter((option) => option.label.toLowerCase().includes(q));
  })();

  const paginatedOwnerOptions = filteredOwnerOptions.slice(0, (ownerFilterPage + 1) * ownerFilterItemsPerPage);
  const hasMoreOwnerOptions = (ownerFilterPage + 1) * ownerFilterItemsPerPage < filteredOwnerOptions.length;

  const displayedRows = (() => {
    let rows = data;

    if (phase !== "all") {
      const selectedPhase = Number(phase);
      if (Number.isFinite(selectedPhase)) {
        rows = rows.filter((row) => {
          const milestones = milestonesByTaskId[String(row.id)] ?? [];
          const currentPhase = getCurrentPhaseNumberFromMilestones(row, milestones);
          return currentPhase === selectedPhase;
        });
      }
    }

    if (status !== "all") {
      rows = rows.filter((row) => {
        const display = getRowDisplay(row, milestonesByTaskId[String(row.id)]);
        return display.health === status;
      });
    }

    if (deadline === "this_week") {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      rows = rows.filter((row) => {
        if (!row.goLiveDeadline) return false;
        const d = new Date(String(row.goLiveDeadline).includes("T") ? String(row.goLiveDeadline) : `${String(row.goLiveDeadline)}T00:00:00`);
        if (Number.isNaN(d.getTime())) return false;
        d.setHours(0, 0, 0, 0);
        return d >= now && d <= end;
      });
    }

    if (ownerFilterIds.length === 0) return rows;

    const selectedNames = new Set(
      ownerFilterIds
        .map((id) => ownerLabelMap.get(String(id))?.toLowerCase().trim())
        .filter((v): v is string => Boolean(v))
    );
    if (selectedNames.size === 0) return rows;

    // Include rows where selected person is PTC (Phụ trách chính) OR NTH (Người thực hiện)
    return rows.filter((row) => {
      const pmName = (row.pmName || "").toLowerCase().trim();
      const engineerName = (row.engineerName || "").toLowerCase().trim();
      return selectedNames.has(pmName) || selectedNames.has(engineerName);
    });
  })();

  const clearOwnerFilter = () => {
    setOwnerFilterIds([]);
    setCurrentPage(1);
  };

  const toggleOwnerFilterValue = (value: string, checked: boolean) => {
    setOwnerFilterIds((prev) => {
      if (checked) {
        if (prev.includes(value)) return prev;
        return [...prev, value];
      }
      return prev.filter((id) => id !== value);
    });
    setCurrentPage(1);
  };

  const fetchPendingGroups = useCallback(async (): Promise<number> => {
    setLoadingPending(true);
    try {
      const { data: list } = await api.get<PendingImplementationTask[]>("/api/v1/admin/implementation/pending");
      const filtered = (Array.isArray(list) ? list : []).filter((task) => !(task.receivedById || task.receivedByName));

      const groupsMap = new Map<string, PendingGroup>();
      for (const task of filtered) {
        const hospitalName = (task.hospitalName || "—").toString();
        const hospitalId = typeof task.hospitalId === "number" ? task.hospitalId : null;
        const key = `${hospitalId ?? "null"}::${hospitalName}`;
        const current = groupsMap.get(key) || { hospitalName, hospitalId, tasks: [] };
        current.tasks.push(task);
        groupsMap.set(key, current);
      }

      const grouped = Array.from(groupsMap.values());
      setPendingGroups(grouped);
      const count = grouped.reduce((sum, group) => sum + group.tasks.length, 0);
      pendingCountRef.current = count;
      return count;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi khi tải danh sách chờ";
      setError(msg);
      return pendingCountRef.current;
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const handleAcceptTask = useCallback(async (taskId: number, suppressRefresh = false) => {
    try {
      const startDate = toLocalISOString(new Date());
      await api.put(`/api/v1/admin/implementation/accept/${taskId}`, {
        startDate,
        status: "RECEIVED",
      });

      setPendingGroups((prev) =>
        prev
          .map((group) => ({ ...group, tasks: group.tasks.filter((task) => task.id !== taskId) }))
          .filter((group) => group.tasks.length > 0)
      );

      if (!suppressRefresh) {
        await loadData();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi khi tiếp nhận công việc";
      setError(msg);
      toast.error(msg);
    }
  }, [loadData]);

  const handleAcceptGroup = useCallback(async (hospitalId: number | null) => {
    const group = pendingGroups.find((g) => (g.hospitalId ?? null) === (hospitalId ?? null));
    if (!group) return;
    for (const task of [...group.tasks]) {
      await handleAcceptTask(task.id, true);
    }
    await loadData();
  }, [handleAcceptTask, loadData, pendingGroups]);

  const handleAcceptAll = useCallback(async () => {
    for (const group of [...pendingGroups]) {
      for (const task of [...group.tasks]) {
        await handleAcceptTask(task.id, true);
      }
    }
    await loadData();
  }, [handleAcceptTask, loadData, pendingGroups]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let mounted = true;

    if (!pendingOpen) {
      void fetchPendingGroups();
    }

    const intervalId = window.setInterval(() => {
      if (!mounted || pendingOpen) return;
      void fetchPendingGroups();
    }, 60000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [fetchPendingGroups, pendingOpen]);

  useEffect(() => {
    const unsubscribe = subscribe("/topic/implementation/pending-changed", () => {
      void fetchPendingGroups();
      void loadData();
    });
    return () => unsubscribe();
  }, [fetchPendingGroups, loadData, subscribe]);

  // Load care-status summary from business (phòng kinh doanh) when pending modal opens
  useEffect(() => {
    if (!pendingOpen) return;
    void fetchCareStatusSummary().then(setCareStatusSummary);
  }, [pendingOpen]);

  // Fetch milestones for current page items to derive progress/health when all 4 phases completed
  useEffect(() => {
    if (data.length === 0) {
      setMilestonesByTaskId({});
      return;
    }
    let cancelled = false;
    Promise.all(
      data.map((item) =>
        fetchMilestones(item.id)
          .then((milestones) => ({ id: String(item.id), milestones }))
          .catch(() => ({ id: String(item.id), milestones: [] as MilestoneDto[] }))
      )
    ).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, MilestoneDto[]> = {};
      pairs.forEach(({ id, milestones }) => {
        map[id] = milestones;
      });
      setMilestonesByTaskId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const MENU_HEIGHT = 180;

  const openMenu = useCallback((rowId: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setMenuAnchor(rect);
    setOpenMenuId(rowId);
    triggerRef.current = anchor;
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuAnchor(null);
    triggerRef.current = null;
  }, []);

  // Close dropdown when clicking outside (triggerRef can be button or row element)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        openMenuId &&
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId, closeMenu]);

  const toDateInput = (d: string | null) => {
    if (!d) return "";
    const s = d.includes("T") ? d.slice(0, 10) : d;
    if (s.includes("-")) return s;
    const parts = s.split("/");
    if (parts.length >= 3) {
      const [day, month, year] = parts;
      return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    }
    return "";
  };

  const handleAction = async (id: string, action: "view" | "edit" | "delete" | "transfer") => {
    closeMenu();
    if (action === "view") {
      const base = isSuperAdmin ? "/superadmin/implementation-tasks-new" : "/implementation-tasks-new";
      navigate(`${base}/${id}`);
      return;
    }
    if (action === "edit") {
      try {
        const task = await fetchImplementationTaskDetail(id);
        const initial: EditHospitalInitial = {
          id: String(task.id),
          hospitalId: null,
          hospitalName: task.hospitalName ?? "",
          projectCode: task.projectCode ?? "",
          startDate: toDateInput(task.startDate ?? null),
          reportDeadline: toDateInput(task.reportDeadline ?? null),
          goLiveDeadline: toDateInput(task.goLiveDeadline ? String(task.goLiveDeadline) : null),
          pmUserId: task.pmUserId ?? null,
          engineerUserId: task.engineerUserId ?? null,
          pmName: task.pmName ?? undefined,
          engineerName: task.engineerName ?? undefined,
          _version: task.version,
        };
        setEditHospital(initial);
        setIsFormOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi tải chi tiết");
      }
      return;
    }
    if (action === "delete") {
      if (!window.confirm("Bạn có chắc muốn xóa bệnh viện này khỏi danh sách triển khai?")) return;
      try {
        await deleteImplementationTask(id);
        loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lỗi xóa");
      }
      return;
    }
    if (action === "transfer") {
      const row = data.find((item) => String(item.id) === String(id));
      if (!row) {
        toast.error("Không tìm thấy dữ liệu bệnh viện để chuyển bảo trì");
        return;
      }

      const display = getRowDisplay(row, milestonesByTaskId[String(row.id)]);
      if (display.health !== "completed") {
        toast.error("Chỉ được chuyển bảo trì khi bệnh viện đã hoàn thành triển khai");
        return;
      }

      if (!window.confirm("Bạn có chắc muốn chuyển bệnh viện này sang bảo trì?")) return;
      try {
        const detail = await fetchImplementationTaskDetail(id);
        const hospitalId = detail?.hospitalId;
        if (!hospitalId) {
          toast.error("Không xác định được bệnh viện để chuyển bảo trì");
          return;
        }

        await api.post(`/api/v1/admin/hospitals/${hospitalId}/transfer-to-maintenance`);
        toast.success("Đã chuyển bảo trì thành công");
        loadData();
      } catch (e) {
        toast.error(getApiErrorMessage(e, "Lỗi chuyển bảo trì"));
      }
    }
  };

  const handleHospitalSubmit = async (payload: HospitalFormSubmitPayload, taskId?: string) => {
    try {
      let createdId: number | null = null;
      let createdDetail: Awaited<ReturnType<typeof createImplementationTask>> | null = null;
      if (taskId) {
        await updateImplementationTask(taskId, {
          projectCode: payload.projectCode,
          startDate: payload.startDate,
          reportDeadline: payload.reportDeadline,
          goLiveDeadline: payload.goLiveDeadline,
          pmUserId: payload.pmUserId ?? undefined,
          engineerUserId: payload.engineerUserId ?? undefined,
          version: payload.version,
        });
      } else if (payload.hospitalId) {
        const created = await createImplementationTask({
          hospitalId: payload.hospitalId,
          projectCode: payload.projectCode,
          startDate: payload.startDate,
          reportDeadline: payload.reportDeadline,
          goLiveDeadline: payload.goLiveDeadline,
          pmUserId: payload.pmUserId,
          engineerUserId: payload.engineerUserId,
        });
        createdDetail = created;
        createdId = created?.id ?? null;
      }
      // Reset to page 1 and refetch so the new item appears (backend usually sorts newest first)
      setCurrentPage(1);
      loadData(1);
      setIsFormOpen(false);
      setEditHospital(null);
      if (createdId != null && createdDetail) {
        const base = isSuperAdmin ? "/superadmin/implementation-tasks-new" : "/implementation-tasks-new";
        // Navigate to Phase 1 Kanban page (add tasks) - use first milestone id, fallback to 1
        const firstPhaseId = createdDetail.milestones?.[0]?.id ?? 1;
        navigate(`${base}/${createdId}/${firstPhaseId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi lưu");
    }
  };

  return (
    <>
      <PageMeta
        title="Bảng theo dõi triển khai Kiosk | TAGTECH"
        description="Theo dõi và quản lý tiến độ triển khai Kiosk tại các bệnh viện"
      />
      <div className="p-6 xl:p-10">
        <div className="mb-6 space-y-6">
        {/* Header: Title + Search + Action buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
            Bảng theo dõi triển khai Kiosk
          </h1>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative w-full sm:w-64">
              <svg
                className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm bệnh viện..."
                className="h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingOpen(true);
                  void fetchPendingGroups();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Tiếp nhận từ Sales
                {pendingCountRef.current > 0 && (
                  <span className="-mr-1 inline-flex min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {pendingCountRef.current}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditHospital(null);
                  setIsFormOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <PlusIcon className="size-4" />
                Thêm bệnh viện
              </button>
            </div>
          </div>
        </div>

        {/* Filter row - same style as implementation-tasks FilterToolbar */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Tìm kiếm & Lọc
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative" ref={ownerFilterDropdownRef}>
              <button
                type="button"
                onClick={() => setOwnerFilterOpen((prev) => !prev)}
                className="min-w-[220px] rounded-full border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                {ownerFilterIds.length === 0
                  ? "Phụ trách chính: Tất cả"
                  : `Phụ trách chính: ${ownerFilterIds.length} đã chọn`}
              </button>

              {ownerFilterOpen && (
                <div className="absolute left-0 z-40 mt-2 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-2">
                    <input
                      type="text"
                      value={ownerFilterQuery}
                      onChange={(e) => setOwnerFilterQuery(e.target.value)}
                      placeholder="Tìm người phụ trách"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>

                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {filteredOwnerOptions.length === 0 ? (
                      <div className="py-4 text-center text-sm text-gray-500">Không có dữ liệu người phụ trách</div>
                    ) : (
                      <>
                        {paginatedOwnerOptions.map((owner) => {
                          const value = String(owner.id);
                          const checked = ownerFilterIds.includes(value);
                          return (
                            <label key={owner.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleOwnerFilterValue(value, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{owner.label}</span>
                            </label>
                          );
                        })}
                        {hasMoreOwnerOptions && (
                          <button
                            type="button"
                            onClick={() => setOwnerFilterPage((prev) => prev + 1)}
                            className="w-full py-2 text-center text-sm text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            Xem thêm ({filteredOwnerOptions.length - (ownerFilterPage + 1) * ownerFilterItemsPerPage} còn lại)
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm text-blue-600 hover:underline disabled:pointer-events-none disabled:opacity-50"
                      onClick={clearOwnerFilter}
                      disabled={ownerFilterIds.length === 0}
                    >
                      Bỏ lọc
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      onClick={() => setOwnerFilterOpen(false)}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`px-3 py-1.5 text-xs text-blue-600 hover:underline ${ownerFilterIds.length > 0 ? "visible" : "invisible pointer-events-none"}`}
              onClick={clearOwnerFilter}
            >
              Bỏ lọc
            </button>
            <select
              value={phase}
              onChange={(e) => {
                setPhase(e.target.value);
                setCurrentPage(1);
              }}
              className="min-w-[160px] rounded-full border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="all">Giai đoạn: Tất cả</option>
              <option value="1">Giai đoạn 1</option>
              <option value="2">Giai đoạn 2</option>
              <option value="3">Giai đoạn 3</option>
              <option value="4">Giai đoạn 4</option>
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="min-w-[160px] rounded-full border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="all">Trạng thái: Tất cả</option>
              <option value="in_progress">Đang triển khai</option>
              <option value="at_risk">Có rủi ro</option>
              <option value="blocked">Đang bị chặn</option>
              <option value="completed">Hoàn thành</option>
            </select>
            <select
              value={deadline}
              onChange={(e) => {
                setDeadline(e.target.value);
                setCurrentPage(1);
              }}
              className="min-w-[160px] rounded-full border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="all">Hạn chốt: Tất cả</option>
              <option value="this_week">Hạn chót: Trong tuần này</option>
            </select>
            <button
              type="button"
              onClick={() => loadData()}
              className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Làm mới"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Table - match implementation-tasks hospital list style */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                Không có viện nào trong danh sách
              </div>
            ) : (
            <table className="w-full min-w-[900px] divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-14">
                    STT
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[200px]">
                    Tên bệnh viện
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Ngày bắt đầu
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Hạn báo cáo
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Hạn go-live
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Ngày hoàn thành
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[180px]">
                    Giai đoạn
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Tiến độ
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[140px]">
                    PTC & NHT
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[120px]">
                    Tình trạng
                  </th>
                  <th className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-gray-50 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)] w-12">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {displayedRows.map((row, index) => {
                  const display = getRowDisplay(row, milestonesByTaskId[String(row.id)]);
                  const statusDisplay = getStatusDisplay(row, display.health, display.healthLabel);
                  const borderClass =
                    display.health === "at_risk"
                      ? "border-l-4 border-l-red-500"
                      : display.health === "blocked"
                        ? "border-l-4 border-l-amber-500"
                        : "";
                  const reportStatus = getDeadlineStatus(row.reportDeadline, display.health);
                  const goLiveStatus = getDeadlineStatus(row.goLiveDeadline, display.health);
                  return (
                    <tr
                      key={row.id}
                      className={`group transition hover:bg-gray-50 dark:hover:bg-gray-800/30 ${borderClass}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-400">
                        {startItem + index}
                      </td>
                      <td className="min-w-[200px] max-w-[320px] px-4 py-3">
                        <Link
                          to={
                            isSuperAdmin
                              ? `/superadmin/implementation-tasks-new/${row.id}`
                              : `/implementation-tasks-new/${row.id}`
                          }
                          className="block cursor-pointer font-medium text-gray-900 transition hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                        >
                          <p className="break-words text-sm whitespace-normal" title={row.hospitalName ?? ""}>
                            {orDash(row.hospitalName)}
                          </p>
                          <p className="truncate max-w-[220px] text-xs text-gray-500 dark:text-gray-400" title={row.projectCode ? `Mã BV: ${row.projectCode}` : ""}>
                            Mã BV: {orDash(row.projectCode)}
                          </p>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {formatDate(row.startDate) || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={
                              reportStatus === "overdue"
                                ? "font-medium text-red-600 dark:text-red-400"
                                : reportStatus === "near"
                                  ? "font-medium text-amber-600 dark:text-amber-400"
                                  : "text-gray-700 dark:text-gray-300"
                            }
                          >
                            {formatDate(row.reportDeadline) || "-"}
                          </span>
                          {reportStatus === "overdue" && (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">Quá hạn</span>
                          )}
                          {reportStatus === "near" && (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sắp đến hạn</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={
                              goLiveStatus === "overdue"
                                ? "font-medium text-red-600 dark:text-red-400"
                                : goLiveStatus === "near"
                                  ? "font-medium text-amber-600 dark:text-amber-400"
                                  : "text-gray-700 dark:text-gray-300"
                            }
                          >
                            {formatDate(row.goLiveDeadline) || "-"}
                          </span>
                          {goLiveStatus === "overdue" && (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">Quá hạn</span>
                          )}
                          {goLiveStatus === "near" && (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sắp đến hạn</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {(() => {
                          const { dateText, statusLabel, isOnTime } = getCompletionDeadlineLabel(
                            row.completionDate ?? null,
                            row.goLiveDeadline ?? null
                          );
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-gray-700 dark:text-gray-300">{dateText}</span>
                              {statusLabel != null && (
                                <span
                                  className={
                                    isOnTime === true
                                      ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                                      : "text-xs font-medium text-amber-600 dark:text-amber-400"
                                  }
                                >
                                  {statusLabel}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex max-w-[220px] truncate rounded-full px-2.5 py-1 text-xs font-medium ${
                            PHASE_COLORS[display.phaseColor]
                          }`}
                          title={display.phaseLabel}
                        >
                          {orDash(display.phaseLabel)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${display.progress}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {display.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm min-w-[140px]">
                        <div className="min-w-0">
                          <p className="truncate max-w-[140px] font-medium text-gray-900 dark:text-white" title={row.pmName ?? ""}>
                            PTC: {orDash(row.pmName)}
                          </p>
                          <p className="truncate max-w-[140px] text-xs text-gray-500 dark:text-gray-400" title={row.engineerName ?? ""}>
                            NHT: {orDash(row.engineerName)}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusDisplay.bg} ${statusDisplay.text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDisplay.dot}`}
                          />
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-white px-4 py-3 text-right shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)] dark:group-hover:bg-gray-800/30">
                        <button
                          type="button"
                          onClick={(e) => {
                            if (openMenuId === String(row.id)) {
                              closeMenu();
                            } else {
                              openMenu(String(row.id), e.currentTarget);
                            }
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                          aria-label="Mở menu thao tác"
                        >
                          <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>

          {/* Pagination footer - match implementation-tasks style */}
          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Hiển thị {startItem} đến {endItem} trong tổng số {totalItems} bệnh viện
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Hiển thị:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Trang đầu"
                >
                  &#171;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Trang trước"
                >
                  &#8249;
                </button>
                {(() => {
                  const start = Math.max(1, currentPage - 2);
                  const end = Math.min(totalPages, currentPage + 2);
                  const pages: number[] = [];
                  for (let i = start; i <= end; i++) pages.push(i);
                  return pages;
                })().map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      className={`rounded border px-3 py-1 text-sm transition ${
                        currentPage === p
                          ? "border-blue-600 bg-blue-600 text-white dark:bg-blue-500"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Trang sau"
                >
                  &#8250;
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                  title="Trang cuối"
                >
                  &#187;
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Add/Edit hospital form - right-side panel */}
      <AddHospitalImplementation
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditHospital(null);
        }}
        onSubmit={handleHospitalSubmit}
        editHospital={editHospital}
        forceDeadlineEdit={isSuperAdmin}
      />

      {/* Action menu portal - fixed position so it overlays and stays visible */}
      {openMenuId &&
        menuAnchor &&
        createPortal(
          (() => {
            const row = displayedRows.find((r) => String(r.id) === openMenuId);
            if (!row) return null;
            const spaceBelow = window.innerHeight - (menuAnchor.bottom + 8);
            const openUpward = spaceBelow < MENU_HEIGHT;
            const top = openUpward
              ? menuAnchor.top - MENU_HEIGHT - 4
              : menuAnchor.bottom + 4;
            // Clamp horizontal position so menu stays visible (row can be wide when table scrolls)
            const menuWidth = 180;
            const padding = 8;
            const preferredLeft = menuAnchor.right - menuWidth;
            const left = Math.max(
              padding,
              Math.min(preferredLeft, window.innerWidth - menuWidth - padding)
            );
            const clampedTop = Math.max(padding, Math.min(top, window.innerHeight - MENU_HEIGHT - padding));
            return (
              <div
                ref={dropdownRef}
                className="fixed z-[9999] min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
                style={{ top: clampedTop, left }}
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => handleAction(String(row.id), "view")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <EyeIcon className="size-4 shrink-0" />
                  Xem
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(String(row.id), "edit")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <PencilIcon className="size-4 shrink-0" />
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(String(row.id), "delete")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <TrashBinIcon className="size-4 shrink-0" />
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(String(row.id), "transfer")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Chuyển bảo trì
                </button>
              </div>
            );
          })(),
          document.body
        )}

      {pendingOpen && (
        <div
          className="fixed inset-0 z-[10000] grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingOpen(false);
          }}
        >
          <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  📨 Chờ tiếp nhận - Tiếp nhận từ Sales
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Có {careStatusSummary.hospitalCount} viện {careStatusSummary.kioskCount} kiosk đang ở trạng thái chăm sóc (dữ liệu từ phòng kinh doanh).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingOpen(false)}
                  className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void fetchPendingGroups();
                  }}
                  className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                >
                  Làm mới
                </button>
              </div>
            </div>
            <div className="p-4">
              {loadingPending ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Đang tải...</div>
              ) : pendingGroups.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Không có viện nào chờ tiếp nhận</div>
              ) : (
                <>
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleAcceptAll();
                      }}
                      className="rounded-full bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Tiếp nhận tất cả ({pendingGroups.reduce((sum, g) => sum + g.tasks.length, 0)})
                    </button>
                  </div>
                  <div className="space-y-3">
                    {pendingGroups.map((group) => (
                      <div
                        key={`${group.hospitalId ?? "null"}-${group.hospitalName}`}
                        className="flex items-center justify-between rounded-xl border border-gray-200 px-5 py-4 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
                      >
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">{group.hospitalName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{group.tasks.length} công việc chờ</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void handleAcceptGroup(group.hospitalId);
                          }}
                          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Tiếp nhận
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
