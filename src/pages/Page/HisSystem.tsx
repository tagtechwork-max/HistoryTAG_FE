import React, { useEffect, useMemo, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { AiOutlineEye, AiOutlineEdit, AiOutlineDelete, AiOutlinePlus } from "react-icons/ai";
import { FaHospital } from "react-icons/fa";
import { FiMail, FiPhone, FiUser, FiClock, FiMapPin, FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import ExcelJS from "exceljs";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

// ===================== Types ===================== //
export type SortDir = "asc" | "desc";

export interface HisResponseDTO {
  id: number;
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  apiUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface HisRequestDTO {
  name: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phoneNumber?: string;
  apiUrl?: string;
}

// Hospital type for statistics
export interface HospitalStat {
  id: number;
  name: string;
  province?: string | null;
  address?: string | null;
  projectStatus?: string | null;
  personInChargeName?: string | null;
}

// Spring Page
interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

// ===================== Config & helpers ===================== //
// ⚠️ Fix env access for Vite-based projects
const API_BASE = import.meta.env.VITE_API_URL ?? ""; // same-origin if not set
// ✅ Dùng admin API cho GET requests (admin thường có thể dùng)
const ADMIN_BASE = `${API_BASE}/api/v1/admin/his`;
// ✅ Chỉ dùng superadmin API cho CREATE/UPDATE/DELETE (khi canEdit = true)
const SUPERADMIN_BASE = `${API_BASE}/api/v1/superadmin/his`;

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }
    : { "Content-Type": "application/json", Accept: "application/json" };
}

// ✅ Helper để build URL an toàn (xử lý cả relative và absolute URLs)
function buildUrl(path: string): URL {
  // Nếu path đã là absolute URL (có protocol), dùng trực tiếp
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return new URL(path);
  }
  // Nếu API_BASE có giá trị, dùng nó làm base
  if (API_BASE) {
    return new URL(path, API_BASE);
  }
  // Nếu không có API_BASE, dùng window.location.origin làm base
  return new URL(path, window.location.origin);
}

// ✅ Helper để chọn API base dựa trên method và user role
function getApiBase(method: string = "GET", isSuperAdminUser: boolean = false): string {
  // GET requests: luôn dùng admin API (admin thường có thể dùng)
  if (method === "GET") {
    return ADMIN_BASE;
  }
  // Write operations (POST, PUT, DELETE): 
  // - Nếu là superadmin → dùng superadmin API
  // - Nếu là admin → dùng admin API
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    return isSuperAdminUser ? SUPERADMIN_BASE : ADMIN_BASE;
  }
  // Fallback: dùng admin API
  return ADMIN_BASE;
}

function validate(values: HisRequestDTO) {
  const e: Partial<Record<keyof HisRequestDTO, string>> = {};
  if (!values.name?.trim()) e.name = "Tên HIS là bắt buộc";
  if (values.name && values.name.length > 100) e.name = "Tên HIS tối đa 100 ký tự";
  if (values.address && values.address.length > 255) e.address = "Địa chỉ tối đa 255 ký tự";
  if (values.contactPerson && values.contactPerson.length > 100)
    e.contactPerson = "Người liên hệ tối đa 100 ký tự";
  if (values.email) {
    if (values.email.length > 255) e.email = "Email tối đa 255 ký tự";
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(values.email)) e.email = "Email không hợp lệ";
  }
  if (values.phoneNumber) {
    const r = /^\d{10,11}$/;
    if (!r.test(values.phoneNumber)) e.phoneNumber = "Số điện thoại 10-11 chữ số";
  }
  if (values.apiUrl && values.apiUrl.length > 500) e.apiUrl = "API URL tối đa 500 ký tự";
  return e;
}

function errMsg(err: unknown, fallback = "Lỗi xảy ra") {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

// Helper functions for status colors
function getStatusBg(status?: string | null): string {
  switch (status) {
    case "NOT_DEPLOYED":
      return "bg-gray-400";
    case "IN_PROGRESS":
      return "bg-orange-500";
    case "COMPLETED":
      return "bg-green-500";
    case "ISSUE":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
}

function getStatusColor(status?: string | null): string {
  switch (status) {
    case "IN_PROGRESS":
      return "text-orange-600";
    case "COMPLETED":
      return "text-green-600";
    case "ISSUE":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

function getStatusLabel(status?: string | null): string {
  switch (status) {
    case "NOT_DEPLOYED":
      return "Chưa triển khai";
    case "IN_PROGRESS":
      return "Đang thực hiện";
    case "COMPLETED":
      return "Hoàn thành";
    case "ISSUE":
      return "Gặp sự cố";
    default:
      return "—";
  }
}

function formatDateShort(value?: string | null) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    
    // Kiểm tra nếu ngày không hợp lệ (ví dụ chuỗi rác)
    if (isNaN(d.getTime())) return "—";

    // Hàm tiện ích để thêm số 0 vào trước nếu cần (ví dụ: 5 -> "05")
    const pad = (num: number) => num.toString().padStart(2, '0');

    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1); // Tháng bắt đầu từ 0 nên phải +1
    const yyyy = d.getFullYear();

    return `${hh}:${min}-${dd}/${mm}/${yyyy}`;
  } catch {
    return "—";
  }
}

// Small Info helper (label column + value column, accepts an icon)
function Info({
  label,
  value,
  icon,
  stacked,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {icon && <span className="text-gray-500 dark:text-gray-400 text-lg">{icon}</span>}
          <span className="font-semibold text-gray-900 dark:text-gray-100">{label}:</span>
        </div>
        <div className="text-gray-700 dark:text-gray-300 break-words pl-7">{value ?? "—"}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-[120px] flex items-center gap-3">
        {icon && <span className="text-gray-500 dark:text-gray-400 text-lg">{icon}</span>}
        <span className="font-semibold text-gray-900 dark:text-gray-100">{label}:</span>
      </div>
      <div className="flex-1 text-gray-700 dark:text-gray-300 break-words">{value ?? "—"}</div>
    </div>
  );
}

// ===================== Page ===================== //
const HisSystemPage: React.FC = () => {
  // table state
  const [items, setItems] = useState<HisResponseDTO[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pagination & sort
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sortBy, setSortBy] = useState<keyof HisResponseDTO>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // filters (client-side like your Hospitals page)
  const [qName, setQName] = useState("");
  const [qContact, setQContact] = useState("");
  const [qEmail] = useState("");

  // modal/form
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HisResponseDTO | null>(null);
  const [viewing, setViewing] = useState<HisResponseDTO | null>(null);
  const [form, setForm] = useState<HisRequestDTO>({ name: "" });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HisRequestDTO, string>>>({});
  const [isModalLoading, setIsModalLoading] = useState(false);

  // Hospital statistics
  const [hospitalStats, setHospitalStats] = useState<Record<number, number>>({}); // Only store count
  const [hospitalsModalOpen, setHospitalsModalOpen] = useState(false);
  const [selectedHisId, setSelectedHisId] = useState<number | null>(null);
  const [selectedHospitals, setSelectedHospitals] = useState<HospitalStat[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalByHisCache, setHospitalByHisCache] = useState<Record<number, HospitalStat[]>>({});
  const hospitalsCacheRef = React.useRef<{ data: any[]; fetchedAt: number } | null>(null);

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  // Determine if current user can perform write actions (ADMIN or SUPERADMIN)
  const canEdit = (() => {
    try {
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (!rolesStr) return false;
      const roles = JSON.parse(rolesStr);
      return Array.isArray(roles) && roles.some((r: string) => 
        r === "ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN" || r === "Super Admin"
      );
    } catch (e) {
      return false;
    }
  })();

  // Check if user is superadmin (to decide which API to use)
  const isSuperAdmin = (() => {
    try {
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (!rolesStr) return false;
      const roles = JSON.parse(rolesStr);
      return Array.isArray(roles) && roles.some((r: string) => 
        r === "SUPERADMIN" || r === "SUPER_ADMIN" || r === "Super Admin"
      );
    } catch (e) {
      return false;
    }
  })();

  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

  // ------- data fetching (server paging compatible) ------- //
  async function fetchList() {
    setLoading(true);
    setError(null);
    try {
      // ✅ GET request: luôn dùng admin API
      const base = getApiBase("GET", false);
      const url = buildUrl(base);
        url.searchParams.set("search", "");
        url.searchParams.set("page", String(page));
        url.searchParams.set("size", String(size));
        url.searchParams.set("sortBy", String(sortBy));
        url.searchParams.set("sortDir", sortDir);
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setItems(data);
        setTotalElements(data.length);
        setTotalPages(Math.ceil(data.length / size));
      } else {
        const pageRes = data as SpringPage<HisResponseDTO>;
        setItems(pageRes.content ?? []);
        setTotalElements(pageRes.totalElements ?? pageRes.content?.length ?? 0);
        setTotalPages(pageRes.totalPages ?? Math.ceil((pageRes.totalElements ?? pageRes.content?.length ?? 0) / size));
      }
    } catch (error: unknown) {
      const msg = errMsg(error, "Lỗi tải dữ liệu");
      console.error("fetchList error:", error);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, sortBy, sortDir]);


  // Cache hospitals list to avoid refetching on every modal open / stats calc
  async function fetchHospitalsCached() {
    const cache = hospitalsCacheRef.current;
    const now = Date.now();
    if (cache && now - cache.fetchedAt < 2 * 60 * 1000) {
      return cache.data;
    }

    const url = buildUrl(`${API_BASE}/api/v1/auth/hospitals`);
    url.searchParams.set("page", "0");
    url.searchParams.set("size", "500"); // Reduced from 10000 to 500 for better performance

    const res = await fetch(url.toString(), { headers: { ...authHeader() } });
    if (!res.ok) return cache?.data ?? [];

    const data = await res.json();
    const allHospitals = Array.isArray(data) ? data : (data.content ?? []);
    hospitalsCacheRef.current = { data: allHospitals, fetchedAt: now };
    return allHospitals;
  }

  // Load hospital counts for all HIS items (prefer server-side count)
  useEffect(() => {
    if (items.length === 0) return;
    
    const loadCounts = async () => {
      try {
        const url = buildUrl(`${API_BASE}/api/v1/auth/hospitals/count-by-his`);
        const res = await fetch(url.toString(), { headers: { ...authHeader() } });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === "object") {
            const counts: Record<number, number> = {};
            items.forEach((his) => {
              counts[his.id] = Number(data[String(his.id)]) || 0;
            });
            setHospitalStats(counts);
            return;
          }
        }

        // Fallback: reuse cached hospitals list if endpoint not available
        const allHospitals = await fetchHospitalsCached();
        const counts: Record<number, number> = {};
        items.forEach((his) => {
          counts[his.id] = allHospitals.filter((h: any) => h.hisSystemId === his.id).length;
        });
        setHospitalStats(counts);
      } catch (e) {
        console.error("Error loading hospital counts:", e);
      }
    };
    
    loadCounts();
  }, [items]);

  // Fetch hospitals when modal opens (use cache for faster display)
  async function loadHospitalsForHis(hisId: number) {
    const cached = hospitalByHisCache[hisId];
    if (cached) {
      setSelectedHospitals(cached);
    }
    setHospitalsLoading(!cached);
    try {
      const url = buildUrl(`${API_BASE}/api/v1/auth/hospitals`);
      url.searchParams.set("page", "0");
      // Try to use backend filter (if supported)
      url.searchParams.set("hisSystemId", String(hisId));
      url.searchParams.set("size", "500"); // Reduced from 10000 to 500 for better performance
      
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) {
        setSelectedHospitals([]);
        return;
      }
      
      const data = await res.json();
      const allHospitals = Array.isArray(data) ? data : (data.content ?? []);

      // If backend ignores hisSystemId, filter on client
      const filteredHospitals = allHospitals.every((h: any) => h.hisSystemId === hisId)
        ? allHospitals
        : allHospitals.filter((h: any) => h.hisSystemId === hisId);
      
      const hospitals = filteredHospitals.map((h: any) => ({
          id: h.id,
          name: h.name,
          province: h.province,
          address: h.address,
          projectStatus: h.projectStatus,
          personInChargeName: h.personInChargeName,
        }));
      
      setSelectedHospitals(hospitals);
      setHospitalByHisCache((prev) => ({ ...prev, [hisId]: hospitals }));
    } catch (e) {
      console.error("Error loading hospitals:", e);
      setSelectedHospitals([]);
    } finally {
      setHospitalsLoading(false);
    }
  }

  // Export hospitals to Excel
  async function exportHospitalsExcel() {
    if (!selectedHisId || selectedHospitals.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    try {
      const hisName = items.find((h) => h.id === selectedHisId)?.name || "HIS";
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Danh sách bệnh viện");

      // Title row: "Tên His" - only style the first 5 cells
      const titleRow = worksheet.addRow([hisName, "", "", "", ""]); // Add empty cells for columns B, C, D, E
      titleRow.height = 30;
      
      // Merge only the first 5 cells (A-E)
      worksheet.mergeCells(1, 1, 1, 5);
      
      // Style only the merged cell (which is now cell A1)
      const titleCell = titleRow.getCell(1);
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFADD8E6" }, // Light blue
      };
      titleCell.value = hisName;
      
      // Clear any style from cells beyond column 5 in title row
      for (let col = 6; col <= 20; col++) {
        try {
          const cell = titleRow.getCell(col);
            if (cell) {
            cell.value = null;
            cell.style = {};
            try { delete (cell as any).fill; } catch {};
          }
        } catch (e) {
          // Ignore
        }
      }

      // Header row - only style the first 5 cells
      const headers = ["STT", "Tên bệnh viện", "Người phụ trách", "Tỉnh/thành", "Trạng thái"];
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 25;
      
      // Style only the first 5 cells (columns A-E)
      for (let col = 1; col <= 5; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" }, // Yellow
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }

      // Set column widths
      worksheet.getColumn(1).width = 10; // STT
      worksheet.getColumn(2).width = 40; // Tên bệnh viện
      worksheet.getColumn(3).width = 25; // Người phụ trách
      worksheet.getColumn(4).width = 20; // Tỉnh/thành
      worksheet.getColumn(5).width = 18; // Trạng thái

      // Data rows - only style the first 5 cells
      selectedHospitals.forEach((hospital, index) => {
        const row = worksheet.addRow([
          index + 1, // STT
          hospital.name || "",
          hospital.personInChargeName || "",
          hospital.province || "",
          getStatusLabel(hospital.projectStatus), // Trạng thái
        ]);
        row.height = 20;
        
        // Style only the first 5 cells (columns A-E)
        for (let col = 1; col <= 5; col++) {
          const cell = row.getCell(col);
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }
      });

      // Remove any cells beyond column 5 to prevent extra columns with styles
      const lastRow = worksheet.rowCount;
      if (lastRow > 0) {
        for (let rowNum = 1; rowNum <= lastRow; rowNum++) {
          const row = worksheet.getRow(rowNum);
          // Clear cells from column 6 onwards
          for (let colNum = 6; colNum <= 20; colNum++) {
            try {
              const cell = row.getCell(colNum);
              if (cell && (cell.value !== null || cell.style || cell.numFmt)) {
                // Clear everything from extra cells
                cell.value = null;
                cell.style = {};
                try { delete (cell as any).numFmt; } catch {}
              }
            } catch (e) {
              // Ignore errors for cells that don't exist
            }
          }
        }
      }
      
      // Clear column definitions beyond column 5
      for (let colNum = 6; colNum <= 20; colNum++) {
        try {
          const column = worksheet.getColumn(colNum);
          if (column) {
            column.width = undefined;
            if (column.style) {
              column.style = {};
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `danh_sach_benh_vien_${hisName.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Xuất Excel thành công");
    } catch (e: any) {
      console.error("Error exporting Excel:", e);
      toast.error(e?.message || "Xuất Excel thất bại");
    }
  }

  // ------- client-side filtering like hospitals page ------- //
  const filtered = useMemo(() => {
    const name = qName.trim().toLowerCase();
    const contact = qContact.trim().toLowerCase();
    const email = qEmail.trim().toLowerCase();
    return items.filter((h) => {
      const okName = !name || (h.name ?? "").toLowerCase().includes(name);
      const okContact = !contact || (h.contactPerson ?? "").toLowerCase().includes(contact);
      const okEmail = !email || (h.email ?? "").toLowerCase().includes(email);
      return okName && okContact && okEmail;
    });
  }, [items, qName, qContact, qEmail]);

  // ------- modal helpers ------- //
  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({ name: "", address: "", contactPerson: "", email: "", phoneNumber: "", apiUrl: "" });
    setFormErrors({});
    setOpen(true);
  }

  async function onEdit(h: HisResponseDTO) {
    setViewing(null);
    setIsModalLoading(true);
    try {
      // ✅ GET request: luôn dùng admin API
      const base = getApiBase("GET", false);
      const res = await fetch(`${base}/${h.id}`, { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const detail = (await res.json()) as HisResponseDTO;
      setEditing(detail);
      setForm({
        name: detail.name ?? "",
        address: detail.address ?? "",
        contactPerson: detail.contactPerson ?? "",
        email: detail.email ?? "",
        phoneNumber: detail.phoneNumber ?? "",
        apiUrl: detail.apiUrl ?? "",
      });
      setFormErrors({});
      setOpen(true);
    } catch (error: unknown) {
      const msg = errMsg(error, "Không thể tải chi tiết HIS");
      console.error("onEdit error:", error);
      setError(msg);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function onView(h: HisResponseDTO) {
    setEditing(null);
    setViewing(null);
    setOpen(true);
    setIsModalLoading(true);
    try {
      // ✅ GET request: luôn dùng admin API
      const base = getApiBase("GET", false);
      const res = await fetch(`${base}/${h.id}`, { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const detail = (await res.json()) as HisResponseDTO;
      setViewing(detail);
      setForm({
        name: detail.name ?? "",
        address: detail.address ?? "",
        contactPerson: detail.contactPerson ?? "",
        email: detail.email ?? "",
        phoneNumber: detail.phoneNumber ?? "",
        apiUrl: detail.apiUrl ?? "",
      });
      setFormErrors({});
    } catch (error: unknown) {
      const msg = errMsg(error, "Không thể tải chi tiết HIS");
      console.error("onView error:", error);
      setError(msg);
      setOpen(false);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function onDelete(id: number) {
    if (!canEdit) {
      toast.error("Bạn không có quyền xóa HIS");
      return;
    }
    const ok = await askConfirm({
      title: "Xóa HIS?",
      message: "Bạn có chắc muốn xóa HIS này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    setLoading(true);
    try {
      // ✅ DELETE request: dùng admin API nếu là admin, superadmin API nếu là superadmin
      const base = getApiBase("DELETE", isSuperAdmin);
      const res = await fetch(`${base}/${id}`, { method: "DELETE", headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      // adjust page when last item removed
      if (items.length === 1 && page > 0) setPage((p) => p - 1);
      await fetchList();
      toast.success("Xóa HIS thành công");
    } catch (error: unknown) {
      const msg = errMsg(error, "Xóa thất bại");
      console.error("onDelete error:", error);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    if (!canEdit) {
      setError("Bạn không có quyền thực hiện thao tác này");
      return;
    }
    try {
      const method = isEditing ? "PUT" : "POST";
      // ✅ POST/PUT request: dùng admin API nếu là admin, superadmin API nếu là superadmin
      const base = getApiBase(method, isSuperAdmin);
      const url = isEditing ? `${base}/${editing!.id}` : base;
      const res = await fetch(url, {
        method,
        headers: { ...authHeader() },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${method} ${res.status}`);
      // if not thrown, res.ok already ensured by fetchWithFallback
      setOpen(false);
      setEditing(null);
      await fetchList();
      toast.success(isEditing ? "Cập nhật HIS thành công" : "Tạo HIS thành công");
    } catch (error: unknown) {
      const msg = errMsg(error, "Lưu thất bại");
      console.error("onSubmit error:", error);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  // ===================== Render ===================== //
  return (
    <>
      <PageMeta title="HIS System – CRUD" description="Quản lý hệ thống HIS: danh sách, lọc, tạo/sửa/xóa" />

      <div className="space-y-10">
        {/* Filters & Actions */}
        <ComponentCard title="Tìm kiếm & Thao tác">
          <div className="flex flex-wrap items-center gap-3">
            <input className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 bg-white" placeholder="Tìm theo tên HIS" value={qName} onChange={(e) => setQName(e.target.value)} />
            <input className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 bg-white" placeholder="Người liên hệ" value={qContact} onChange={(e) => setQContact(e.target.value)} />
            <button
              type="button"
              onClick={() => {
                setQName("");
                setQContact("");
              }}
              className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
            >
              Bỏ lọc
            </button>
          </div>
            <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">Tổng: <span className="font-semibold text-gray-900">{totalElements}</span></p>
            <div className="flex items-center gap-3">
              {canEdit && (
                <button className="rounded-xl border border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-600 hover:shadow-md" onClick={onCreate}> + Thêm HIS</button>
              )}
            </div>
          </div>
        </ComponentCard>

        {/* Card list version */}
        <ComponentCard title="Danh sách HIS">
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div className="space-y-4">
            {filtered.map((h, idx) => {
              const delayMs = Math.round(idx * (2000 / Math.max(1, filtered.length)));
              return (
                <div
                  key={h.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onView(h)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onView(h);
                    }
                  }}
                  className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:bg-primary/5 hover:ring-1 hover:ring-primary/20 cursor-pointer"
                  style={{ animation: `fadeInUp 600ms ease ${delayMs}ms both` }}
                >
                  <div className="flex items-center gap-4 w-2/3">
                    <div className="h-12 w-12 rounded-lg bg-white flex items-center justify-center text-indigo-600 font-semibold text-sm border border-gray-100 transition-colors duration-200 group-hover:border-transparent group-hover:bg-blue-600 group-hover:text-white">
                      <FaHospital className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 title={h.name} className="font-semibold text-gray-900 truncate group-hover:text-primary">{h.name}</h4>
                        {/* address removed as requested */}
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="truncate"><span className="text-xs text-gray-400">Người liên hệ: </span><span title={h.contactPerson || ""} className="font-medium text-gray-800">{h.contactPerson || "—"}</span>{h.phoneNumber && <span className="ml-2 text-xs text-gray-500">• {h.phoneNumber}</span>}</div>
                        <div className="truncate mt-1"><span className="text-xs text-gray-400">Email: </span><span title={h.email || ""} className="text-gray-700">{h.email || "—"}</span></div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHisId(h.id);
                              setHospitalsModalOpen(true);
                              loadHospitalsForHis(h.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200"
                          >
                            <FaHospital className="w-3 h-3" />
                            <span>{hospitalStats[h.id] ?? 0} bệnh viện</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col text-right text-sm text-gray-600">
                      <span className="text-xs text-gray-400">Ngày tạo</span>
                      <span className="font-medium">{formatDateShort(h.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        title="Xem"
                        aria-label={`Xem ${h.name}`}
                        onClick={(e) => { e.stopPropagation(); onView(h); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-100 text-blue-700 hover:bg-blue-50 transition transform group-hover:scale-105 text-xs font-medium"
                      >
                        <AiOutlineEye className="w-4 h-4" />
                        <span className="hidden sm:inline">Xem</span>
                      </button>
                      {canEdit && (
                        <>
                          <button
                            title="Sửa"
                            aria-label={`Sửa ${h.name}`}
                            onClick={(e) => { e.stopPropagation(); onEdit(h); }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition transform group-hover:scale-105 text-xs font-medium"
                          >
                            <AiOutlineEdit className="w-4 h-4" />
                            <span className="hidden sm:inline">Sửa</span>
                          </button>
                          <button
                            title="Xóa"
                            aria-label={`Xóa ${h.name}`}
                            onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition transform group-hover:scale-105 text-xs font-medium"
                          >
                            <AiOutlineDelete className="w-4 h-4" />
                            <span className="hidden sm:inline">Xóa</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && filtered.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                <div className="flex flex-col items-center">
                  <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <span className="text-sm">Không có dữ liệu</span>
                </div>
              </div>
            )}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalElements}
            itemsPerPage={size}
            onPageChange={setPage}
            onItemsPerPageChange={(newSize) => {
              setSize(newSize);
              setPage(0); // Reset to first page when changing page size
            }}
            itemsPerPageOptions={[10, 20, 50]}
          />

          {loading && <div className="mt-3 text-sm text-gray-500">Đang tải...</div>}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </ComponentCard>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-5xl rounded-3xl bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                {!isViewing && !isEditing && <AiOutlinePlus className="w-6 h-6 text-blue-600" />}
                {isViewing ? "Chi tiết HIS" : (isEditing ? "Cập nhật HIS" : "Thêm HIS")}
              </h3>
              <button className="rounded-xl p-2 transition-all hover:bg-gray-100 hover:scale-105" onClick={() => setOpen(false)}>
                {/* close */}
              </button>
            </div>

            {isModalLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <svg className="mb-4 h-12 w-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Đang tải chi tiết...</span>
              </div>
            ) : isViewing ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Info label="Tên HIS" icon={<FaHospital />} value={viewing?.name || "—"} />
                <Info label="Người liên hệ" icon={<FiUser />} value={viewing?.contactPerson || "—"} />
                <Info label="Email" icon={<FiMail />} value={viewing?.email || "—"} />
                <Info label="Số điện thoại" icon={<FiPhone />} value={viewing?.phoneNumber || "—"} />
                {/* Removed Địa chỉ and API URL from view as requested */}
                <Info label="Tạo lúc" icon={<FiClock />} value={formatDateShort(viewing?.createdAt)} />
                <Info label="Cập nhật lúc" icon={<FiClock />} value={formatDateShort(viewing?.updatedAt)} />

                <div className="col-span-1 md:col-span-2 mt-4 pt-2 border-t border-gray-200 flex justify-end">
                  <button className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700" onClick={() => setOpen(false)}>
                    Đóng
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        <FaHospital className="w-4 h-4 text-gray-500" />
                        <span>Tên HIS*</span>
                      </span>
                    </label>
                    <input
                        required
                        disabled={isViewing || !canEdit}
                      className={`w-full rounded-xl border-2 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                        formErrors.name ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    />
                    {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        <FiUser className="w-4 h-4 text-gray-500" />
                        <span>Người liên hệ</span>
                      </span>
                    </label>
                    <input
                      disabled={isViewing || !canEdit}
                      className={`w-full rounded-xl border-2 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                        formErrors.contactPerson ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.contactPerson || ""}
                      onChange={(e) => setForm((s) => ({ ...s, contactPerson: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        <FiMail className="w-4 h-4 text-gray-500" />
                        <span>Email</span>
                      </span>
                    </label>
                    <input
                      disabled={isViewing || !canEdit}
                      type="email"
                      className={`w-full rounded-xl border-2 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                        formErrors.email ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.email || ""}
                      onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    />
                    {formErrors.email && <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        <FiPhone className="w-4 h-4 text-gray-500" />
                        <span>Số điện thoại</span>
                      </span>
                    </label>
                    <input
                      disabled={isViewing || !canEdit}
                      className={`w-full rounded-xl border-2 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                        formErrors.phoneNumber ? "border-red-400" : "border-gray-300"
                      }`}
                      value={form.phoneNumber || ""}
                      onChange={(e) => setForm((s) => ({ ...s, phoneNumber: e.target.value }))}
                    />
                    {formErrors.phoneNumber && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.phoneNumber}</p>
                    )}
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 mt-4 flex items-center justify-between border-t border-gray-200 pt-6">
                  {error && (
                    <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400"
                      onClick={() => setOpen(false)}
                    >
                      {isViewing ? "Đóng" : "Huỷ"}
                    </button>
                    {!isViewing && canEdit && (
                      <button
                        type="submit"
                        className="rounded-xl border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading}
                      >
                        {loading ? "Đang lưu..." : (isEditing ? "Cập nhật" : "Tạo mới")}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Hospitals Modal */}
      <AnimatePresence mode="wait">
        {hospitalsModalOpen && selectedHisId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setHospitalsModalOpen(false);
                setSelectedHisId(null);
                setSelectedHospitals([]);
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 250, damping: 25 }}
              className="relative z-10 w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <FaHospital className="w-5 h-5 text-blue-600" />
                    <span>
                      Danh sách bệnh viện sử dụng HIS:{" "}
                      <span className="text-blue-600">{items.find((h) => h.id === selectedHisId)?.name}</span>
                    </span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {selectedHospitals.length > 0 && (
                      <button
                        onClick={exportHospitalsExcel}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-sm font-medium"
                      >
                        <FiDownload className="w-4 h-4" />
                        Xuất Excel
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setHospitalsModalOpen(false);
                        setSelectedHisId(null);
                        setSelectedHospitals([]);
                      }}
                      className="text-gray-500 hover:text-gray-800 transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div
                className="overflow-y-auto px-6 py-6 space-y-4 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {hospitalsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <svg
                      className="mb-4 h-12 w-12 animate-spin text-primary"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Đang tải...</span>
                  </div>
                ) : selectedHospitals.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <FaHospital className="mx-auto h-12 w-12 mb-3 text-gray-300" />
                    <span className="text-sm">Chưa có bệnh viện nào sử dụng HIS này</span>
                  </div>
                ) : (
                  selectedHospitals.map((hospital) => (
                    <div
                      key={hospital.id}
                      className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition bg-white"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <FaHospital className="w-4 h-4 text-blue-600" />
                            {hospital.name}
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            {hospital.province && (
                              <div className="flex items-center gap-2">
                                <FiMapPin className="w-4 h-4 text-gray-400" />
                                <span>{hospital.province}</span>
                              </div>
                            )}
                            {hospital.personInChargeName && (
                              <div className="flex items-center gap-2">
                                <FiUser className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-700">
                                  <span className="text-xs text-gray-500">Người phụ trách: </span>
                                  <span className="font-medium">{hospital.personInChargeName}</span>
                                </span>
                              </div>
                            )}
                            {hospital.projectStatus && (
                              <div className="mt-2">
                                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusBg(hospital.projectStatus)} text-white`}>
                                  {getStatusLabel(hospital.projectStatus)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Tổng: <span className="font-semibold text-gray-900">{selectedHospitals.length}</span> bệnh viện
                </p>
                  <button
                    onClick={() => {
                      setHospitalsModalOpen(false);
                      setSelectedHisId(null);
                      setSelectedHospitals([]);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-100 transition"
                  >
                    Đóng
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {genericConfirmDialog}
    </>
  );
};

export default HisSystemPage;
