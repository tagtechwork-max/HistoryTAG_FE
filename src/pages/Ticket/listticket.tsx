import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiSearch,
  FiFilter,
  FiX,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiTag,
  FiUser,
  FiCalendar,
  FiRefreshCw,
  FiDownload
} from "react-icons/fi";
import { FaHospital } from "react-icons/fa";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import {
  getAllTickets,
  updateHospitalTicket,
  deleteHospitalTicket,
  createHospitalTicket,
  type TicketResponseDTO,
  type TicketRequestDTO,
  type TicketFilterParams
} from "../../api/ticket.api";
import api from "../../api/client";
import { getUserAccount, type UserResponseDTO } from "../../api/auth.api";

// ==================== TYPES ====================

interface TicketStats {
  total: number;
  chuaXuLy: number;
  dangXuLy: number;
  hoanThanh: number;
  cao: number;
  trungBinh: number;
  thap: number;
  maintenance: number;
  deployment: number;
}

// ==================== CONFIG ====================

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

const ticketTypeConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
  MAINTENANCE: { label: "Bảo trì", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  DEPLOYMENT: { label: "Triển khai", bgColor: "bg-purple-100", textColor: "text-purple-700" }
};

// ==================== HELPER ====================

/**
 * Elapsed time from createdAt to endAt (or now if endAt not provided).
 * When ticket is completed (HOAN_THANH), pass updatedAt as endAt so we show "time to complete" not "time until now".
 */
function calculateTimeElapsed(createdAt?: string, endAt?: string | null): string {
  if (!createdAt) return "—";
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "—";
  const end = endAt ? new Date(endAt) : new Date();
  if (endAt && Number.isNaN(end.getTime())) return "—";
  const diff = Math.max(0, end.getTime() - created.getTime());

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days} ngày`;
  if (hours > 0) return `${hours}h ${minutes % 60}p`;
  if (minutes > 0) return `${minutes}p`;
  return "Vừa xong";
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

// ==================== MAIN COMPONENT ====================

export default function ListTicketPage() {
  // State
  const [tickets, setTickets] = useState<TicketResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  
  // Modals
  const [viewingTicket, setViewingTicket] = useState<TicketResponseDTO | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<TicketResponseDTO | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketResponseDTO | null>(null);
  
  // Form state
  const [ticketForm, setTicketForm] = useState<{
    hospitalId: number | null;
    hospitalName: string;
    issue: string;
    priority: "Cao" | "Trung bình" | "Thấp";
    status: "CHUA_XU_LY" | "DANG_XU_LY" | "HOAN_THANH";
    ticketType: "MAINTENANCE" | "DEPLOYMENT";
    pic: string;
    picUserId: number | null;
  }>({
    hospitalId: null,
    hospitalName: "",
    issue: "",
    priority: "Trung bình",
    status: "DANG_XU_LY",
    ticketType: "MAINTENANCE",
    pic: "",
    picUserId: null
  });
  
  // Hospital list for dropdown
  const [hospitals, setHospitals] = useState<Array<{id: number; name: string}>>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [searchHospital, setSearchHospital] = useState("");
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  
  // IT Users list for PIC dropdown
  const [itUsers, setItUsers] = useState<Array<{id: number; name: string}>>([]);
  const [loadingItUsers, setLoadingItUsers] = useState(false);
  
  // User info for checking MAINTENANCE LEADER
  const [userProfile, setUserProfile] = useState<UserResponseDTO | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // Permission check
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
  
  // Check if user is MAINTENANCE LEADER
  const isMaintenanceLeader = useMemo(() => {
    if (!userProfile?.teamRoles) return false;
    
    // Check if user has MAINTENANCE team with LEADER role
    const maintenanceTeams = Object.entries(userProfile.teamRoles)
      .filter(([teamId, role]) => {
        // teamId might be "MAINTENANCE" or numeric ID
        const teamName = teamId.toUpperCase();
        const roleUpper = String(role).toUpperCase();
        return teamName.includes('MAINTENANCE') && roleUpper === 'LEADER';
      });
    
    return maintenanceTeams.length > 0;
  }, [userProfile]);
  
  // Combined permission: SuperAdmin OR Maintenance Leader
  const canManage = isSuperAdmin || isMaintenanceLeader;

  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

  // Load tickets
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: TicketFilterParams = {
        page,
        size: 1000, // Load all for now, filter on client side
      };
      
      console.log("Loading all tickets...");
      const data = await getAllTickets(params);
      console.log("Loaded tickets:", data.length);
      setTickets(data);
    } catch (err: any) {
      console.error("Error loading tickets:", err);
      setError(err.message || "Không thể tải danh sách tickets");
      toast.error("Không thể tải danh sách tickets");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadTickets();
    loadHospitalsList();
    loadItUsers();
    loadUserProfile();
  }, [loadTickets]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.hospital-dropdown-container')) {
        setShowHospitalDropdown(false);
      }
    };
    
    if (showHospitalDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showHospitalDropdown]);
  
  // Load hospitals list for dropdown từ API bảo trì
  const loadHospitalsList = async () => {
    setLoadingHospitals(true);
    try {
      const res = await api.get('/api/v1/admin/maintenance/hospitals/summary');
      const hospitalsList = Array.isArray(res.data) ? res.data : [];
      const formattedHospitals = hospitalsList.map((h: any) => ({
        id: h.hospitalId || h.id,
        name: h.hospitalName || h.name || `Hospital ${h.hospitalId || h.id}`
      }));
      setHospitals(formattedHospitals);
    } catch (err) {
      console.error("Error loading hospitals:", err);
      toast.error("Không thể tải danh sách bệnh viện");
    } finally {
      setLoadingHospitals(false);
    }
  };
  
  // Load IT users for PIC dropdown
  const loadItUsers = async () => {
    setLoadingItUsers(true);
    try {
      const res = await api.get('/api/v1/admin/users/search?department=IT');
      const list = Array.isArray(res.data) ? res.data : [];
      
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
      // Don't show error toast, just log it (optional field)
    } finally {
      setLoadingItUsers(false);
    }
  };
  
  // Load user profile to check MAINTENANCE LEADER
  const loadUserProfile = async () => {
    setLoadingProfile(true);
    try {
      const userIdStr = localStorage.getItem("userId") || sessionStorage.getItem("userId");
      if (!userIdStr) {
        console.warn("No userId found in storage");
        return;
      }
      
      const userId = Number(userIdStr);
      if (!userId || isNaN(userId)) {
        console.warn("Invalid userId:", userIdStr);
        return;
      }
      
      const profile = await getUserAccount(userId);
      setUserProfile(profile);
      
      // Debug log
      console.log("User profile loaded:", {
        userId: profile.id,
        username: profile.username,
        teamRoles: profile.teamRoles,
        primaryTeam: profile.primaryTeam
      });
    } catch (err) {
      console.error("Error loading user profile:", err);
      // Don't show error toast, just log it
    } finally {
      setLoadingProfile(false);
    }
  };

  // Filter & search
  const filteredTickets = useMemo(() => {
    let result = [...tickets];
    
    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.issue?.toLowerCase().includes(query) ||
        t.ticketCode?.toLowerCase().includes(query) ||
        t.hospitalName?.toLowerCase().includes(query) ||
        t.pic?.toLowerCase().includes(query) ||
        t.createdBy?.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(t => t.status === statusFilter);
    }
    
    // Priority filter
    if (priorityFilter !== "all") {
      result = result.filter(t => t.priority === priorityFilter);
    }
    
    // Ticket type filter
    if (ticketTypeFilter !== "all") {
      result = result.filter(t => t.ticketType === ticketTypeFilter);
    }
    
    // Sort by createdAt desc (newest first)
    result.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    
    return result;
  }, [tickets, searchQuery, statusFilter, priorityFilter, ticketTypeFilter]);

  // Pagination
  const pagedTickets = useMemo(() => {
    const start = page * size;
    return filteredTickets.slice(start, start + size);
  }, [filteredTickets, page, size]);

  // Statistics
  const stats: TicketStats = useMemo(() => {
    return filteredTickets.reduce((acc, t) => {
      acc.total++;
      if (t.status === "CHUA_XU_LY") acc.chuaXuLy++;
      if (t.status === "DANG_XU_LY") acc.dangXuLy++;
      if (t.status === "HOAN_THANH") acc.hoanThanh++;
      if (t.priority === "Cao") acc.cao++;
      if (t.priority === "Trung bình") acc.trungBinh++;
      if (t.priority === "Thấp") acc.thap++;
      if (t.ticketType === "MAINTENANCE") acc.maintenance++;
      if (t.ticketType === "DEPLOYMENT") acc.deployment++;
      return acc;
    }, {
      total: 0,
      chuaXuLy: 0,
      dangXuLy: 0,
      hoanThanh: 0,
      cao: 0,
      trungBinh: 0,
      thap: 0,
      maintenance: 0,
      deployment: 0
    });
  }, [filteredTickets]);

  // Handlers
  const handleDelete = async (ticket: TicketResponseDTO) => {
    const ok = await askConfirm({
      title: "Xóa ticket?",
      message: `Bạn có chắc muốn xóa ticket "${ticket.ticketCode}"? Hành động này không thể hoàn tác.`,
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;

    try {
      await deleteHospitalTicket(ticket.hospitalId, ticket.id, canManage);
      toast.success("Đã xóa ticket");
      loadTickets();
      setDeletingTicket(null);
    } catch (err: any) {
      console.error("Error deleting ticket:", err);
      toast.error(err.message || "Không thể xóa ticket");
    }
  };

  const handleUpdateStatus = async (ticket: TicketResponseDTO, newStatus: "CHUA_XU_LY" | "DANG_XU_LY" | "HOAN_THANH") => {
    try {
      const payload: TicketRequestDTO = {
        issue: ticket.issue,
        priority: ticket.priority,
        status: newStatus,
        ticketType: ticket.ticketType,
        picUserId: ticket.picUserId,
        picName: ticket.pic || undefined
      };
      
      await updateHospitalTicket(ticket.hospitalId, ticket.id, payload, canManage);
      toast.success("Đã cập nhật trạng thái");
      loadTickets();
    } catch (err: any) {
      console.error("Error updating ticket:", err);
      toast.error(err.message || "Không thể cập nhật trạng thái");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setTicketTypeFilter("all");
    setPage(0);
  };
  
  const handleAddTicket = () => {
    setEditingTicket(null);
    setTicketForm({
      hospitalId: null,
      hospitalName: "",
      issue: "",
      priority: "Trung bình",
      status: "DANG_XU_LY",
      ticketType: "MAINTENANCE",
      pic: "",
      picUserId: null
    });
    setSearchHospital("");
    setShowTicketModal(true);
  };
  
  const handleEditTicket = (ticket: TicketResponseDTO) => {
    setEditingTicket(ticket);
    setTicketForm({
      hospitalId: ticket.hospitalId,
      hospitalName: ticket.hospitalName || "",
      issue: ticket.issue,
      priority: ticket.priority,
      status: ticket.status,
      ticketType: ticket.ticketType || "MAINTENANCE",
      pic: ticket.pic || "",
      picUserId: ticket.picUserId || null
    });
    setSearchHospital(ticket.hospitalName || "");
    setShowTicketModal(true);
  };
  
  const handleSaveTicket = async () => {
    if (!ticketForm.issue.trim()) {
      toast.error("Vui lòng nhập vấn đề");
      return;
    }
    if (!ticketForm.hospitalId) {
      toast.error("Vui lòng chọn bệnh viện");
      return;
    }
    
    try {
      const payload = {
        issue: ticketForm.issue.trim(),
        priority: ticketForm.priority,
        status: ticketForm.status,
        ticketType: ticketForm.ticketType,
        picName: ticketForm.pic.trim() || null,
        picUserId: ticketForm.picUserId || null
      };
      
      if (editingTicket) {
        await updateHospitalTicket(ticketForm.hospitalId, editingTicket.id, payload, canManage);
        toast.success("Đã cập nhật ticket");
      } else {
        await createHospitalTicket(ticketForm.hospitalId, payload, canManage);
        toast.success("Đã tạo ticket mới");
      }
      
      setShowTicketModal(false);
      setEditingTicket(null);
      loadTickets();
    } catch (err: any) {
      console.error("Error saving ticket:", err);
      toast.error(err.message || "Không thể lưu ticket");
    }
  };

  // ==================== RENDER ====================

  // Check permission - chỉ cho phép superadmin và maintenance leader vào trang này
  if (!loadingProfile && !isSuperAdmin && !isMaintenanceLeader) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
          <FiAlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600 dark:text-red-400" />
          <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Không có quyền truy cập</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Trang này chỉ dành cho Super Admin và Trưởng đội Bảo trì.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 xl:p-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Quản lý Tickets</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Danh sách toàn bộ tickets từ tất cả bệnh viện</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={handleAddTicket}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              <FiTag className="h-5 w-5" />
              Thêm ticket mới
            </button>
          )}
          <button
            onClick={loadTickets}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Tổng số tickets</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
              <FiTag className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Chưa xử lý</p>
              <p className="mt-1 text-2xl font-bold text-gray-700">{stats.chuaXuLy}</p>
            </div>
            <div className="rounded-full bg-gray-100 p-3">
              <FiClock className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Đang xử lý</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{stats.dangXuLy}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <FiRefreshCw className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Hoàn thành</p>
              <p className="mt-1 text-2xl font-bold text-green-700">{stats.hoanThanh}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <FiCheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="mb-3 text-lg font-semibold">Tìm kiếm & Lọc</h3>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[280px]">
                <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo issue, mã ticket, bệnh viện, người tạo..."
                  className="w-full rounded-full border border-gray-300 py-3 pl-10 pr-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-full border border-gray-300 px-4 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="all">— Trạng thái —</option>
                <option value="CHUA_XU_LY">Chưa xử lý</option>
                <option value="DANG_XU_LY">Đang xử lý</option>
                <option value="HOAN_THANH">Hoàn thành</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-full border border-gray-300 px-4 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="all">— Độ ưu tiên —</option>
                <option value="Cao">Cao</option>
                <option value="Trung bình">Trung bình</option>
                <option value="Thấp">Thấp</option>
              </select>

              {/* Ticket Type Filter */}
              <select
                value={ticketTypeFilter}
                onChange={(e) => setTicketTypeFilter(e.target.value)}
                className="rounded-full border border-gray-300 px-4 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="all">— Loại ticket —</option>
                <option value="MAINTENANCE">Bảo trì</option>
                <option value="DEPLOYMENT">Triển khai</option>
              </select>

              {/* Clear Filters */}
              {(searchQuery || statusFilter !== "all" || priorityFilter !== "all" || ticketTypeFilter !== "all") && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <FiX className="h-4 w-4" />
                  Xóa bộ lọc
                </button>
              )}
            </div>

            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              Hiển thị <span className="font-semibold text-gray-900 dark:text-white">{pagedTickets.length}</span> trong tổng số <span className="font-semibold text-gray-900 dark:text-white">{filteredTickets.length}</span> tickets
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <div className="text-blue-600 text-4xl font-extrabold tracking-wider animate-pulse" aria-hidden="true">TAG</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Đang tải tickets từ tất cả bệnh viện...</p>
        </div>
      )}

      {/* Tickets Table */}
      {!loading && (
        <>
          {pagedTickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              Không có tickets nào
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Mã ticket</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bệnh viện</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vấn đề</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Loại</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Độ ưu tiên</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Trạng thái</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Người phụ trách</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Người tạo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Thời gian</th>
                      <th className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)]">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
                    {pagedTickets.map((ticket) => (
                      <tr key={ticket.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        {/* Ticket Code */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <FiTag className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{ticket.ticketCode}</span>
                          </div>
                        </td>

                        {/* Hospital */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <FaHospital className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                              {ticket.hospitalName || `ID: ${ticket.hospitalId}`}
                            </span>
                          </div>
                        </td>

                        {/* Issue */}
                        <td className="px-4 py-4">
                          <div className="max-w-[300px]">
                            <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{ticket.issue}</p>
                          </div>
                        </td>

                        {/* Ticket Type */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {ticket.ticketType && (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ticketTypeConfig[ticket.ticketType]?.bgColor} ${ticketTypeConfig[ticket.ticketType]?.textColor}`}>
                              {ticketTypeConfig[ticket.ticketType]?.label}
                            </span>
                          )}
                        </td>

                        {/* Priority */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityConfig[ticket.priority]?.bgColor} ${priorityConfig[ticket.priority]?.textColor}`}>
                            {priorityConfig[ticket.priority]?.icon}
                            {ticket.priority}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <select
                            value={ticket.status}
                            onChange={(e) => handleUpdateStatus(ticket, e.target.value as any)}
                            disabled={!isSuperAdmin}
                            className={`rounded-full px-3 py-1 text-xs font-medium border-0 cursor-pointer disabled:cursor-not-allowed ${statusConfig[ticket.status]?.bgColor} ${statusConfig[ticket.status]?.textColor}`}
                          >
                            <option value="CHUA_XU_LY">Chưa xử lý</option>
                            <option value="DANG_XU_LY">Đang xử lý</option>
                            <option value="HOAN_THANH">Hoàn thành</option>
                          </select>
                        </td>

                        {/* PIC */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <FiUser className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{ticket.pic || "—"}</span>
                          </div>
                        </td>

                        {/* Created by */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <FiUser className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{ticket.createdBy || "—"}</span>
                          </div>
                        </td>

                        {/* Time: from creation to completion (if HOAN_THANH) or to now */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <FiClock className="h-3 w-3" />
                              {calculateTimeElapsed(
                                ticket.createdAt || undefined,
                                ticket.status === "HOAN_THANH" ? ticket.updatedAt : undefined
                              )}
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500">
                              {formatDateTime(ticket.createdAt)}
                              {ticket.status === "HOAN_THANH" && ticket.updatedAt && (
                                <span className="block">→ {formatDateTime(ticket.updatedAt)}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-white px-4 py-4 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)] dark:group-hover:bg-gray-800">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setViewingTicket(ticket)}
                              className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 transition"
                              title="Xem chi tiết"
                            >
                              <FiEye className="h-4 w-4" />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  onClick={() => handleEditTicket(ticket)}
                                  className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                                  title="Sửa"
                                >
                                  <FiEdit2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(ticket)}
                                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 transition"
                                  title="Xóa"
                                >
                                  <FiTrash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {filteredTickets.length > 0 && (
            <div className="mt-4 flex items-center justify-between py-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {filteredTickets.length === 0 ? (
                  <span>Hiển thị 0 trong tổng số 0 mục</span>
                ) : (
                  (() => {
                    const total = filteredTickets.length;
                    const from = page * size + 1;
                    const to = Math.min((page + 1) * size, total);
                    return <span>Hiển thị {from} đến {to} trong tổng số {total} mục</span>;
                  })()
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Hiển thị:</label>
                  <select
                    value={String(size)}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(0);
                    }}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>

                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={() => setPage(0)}
                    disabled={page <= 0}
                    className="px-2 py-1 border rounded text-sm disabled:opacity-50"
                    title="Đầu"
                  >
                    «
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page <= 0}
                    className="px-2 py-1 border rounded text-sm disabled:opacity-50"
                    title="Trước"
                  >
                    ‹
                  </button>

                  {(() => {
                    const total = Math.max(1, Math.ceil(filteredTickets.length / size));
                    const pages: number[] = [];
                    const start = Math.max(1, page + 1 - 2);
                    const end = Math.min(total, start + 4);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p - 1)}
                        className={`px-3 py-1 border rounded text-sm ${
                          page + 1 === p
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700"
                        }`}
                      >
                        {p}
                      </button>
                    ));
                  })()}

                  <button
                    onClick={() => setPage((p) => Math.min(Math.max(0, Math.ceil(filteredTickets.length / size) - 1), p + 1))}
                    disabled={(page + 1) * size >= filteredTickets.length}
                    className="px-2 py-1 border rounded text-sm disabled:opacity-50"
                    title="Tiếp"
                  >
                    ›
                  </button>
                  <button
                    onClick={() => setPage(Math.max(0, Math.ceil(filteredTickets.length / size) - 1))}
                    disabled={(page + 1) * size >= filteredTickets.length}
                    className="px-2 py-1 border rounded text-sm disabled:opacity-50"
                    title="Cuối"
                  >
                    »
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Ticket Modal */}
      <AnimatePresence>
        {showTicketModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <div className="mb-4 flex items-start justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingTicket ? "Sửa Ticket" : "Thêm Ticket Mới"}
                </h2>
                <button
                  onClick={() => setShowTicketModal(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSaveTicket(); }} className="space-y-4">
                {/* Hospital Selection with Search */}
                <div className="relative hospital-dropdown-container">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Bệnh viện <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={searchHospital}
                    onChange={(e) => {
                      setSearchHospital(e.target.value);
                      setShowHospitalDropdown(true);
                    }}
                    onFocus={() => setShowHospitalDropdown(true)}
                    disabled={!!editingTicket}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Tìm kiếm bệnh viện..."
                    autoComplete="off"
                    required={!ticketForm.hospitalId}
                  />
                  {ticketForm.hospitalName && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Đã chọn: <span className="font-medium text-blue-600 dark:text-blue-400">{ticketForm.hospitalName}</span>
                    </div>
                  )}
                  
                  {/* Dropdown list */}
                  {showHospitalDropdown && !editingTicket && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700">
                      {loadingHospitals ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Đang tải...</div>
                      ) : hospitals.filter(h => 
                        h.name.toLowerCase().includes(searchHospital.toLowerCase())
                      ).length > 0 ? (
                        hospitals
                          .filter(h => h.name.toLowerCase().includes(searchHospital.toLowerCase()))
                          .map(h => (
                            <div
                              key={h.id}
                              onClick={() => {
                                setTicketForm({
                                  ...ticketForm,
                                  hospitalId: h.id,
                                  hospitalName: h.name
                                });
                                setSearchHospital(h.name);
                                setShowHospitalDropdown(false);
                              }}
                              className={`cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-600 ${
                                ticketForm.hospitalId === h.id ? 'bg-blue-100 dark:bg-gray-600' : ''
                              }`}
                            >
                              <div className="font-medium text-gray-900 dark:text-white">{h.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">ID: {h.id}</div>
                            </div>
                          ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Không tìm thấy bệnh viện</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Issue */}
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Vấn đề <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={ticketForm.issue}
                    onChange={(e) => setTicketForm({ ...ticketForm, issue: e.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    placeholder="Mô tả chi tiết vấn đề..."
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Priority */}
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Độ ưu tiên</label>
                    <select
                      value={ticketForm.priority}
                      onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as any })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="Cao">Cao</option>
                      <option value="Trung bình">Trung bình</option>
                      <option value="Thấp">Thấp</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Trạng thái</label>
                    <select
                      value={ticketForm.status}
                      onChange={(e) => setTicketForm({ ...ticketForm, status: e.target.value as any })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="CHUA_XU_LY">Chưa xử lý</option>
                      <option value="DANG_XU_LY">Đang xử lý</option>
                      <option value="HOAN_THANH">Hoàn thành</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Ticket Type */}
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Loại ticket</label>
                    <select
                      value={ticketForm.ticketType}
                      onChange={(e) => setTicketForm({ ...ticketForm, ticketType: e.target.value as any })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="MAINTENANCE">Bảo trì</option>
                      <option value="DEPLOYMENT">Triển khai</option>
                    </select>
                  </div>

                  {/* PIC */}
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Người phụ trách</label>
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
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      disabled={loadingItUsers}
                    >
                      <option value="">-- Chọn người phụ trách --</option>
                      {itUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    {ticketForm.pic && !ticketForm.picUserId && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Giá trị hiện tại: {ticketForm.pic} (không có trong danh sách)
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTicketModal(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    {editingTicket ? "Cập nhật" : "Tạo mới"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Ticket Modal */}
      <AnimatePresence>
        {viewingTicket && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <div className="mb-4 flex items-start justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Chi tiết Ticket</h2>
                <button
                  onClick={() => setViewingTicket(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mã ticket</label>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{viewingTicket.ticketCode}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Bệnh viện</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">{viewingTicket.hospitalName || `ID: ${viewingTicket.hospitalId}`}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Vấn đề</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{viewingTicket.issue}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Loại ticket</label>
                    <p className="mt-1">
                      {viewingTicket.ticketType && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ticketTypeConfig[viewingTicket.ticketType]?.bgColor} ${ticketTypeConfig[viewingTicket.ticketType]?.textColor}`}>
                          {ticketTypeConfig[viewingTicket.ticketType]?.label}
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Độ ưu tiên</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityConfig[viewingTicket.priority]?.bgColor} ${priorityConfig[viewingTicket.priority]?.textColor}`}>
                        {priorityConfig[viewingTicket.priority]?.icon}
                        {viewingTicket.priority}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Trạng thái</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig[viewingTicket.status]?.bgColor} ${statusConfig[viewingTicket.status]?.textColor}`}>
                        {statusConfig[viewingTicket.status]?.label}
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Người phụ trách</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{viewingTicket.pic || "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Người tạo</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{viewingTicket.createdBy || "—"}</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Thời gian tạo</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{formatDateTime(viewingTicket.createdAt)}</p>
                  </div>
                </div>

                {viewingTicket.updatedAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Cập nhật lần cuối</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white">{formatDateTime(viewingTicket.updatedAt)}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                {canManage && (
                  <button
                    onClick={() => {
                      handleDelete(viewingTicket);
                      setViewingTicket(null);
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                  >
                    Xóa
                  </button>
                )}
                <button
                  onClick={() => setViewingTicket(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {genericConfirmDialog}
    </div>
  );
}
