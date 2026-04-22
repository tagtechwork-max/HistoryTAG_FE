import React, { useState, useMemo, useEffect } from "react";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiSave,
  FiAlertTriangle,
  FiClock,
  FiUser,
  FiCheckCircle,
  FiFileText,
  FiEye,
  FiTag
} from "react-icons/fi";
import { Ticket } from "./GeneralInfor";
import {
  getHospitalTickets,
  createHospitalTicket,
  updateHospitalTicket,
  deleteHospitalTicket,
  type TicketResponseDTO,
  type TicketRequestDTO
} from "../../../api/ticket.api";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";

const API_ROOT = import.meta.env.VITE_API_URL || "";

function authHeaders(extra?: Record<string, string>) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  } as Record<string, string>;
}

interface TicketsTabProps {
  tickets?: Ticket[];
  onTicketsChange?: (tickets: Ticket[]) => void;
  hospitalId?: number;
  useTicketsProp?: boolean; // Flag để phân biệt: true = dùng tickets prop, false/undefined = load từ API
}

const TICKETS_CACHE_TTL_MS = 2 * 60 * 1000;
const ticketsCache = new Map<number, Ticket[]>();
const ticketsCacheUpdatedAt = new Map<number, number>();

const statusConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
  CHUA_XU_LY: { label: "Chưa xử lý", bgColor: "bg-gray-100", textColor: "text-gray-700" },
  DANG_XU_LY: { label: "Đang xử lý", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  HOAN_THANH: { label: "Hoàn thành", bgColor: "bg-green-100", textColor: "text-green-700" }
};

const priorityConfig: Record<string, { bgColor: string; textColor: string; icon: React.ReactElement }> = {
  "Cao": {
    bgColor: "bg-red-100",
    textColor: "text-red-700",
    icon: <FiAlertTriangle className="h-3.5 w-3.5" />
  },
  "Trung bình": {
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
    icon: <FiClock className="h-3.5 w-3.5" />
  },
  "Thấp": {
    bgColor: "bg-green-100",
    textColor: "text-green-700",
    icon: <FiCheckCircle className="h-3.5 w-3.5" />
  }
};

const priorityOptions: Ticket["priority"][] = ["Cao", "Trung bình", "Thấp"];

const ticketTypeConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
  MAINTENANCE: { label: "Bảo trì", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  DEPLOYMENT: { label: "Triển khai", bgColor: "bg-purple-100", textColor: "text-purple-700" }
};

const ticketTypeOptions: Array<{ value: "MAINTENANCE" | "DEPLOYMENT"; label: string }> = [
  { value: "MAINTENANCE", label: "Bảo trì" },
  { value: "DEPLOYMENT", label: "Triển khai" }
];

export default function TicketsTab({
  tickets = [],
  onTicketsChange,
  hospitalId,
  useTicketsProp = false // Mặc định không dùng tickets prop, load từ API
}: TicketsTabProps) {
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();
  const [localTickets, setLocalTickets] = useState<Ticket[]>(tickets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [itUsers, setItUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [loadingItUsers, setLoadingItUsers] = useState(false);

  // Get current user ID from localStorage
  const currentUserId = useMemo(() => {
    const userIdStr = localStorage.getItem("userId");
    if (!userIdStr) return null;
    const userId = Number(userIdStr);
    return isNaN(userId) ? null : userId;
  }, []);

  // Check if current user is SUPERADMIN
  const isSuperAdmin = useMemo(() => {
    try {
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (rolesStr) {
        const roles = JSON.parse(rolesStr);
        if (Array.isArray(roles)) {
          return roles.some((r: any) => {
            if (typeof r === "string") {
              return r.toUpperCase() === "SUPERADMIN" || r.toUpperCase() === "SUPER_ADMIN";
            }
            if (r && typeof r === "object") {
              const roleName = r.roleName || r.role_name || r.role;
              return typeof roleName === "string" && roleName.toUpperCase() === "SUPERADMIN";
            }
            return false;
          });
        }
      }
    } catch (e) {
      console.error("Error checking superadmin role:", e);
    }
    return false;
  }, []);

  const applyLocalTickets = React.useCallback((updated: Ticket[]) => {
    setLocalTickets(updated);
    onTicketsChange?.(updated);
    if (hospitalId) {
      ticketsCache.set(hospitalId, updated);
      ticketsCacheUpdatedAt.set(hospitalId, Date.now());
    }
  }, [hospitalId, onTicketsChange]);

  // Load tickets function - wrap in useCallback để tránh recreate mỗi lần render
  const loadTickets = React.useCallback(async () => {
    if (!hospitalId) {
      console.warn("TicketsTab: hospitalId is missing");
      setLocalTickets([]);
      return;
    }
    
    console.log("TicketsTab: Loading tickets for hospitalId:", hospitalId, "Type:", typeof hospitalId);
    const cached = ticketsCache.get(hospitalId);
    const cachedAt = ticketsCacheUpdatedAt.get(hospitalId) ?? 0;
    const isStale = Date.now() - cachedAt > TICKETS_CACHE_TTL_MS;
    if (cached && cached.length > 0) {
      setLocalTickets(cached);
      setLoading(false);
      if (!isStale) {
        return;
      }
    }
    setLoading(!cached || cached.length === 0);
    setError(null);
    try {
      const data = await getHospitalTickets(hospitalId);
      console.log("TicketsTab: Received tickets data:", data, "Length:", data?.length);
      // Convert API response to Ticket format và sắp xếp theo createdAt giảm dần (mới nhất trước)
      const convertedTickets: Ticket[] = data.map((item: TicketResponseDTO) => ({
        id: item.ticketCode || `#TK-${item.id}`,
        issue: item.issue,
        priority: item.priority,
        status: item.status,
        ticketType: item.ticketType || "MAINTENANCE", // Default to MAINTENANCE if not provided
        pic: item.pic || '',
        createdAt: item.createdAt || undefined,
        createdBy: item.createdBy || null,
        createdById: item.createdById || null,
        timeElapsed: item.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(item.createdAt || undefined)
      }))
      .sort((a, b) => {
        // Sắp xếp theo createdAt giảm dần (mới nhất trước)
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      console.log("TicketsTab: Converted tickets:", convertedTickets);
      setLocalTickets(convertedTickets);
      ticketsCache.set(hospitalId, convertedTickets);
      ticketsCacheUpdatedAt.set(hospitalId, Date.now());
      if (onTicketsChange) {
        onTicketsChange(convertedTickets);
      }
    } catch (err: any) {
      console.error("TicketsTab: Error loading tickets:", err);
      console.error("TicketsTab: Error details:", {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
        hospitalId
      });
      setError(err?.response?.data?.message || err?.message || "Không thể tải danh sách tickets");
      toast.error(err?.response?.data?.message || err?.message || "Không thể tải danh sách tickets");
    } finally {
      setLoading(false);
    }
  }, [hospitalId, onTicketsChange]);

  // Load tickets logic:
  // - Nếu useTicketsProp = true: dùng tickets prop (không load từ API)
  // - Nếu useTicketsProp = false/undefined và có hospitalId: load từ API
  useEffect(() => {
    console.log("TicketsTab: useEffect triggered, hospitalId:", hospitalId, "useTicketsProp:", useTicketsProp, "tickets.length:", tickets.length);
    
    // Nếu useTicketsProp = true, dùng tickets prop (không load từ API)
    if (useTicketsProp) {
      console.log("TicketsTab: Using tickets prop, syncing with localTickets");
      const ticketsStr = JSON.stringify(tickets);
      const localStr = JSON.stringify(localTickets);
      if (ticketsStr !== localStr) {
        console.log("TicketsTab: Syncing localTickets with tickets prop");
        setLocalTickets(tickets);
      }
      return; // Không load từ API
    }
    
    // Nếu useTicketsProp = false/undefined và có hospitalId, load từ API
    if (hospitalId) {
      console.log("TicketsTab: hospitalId is valid, calling loadTickets()");
      loadTickets();
    } else {
      console.log("TicketsTab: hospitalId is missing or invalid, clearing tickets");
      setLocalTickets([]);
      setLoading(false);
    }
  }, [hospitalId, loadTickets, useTicketsProp]); // Bỏ tickets và localTickets khỏi dependency để tránh infinite loop

  // Sync tickets prop một cách riêng biệt khi useTicketsProp = true
  useEffect(() => {
    if (useTicketsProp && tickets) {
      const ticketsStr = JSON.stringify(tickets);
      const localStr = JSON.stringify(localTickets);
      if (ticketsStr !== localStr) {
        console.log("TicketsTab: Syncing localTickets with tickets prop (separate effect)");
        setLocalTickets(tickets);
      }
    }
  }, [tickets, useTicketsProp]); // Chỉ sync khi tickets prop thay đổi và useTicketsProp = true

  const [ticketForm, setTicketForm] = useState<Omit<Ticket, "id" | "timeElapsed"> & { picUserId?: number | null }>({
    issue: "",
    priority: "Trung bình",
    createdAt: new Date().toISOString(),
    pic: "",
    picUserId: null,
    status: "DANG_XU_LY",
    ticketType: "MAINTENANCE"
  });

  // Load IT users on mount - using ADMIN API endpoint
  useEffect(() => {
    const loadItUsers = async () => {
      setLoadingItUsers(true);
      try {
        // Use ADMIN API endpoint instead of SUPERADMIN API
        const params = new URLSearchParams({
          department: "IT",
          includeSuperAdmin: "true",
        });
        const res = await fetch(`${API_ROOT}/api/v1/admin/users/search?${params.toString()}`, {
          method: 'GET',
          headers: authHeaders(),
          credentials: 'include',
        });
        
        if (!res.ok) {
          throw new Error(`Failed to load IT users: ${res.status}`);
        }
        
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        
        // Map from EntitySelectDTO format (id, label, subLabel) to our format
        const userOptions = list
          .map((u: any) => {
            const id = u?.id;
            const name = u?.label || u?.fullname || u?.fullName || u?.username || `User ${id}`;
            if (!id || !name) return null;
            return {
              id: Number(id),
              name: String(name).trim()
            };
          })
          .filter((u): u is { id: number; name: string } => u != null && Number.isFinite(u.id))
          .sort((a, b) => a.name.localeCompare(b.name, "vi"));
        
        setItUsers(userOptions);
      } catch (err) {
        console.error("Error loading IT users:", err);
        toast.error("Không thể tải danh sách người phụ trách");
      } finally {
        setLoadingItUsers(false);
      }
    };
    loadItUsers();
  }, []);

  // Filter tickets
  const filteredTickets = useMemo(() => {
    return localTickets.filter(ticket => {
      const matchesSearch =
        ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.issue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.pic.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
      const matchesTicketType = ticketTypeFilter === "all" || ticket.ticketType === ticketTypeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesTicketType;
    });
  }, [localTickets, searchQuery, statusFilter, priorityFilter, ticketTypeFilter]);

  // Calculate time elapsed from createdAt
  const calculateTimeElapsed = (createdAt?: string): string => {
    if (!createdAt) return "Chưa có";
    
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays > 0) {
      return `${diffDays} ngày`;
    } else if (diffHours > 0) {
      const mins = diffMins % 60;
      return mins > 0 ? `${diffHours}h ${mins}p` : `${diffHours}h`;
    } else {
      return `${diffMins}p`;
    }
  };

  // Stats
  const stats = useMemo(() => {
    const notStarted = localTickets.filter(t => t.status === "CHUA_XU_LY").length;
    const inProgress = localTickets.filter(t => t.status === "DANG_XU_LY").length;
    const completed = localTickets.filter(t => t.status === "HOAN_THANH").length;
    const highPriority = localTickets.filter(t => t.priority === "Cao").length;

    return { notStarted, inProgress, completed, highPriority };
  }, [localTickets]);

  const handleAddTicket = () => {
    setEditingTicket(null);
    setTicketForm({
      issue: "",
      priority: "Trung bình",
      createdAt: new Date().toISOString(),
      pic: "",
      picUserId: null,
      status: "CHUA_XU_LY",
      ticketType: "MAINTENANCE"
    });
    setShowTicketModal(true);
  };

  const handleEditTicket = (ticket: Ticket) => {
    setEditingTicket(ticket);
    // Tìm userId từ picName nếu có
    let picUserId: number | null = null;
    if (ticket.pic) {
      const matchedUser = itUsers.find(u => u.name === ticket.pic);
      if (matchedUser) {
        picUserId = matchedUser.id;
      }
    }
    setTicketForm({
      issue: ticket.issue,
      priority: ticket.priority,
      createdAt: ticket.createdAt || new Date().toISOString(),
      pic: ticket.pic,
      picUserId: picUserId,
      status: ticket.status,
      ticketType: ticket.ticketType || "MAINTENANCE"
    });
    setShowTicketModal(true);
  };

  const handleViewTicket = (ticket: Ticket) => {
    setViewingTicket(ticket);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    const ok = await askConfirm({
      title: "Xóa ticket?",
      message: "Bạn có chắc muốn xóa ticket này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;

    if (!hospitalId) {
      // Fallback: local delete if no hospitalId
      const updatedTickets = localTickets.filter(t => t.id !== ticketId);
      applyLocalTickets(updatedTickets);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Extract numeric ID from ticketCode (e.g., "#TK-123" -> 123)
      const numericId = parseInt(ticketId.replace(/[^\d]/g, ''));
      if (isNaN(numericId)) {
        throw new Error("Invalid ticket ID");
      }

      await deleteHospitalTicket(hospitalId, numericId, false);
      toast.success("Xóa ticket thành công");
      // Update list immediately to avoid flicker; cache will keep it in sync
      const updatedTickets = localTickets.filter(t => t.id !== ticketId);
      applyLocalTickets(updatedTickets);
    } catch (err: any) {
      console.error("Error deleting ticket:", err);
      setError(err?.response?.data?.message || err?.message || "Không thể xóa ticket");
      toast.error(err?.response?.data?.message || err?.message || "Không thể xóa ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTicket = async () => {
    if (!ticketForm.issue.trim()) {
      toast.error("Vui lòng điền vấn đề");
      return;
    }

    if (!hospitalId) {
      // Fallback: local save if no hospitalId
      let updatedTickets: Ticket[];
      if (editingTicket) {
        const updatedTicket = {
          ...ticketForm,
          id: editingTicket.id,
          createdBy: editingTicket.createdBy, // Preserve createdBy when editing
          createdById: editingTicket.createdById, // Preserve createdById when editing
          timeElapsed: ticketForm.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(ticketForm.createdAt)
        };
        updatedTickets = localTickets.map(t =>
          t.id === editingTicket.id ? updatedTicket : { ...t, timeElapsed: t.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(t.createdAt) }
        );
      } else {
        const newTicket: Ticket = {
          ...ticketForm,
          id: `#TK-${Date.now()}`,
          timeElapsed: calculateTimeElapsed(ticketForm.createdAt)
        };
        updatedTickets = [...localTickets.map(t => ({ ...t, timeElapsed: t.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(t.createdAt) })), newTicket];
      }
      setLocalTickets(updatedTickets);
      onTicketsChange?.(updatedTickets);
      setShowTicketModal(false);
      setEditingTicket(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: TicketRequestDTO = {
        issue: ticketForm.issue.trim(),
        priority: ticketForm.priority,
        status: ticketForm.status,
        ticketType: ticketForm.ticketType || "MAINTENANCE",
        picName: ticketForm.pic.trim() || null,
        picUserId: ticketForm.picUserId || null
      };

      let updatedTicket: Ticket | null = null;
      if (editingTicket) {
        // Extract numeric ID from ticketCode (e.g., "#TK-123" -> 123)
        const numericId = parseInt(editingTicket.id.replace(/[^\d]/g, ''));
        if (isNaN(numericId)) {
          throw new Error("Invalid ticket ID");
        }
        const response = await updateHospitalTicket(hospitalId, numericId, payload, false);
        toast.success("Cập nhật ticket thành công");
        // Convert response to Ticket format, preserve createdAt from original ticket if response doesn't have it
        const createdAt = response.createdAt || editingTicket.createdAt || undefined;
        updatedTicket = {
          id: response.ticketCode || editingTicket.id,
          issue: response.issue,
          priority: response.priority,
          status: response.status,
          ticketType: response.ticketType || editingTicket.ticketType || "MAINTENANCE",
          pic: response.pic || editingTicket.pic || '',
          createdAt: createdAt,
          createdBy: response.createdBy || editingTicket.createdBy || null,
          createdById: response.createdById ?? editingTicket.createdById ?? null,
          timeElapsed: response.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(createdAt)
        };
      } else {
        const response = await createHospitalTicket(hospitalId, payload, false);
        toast.success("Tạo ticket thành công");
        // Convert response to Ticket format
        updatedTicket = {
          id: response.ticketCode || `#TK-${response.id}`,
          issue: response.issue,
          priority: response.priority,
          status: response.status,
          ticketType: response.ticketType || ticketForm.ticketType || "MAINTENANCE",
          pic: response.pic || '',
          createdAt: response.createdAt || ticketForm.createdAt || undefined,
          createdBy: response.createdBy || null,
          createdById: response.createdById || null,
          timeElapsed: response.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(response.createdAt || ticketForm.createdAt)
        };
      }

      // Update local tickets immediately for instant UI feedback
      if (updatedTicket) {
        let updatedTickets: Ticket[];
        if (editingTicket) {
          updatedTickets = localTickets.map(t =>
            t.id === editingTicket.id ? updatedTicket! : { ...t, timeElapsed: t.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(t.createdAt) }
          );
        } else {
          updatedTickets = [
            updatedTicket,
            ...localTickets.map(t => ({ ...t, timeElapsed: t.status === "HOAN_THANH" ? undefined : calculateTimeElapsed(t.createdAt) }))
          ];
        }
        // Sort by createdAt descending
        updatedTickets.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        applyLocalTickets(updatedTickets);
      }

      // Invalidate cache to force fresh reload on next open
      if (hospitalId) {
        ticketsCache.delete(hospitalId);
        ticketsCacheUpdatedAt.delete(hospitalId);
      }

      setShowTicketModal(false);
      setEditingTicket(null);
    } catch (err: any) {
      console.error("Error saving ticket:", err);
      setError(err?.response?.data?.message || err?.message || "Không thể lưu ticket");
      toast.error(err?.response?.data?.message || err?.message || "Không thể lưu ticket");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseTicketModal = () => {
    setShowTicketModal(false);
    setEditingTicket(null);
  };

  const handleCloseViewModal = () => {
    setViewingTicket(null);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && localTickets.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Đang tải...</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Đang xử lý</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.inProgress}</p>
            </div>
            <FiClock className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Chưa xử lý</p>
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{stats.notStarted}</p>
            </div>
            <FiFileText className="h-8 w-8 text-gray-500" />
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">Hoàn thành</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.completed}</p>
            </div>
            <FiCheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Ưu tiên cao</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.highPriority}</p>
            </div>
            <FiTag className="h-8 w-8 text-amber-500" />
          </div>
        </div>
      </div>

      {/* Header với search và filter */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 flex gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FiSearch className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm theo ID, vấn đề, người phụ trách..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
              showFilters || statusFilter !== "all" || priorityFilter !== "all" || ticketTypeFilter !== "all"
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            <FiFilter className="h-4 w-4" />
            Lọc
          </button>
        </div>

        {/* Add Button */}
        <button
          onClick={handleAddTicket}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition shrink-0"
        >
          <FiPlus className="h-4 w-4" />
          Tạo ticket mới
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trạng thái
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Tất cả</option>
                <option value="DANG_XU_LY">Đang xử lý</option>
                <option value="QUA_SLA">Quá SLA</option>
                <option value="HOAN_THANH">Hoàn thành</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mức độ ưu tiên
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Tất cả</option>
                <option value="Cao">Cao</option>
                <option value="Trung bình">Trung bình</option>
                <option value="Thấp">Thấp</option>
              </select>
            </div>

            {/* Ticket Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Loại ticket
              </label>
              <select
                value={ticketTypeFilter}
                onChange={(e) => setTicketTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Tất cả</option>
                <option value="MAINTENANCE">Bảo trì</option>
                <option value="DEPLOYMENT">Triển khai</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Tickets Table */}
      <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700" style={{ maxWidth: '100%' }}>
        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="min-w-[1400px] divide-y divide-gray-200 dark:divide-gray-700" style={{ width: 'max-content' }}>
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Ticket ID
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Vấn đề
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Ưu tiên
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Trạng thái
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Loại ticket
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Thời gian chờ
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Người phụ trách
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Người tạo
              </th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">Đang tải tickets...</p>
                  </div>
                </td>
              </tr>
            ) : filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <FiFileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchQuery || statusFilter !== "all" || priorityFilter !== "all" || ticketTypeFilter !== "all"
                      ? "Không tìm thấy ticket nào"
                      : "Chưa có ticket nào"}
                  </p>
                </td>
              </tr>
            ) : (
              filteredTickets.map((ticket) => {
                const isHighPriority = ticket.priority === "Cao";
  return (
                  <tr
                    key={ticket.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {ticket.id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-gray-700 dark:text-gray-300 max-w-xs">
                        <p className="truncate">{ticket.issue}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          priorityConfig[ticket.priority]?.bgColor
                        } ${priorityConfig[ticket.priority]?.textColor}`}
                      >
                        {priorityConfig[ticket.priority]?.icon}
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          statusConfig[ticket.status]?.bgColor
                        } ${statusConfig[ticket.status]?.textColor}`}
                      >
                        {statusConfig[ticket.status]?.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {ticket.ticketType && ticketTypeConfig[ticket.ticketType] ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            ticketTypeConfig[ticket.ticketType]?.bgColor
                          } ${ticketTypeConfig[ticket.ticketType]?.textColor}`}
                        >
                          {ticketTypeConfig[ticket.ticketType]?.label}
                        </span>
                      ) : ticket.ticketType ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700">
                          {ticket.ticketType}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                        <FiClock className={`h-4 w-4 ${
                          ticket.status === "HOAN_THANH" ? "text-green-500" : 
                          (ticket.timeElapsed && ticket.timeElapsed.includes("ngày") && parseInt(ticket.timeElapsed) > 3) ? "text-amber-500" : 
                          "text-gray-400"
                        }`} />
                        <span className={
                          ticket.status === "HOAN_THANH" ? "text-green-600 font-medium" :
                          (ticket.timeElapsed && ticket.timeElapsed.includes("ngày") && parseInt(ticket.timeElapsed) > 3) ? "text-amber-600 font-medium" :
                          ""
                        }>
                          {ticket.status === "HOAN_THANH" ? "Đã hoàn thành" : 
                           (ticket.timeElapsed || calculateTimeElapsed(ticket.createdAt))}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <FiUser className="h-4 w-4 text-gray-400" />
                        {ticket.pic}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <FiUser className="h-4 w-4 text-gray-400" />
                        {ticket.createdBy || "N/A"}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewTicket(ticket)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition dark:hover:bg-blue-900/20"
                          title="Xem chi tiết"
                        >
                          <FiEye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditTicket(ticket)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition dark:hover:bg-blue-900/20"
                          title="Sửa"
                        >
                          <FiEdit2 className="h-4 w-4" />
                        </button>
                        {/* Chỉ hiển thị nút xóa nếu user hiện tại là người tạo ticket HOẶC là SUPERADMIN */}
                        {((currentUserId && ticket.createdById && currentUserId === ticket.createdById) || isSuperAdmin) && (
                          <button
                            onClick={() => handleDeleteTicket(ticket.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition dark:hover:bg-red-900/20"
                            title={isSuperAdmin ? "Xóa (SUPERADMIN)" : "Xóa"}
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Ticket Modal (Add/Edit) */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto dark:bg-gray-800">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingTicket ? "Sửa ticket" : "Tạo ticket mới"}
              </h3>
              <button
                onClick={handleCloseTicketModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveTicket();
              }}
              className="p-6 space-y-4"
            >
              {/* Vấn đề */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Vấn đề / Mô tả <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={ticketForm.issue}
                  onChange={(e) => setTicketForm({ ...ticketForm, issue: e.target.value })}
                  placeholder="Mô tả chi tiết vấn đề..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Mức độ ưu tiên */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mức độ ưu tiên <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) =>
                      setTicketForm({ ...ticketForm, priority: e.target.value as Ticket["priority"] })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                    required
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trạng thái */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Trạng thái <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ticketForm.status}
                    onChange={(e) =>
                      setTicketForm({ ...ticketForm, status: e.target.value as Ticket["status"] })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                    required
                  >
                    <option value="CHUA_XU_LY">Chưa xử lý</option>
                    <option value="DANG_XU_LY">Đang xử lý</option>
                    <option value="HOAN_THANH">Hoàn thành</option>
                  </select>
                </div>

                {/* Loại ticket */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Loại ticket <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ticketForm.ticketType || "MAINTENANCE"}
                    onChange={(e) =>
                      setTicketForm({ ...ticketForm, ticketType: e.target.value as Ticket["ticketType"] })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                    required
                  >
                    {ticketTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Ngày tạo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ngày tạo
                  </label>
                  <input
                    type="datetime-local"
                    value={ticketForm.createdAt ? new Date(ticketForm.createdAt).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setTicketForm({ ...ticketForm, createdAt: e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString() })}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                {/* Người phụ trách */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Người phụ trách 
                  </label>
                  <select
                    value={ticketForm.picUserId || ""}
                    onChange={(e) => {
                      const userId = e.target.value ? Number(e.target.value) : null;
                      const selectedUser = itUsers.find(u => u.id === userId);
                      setTicketForm({ 
                        ...ticketForm, 
                        picUserId: userId,
                        pic: selectedUser ? selectedUser.name : ""
                      });
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                    disabled={loadingItUsers}
                  >
                    <option value="">-- Chọn người phụ trách --</option>
                    {itUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                  {/* Hiển thị giá trị cũ nếu không tìm thấy trong danh sách (backward compatibility) */}
                  {ticketForm.pic && !ticketForm.picUserId && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Giá trị hiện tại: {ticketForm.pic} (không có trong danh sách)
                    </p>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleCloseTicketModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                >
                  <FiSave className="h-4 w-4" />
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Ticket Modal */}
      {viewingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto dark:bg-gray-800">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <FiFileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Chi tiết Ticket
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {viewingTicket.id}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseViewModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Vấn đề - Section chính */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Vấn đề / Mô tả
                </label>
                <p className="text-base text-gray-900 dark:text-white leading-relaxed">
                  {viewingTicket.issue}
                </p>
              </div>

              {/* Thông tin trạng thái - Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Mức độ ưu tiên
                  </label>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                      priorityConfig[viewingTicket.priority]?.bgColor
                    } ${priorityConfig[viewingTicket.priority]?.textColor}`}
                  >
                    {priorityConfig[viewingTicket.priority]?.icon}
                    {viewingTicket.priority}
                  </span>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Trạng thái
                  </label>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                      statusConfig[viewingTicket.status]?.bgColor
                    } ${statusConfig[viewingTicket.status]?.textColor}`}
                  >
                    {statusConfig[viewingTicket.status]?.label}
                  </span>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Loại ticket
                  </label>
                  {viewingTicket.ticketType ? (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                        ticketTypeConfig[viewingTicket.ticketType]?.bgColor
                      } ${ticketTypeConfig[viewingTicket.ticketType]?.textColor}`}
                    >
                      {ticketTypeConfig[viewingTicket.ticketType]?.label}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-gray-500">Chưa xác định</span>
                  )}
                </div>
              </div>

              {/* Thông tin thời gian và người liên quan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Thời gian */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Thời gian
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <FiClock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Thời gian chờ</p>
                        <p className={`text-sm font-medium ${
                          viewingTicket.status === "HOAN_THANH" 
                            ? "text-green-600 dark:text-green-400" 
                            : "text-gray-900 dark:text-white"
                        }`}>
                          {viewingTicket.status === "HOAN_THANH" 
                            ? "Đã hoàn thành" 
                            : (viewingTicket.timeElapsed || calculateTimeElapsed(viewingTicket.createdAt) || "Chưa có")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <FiClock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Ngày tạo</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {viewingTicket.createdAt 
                            ? new Date(viewingTicket.createdAt).toLocaleString("vi-VN", {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : "Chưa có"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Người liên quan */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Người liên quan
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <FiUser className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Người phụ trách</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {viewingTicket.pic || "Chưa có"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <FiUser className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Người tạo</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {viewingTicket.createdBy || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleCloseViewModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    handleCloseViewModal();
                    handleEditTicket(viewingTicket);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                >
                  <FiEdit2 className="h-4 w-4" />
                  Chỉnh sửa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {genericConfirmDialog}
    </div>
  );
}
