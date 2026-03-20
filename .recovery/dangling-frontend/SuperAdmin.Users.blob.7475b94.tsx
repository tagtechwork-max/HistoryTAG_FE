import { useEffect, useMemo, useState, useCallback } from "react";
import { FaRegUser } from "react-icons/fa";
import { FiImage, FiMail, FiPhone, FiMapPin, FiUsers, FiBriefcase, FiClock, FiCalendar, FiUser, FiInfo } from "react-icons/fi";
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
  roles: string[];
  department: "" | (typeof DEPARTMENT_OPTIONS)[number];
  team: "" | (typeof TEAM_OPTIONS)[number];
  workStatus?: string;
  workStatusDate?: string;
};

const ROLE_OPTIONS = ["USER", "ADMIN", "SUPERADMIN"]; // Match backend RoleType enum
const DEPARTMENT_OPTIONS = ["IT", "ACCOUNTING", "BUSINESS"] as const;
const TEAM_OPTIONS = ["DEV", "DEPLOYMENT", "MAINTENANCE", "SALES"] as const;
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

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserResponseDTO | null>(null);
  const [viewing, setViewing] = useState<UserResponseDTO | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);


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
    roles: [],
    department: "",
    team: "",
    workStatus: "",
    workStatusDate: "",
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
      roles: [],
      department: "",
      team: "",
      workStatus: "",
      workStatusDate: "",
    });
  }

  function fillForm(user: UserResponseDTO) {
    // Debug current roles from BE
    console.log("[Users] fillForm roles raw:", user.roles);
    const normalizedRoles =
      user.roles?.map((r: any) => {
        const name = (r.roleName ?? r.roleType ?? "").toString();
        return name.replace(/^ROLE_/i, "").toUpperCase();
      }) || [];
    console.log("[Users] fillForm roles normalized:", normalizedRoles);
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
      roles: normalizedRoles,
      department: (user.department ?? "") as UserForm["department"],
      team: (user.team ?? "") as UserForm["team"],
      workStatus: user.workStatus || "",
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

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllUsers({ page, size, sortBy, sortDir });
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
  }, [page, size, sortBy, sortDir]);

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
      roles: [],
      department: "",
      team: "",
      workStatus: "",
      workStatusDate: "",
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
    if (!confirm("Xóa người dùng này?")) return;

    // Debug: Check if token exists
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    console.log("Current token exists:", !!token);
    console.log("Current user roles:", localStorage.getItem("roles") || sessionStorage.getItem("roles"));

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
    const confirmMsg = willLock ? "Bạn có chắc muốn khóa tài khoản này?" : "Bạn có chắc muốn mở khóa tài khoản này?";
    if (!confirm(confirmMsg)) return;

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
    if (!form.address.trim()) {
      setError("Địa chỉ không được để trống");
      return;
    }
    if (!isEditing && form.roles.length === 0) {
      setError("Vai trò không được để trống");
      return;
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
          team: form.team || undefined,
          
          workStatus: form.workStatus || undefined,
          workStatusDate: form.workStatusDate || undefined,
          roles: form.roles && form.roles.length ? form.roles : undefined,
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
          team: form.team || undefined,
          
          roles: form.roles,
        };
        await createUser(payload);
        toast.success("Tạo thành công");
      }

      closeModal();
      setPage(0);
      await fetchList();
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Lưu thất bại");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return items;
    const lowerSearch = search.toLowerCase();
    return items.filter(
      (item) =>
        item.username?.toLowerCase().includes(lowerSearch) ||
        item.email?.toLowerCase().includes(lowerSearch) ||
        item.fullname?.toLowerCase().includes(lowerSearch) ||
        item.phone?.toLowerCase().includes(lowerSearch)
    );
  }, [items, search]);

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
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {["id", "username", "fullname", "email", "createdAt"].map((k) => (
                <option key={k} value={k}>
                  Sắp xếp theo: {k}
                </option>
              ))}
            </select>
            <select
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
            </select>
            <button
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100"
              onClick={onCreate}
            >
              + Thêm người dùng
            </button>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-500">
              Tổng: <span className="font-medium text-gray-700">{filtered.length}</span>
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
                {filtered.map((user, idx) => (
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

                {filtered.length === 0 && (
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
                    <span className="font-semibold text-gray-900 flex items-center gap-2"><FiUser className="text-gray-500" />Username:</span>
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
                  <div className="flex-1 text-gray-700 break-words">{viewing.team ? getTeamLabel(viewing.team) : "—"}</div>
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

                {viewing.workStatusDate && (
                  <div className="flex items-start gap-4">
                    <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiCalendar className="text-gray-500" />Ngày cập nhật trạng thái:</span></div>
                    <div className="flex-1 text-gray-700 break-words">{new Date(viewing.workStatusDate).toLocaleString('vi-VN')}</div>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiCalendar className="text-gray-500" />Tạo lúc:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{(viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : "—")}</div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="min-w-[150px]"><span className="font-semibold text-gray-900 flex items-center gap-2"><FiClock className="text-gray-500" />Cập nhật:</span></div>
                  <div className="flex-1 text-gray-700 break-words">{(viewing.updatedAt ? new Date(viewing.updatedAt).toLocaleString() : "—")}</div>
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
                <h3 className="text-lg font-semibold text-gray-900">{isEditing ? "Cập nhật người dùng" : "Thêm người dùng"}</h3>
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
                          <input required type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} disabled={isViewing} minLength={8} />
                          <p className="mt-1 text-xs text-gray-500">Tối thiểu 8 ký tự</p>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Xác nhận mật khẩu <span className="text-red-500">*</span></label>
                          <input required type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.confirmPassword} onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))} disabled={isViewing} minLength={8} />
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
                      <label className="mb-1 block text-sm font-medium">Địa chỉ <span className="text-red-500">*</span></label>
                      <textarea required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" rows={3} value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} disabled={isViewing} />
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
                      <label className="mb-1 block text-sm font-medium">Vai trò <span className="text-red-500">*</span> {!isEditing && !isViewing && "(Có thể chọn nhiều)"}</label>
                      <div className="rounded-lg border border-gray-300 p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {ROLE_OPTIONS.map((role) => {
                            const checked = form.roles.includes(role);
                            return (
                              <label key={role} className={`flex items-center gap-2 text-sm ${isViewing || isEditing ? 'opacity-60' : ''}`}>
                                <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  setForm((s) => {
                                    const next = new Set(s.roles);
                                    if (isChecked) next.add(role); else next.delete(role);
                                    return { ...s, roles: Array.from(next) };
                                  });
                                }} disabled={isViewing} />
                                <span>{role}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {!isEditing && !isViewing && <p className="mt-1 text-xs text-gray-500">Chọn một hoặc nhiều vai trò</p>}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">Phòng ban <span className="text-red-500">*</span></label>
                      <select required={!isEditing} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.department} onChange={(e) => setForm((s) => ({ ...s, department: e.target.value as UserForm['department'] }))} disabled={isViewing}>
                        <option value="">— Chọn phòng ban —</option>
                        {DEPARTMENT_OPTIONS.map((d) => <option key={d} value={d}>{getDepartmentLabel(d)}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm">Team</label>
                      <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50" value={form.team} onChange={(e) => setForm((s) => ({ ...s, team: e.target.value as UserForm['team'] }))} disabled={isViewing}>
                        <option value="">— Chọn team —</option>
                        {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{getTeamLabel(t)}</option>)}
                      </select>
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
    </>
  );
}
