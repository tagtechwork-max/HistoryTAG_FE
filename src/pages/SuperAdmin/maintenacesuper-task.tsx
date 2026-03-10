import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiInfo, FiLink, FiUser, FiClock, FiCheckCircle, FiXCircle, FiTag, FiX } from "react-icons/fi";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { FaHospital } from "react-icons/fa";
import { AiOutlineEye } from "react-icons/ai";
import toast, { ToastOptions } from "react-hot-toast";
import TaskCard from "./TaskCardNew";
import TaskFormModal from "./TaskFormModal";
import TaskNotes from "../../components/TaskNotes";
import TicketsTab from "../../pages/CustomerCare/SubCustomerCare/TicketsTab";
import { getHospitalTickets } from "../../api/ticket.api";
import { useAuth } from '../../contexts/AuthContext';

const API_ROOT = import.meta.env.VITE_API_URL || "";
const MIN_LOADING_MS = 2000;


// Helper function để parse PIC IDs từ additionalRequest hoặc notes
function parsePicIdsFromAdditionalRequest(additionalRequest?: string | null, notes?: string | null, picDeploymentId?: number | null): number[] {
  const ids: number[] = [];
  if (picDeploymentId) {
    ids.push(picDeploymentId);
  }
  const text = additionalRequest || notes || "";
  if (text) {
    const match = text.match(/\[PIC_IDS:\s*([^\]]+)\]/);
    if (match) {
      const parsedIds = match[1].split(',').map(id => Number(id.trim())).filter(id => !isNaN(id) && id > 0);
      ids.push(...parsedIds);
    }
  }
  return [...new Set(ids)]; // Loại bỏ duplicate
}

type MaintTask = {
  id: number;
  name: string;
  hospitalName?: string | null;
  picDeploymentName?: string | null;
  receivedById?: number | null;
  receivedByName?: string | null;
  receivedDate?: string | null;
  status?: string | null;
  createdAt?: string | null;
  apiUrl?: string | null;
  apiTestStatus?: string | null;
  startDate?: string | null;
  acceptanceDate?: string | null;
  finishDate?: string | null;
  notes?: string | null;
  additionalRequest?: string | null;
  // include optional fields used by shared TaskCardNew component
  hospitalId?: number | null;
  picDeploymentId?: number | null;
  quantity?: number | null;
  agencyId?: number | null;
  hisSystemId?: number | null;
  hardwareId?: number | null;
  deadline?: string | null;
  completionDate?: string | null;
  team?: string | null;
  transferredToMaintenance?: boolean | null;
  readOnlyForDeployment?: boolean | null;
};

type PendingTransferGroup = {
  key: string;
  hospitalId: number | null;
  hospitalName: string;
  tasks: MaintTask[];
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

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function statusBadgeClasses(status?: string | null) {
  if (!status)
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  const s = status.toUpperCase();
  switch (s) {
    case "NOT_STARTED":
    case "RECEIVED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "IN_PROGRESS":
    case "IN_PROCESS":
    case "API_TESTING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "INTEGRATING":
    case "ISSUE":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "WAITING_FOR_DEV":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "ACCEPTED":
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  const normalized = status.toUpperCase();
  const map: Record<string, string> = {
    // Canonical statuses
    RECEIVED: "Đã tiếp nhận",
    IN_PROCESS: "Đang xử lý",
    COMPLETED: "Hoàn thành",
    ISSUE: "Gặp sự cố",
    CANCELLED: "Hủy",

    // Legacy / alternative values
    NOT_STARTED: "Chưa bắt đầu",
    IN_PROGRESS: "Đang xử lý",
    API_TESTING: "Đang kiểm thử API",
    INTEGRATING: "Đang tích hợp",
    WAITING_FOR_DEV: "Đang chờ phát triển",
    ACCEPTED: "Nghiệm thu",
    TRANSFERRED: "Đã chuyển",
  };

  return map[normalized] || status;
}

type ToastVariant = "success" | "error";

const showStyledToast = (
  type: ToastVariant,
  message: string,
  options?: ToastOptions
) => {
  const { duration, position, id, ariaProps } = options ?? {};
  toast.custom(
    () => (
      <div className="pointer-events-auto">
        <div
          className={`flex min-w-[220px] items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg bg-white ${type === "success" ? "border-green-200" : "border-red-200"
            }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${type === "success"
              ? "bg-green-100 text-green-600"
              : "bg-red-100 text-red-600"
              }`}
          >
            {type === "success" ? (
              <FiCheckCircle size={20} />
            ) : (
              <FiXCircle size={20} />
            )}
          </span>
          <span className="text-sm font-medium text-gray-900">{message}</span>
        </div>
      </div>
    ),
    {
      duration: duration ?? (type === "success" ? 3000 : 4000),
      position: position ?? "top-right",
      id,
      ariaProps,
    }
  );
};

const toastSuccess = (message: string, options?: ToastOptions) =>
  showStyledToast("success", message, options);

const toastError = (message: string, options?: ToastOptions) =>
  showStyledToast("error", message, options);

const MaintenanceSuperTaskPage: React.FC = () => {
  // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
  const { isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin;
  const navigate = useNavigate();

  const [data, setData] = useState<MaintTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [hospitalQuery, setHospitalQuery] = useState<string>("");
  const [hospitalOptions, setHospitalOptions] = useState<
    Array<{ id: number; label: string }>
  >([]);

  // Unused in some builds but kept for parity with implementation page — reference to avoid TS6133
  void hospitalQuery;
  void setHospitalQuery;
  void hospitalOptions;
  void setHospitalOptions;
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const searchDebounce = useRef<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortDir, setSortDir] = useState<string>("desc");
  const [page, setPage] = useState<number>(0);
  const [size, setSize] = useState<number>(10);
  const [enableItemAnimation, setEnableItemAnimation] =
    useState<boolean>(true);

  const { subscribe } = useWebSocket();

  const apiBase = `${API_ROOT}/api/v1/superadmin/maintenance/tasks`;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaintTask | null>(null);
  const [viewOnly, setViewOnly] = useState<boolean>(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<PendingTransferGroup[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  // hospital list view state (like implementation-tasks page)
  const [showHospitalList, setShowHospitalList] = useState<boolean>(true);
  const [hospitalsWithTasks, setHospitalsWithTasks] = useState<Array<{ id: number; label: string; subLabel?: string; hospitalCode?: string; taskCount?: number; acceptedCount?: number; nearDueCount?: number; overdueCount?: number; fromDeployment?: boolean; acceptedByMaintenance?: boolean; picDeploymentIds?: Array<string | number>; picDeploymentNames?: string[]; maintenancePersonInChargeName?: string }>>([]);
  const [loadingHospitals, setLoadingHospitals] = useState<boolean>(false);
  const [hospitalPage, setHospitalPage] = useState<number>(0);
  const [hospitalSize, setHospitalSize] = useState<number>(10);
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null);
  const [hospitalSearch, setHospitalSearch] = useState<string>("");
  const [hospitalCodeSearch, setHospitalCodeSearch] = useState<string>("");
  const [hospitalStatusFilter, setHospitalStatusFilter] = useState<string>("");
  const [hospitalPicFilter, setHospitalPicFilter] = useState<string[]>([]);
  const [picFilterOpen, setPicFilterOpen] = useState<boolean>(false);
  const [picFilterQuery, setPicFilterQuery] = useState<string>("");
  const [picOptions, setPicOptions] = useState<Array<{ id: string; label: string }>>([]);
  const picFilterDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [selectedHospitalIdForTickets, setSelectedHospitalIdForTickets] = useState<number | null>(null);
  const [selectedHospitalNameForTickets, setSelectedHospitalNameForTickets] = useState<string | null>(null);
  const [ticketOpenCounts, setTicketOpenCounts] = useState<Record<number, number>>({});
  const [ticketCountLoading, setTicketCountLoading] = useState<Set<number>>(new Set());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        picFilterDropdownRef.current &&
        !picFilterDropdownRef.current.contains(event.target as Node)
      ) {
        setPicFilterOpen(false);
      }
    }
    if (picFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [picFilterOpen]);

  useEffect(() => {
    if (!picFilterOpen) {
      setPicFilterQuery("");
    }
  }, [picFilterOpen]);

  const filteredPicOptions = useMemo(() => {
    const q = picFilterQuery.trim().toLowerCase();
    if (!q) return picOptions;
    return picOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [picOptions, picFilterQuery]);

  async function fetchList(overrides?: { page?: number; size?: number; sortBy?: string; sortDir?: string }) {
    const start = Date.now();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(overrides?.page ?? page),
        size: String(overrides?.size ?? size),
        sortBy: overrides?.sortBy ?? sortBy,
        sortDir: overrides?.sortDir ?? sortDir,
      });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);
      if (selectedHospital) params.set("hospitalName", selectedHospital);

      const url = `${apiBase}?${params.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      const resp = await res.json();
      const items = Array.isArray(resp?.content)
        ? resp.content
        : Array.isArray(resp)
          ? resp
          : [];
      setData(items);
      if (resp && typeof resp.totalElements === "number")
        setTotalCount(resp.totalElements);
      else setTotalCount(Array.isArray(resp) ? resp.length : null);

      if (enableItemAnimation) {
        const itemCount = items.length;
        const maxDelay = itemCount > 1 ? 2000 + (itemCount - 2) * 80 : 0;
        const animationDuration = 220;
        const buffer = 120;
        window.setTimeout(
          () => setEnableItemAnimation(false),
          maxDelay + animationDuration + buffer
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Lỗi tải dữ liệu");
    } finally {
      const elapsed = Date.now() - start;
      if (isInitialLoad) {
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        await new Promise((res) => setTimeout(res, remaining));
      }
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }

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

  // Initial: load hospital list instead of tasks
  useEffect(() => {
    fetchHospitalsWithTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    searchDebounce.current = window.setTimeout(() => {
      fetchList();
    }, 600);
    return () => {
      if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // refetch when statusFilter or sort changes
  useEffect(() => { if (!showHospitalList) fetchList(); /* eslint-disable-line */ }, [statusFilter]);
  useEffect(() => { if (!showHospitalList) fetchList(); /* eslint-disable-line */ }, [sortBy, sortDir]);

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa bản ghi này?")) return;
    const res = await fetch(`${apiBase}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const msg = await res.text();
      toastError(`Xóa thất bại: ${msg || res.status}`);
      return;
    }
    if (showHospitalList) {
      await fetchHospitalsWithTasks();
    } else {
      await fetchList();
      if (selectedHospital) {
        await fetchAcceptedCountForHospital(selectedHospital);
      }
    }
    toastSuccess("Đã xóa");
  };

  // --- pending tasks (chờ) for maintenance: fetch & accept ---
  async function fetchPendingTasks() {
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
        toastError(`Tải danh sách bệnh viện chờ thất bại: ${msg || res.status}`);
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
      toastError("Lỗi khi tải danh sách bệnh viện chờ");
    } finally {
      setLoadingPending(false);
    }
  }

  const handleAcceptPendingGroup = async (group: PendingTransferGroup) => {
    if (!group || !group.hospitalId) {
      toastError("Không có bệnh viện nào để tiếp nhận.");
      return;
    }

    if (
      !confirm(
        `Tiếp nhận bệnh viện ${group.hospitalName} và chuyển sang danh sách bảo trì?`,
      )
    )
      return;

    try {
      // ✅ API mới: Tiếp nhận bệnh viện (1 API call thay vì loop qua từng task)
      const res = await fetch(`${API_ROOT}/api/v1/admin/maintenance/accept-hospital/${group.hospitalId}`, {
        method: "PUT",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const msg = await res.text();
        toastError(`Tiếp nhận thất bại: ${msg || res.status}`);
        return;
      }

      toastSuccess(`Đã tiếp nhận bệnh viện ${group.hospitalName}`);
      setPendingTasks((prev) => prev.filter((item) => item.key !== group.key));
      // ✅ Refresh danh sách bệnh viện để hiển thị ngay bệnh viện vừa tiếp nhận
      await fetchHospitalsWithTasks();
      await fetchList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError(msg || "Lỗi khi tiếp nhận");
      await fetchPendingTasks();
    }
  };

  const handleAcceptAll = async () => {
    if (pendingTasks.length === 0) {
      toastError("Không có bệnh viện nào để tiếp nhận.");
      return;
    }

    if (
      !confirm(
        `Tiếp nhận tất cả ${pendingTasks.length} bệnh viện và chuyển sang danh sách bảo trì?`,
      )
    )
      return;

    // Accept all hospitals sequentially
    for (const group of [...pendingTasks]) {
      if (group.hospitalId) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await handleAcceptPendingGroup(group);
        } catch (err) {
          console.error(`Failed to accept hospital ${group.hospitalName}:`, err);
        }
      }
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  async function fetchHospitalsWithTasks() {
    setLoadingHospitals(true);
    setError(null);
    try {
      // ✅ Tối ưu: Chỉ fetch summary (đã có đầy đủ thông tin), không cần fetch tất cả tasks
      const summaryEndpoint = `${API_ROOT}/api/v1/admin/maintenance/hospitals/summary`;
      const summaryRes = await fetch(summaryEndpoint, {
        method: "GET",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!summaryRes.ok) throw new Error(`Failed to fetch hospitals summary: ${summaryRes.status}`);
      const summaryPayload = await summaryRes.json();
      const summaries: any[] = Array.isArray(summaryPayload) ? summaryPayload : [];

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
          if (maintenancePicNameStr && !picOptionMap.has(maintenancePicIdStr)) {
            picOptionMap.set(maintenancePicIdStr, { id: maintenancePicIdStr, label: maintenancePicNameStr });
          }
        }
      });

      // ✅ Không fetch tất cả users - chỉ dùng PICs từ summary và từ tasks (để tránh hiển thị quá nhiều options)

      // Build list of all hospitals from summary
      const allHospitalNames = new Set<string>();
      summaries.forEach((item: any) => {
        const name = String(item?.hospitalName ?? "").trim();
        if (name) allHospitalNames.add(name);
      });

      // ✅ Fetch acceptedCount cho từng bệnh viện (backend không trả về trong summary)
      const acceptedCountsMap = new Map<string, number>();
      const acceptedCountsPromises = Array.from(allHospitalNames).map(async (hospitalName) => {
        try {
          // Fetch count of ACCEPTED tasks for this hospital
          const params = new URLSearchParams({ page: "0", size: "1", status: "ACCEPTED", hospitalName });
          const url = `${API_ROOT}/api/v1/superadmin/maintenance/tasks?${params.toString()}`;
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
          const tasksUrl = `${API_ROOT}/api/v1/superadmin/maintenance/tasks?${tasksParams.toString()}`;
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
            const tasksUrl = `${API_ROOT}/api/v1/superadmin/maintenance/tasks?${tasksParams.toString()}`;
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
              
              // ✅ Thêm vào picOptionMap để filter có đầy đủ options
              if (picId && picName && !picOptionMap.has(picId)) {
                picOptionMap.set(picId, { id: picId, label: picName });
              }
            }
            
            // Collect PICs từ additionalRequest nếu có
            const additionalRequest = task?.additionalRequest || task?.notes || "";
            if (additionalRequest) {
              const picIds = parsePicIdsFromAdditionalRequest(additionalRequest, task?.notes, task?.picDeploymentId);
              if (picIds.length > 0) {
                const hospitalPics = hospitalPicsFromTasks.get(hospitalName) || { picIds: new Set<string>(), picNames: new Set<string>() };
                picIds.forEach(id => {
                  const idStr = String(id);
                  hospitalPics.picIds.add(idStr);
                  // Thêm vào picOptionMap nếu chưa có (sẽ fetch name sau nếu cần)
                  if (!picOptionMap.has(idStr)) {
                    picOptionMap.set(idStr, { id: idStr, label: `User-${id}` });
                  }
                });
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

      // ✅ Map summary - dùng taskCount từ summary, không cần aggregate từ tasks
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
          subLabel: item?.province ? String(item.province) : "", // ✅ Dùng province từ summary, không cần resolve
          hospitalCode: item?.hospitalCode || "",
          taskCount: Number(item?.maintenanceTaskCount ?? 0), // ✅ Dùng từ summary
          acceptedCount: acceptedCount,
          nearDueCount: dueStats.nearDueCount, // ✅ Tính từ tasks chưa completed
          overdueCount: dueStats.overdueCount, // ✅ Tính từ tasks chưa completed
          fromDeployment: Boolean(item?.transferredFromDeployment),
          acceptedByMaintenance: Boolean(item?.acceptedByMaintenance),
          picDeploymentIds: Array.from(taskPics.picIds), // ✅ Dùng PICs từ tasks (đầy đủ hơn)
          picDeploymentNames: Array.from(taskPics.picNames), // ✅ Dùng PICs từ tasks (đầy đủ hơn)
          maintenancePersonInChargeName: item?.maintenancePersonInChargeName || undefined,
        };
      });

      // ✅ CHỈ hiển thị bệnh viện đã được tiếp nhận (acceptedByMaintenance = true) hoặc có task bảo trì
      // Bệnh viện chưa tiếp nhận (fromDeployment = true nhưng acceptedByMaintenance = false) sẽ KHÔNG hiện ở đây
      // Bệnh viện chưa tiếp nhận sẽ chỉ hiện ở "Bệnh viện chờ tiếp nhận" (pending-hospitals)
      const filtered = normalized.filter((h) => {
        // Nếu từ triển khai: CHỈ hiển thị nếu đã được tiếp nhận
        if (h.fromDeployment) {
          return h.acceptedByMaintenance === true;
        }
        // Nếu không từ triển khai: hiển thị nếu có task
        return (h.taskCount || 0) > 0;
      });
      setHospitalsWithTasks(filtered);
      setPicOptions(Array.from(picOptionMap.values()));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Lỗi tải danh sách bệnh viện");
    } finally {
      setLoadingHospitals(false);
    }
  }

  // Resolve hospital id by exact name using superadmin search endpoint
  async function resolveHospitalIdByName(name: string): Promise<number | null> {
    try {
      const res = await fetch(`${API_ROOT}/api/v1/superadmin/hospitals/search?name=${encodeURIComponent(name)}`, { headers: authHeaders(), credentials: 'include' });
      if (!res.ok) return null;
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const exact = (arr as any[]).find((h) => String(h?.label ?? h?.name ?? '').trim().toLowerCase() === name.trim().toLowerCase());
      const pick = exact || arr[0];
      const id = Number(pick?.id);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  // Handler for New Task button: if viewing a hospital, prefill hospitalName / hospitalId
  const handleNewTaskClick = async () => {
    if (!showHospitalList && selectedHospital) {
      const hid = await resolveHospitalIdByName(selectedHospital);
      if (hid) {
        setEditing({ hospitalId: hid, hospitalName: selectedHospital } as any);
      } else {
        setEditing({ hospitalName: selectedHospital } as any);
      }
    } else {
      setEditing(null);
    }
    setViewOnly(false);
    setModalOpen(true);
  };

  async function fetchAcceptedCountForHospital(hospitalName: string) {
    try {
      const params = new URLSearchParams({ page: "0", size: "1", status: "ACCEPTED", hospitalName });
      const url = `${apiBase}?${params.toString()}`;
      const res = await fetch(url, { method: "GET", headers: authHeaders(), credentials: "include" });
      if (!res.ok) {
        setAcceptedCount(null);
        return;
      }
      const resp = await res.json();
      if (resp && typeof resp.totalElements === "number") setAcceptedCount(resp.totalElements);
      else if (Array.isArray(resp)) setAcceptedCount(resp.length);
      else setAcceptedCount(0);
    } catch {
      setAcceptedCount(null);
    }
  }

  const togglePicFilterValue = (value: string, checked: boolean) => {
    setHospitalPicFilter((prev) => {
      if (checked) {
        if (prev.includes(value)) return prev;
        return [...prev, value];
      }
      return prev.filter((id) => id !== value);
    });
    setHospitalPage(0);
  };

  const clearPicFilter = () => {
    setHospitalPicFilter([]);
    setHospitalPage(0);
    setPicFilterOpen(false);
    setPicFilterQuery("");
  };

  const clearHospitalStatusFilter = () => {
    setHospitalStatusFilter("");
    setHospitalPage(0);
  };

  const clearTaskStatusFilter = () => {
    setStatusFilter("");
    setPage(0);
  };

  const filteredHospitals = useMemo(() => {
    let list = hospitalsWithTasks;
    const q = hospitalSearch.trim().toLowerCase();
    if (q) list = list.filter(h => h.label.toLowerCase().includes(q) || (h.subLabel || '').toLowerCase().includes(q));
    
    // Filter by hospital code
    const codeQ = hospitalCodeSearch.trim().toLowerCase();
    if (codeQ) list = list.filter(h => (h.hospitalCode || '').toLowerCase().includes(codeQ));
    if (hospitalStatusFilter === 'accepted') list = list.filter(h => (h.acceptedCount || 0) > 0);
    else if (hospitalStatusFilter === 'incomplete') list = list.filter(h => (h.acceptedCount || 0) < (h.taskCount || 0));
    else if (hospitalStatusFilter === 'unaccepted') list = list.filter(h => (h.acceptedCount || 0) === 0);
    else if (hospitalStatusFilter === 'fromDeployment') list = list.filter(h => h.fromDeployment && !h.acceptedByMaintenance);
    else if (hospitalStatusFilter === 'acceptedFromDeployment') list = list.filter(h => h.fromDeployment && h.acceptedByMaintenance);
    else if (hospitalStatusFilter === 'hasOpenTickets') list = list.filter(h => h.id && (ticketOpenCounts[h.id] ?? 0) > 0);
    // Filter by PIC
    if (hospitalPicFilter.length > 0) {
      const selected = new Set(hospitalPicFilter.map(id => String(id).trim()));
      // Tạo map từ picOptions để có thể lookup name từ ID
      const picIdToNameMap = new Map<string, string>();
      picOptions.forEach(opt => {
        picIdToNameMap.set(String(opt.id).trim(), String(opt.label).trim());
      });
      
      list = list.filter((h) => {
        // Check by ID (so sánh với picDeploymentIds)
        const picIds = (h.picDeploymentIds || []).map(id => String(id).trim());
        const hasMatchingId = picIds.some((idStr) => selected.has(idStr));
        
        // Check by name (so sánh với picDeploymentNames)
        const picNames = (h.picDeploymentNames || []).map(name => String(name).trim());
        const hasMatchingName = picNames.some((nameStr) => selected.has(nameStr));
        
        // ✅ Check by maintenancePersonInChargeName (người phụ trách bảo trì)
        const maintenancePicName = h.maintenancePersonInChargeName ? String(h.maintenancePersonInChargeName).trim() : "";
        const hasMatchingMaintenancePic = maintenancePicName && (
          selected.has(maintenancePicName) || 
          // Cũng kiểm tra xem ID trong filter có match với name này không
          Array.from(selected).some(selectedValue => {
            const nameFromId = picIdToNameMap.get(selectedValue);
            return nameFromId && nameFromId === maintenancePicName;
          })
        );
        
        return hasMatchingId || hasMatchingName || hasMatchingMaintenancePic;
      });
    }
    // ✅ Sort: Ưu tiên bệnh viện có ticket mở lên đầu, sau đó sort theo tên
    // Chỉ sort theo ticket khi tất cả hospitals đã load xong ticket count (tránh nháy)
    const allTicketsLoaded = ticketCountLoading.size === 0;
    
    list = [...list].sort((a, b) => {
      // Chỉ áp dụng sort theo ticket khi đã load xong tất cả
      if (allTicketsLoaded) {
        const aTickets = a.id ? (ticketOpenCounts[a.id] ?? 0) : 0;
        const bTickets = b.id ? (ticketOpenCounts[b.id] ?? 0) : 0;
        
        // Ưu tiên bệnh viện có ticket > 0 lên trước
        if (aTickets > 0 && bTickets === 0) return -1;
        if (aTickets === 0 && bTickets > 0) return 1;
        
        // Nếu cả 2 đều có ticket, sort theo số ticket giảm dần
        if (aTickets > 0 && bTickets > 0 && aTickets !== bTickets) {
          return bTickets - aTickets;
        }
      }
      
      // Sort theo tên
      return a.label.localeCompare(b.label, "vi", { sensitivity: "base" });
    });
    return list;
  }, [hospitalsWithTasks, hospitalSearch, hospitalCodeSearch, hospitalStatusFilter, hospitalPicFilter, ticketOpenCounts, ticketCountLoading, picOptions]);

  const hospitalSummary = useMemo(() => {
    const total = hospitalsWithTasks.length;
    const filteredCount = filteredHospitals.length;
    let acceptedFull = 0;
    for (const h of hospitalsWithTasks) {
      if ((h.taskCount || 0) > 0 && (h.acceptedCount || 0) === (h.taskCount || 0)) {
        acceptedFull += 1;
      }
    }
    return { total, filteredCount, acceptedFull };
  }, [hospitalsWithTasks, filteredHospitals]);

  const pagedHospitals = useMemo(() => {
    return filteredHospitals.slice(hospitalPage * hospitalSize, (hospitalPage + 1) * hospitalSize);
  }, [filteredHospitals, hospitalPage, hospitalSize]);

  const getOpenTicketCount = React.useCallback((tickets: Array<{ status?: string }>) => {
    return tickets.filter((t) => t.status !== "HOAN_THANH").length;
  }, []);

  const updateTicketOpenCount = React.useCallback((hospitalId: number, tickets: Array<{ status?: string }>) => {
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

  const handleTicketsChange = React.useCallback((tickets: Array<{ status?: string }>) => {
    if (selectedHospitalIdForTickets) {
      updateTicketOpenCount(selectedHospitalIdForTickets, tickets);
    }
  }, [selectedHospitalIdForTickets, updateTicketOpenCount]);

  const loadTicketOpenCount = React.useCallback(async (hospitalId: number) => {
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
      // fetch accepted count for header summary
      fetchAcceptedCountForHospital(selectedHospital);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHospital, showHospitalList]);

  function handleHospitalClick(hospitalName: string, e?: React.MouseEvent) {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) {
      // ignore
    }
    // Debug: log click source to help diagnose unexpected reloads
    // eslint-disable-next-line no-console
    console.debug('[MaintenanceSuperTask] handleHospitalClick', { hospitalName, hasEvent: !!e });
    setSelectedHospital(hospitalName);
    setShowHospitalList(false);
    setPage(0);
  }

  async function handleBackToHospitals() {
    setSelectedHospital(null);
    setShowHospitalList(true);
    setSearchTerm("");
    setStatusFilter("");
    setPage(0);
    setData([]);
    setAcceptedCount(null);
    await fetchHospitalsWithTasks();
  }

  const handleSubmit = async (payload: Record<string, unknown>, id?: number) => {
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
      toastError(`${method} thất bại: ${msg || res.status}`);
      return;
    }
    // Update UI immediately without full page reload
    if (showHospitalList) {
      // We are on hospital table → refresh the aggregated list
      await fetchHospitalsWithTasks();
    } else {
      // If creating new task, reset to first page and ensure sort by id desc (newest first)
      if (!isUpdate) {
        // Set sort to id desc so new task appears at top
        setPage(0);
        setSortBy("id");
        setSortDir("desc");
        // Fetch immediately with new sort params to ensure new task appears at top
        await fetchList({ page: 0, sortBy: "id", sortDir: "desc" });
        if (selectedHospital) {
          await fetchAcceptedCountForHospital(selectedHospital);
        }
      } else {
        // We are viewing tasks of a hospital → refresh tasks and accepted counter
        await fetchList();
        if (selectedHospital) {
          await fetchAcceptedCountForHospital(selectedHospital);
        }
      }

      // Optimistically bump hospital list counters
      if (!isUpdate && selectedHospital) {
        setHospitalsWithTasks((prev) => prev.map((h) => {
          if (h.label !== selectedHospital) return h;
          const incAccepted = String((payload as any)?.status || '').toUpperCase() === 'ACCEPTED' ? 1 : 0;
          return { ...h, taskCount: (h.taskCount || 0) + 1, acceptedCount: (h.acceptedCount || 0) + incAccepted };
        }));
      }
    }
    toastSuccess(isUpdate ? "Cập nhật thành công" : "Tạo mới thành công");
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setViewOnly(false);
    setEditing(null);
  };

  if (!isSuper) {
    return (
      <div className="p-6 text-red-600">
        Bạn không có quyền truy cập trang SuperAdmin.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
          {showHospitalList ? "Danh sách bệnh viện cần bảo trì" : `Danh sách công việc bảo trì - ${selectedHospital}`}
        </h1>
        {!showHospitalList && (
          <button
            onClick={handleBackToHospitals}
            className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm font-medium"
          >
            ← Quay lại danh sách bệnh viện
          </button>
        )}
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {/* Hospital List View */}
      {showHospitalList && (
        <div className="mb-6 space-y-4">
          <div className="rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Lọc</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                    placeholder="Tìm theo tên bệnh viện / tỉnh"
                    value={hospitalSearch}
                    onChange={(e) => { setHospitalSearch(e.target.value); setHospitalPage(0); }}
                  />
                  <input
                    type="text"
                    className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                    placeholder="Tìm theo mã bệnh viện"
                    value={hospitalCodeSearch}
                    onChange={(e) => { setHospitalCodeSearch(e.target.value); setHospitalPage(0); }}
                  />
                  <div className="flex items-center gap-2 w-[280px]">
                    <select
                      className="w-[200px] rounded-full border px-4 py-3 text-sm shadow-sm border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                      value={hospitalStatusFilter}
                      onChange={(e) => { setHospitalStatusFilter(e.target.value); setHospitalPage(0); }}
                    >
                      <option value="" disabled hidden>— Trạng thái —</option>
                      <option value="accepted">Có nghiệm thu</option>
                      <option value="incomplete">Chưa nghiệm thu hết</option>
                      <option value="unaccepted">Chưa có nghiệm thu</option>
                      <option value="fromDeployment">Từ triển khai</option>
                      <option value="acceptedFromDeployment">Đã nhận từ triển khai</option>
                      <option value="hasOpenTickets">Có tickets chưa hoàn thành</option>
                    </select>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${hospitalStatusFilter ? "visible" : "invisible pointer-events-none"}`}
                      onClick={clearHospitalStatusFilter}
                    >
                      Bỏ lọc
                    </button>
                  </div>
                </div>
                <div ref={picFilterDropdownRef} className="flex flex-col gap-2 mt-3">
                  <div className="relative w-full max-w-[200px]">
                    <button
                      type="button"
                      className="w-full rounded-full border px-3 py-2 text-sm shadow-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                      onClick={() => setPicFilterOpen((prev) => !prev)}
                    >
                      <span className="truncate">
                        {hospitalPicFilter.length === 0
                          ? "Lọc người phụ trách"
                          : hospitalPicFilter.length === 1
                            ? picOptions.find((opt) => opt.id === hospitalPicFilter[0])?.label ?? "Đã chọn 1"
                            : `Đã chọn ${hospitalPicFilter.length} người phụ trách`}
                      </span>
                      <svg className={`w-4 h-4 transition-transform ${picFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {picFilterOpen && (
                      <div className="absolute z-30 mt-2 w-60 max-h-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3">
                        <input
                          type="text"
                          value={picFilterQuery}
                          onChange={(e) => setPicFilterQuery(e.target.value)}
                          placeholder="Tìm người phụ trách"
                          className="w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                        />
                        <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                          {filteredPicOptions.length === 0 ? (
                            <div className="text-sm text-gray-500 text-center py-6">
                              Không có dữ liệu người phụ trách
                            </div>
                          ) : (
                            filteredPicOptions.map((opt) => {
                              const value = opt.id;
                              const checked = hospitalPicFilter.includes(value);
                              return (
                                <label key={value} className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 px-2 py-1.5 rounded cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => togglePicFilterValue(value, e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="truncate">{opt.label}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm text-blue-600 hover:underline focus:outline-none"
                            onClick={clearPicFilter}
                            disabled={hospitalPicFilter.length === 0}
                          >
                            Bỏ lọc
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1.5 text-sm rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 focus:outline-none"
                            onClick={() => setPicFilterOpen(false)}
                          >
                            Đóng
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`self-start px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${hospitalPicFilter.length === 0 ? "invisible pointer-events-none" : ""}`}
                    onClick={clearPicFilter}
                  >
                    Bỏ lọc người phụ trách
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    Tổng bệnh viện:
                    <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                      {loadingHospitals ? "..." : hospitalSummary.total}
                    </span>
                  </span>
                  {/* <span className="font-semibold text-gray-800 dark:text-gray-200">
                    Đang hiển thị:
                    <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                      {loadingHospitals ? "..." : hospitalSummary.filteredCount}
                    </span>
                  </span> */}
                  {/* <span className="font-semibold text-gray-800 dark:text-gray-200">
                    Đã hoàn thành 100%:
                    <span className="ml-1 font-bold text-gray-900 dark:text-gray-100">
                      {loadingHospitals ? "..." : hospitalSummary.acceptedFull}
                    </span>
                  </span> */}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700"
                  onClick={() => { void handleNewTaskClick(); }}
                  type="button"
                >
                  + Thêm task mới
                </button>
                <button
                  className="relative inline-flex items-center gap-2 rounded-full border border-gray-300 text-gray-800 px-4 py-2 text-sm bg-white hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:bg-gray-900"
                  onClick={() => {
                    setPendingOpen(true);
                    fetchPendingTasks();
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg> Viện chờ tiếp nhận
                  {pendingTasks.length > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
                      {pendingTasks.length}
                    </span>
                  )}
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-gray-300 text-gray-800 px-4 py-2 text-sm bg-white hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:bg-gray-900"
                  onClick={() => navigate("/superadmin/tickets")}
                  type="button"
                >
                  <FiTag className="w-5 h-5" />
                  Tickets
                </button>
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
              <div className="rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 w-10 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">STT</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên bệnh viện</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã BV</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tỉnh/thành</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách chính</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách bảo trì</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng task</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredHospitals
                        .slice(hospitalPage * hospitalSize, (hospitalPage + 1) * hospitalSize)
                        .map((hospital, index) => {
                          const longName = (hospital.label || "").length > 32;
                          return (
                            <tr
                              key={`${hospital.label}-${index}`}
                              className="hover:bg-gray-50 transition-colors cursor-pointer"
                              onClick={(e) => handleHospitalClick(hospital.label, e)}
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {hospitalPage * hospitalSize + index + 1}
                              </td>
                              <td className="px-6 py-4">
                                <div className={`flex gap-3 ${longName ? 'items-start' : 'items-center'}`}>

                                  <div className={`text-sm font-medium text-gray-900 break-words max-w-[260px] flex flex-wrap gap-2 ${longName ? 'leading-snug' : ''}`}>
                                    <span>{hospital.label}</span>
                                    {hospital.fromDeployment && !hospital.acceptedByMaintenance && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                        Từ triển khai
                                      </span>
                                    )}
                                    {hospital.fromDeployment && hospital.acceptedByMaintenance && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                        Nhận từ triển khai
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {hospital.hospitalCode || "—"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {hospital.subLabel || "—"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {hospital.maintenancePersonInChargeName || "—"}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                {hospital.picDeploymentNames && hospital.picDeploymentNames.length > 0
                                  ? (
                                    <div className="flex flex-wrap gap-1">
                                      {hospital.picDeploymentNames.map((name, i) => (
                                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  )
                                  : "—"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm align-center">
                                <div className="flex flex-col items-start gap-1">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {(hospital.acceptedCount ?? 0)}/{hospital.taskCount ?? 0} task
                                  </span>
                                  {(hospital.nearDueCount ?? 0) > 0 && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Sắp đến hạn: {hospital.nearDueCount}</span>
                                  )}
                                  {(hospital.overdueCount ?? 0) > 0 && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Quá hạn: {hospital.overdueCount}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      // pass the event so handler can prevent default/stop propagation
                                      handleHospitalClick(hospital.label, e);
                                    }}
                                    className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition"
                                    title="Xem công việc"
                                  >
                                    <AiOutlineEye className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      // hospital.id từ summary API chính là hospitalId thực sự từ bảng hospitals
                                      // Chỉ resolve lại nếu hospital.id không hợp lệ (số âm hoặc <= 0)
                                      let finalHospitalId: number | null = null;
                                      
                                      if (hospital.id && hospital.id > 0) {
                                        // Dùng trực tiếp hospital.id vì nó đã là hospitalId thực sự từ summary API
                                        finalHospitalId = hospital.id;
                                        console.log("Using hospital.id directly:", finalHospitalId, "for hospital:", hospital.label);
                                      } else {
                                        // Fallback: resolve từ tên nếu hospital.id không hợp lệ
                                        console.log("hospital.id is invalid, resolving from name:", hospital.id);
                                        const resolvedId = await resolveHospitalIdByName(hospital.label);
                                        if (resolvedId) {
                                          finalHospitalId = resolvedId;
                                          console.log("Resolved hospitalId:", finalHospitalId, "for hospital:", hospital.label);
                                        }
                                      }
                                      
                                      if (finalHospitalId && finalHospitalId > 0) {
                                        setSelectedHospitalIdForTickets(finalHospitalId);
                                        setSelectedHospitalNameForTickets(hospital.label);
                                        setShowTicketsModal(true);
                                      } else {
                                        toast.error("Không thể tìm thấy ID bệnh viện hợp lệ");
                                      }
                                    }}
                                    className="relative rounded-lg p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition"
                                    title="Xem danh sách tickets"
                                  >
                                    <FiTag className="h-4 w-4" />
                                    {(ticketOpenCounts[hospital.id] ?? 0) > 0 && (
                                      <span className="absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                                        {ticketOpenCounts[hospital.id]}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between py-3">
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
                    <select value={String(hospitalSize)} onChange={(e) => { setHospitalSize(Number(e.target.value)); setHospitalPage(0); }} className="border rounded px-2 py-1 text-sm">
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>

                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => setHospitalPage(0)} disabled={hospitalPage <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Đầu">«</button>
                    <button onClick={() => setHospitalPage((p) => Math.max(0, p - 1))} disabled={hospitalPage <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Trước">‹</button>

                    {(() => {
                      const total = Math.max(1, Math.ceil(filteredHospitals.length / hospitalSize));
                      const pages: number[] = [];
                      const start = Math.max(1, hospitalPage + 1 - 2);
                      const end = Math.min(total, start + 4);
                      for (let i = start; i <= end; i++) pages.push(i);
                      return pages.map((p) => (
                        <button key={p} onClick={() => setHospitalPage(p - 1)} className={`px-3 py-1 border rounded text-sm ${hospitalPage + 1 === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>
                          {p}
                        </button>
                      ));
                    })()}

                    <button onClick={() => setHospitalPage((p) => Math.min(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1), p + 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Tiếp">›</button>
                    <button onClick={() => setHospitalPage(Math.max(0, Math.ceil(filteredHospitals.length / hospitalSize) - 1))} disabled={(hospitalPage + 1) * hospitalSize >= filteredHospitals.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Cuối">»</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Task List View */}
      {!showHospitalList && (
        <>
          {/* Search & Filter */}
          <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Thao tác</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px]"
                    placeholder="Tìm theo tên"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") fetchList();
                    }}
                  />
                  <div className="flex items-center gap-2 w-[260px]">
                    <select
                      className="w-[200px] rounded-full border px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="" disabled hidden>— Trạng thái —</option>
                      <option value="NOT_STARTED">Đã tiếp nhận</option>
                      <option value="IN_PROGRESS">Chưa xử lý</option>
                      <option value="API_TESTING">Đang xử lý</option>
                      <option value="INTEGRATING">Gặp sự cố</option>
                      <option value="WAITING_FOR_DEV">Hoàn thành</option>
                      {/* ACCEPTED intentionally omitted for maintenance UI */}
                    </select>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${statusFilter ? "visible" : "invisible pointer-events-none"}`}
                      onClick={clearTaskStatusFilter}
                    >
                      Bỏ lọc
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-600 flex items-center gap-4">
                  <span>Tổng:{" "}
                    <span className="font-semibold text-gray-800">
                      {loading ? "..." : totalCount ?? data.length}
                    </span>
                  </span>
                  {typeof acceptedCount === 'number' && (
                    <span>Đã hoàn thành: <span className="font-semibold text-gray-800">{acceptedCount}/{totalCount ?? data.length} task</span></span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700"
                  onClick={() => {
                    void handleNewTaskClick();
                  }}
                >
                  + Thêm task mới
                </button>

              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {loading && isInitialLoad ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse">
                  TAG
                </div>
              </div>
            ) : data.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-600 dark:text-gray-400">
                Không có dữ liệu
              </div>
            ) : (
              data.map((row, idx) => (
                <TaskCard
                  key={row.id}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  task={row as any}
                  idx={idx}
                  animate={enableItemAnimation}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onOpen={(t: any) => {
                    // Open in view-only mode for SuperAdmin on maintenance list
                    setEditing(t);
                    setViewOnly(true);
                    setModalOpen(true);
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onEdit={(t: any) => {
                    setEditing(t);
                    setViewOnly(false);
                    setModalOpen(true);
                  }}
                  onDelete={(id: number) => handleDelete(id)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {!showHospitalList && (
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
          )}
        </>
      )}

      {/* Modals */}
      {viewOnly ? (
        <DetailModal
          open={modalOpen}
          onClose={handleModalClose}
          item={editing}
        />
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <TaskFormModal
          open={modalOpen}
          onClose={handleModalClose}
          initial={editing as any}
          excludeAccepted={true}
          onSubmit={handleSubmit}
          readOnly={false}
        />
      )}
      <PendingTasksModal
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        tasks={pendingTasks}
        loading={loadingPending}
        onAccept={handleAcceptPendingGroup}
        onAcceptAll={handleAcceptAll}
      />

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
                {selectedHospitalIdForTickets ? (
                  <TicketsTab
                    hospitalId={selectedHospitalIdForTickets}
                    onTicketsChange={handleTicketsChange}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Đang tải thông tin bệnh viện...
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// =======================
// Detail Modal
// =======================
function DetailModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: MaintTask | null;
}) {
  const [picNames, setPicNames] = React.useState<Array<{ id: number; name: string }>>([]);
  const [loadingPics, setLoadingPics] = React.useState(false);

  // Fetch tên các PIC khi modal mở
  React.useEffect(() => {
    if (!open || !item) {
      setPicNames([]);
      return;
    }

    // 1. Ưu tiên: Dùng dữ liệu có sẵn từ backend (nếu API trả về đủ)
    const backendPicNames = (item as any)?.picDeploymentNames as Array<string> | undefined;
    const backendPicIds = (item as any)?.picDeploymentIds as Array<number | string> | undefined;
    if (Array.isArray(backendPicNames) && backendPicNames.length > 0 && Array.isArray(backendPicIds) && backendPicIds.length > 0) {
      setPicNames(backendPicIds.map((id, idx) => ({
        id: Number(id),
        name: backendPicNames[idx] || String(id),
      })));
      return;
    }

    // 2. Fallback: Parse từ text (additionalRequest/notes) cho các task cũ
    const picIds = parsePicIdsFromAdditionalRequest(item.additionalRequest, item.notes, item.picDeploymentId);

    if (picIds.length <= 1) {
      // Chỉ có 1 PIC (chính), dùng tên có sẵn từ item
      if (item.picDeploymentId && item.picDeploymentName) {
        setPicNames([{ id: item.picDeploymentId, name: item.picDeploymentName }]);
      } else {
        setPicNames([]);
      }
      return;
    }

    // 3. Fetch tên các PIC từ API (Batch hoặc Single loop)
    setLoadingPics(true);

    Promise.all(
      picIds.map(async (id) => {
        // Nếu ID trùng với PIC chính -> dùng tên có sẵn luôn, đỡ gọi API
        if (id === item.picDeploymentId && item.picDeploymentName) {
          return { id, name: item.picDeploymentName };
        }

        try {
          const url = `${API_ROOT}/api/v1/superadmin/users/${id}`;
          const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
          if (!res.ok) return { id, name: String(id) };
          const user = await res.json();
          const name = user.fullName || user.fullname || user.name || user.username || user.email || String(id);
          return { id, name: String(name) };
        } catch (err) {
          return { id, name: String(id) };
        }
      })
    )
      .then((results) => {
        setPicNames(results);
      })
      .catch((err) => {
        console.error("Err loading pics:", err);
        // Fallback cuối cùng
        if (item.picDeploymentId && item.picDeploymentName) {
          setPicNames([{ id: item.picDeploymentId, name: item.picDeploymentName }]);
        }
      })
      .finally(() => {
        setLoadingPics(false);
      });
  }, [open, item]);

  if (!open || !item) return null;
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("vi-VN") : "—");

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
        {/* Header (sticky) */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            📋 Chi tiết tác vụ bảo trì
          </h2>

        </div>

        {/* Body (scrollable) */}
        
        <div className="p-6 max-h-[60vh] overflow-y-auto text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <Info label="Tên " value={item.name} icon={<FiInfo />} />
            <Info label="Bệnh viện " value={item.hospitalName} icon={<FiUser />} />
            {/* 1. Người phụ trách (Chỉ lấy người chính từ item, KHÔNG dùng picNames) */}
            <Info
              label="Người phụ trách "
              value={item.picDeploymentName || "—"}
              icon={<FiUser />}
            />

            {/* 2. Người hỗ trợ (Dùng picNames nhưng LỌC BỎ người chính ra) */}
            <Info
              label="Người hỗ trợ"
              icon={<FiUser />}
              value={
                loadingPics ? (
                  <span className="text-gray-500">Đang tải...</span>
                ) : (
                  <span className="font-medium">
                    {picNames
                      // QUAN TRỌNG: Lọc bỏ ID của người phụ trách chính ra khỏi danh sách này
                      .filter((p) => Number(p.id) !== Number(item.picDeploymentId))
                      .map((p) => p.name)
                      .join(", ") || <span className="text-gray-400 font-normal">Chưa có</span>
                    }
                  </span>
                )
              }
            />
            <Info
              label="Người tiếp nhận"
              icon={<FiCheckCircle />}
              value={(item as any).receivedByName || "-"}
            />
            <Info
              label="Trạng thái"
              icon={<FiActivity />}
              value={
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              }
            />
            {/* <Info
              label="API URL"
              icon={<FiLink />}
              value={
                item.apiUrl ? (
                  <a href={item.apiUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {item.apiUrl}
                  </a>
                ) : (
                  "—"
                )
              }
            /> */}
            {/* <Info label="API Test" value={item.apiTestStatus} icon={<FiInfo />} /> */}
            <Info label="Bắt đầu" value={fmt(item.startDate)} icon={<FiClock />} />
            <Info icon={<FiClock />} label="Deadline:" value={fmt(item.deadline)} />
            
            {/* <Info label="Ngày nghiệm thu" value={fmt(item.acceptanceDate)} icon={<FiClock />} /> */}
            <Info label="Hoàn thành" value={fmt(item.finishDate ?? item.completionDate)} icon={<FiClock />} />
            <Info label="Tạo lúc" value={fmt(item.createdAt)} icon={<FiClock />} />
          </div>

          <div className="pt-6 mb-6">
            <p className="text-gray-500 mb-2">Nội dung công việc:</p>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 min-h-[60px] whitespace-pre-wrap break-words">
              {(() => {
                const notes = item.notes || item.additionalRequest || "";
                // Loại bỏ phần [PIC_IDS: ...] khỏi hiển thị
                const cleaned = notes.replace(/\[PIC_IDS:\s*[^\]]+\]\s*/g, "").trim();
                return cleaned || "—";
              })()}
            </div>
          </div>
          {/* Shared TaskNotes component (shows all notes + my note textarea + delete) */}
          <TaskNotes taskId={item?.id} myRole={(item as any)?.myRole} taskType="maintenance" />
        </div>

        {/* Footer (sticky) */}
        <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            Đóng
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =======================
// Pending Tasks Modal (công việc chờ)
// =======================
function PendingTasksModal({
  open,
  onClose,
  tasks,
  loading,
  onAccept,
  onAcceptAll,
}: {
  open: boolean;
  onClose: () => void;
  tasks: PendingTransferGroup[];
  loading: boolean;
  onAccept: (group: PendingTransferGroup) => Promise<void>;
  onAcceptAll?: () => Promise<void>;
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
        className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-3 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Danh sách bệnh viện chờ tiếp nhận</h3>
          {/* <button onClick={onClose} className="text-gray-500">✕</button> */}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-8">Đang tải...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-6 text-gray-500">Không có bệnh viện chờ tiếp nhận</div>
          ) : (
            <>
              {onAcceptAll && (
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={onAcceptAll}
                    disabled={tasks.length === 0}
                    className="h-10 rounded-xl px-4 text-sm font-medium transition shadow-sm !bg-green-600 !text-white !border-green-600 hover:!bg-green-700 hover:!border-green-700 disabled:!bg-green-300 disabled:!border-green-300 disabled:!text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tiếp nhận tất cả ({tasks.length})
                  </button>
                </div>
              )}
              <div className="max-h-[60vh] overflow-y-auto space-y-3">
                {tasks.map((group) => (
                  <div
                    key={group.key}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900"
                  >
                    <div className="flex items-center justify-between px-5 py-4">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {group.hospitalName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Bệnh viện chờ tiếp nhận
                        </div>
                      </div>
                      <button
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
                        disabled={acceptingKey === group.key}
                        onClick={async () => {
                          setAcceptingKey(group.key);
                          try {
                            await onAccept(group);
                          } finally {
                            setAcceptingKey(null);
                          }
                        }}
                      >
                        {acceptingKey === group.key ? "Đang tiếp nhận..." : "Tiếp nhận"}
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </>
          )}
        </div>


      </motion.div>
    </div>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-start items-start gap-3">
      <div className="flex items-center gap-2 min-w-[140px] shrink-0">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span className="font-semibold text-gray-900 dark:text-gray-100">{label}:</span>
      </div>
      <div className="text-gray-700 dark:text-gray-300 text-left flex-1 break-words">        {value ?? "—"}
      </div>
    </div>
  );
}

export default MaintenanceSuperTaskPage;
