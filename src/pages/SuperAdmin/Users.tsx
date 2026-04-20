import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { FaRegUser } from "react-icons/fa";
import { FiImage, FiMail, FiPhone, FiMapPin, FiUsers, FiBriefcase, FiClock, FiCalendar, FiUser, FiInfo } from "react-icons/fi";
import { EyeIcon, EyeCloseIcon } from "../../icons";
import axios from "axios";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import UserCard from "../../components/UserProfile/UserCard";
import UserCardSkeleton from "../../components/UserProfile/UserCardSkeleton";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  lockUser,
  unlockUser,
  type UserResponseDTO,
  type SuperAdminUserCreateDTO,
  type UserUpdateRequestDTO,
} from "../../api/superadmin.api";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

type UserForm = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phoneNumber: string;
  address: string;
  avatarFile?: File | null;
  avatar?: string | null;

  // Global role - single selection (radio)
  globalRole: 'USER' | 'ADMIN' | 'SUPERADMIN';

  // Teams - multi-selection with roles
  selectedTeams: string[];
  teamRoles: Record<string, 'LEADER' | 'MEMBER'>; // team -> role mapping
  primaryTeam: string;

  department: "" | (typeof DEPARTMENT_OPTIONS)[number];
  workStatus?: string;
  workStatusDate?: string;

  /** When true, this user (ADMIN) can approve OT. Only shown when globalRole is ADMIN. */
  canApproveOt: boolean;
};

const ROLE_OPTIONS = ["USER", "ADMIN", "SUPERADMIN"]; // Match backend RoleType enum
const DEPARTMENT_OPTIONS = ["IT", "ACCOUNTING", "BUSINESS"] as const;
const TEAM_OPTIONS = ["DEV", "DEPLOYMENT", "MAINTENANCE", "SALES", "CUSTOMER_SERVICE"] as const;
const WORK_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"] as const;

// Mapping để hiển thị tiếng Việt
const DEPARTMENT_LABELS: Record<string, string> = {
  IT: "Công nghệ thông tin",
  ACCOUNTING: "Kế toán",
  BUSINESS: "Kinh doanh",
};

const TEAM_LABELS: Record<string, string> = {
  DEV: "Phát triển",
  DEPLOYMENT: "Triển khai",
  MAINTENANCE: "Bảo trì",
  SALES: "Kinh doanh",
  CUSTOMER_SERVICE: "CSKH"
};

const WORK_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang làm việc",
  INACTIVE: "Không hoạt động",
  ON_LEAVE: "Nghỉ phép",
  TERMINATED: "Đã nghỉ việc",
};

const WORK_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-800 border-gray-200",
  ON_LEAVE: "bg-yellow-100 text-yellow-800 border-yellow-200",
  TERMINATED: "bg-red-100 text-red-800 border-red-200",
};

// Helper functions để lấy label tiếng Việt
function getDepartmentLabel(value: string): string {
  return DEPARTMENT_LABELS[value] || value;
}

function getTeamLabel(value: string): string {
  return TEAM_LABELS[value] || value;
}

function getWorkStatusLabel(value: string): string {
  return WORK_STATUS_LABELS[value] || value;
}

function getWorkStatusColor(value: string): string {
  return WORK_STATUS_COLORS[value] || "bg-gray-100 text-gray-800 border-gray-200";
}

// Helper function để format LocalDateTime từ backend (không có timezone)
// Backend gửi LocalDateTime dạng "2025-11-04T10:54:00.843223" (UTC+7 local time)
// Không parse qua Date object vì sẽ bị sai timezone
function formatLocalDateTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return "—";
  
  try {
    // Parse LocalDateTime string từ backend (format: "2025-11-04T10:54:00" hoặc "2025-11-04T10:54:00.843223")
    const match = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
    if (!match) {
      // Fallback nếu format không đúng
      return new Date(dateTimeStr).toLocaleString("vi-VN");
    }
    
    const [, year, month, day, hour, minute] = match;
    
    // Format: "hh:mm - dd/mm/yyyy" (không có giây)
    const formattedDate = `${hour}:${minute} - ${day}/${month}/${year}`;
    return formattedDate;
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateTimeStr;
  }
}

export default function SuperAdminUsers() {
  const [items, setItems] = useState<UserResponseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState(""); // Debounced version for API calls
  const searchDebounceRef = useRef<number | null>(null);
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserResponseDTO | null>(null);
  const [viewing, setViewing] = useState<UserResponseDTO | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  
  // ✅ Password visibility toggle
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const [form, setForm] = useState<UserForm>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phoneNumber: "",
    address: "",
    avatarFile: null,
    avatar: null,

    // Global role - default to USER
    globalRole: 'USER',

    // Teams - start with empty selections
    selectedTeams: [],
    teamRoles: {},
    primaryTeam: "",

    department: "",
    workStatus: "",
    workStatusDate: "",
    canApproveOt: false,
  });

  // business projects selection removed from UI; keep backend support if needed later

  function getErrorMessage(err: unknown, fallback = "Thao tác thất bại") {
    if (axios.isAxiosError(err)) {
      const respData = err.response?.data as unknown;
      if (respData && typeof respData === "object") {
        const maybeMsg = (respData as { message?: unknown }).message;
        if (typeof maybeMsg === "string") return maybeMsg;
      }
      return err.message || fallback;
    }
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return fallback;
  }

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setViewing(null);
    setError(null);
    setIsModalLoading(false);
    setForm({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      phoneNumber: "",
      address: "",
      avatarFile: null,
      avatar: null,

      globalRole: 'USER',
      selectedTeams: [],
      teamRoles: {},
      primaryTeam: "",

      department: "",
      workStatus: "",
      workStatusDate: "",
      canApproveOt: false,
    });
  }

  function fillForm(user: UserResponseDTO) {
    // Debug current roles from BE
    // console.log("[Users] fillForm roles raw:", user.roles);
    const normalizedRoles =
      user.roles?.map((r: any) => {
        const name = (r.roleName ?? r.roleType ?? "").toString();
        return name.replace(/^ROLE_/i, "").toUpperCase();
      }) || [];
    // console.log("[Users] fillForm roles normalized:", normalizedRoles);
    // Parse global role from normalized roles (take the highest role)
    const globalRole = normalizedRoles.includes('SUPERADMIN') ? 'SUPERADMIN' :
                      normalizedRoles.includes('ADMIN') ? 'ADMIN' : 'USER';

    // Parse team data (prefer new multi-team fields from backend)
    const selectedTeams =
      (user.availableTeams && user.availableTeams.length > 0)
        ? user.availableTeams
        : (user.team ? [user.team] : []);

    const teamRoles: Record<string, 'LEADER' | 'MEMBER'> = {};
    if (user.teamRoles) {
      Object.entries(user.teamRoles).forEach(([teamId, role]) => {
        teamRoles[teamId] = role === 'LEADER' ? 'LEADER' : 'MEMBER';
      });
    } else {
      selectedTeams.forEach((t) => { teamRoles[t] = 'MEMBER'; });
    }

    setForm({
      username: user.username || "",
      email: user.email || "",
      password: "", // Don't populate password for security
      confirmPassword: "",
      fullName: user.fullname || "",
      phoneNumber: user.phone || "",
      address: user.address || "",
      avatarFile: null,
      avatar: user.avatar || null,

      globalRole: ((user.globalRole as any) || globalRole) as UserForm['globalRole'],
      selectedTeams,
      teamRoles,
      primaryTeam: user.primaryTeam || selectedTeams[0] || "",

      department: (user.department ?? "") as UserForm["department"],
      workStatus: user.workStatus || "",
      canApproveOt: !!user.canApproveOt,
      workStatusDate: user.workStatusDate || "",
    });
  }

  async function fetchUserDetails(id: number): Promise<UserResponseDTO | null> {
    setIsModalLoading(true);
    setError(null);
    try {
      const data = await getUserById(id);
      return data;
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Lỗi tải chi tiết người dùng");
      setError(msg);
      console.error("❌ FETCH DETAIL ERROR:", error);
      return null;
    } finally {
      setIsModalLoading(false);
    }
  }

  // Debounce search input: update debouncedSearch after 300ms of no typing
  useEffect(() => {
    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [search]);

  // Reset to page 0 when search changes
  useEffect(() => {
    if (page !== 0) {
      setPage(0);
    }
  }, [debouncedSearch]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, size, sortBy, sortDir };
      // Chỉ gửi search parameter khi có giá trị (không rỗng)
      if (debouncedSearch && debouncedSearch.trim().length > 0) {
        params.search = debouncedSearch.trim();
      }
      const data = await getAllUsers(params);
      setItems(data.content || data);
      setTotalItems(data.totalElements || data.length || 0);
      setTotalPages(data.totalPages || Math.ceil((data.totalElements || data.length || 0) / size));
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Lỗi tải danh sách");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, size, sortBy, sortDir, debouncedSearch]);

  useEffect(() => {
    void fetchList();
    // businesses fetching removed (UI selection hidden)
  }, [fetchList]);

  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      phoneNumber: "",
      address: "",
      avatarFile: null,
      avatar: null,

      globalRole: 'USER',
      selectedTeams: [],
      teamRoles: {},
      primaryTeam: "",

      department: "",
      workStatus: "ACTIVE", // Mặc định là "Đang làm việc"
      workStatusDate: "",
      canApproveOt: false,
    });
    setOpen(true);
  }

  async function onView(user: UserResponseDTO) {
    setEditing(null);
    setViewing(null);
    setOpen(true);

    const details = await fetchUserDetails(user.id);
    if (details) {
      setViewing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onEdit(user: UserResponseDTO) {
    setViewing(null);
    setEditing(null);
    setOpen(true);

    const details = await fetchUserDetails(user.id);
    if (details) {
      setEditing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onDelete(id: number) {
    const ok = await askConfirm({
      title: "Xóa người dùng?",
      message: "Bạn có chắc muốn xóa người dùng này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;

    // Debug: Check if token exists
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    // console.log("Current token exists:", !!token);
    // console.log("Current user roles:", localStorage.getItem("roles") || sessionStorage.getItem("roles"));

    setLoading(true);
    try {
      await deleteUser(id);
      toast.success("Xóa thành công");
      await fetchList();
    } catch (error: unknown) {
      console.error("Delete error:", error);
      const msg = getErrorMessage(error, "Xóa thất bại");
      toast.error(msg);

      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.error("401 Unauthorized - Check if user has SUPERADMIN role");
        toast.error("Không có quyền xóa người dùng. Vui lòng đăng nhập lại với quyền SUPERADMIN.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onToggleLock(id: number, currentStatus?: boolean) {
    const willLock = !!currentStatus; // if currently active(true) -> lock
    const ok = await askConfirm({
      title: willLock ? "Khóa tài khoản?" : "Mở khóa tài khoản?",
      message: willLock ? "Bạn có chắc muốn khóa tài khoản này?" : "Bạn có chắc muốn mở khóa tài khoản này?",
      confirmLabel: willLock ? "Khóa" : "Mở khóa",
    });
    if (!ok) return;

    setLoading(true);
    try {
      if (willLock) {
        await lockUser(id);
        toast.success("Tài khoản đã được khóa");
      } else {
        await unlockUser(id);
        toast.success("Tài khoản đã được mở khóa");
      }
      await fetchList();
    } catch (error: unknown) {
      console.error("Lock/Unlock error:", error);
      const msg = getErrorMessage(error, "Thao tác thất bại");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!form.username.trim()) {
      setError("Tên đăng nhập không được để trống");
      return;
    }
    if (!form.email.trim()) {
      setError("Email không được để trống");
      return;
    }
    if (!isEditing && !form.password.trim()) {
      setError("Mật khẩu không được để trống");
      return;
    }
    if (!isEditing && form.password !== form.confirmPassword) {
      setError("Mật khẩu và xác nhận mật khẩu không khớp");
      return;
    }
    if (!form.fullName.trim()) {
      setError("Họ và tên không được để trống");
      return;
    }
    // if (!form.address.trim()) {
    //   setError("Địa chỉ không được để trống");
    //   return;
    // }
    // Validate global role
    if (!form.globalRole) {
      setError("Vai trò toàn cục không được để trống");
      return;
    }

    // Validate team selection
    if (form.selectedTeams.length === 0) {
      setError("Phải chọn ít nhất một đội");
      return;
    }

    // Validate primary team
    if (!form.primaryTeam) {
      setError("Phải chọn đội chính");
      return;
    }

    // Validate that primary team is in selected teams
    if (!form.selectedTeams.includes(form.primaryTeam)) {
      setError("Đội chính phải nằm trong danh sách đội đã chọn");
      return;
    }

    // Validate team roles
    for (const team of form.selectedTeams) {
      if (!form.teamRoles[team]) {
        setError(`Chưa chọn vai trò cho đội ${team}`);
        return;
      }
    }

    if (isViewing) return;

    setLoading(true);
    setError(null);

  try {
      if (isEditing) {
        const payload: UserUpdateRequestDTO = {
          email: form.email?.trim() || undefined,
          fullname: form.fullName?.trim() || undefined,
          phone: form.phoneNumber?.trim() || undefined,
          address: form.address?.trim() || undefined,
          avatar: form.avatarFile || undefined,
          department: form.department || undefined,
          workStatus: form.workStatus || undefined,
          workStatusDate: form.workStatusDate || undefined,
          // New multi-team support
          globalRole: form.globalRole,
          selectedTeams: form.selectedTeams.length > 0 ? form.selectedTeams : undefined,
          teamRoles: Object.keys(form.teamRoles).length > 0 ? JSON.stringify(form.teamRoles) : undefined,
          primaryTeam: form.primaryTeam || undefined,
          // Backward compatibility fallback
          team: form.selectedTeams.length > 0 ? (form.selectedTeams[0] as any) : undefined,
          roles: [form.globalRole],
          canApproveOt: form.globalRole === "ADMIN" ? form.canApproveOt : false,
        };
        await updateUser(editing!.id, payload);
        toast.success("Cập nhật thành công");
      } else {
        const payload: SuperAdminUserCreateDTO = {
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password.trim(),
          confirmPassword: form.confirmPassword.trim(),
          fullName: form.fullName.trim(),
          address: form.address.trim(),
          phoneNumber: form.phoneNumber.trim(),
          department: form.department,
          // New multi-team support
          globalRole: form.globalRole,
          selectedTeams: form.selectedTeams.length > 0 ? form.selectedTeams : undefined,
          teamRoles: Object.keys(form.teamRoles).length > 0 ? JSON.stringify(form.teamRoles) : undefined,
          primaryTeam: form.primaryTeam || undefined,
          // Backward compatibility fallback
          team: form.selectedTeams.length > 0 ? form.selectedTeams[0] : undefined,
          roles: [form.globalRole],
        };
        await createUser(payload);
        toast.success("Tạo thành công");
      }

      closeModal();
      // ✅ Chỉ reset về trang 0 khi tạo mới, còn khi cập nhật thì giữ nguyên trang hiện tại
      if (!isEditing) {
      setPage(0);
      }
      await fetchList();
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Lưu thất bại");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }


  return (
    <>
      <PageMeta title="Quản lý người dùng" description="Super Admin - Quản lý người dùng" />

      <div className="space-y-6">
        {/* Search & Actions */}
        <ComponentCard title="Tìm kiếm & Thao tác">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-primary/30"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {["id", "username", "fullname", "email", "createdAt"].map((k) => (
                <option key={k} value={k}>
                  Sắp xếp theo: {k}
                </option>
              ))}
            </select> */}
            {/* <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
            >
              <option value="asc">Tăng dần</option>
              <option value="desc">Giảm dần</option>
            </select>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              <option value={5}>5 / trang</option>
              <option value={10}>10 / trang</option>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
            </select> */}
            <button
              className="absolute right-20 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100"
              onClick={onCreate}
            >
              + Thêm người dùng
            </button>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-500">
              Tổng: <span className="font-medium text-gray-700">{totalItems}</span>
            </p>
          </div>
        </ComponentCard>

        {/* User Cards */}
        <ComponentCard title="Danh sách người dùng">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="opacity-0 fadeIn" style={{ animationDelay: `${idx * 0.1}s` }}>
                  <UserCardSkeleton />
                </div>
              ))
            ) : (
              <>
                {items.map((user, idx) => (
                  <div key={user.id} className="opacity-0 fadeIn" style={{ animationDelay: `${idx * 0.1}s` }}>
                    <UserCard
                      user={user}
                      onView={onView}
                      onEdit={onEdit}
                      onToggleLock={onToggleLock}
                      onDelete={onDelete}
                    />
                  </div>
                ))}

                {items.length === 0 && !loading && (
                  <div className="col-span-full text-center py-12">
                    <p className="text-gray-500">Không có dữ liệu</p>
                  </div>
                )}
              </>
            )}
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={size}
            onPageChange={setPage}
            onItemsPerPageChange={(newSize) => {
              setSize(newSize);
              setPage(0); // Reset to first page when changing page size
            }}
          />
        </ComponentCard>
      </div>

      {/* MODAL: Detail view modal (styled like Hospitals) */}
      {open && isViewing && viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="relative z-10 w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="sticky top-0 z-20 bg-white border-b px-6 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><FaRegUser className="text-xl text-gray-700" /><span className="ml-1">Chi tiết người dùng</span></h2>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-800">✕</button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-6 space-y-6 text-sm text-gray-800 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]">
                    <span className="font-semibold text-gray-900 flex items-center gap-2"><FiUser className="text-gray-500" />Tên tài khoản:</span>
                  </div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.username ?? "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiMail className="text-gray-500" />Email:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.email ?? "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FaRegUser className="text-gray-500" />Họ & tên:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.fullname ?? "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiPhone className="text-gray-500" />Số điện thoại:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.phone ?? "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiMapPin className="text-gray-500" />Địa chỉ:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.address ?? "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiUsers className="text-gray-500" />Vai trò:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{
                    (function formatRoles(x: unknown) {
                      if (!x) return "—";
                      if (Array.isArray(x)) {
                        return x
                          .map((r) => {
                            if (r && typeof r === "object") {
                              const obj = r as Record<string, unknown>;
                              const v = obj["roleName"] ?? obj["roleType"] ?? obj["name"] ?? r;
                              return String(v).replace(/^ROLE_/i, "");
                            }
                            return String(r);
                          })
                          .join(", ");
                      }
                      return String(x);
                    })(viewing.roles)
                  }</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiBriefcase className="text-gray-500" />Phòng ban:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{viewing.department ? getDepartmentLabel(viewing.department) : "—"}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiBriefcase className="text-gray-500" />Team:</span></div>
                  <div className="flex-1 text-gray-700 break-words">
                    {(() => {
                      // Lấy danh sách teams (ưu tiên availableTeams, fallback về team)
                      const teams = (viewing as any).availableTeams && (viewing as any).availableTeams.length > 0
                        ? (viewing as any).availableTeams
                        : (viewing.team ? [viewing.team] : []);
                      
                      if (teams.length === 0) return "—";
                      
                      const teamRoles = (viewing as any).teamRoles || {};
                      const primaryTeam = (viewing as any).primaryTeam || teams[0];
                      
                      return (
                        <div className="flex flex-wrap gap-2">
                          {teams.map((team: string) => {
                            const role = teamRoles[team] || 'MEMBER';
                            const isPrimary = team === primaryTeam;
                            return (
                              <span
                                key={team}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                                  isPrimary
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-gray-50 text-gray-700 border-gray-200'
                                }`}
                              >
                                {getTeamLabel(team)}
                                {isPrimary && (
                                  <span className="text-indigo-600 font-semibold" title="Đội chính">★</span>
                                )}
                                <span className={`text-xs ${
                                  role === 'LEADER' ? 'text-orange-600 font-semibold' : 'text-gray-500'
                                }`}>
                                  ({role === 'LEADER' ? 'Trưởng đội' : 'Thành viên'})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Team kinh doanh view removed */}

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiInfo className="text-gray-500" />Trạng thái làm việc:</span></div>
                  <div className="flex-1 text-gray-700 break-words">
                    {(() => { 
                      const obj = viewing as Record<string, unknown>; 
                      const v = 'workStatus' in obj ? obj['workStatus'] : undefined; 
                      if (v != null && v !== '') {
                        const statusValue = String(v);
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getWorkStatusColor(statusValue)}`}>
                            {getWorkStatusLabel(statusValue)}
                          </span>
                        );
                      }
                      return '—';
                    })()}
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiCalendar className="text-gray-500" />Tạo lúc:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{(viewing.createdAt ? formatLocalDateTime(viewing.createdAt) : "—")}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiClock className="text-gray-500" />Cập nhật:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{(viewing.updatedAt ? formatLocalDateTime(viewing.updatedAt) : "—")}</div>
                </div>
              </div>

              {viewing.avatar && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="font-semibold text-gray-900 mb-2"><FiImage className="inline mr-2 text-lg text-gray-600" />Ảnh đại diện</p>
                  <div className="rounded-xl overflow-hidden w-full">
                    <img src={viewing.avatar} alt="Avatar" className="w-full h-auto object-cover rounded-lg max-h-[420px]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end px-6 py-4 border-t bg-white">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Form modal for create / edit (sticky header + scrollable body) */}
      {open && !isViewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-5xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="sticky top-0 z-20 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-gray-200">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-blue-800">{isEditing ? "Cập nhật người dùng" : "Thêm người dùng"}</h3>
                <button className="rounded-md p-1 hover:bg-gray-100" onClick={closeModal}>✕</button>
              </div>
            </div>

            {isModalLoading ? (
              <div className="text-center py-12 text-gray-500">Đang tải chi tiết...</div>
            ) : (
              <div className="overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* form content kept intact */}
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tên tài khoản <span className="text-red-500">*</span></label>
                      <input required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} disabled={isViewing || isEditing} pattern="^[a-zA-Z0-9]+$" minLength={6} maxLength={100} />
                      {!isViewing && <p className="mt-1 text-xs text-gray-500">Từ 6-100 ký tự, chỉ chữ và số</p>}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Email <span className="text-red-500">*</span></label>
                      <input required type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} disabled={isViewing} />
                    </div>

                    {!isEditing && !isViewing && (
                      <>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Mật khẩu <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <input required type={showPassword ? "text" : "password"} autoComplete="new-password" className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} disabled={isViewing} minLength={8} />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                            >
                              {showPassword ? (
                                <EyeIcon className="fill-gray-500 size-5" />
                              ) : (
                                <EyeCloseIcon className="fill-gray-500 size-5" />
                              )}
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">Tối thiểu 8 ký tự</p>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Xác nhận mật khẩu <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <input required type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.confirmPassword} onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))} disabled={isViewing} minLength={8} />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              disabled={isViewing}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                            >
                              {showConfirmPassword ? (
                                <EyeIcon className="fill-gray-500 size-5" />
                              ) : (
                                <EyeCloseIcon className="fill-gray-500 size-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="mb-1 block text-sm font-medium">Họ và tên <span className="text-red-500">*</span></label>
                      <input required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.fullName} onChange={(e) => setForm((s) => ({ ...s, fullName: e.target.value }))} disabled={isViewing} />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Số điện thoại</label>
                      <input type="tel" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.phoneNumber} onChange={(e) => setForm((s) => ({ ...s, phoneNumber: e.target.value }))} disabled={isViewing} pattern="^\d{10,11}$" placeholder="10-11 chữ số" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 text-sm font-medium">Địa chỉ</label>
                      <textarea  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" rows={3} value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} disabled={isViewing} />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Ảnh đại diện</label>
                      {form.avatar && (
                        <div className="mb-3">
                          <img src={form.avatar} alt="Ảnh đại diện hiện tại" className="h-32 w-full max-w-full rounded-lg border object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          {!isViewing && <p className="mt-1 text-xs text-gray-500">Ảnh đại diện hiện tại</p>}
                        </div>
                      )}
                      <input type="file" accept="image/*" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50" onChange={(e) => setForm((s) => ({ ...s, avatarFile: e.target.files?.[0] ?? null }))} disabled={isViewing} />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Vai trò toàn cục <span className="text-red-500">*</span></label>
                      <div className="rounded-lg border border-gray-300 p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {ROLE_OPTIONS.map((role) => {
                            const checked = form.globalRole === role;
                            return (
                              <label key={role} className={`flex items-center gap-2 text-sm ${isViewing ? 'opacity-60' : ''}`}>
                                <input
                                  type="radio"
                                  name="globalRole"
                                  className="h-4 w-4 text-blue-600"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const newRole = role as UserForm['globalRole'];
                                      setForm((s) => ({
                                        ...s,
                                        globalRole: newRole,
                                        canApproveOt: newRole === "ADMIN" ? s.canApproveOt : false,
                                      }));
                                    }
                                  }}
                                  disabled={isViewing}
                                />
                                <span>{role}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {!isViewing && <p className="mt-1 text-xs text-gray-500">Chọn một vai trò toàn cục</p>}
                    </div>

                    {form.globalRole === "ADMIN" && (
                      <div className="rounded-lg border border-gray-300 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-blue-600 rounded"
                            checked={form.canApproveOt}
                            onChange={(e) => setForm((s) => ({ ...s, canApproveOt: e.target.checked }))}
                            disabled={isViewing}
                          />
                          <span>Được phép duyệt OT</span>
                        </label>
                        {!isViewing && <p className="mt-1 text-xs text-gray-500">Cho phép người dùng này vào trang Phê duyệt OT và duyệt/từ chối phiếu tăng ca</p>}
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-sm font-medium">Phòng ban <span className="text-red-500">*</span></label>
                      <select required={!isEditing} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.department} onChange={(e) => setForm((s) => ({ ...s, department: e.target.value as UserForm['department'] }))} disabled={isViewing}>
                        <option value="">— Chọn phòng ban —</option>
                        {DEPARTMENT_OPTIONS.map((d) => <option key={d} value={d}>{getDepartmentLabel(d)}</option>)}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium">Đội và vai trò <span className="text-red-500">*</span></label>

                      {/* Team Multi-Selection */}
                      <div className="rounded-lg border border-gray-300 p-3 mb-3">
                        <div className="mb-2">
                          <label className="text-sm font-medium text-gray-700">Chọn đội:</label>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                          {TEAM_OPTIONS.map((team) => {
                            const isSelected = form.selectedTeams.includes(team);
                            return (
                              <label key={team} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-blue-600"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setForm((s) => {
                                      const selectedTeams = checked
                                        ? [...s.selectedTeams, team]
                                        : s.selectedTeams.filter(t => t !== team);

                                      // Update team roles
                                      const teamRoles = { ...s.teamRoles };
                                      let primaryTeam = s.primaryTeam;
                                      
                                      if (checked) {
                                        teamRoles[team] = 'MEMBER'; // Default role
                                        // ✅ Tự động set đội chính khi tick đội đầu tiên
                                        if (selectedTeams.length === 1 && !primaryTeam) {
                                          primaryTeam = team;
                                        }
                                      } else {
                                        delete teamRoles[team];
                                        // If removing primary team, clear it or set to first remaining team
                                        if (primaryTeam === team) {
                                          primaryTeam = selectedTeams.length > 0 ? selectedTeams[0] : '';
                                        }
                                      }

                                      return { ...s, selectedTeams, teamRoles, primaryTeam };
                                    });
                                  }}
                                  disabled={isViewing}
                                />
                                <span>{getTeamLabel(team)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Team Role Assignment */}
                      {form.selectedTeams.length > 0 && (
                        <div className="rounded-lg border border-gray-300 p-3 mb-3">
                          <div className="mb-2">
                            <label className="text-sm font-medium text-gray-700">Vai trò trong từng đội:</label>
                          </div>
                          <div className="space-y-2">
                            {form.selectedTeams.map((team) => (
                              <div key={team} className="flex items-center gap-4 p-2 bg-gray-50 rounded">
                                <span className="text-sm font-medium w-32">{getTeamLabel(team)}:</span>
                                <div className="flex gap-4">
                                  {(['LEADER', 'MEMBER'] as const).map((role) => (
                                    <label key={role} className="flex items-center gap-1 text-sm">
                                      <input
                                        type="radio"
                                        name={`teamRole-${team}`}
                                        className="h-3 w-3 text-blue-600"
                                        checked={form.teamRoles[team] === role}
                                        onChange={() => {
                                          setForm((s) => ({
                                            ...s,
                                            teamRoles: { ...s.teamRoles, [team]: role }
                                          }));
                                        }}
                                        disabled={isViewing}
                                      />
                                      <span>{role === 'LEADER' ? 'Trưởng đội' : 'Thành viên'}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Primary Team Selection */}
                      {form.selectedTeams.length > 0 && (
                        <div className="rounded-lg border border-gray-300 p-3">
                          <div className="mb-2">
                            <label className="text-sm font-medium text-gray-700">Đội chính <span className="text-red-500">*</span>:</label>
                          </div>
                          <select
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                            value={form.primaryTeam}
                            onChange={(e) => setForm((s) => ({ ...s, primaryTeam: e.target.value }))}
                            disabled={isViewing || form.selectedTeams.length === 1}
                          >
                            {form.selectedTeams.length === 1 ? (
                              <option value={form.selectedTeams[0]}>
                                {getTeamLabel(form.selectedTeams[0])} {form.teamRoles[form.selectedTeams[0]] === 'LEADER' ? '(Trưởng đội)' : '(Thành viên)'}
                              </option>
                            ) : (
                              <>
                                <option value="">— Chọn đội chính —</option>
                                {form.selectedTeams.map((team) => (
                                  <option key={team} value={team}>
                                    {getTeamLabel(team)} {form.teamRoles[team] === 'LEADER' ? '(Trưởng đội)' : '(Thành viên)'}
                                  </option>
                                ))}
                              </>
                            )}
                      </select>
                          <p className="mt-1 text-xs text-gray-500">
                            {form.selectedTeams.length === 1 
                              ? "Đội chính đã được tự động chọn (bắt buộc khi chỉ có 1 đội)"
                              : "Đội chính sẽ được sử dụng mặc định khi đăng nhập"}
                          </p>
                        </div>
                      )}

                    </div>

                    {/* Team kinh doanh selection removed from form */}

                    {isEditing && (
                      <div>
                        <label className="mb-1 block text-sm">Trạng thái làm việc</label>
                        <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.workStatus} onChange={(e) => setForm((s) => ({ ...s, workStatus: e.target.value }))} disabled={isViewing}>
                          <option value="">— Chọn trạng thái —</option>
                          {WORK_STATUS_OPTIONS.map((w) => <option key={w} value={w}>{getWorkStatusLabel(w)}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="col-span-1 mt-2 flex items-center justify-between md:col-span-2">
                    {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100" onClick={closeModal}>{isViewing ? 'Đóng' : 'Huỷ'}</button>
                      {!isViewing && <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50" disabled={loading}>{loading ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo mới'}</button>}
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
      {genericConfirmDialog}
    </>
  );
}
