import { useEffect, useMemo, useRef, useState } from "react";
import flatpickr from "flatpickr";
import { Vietnamese } from "flatpickr/dist/l10n/vn";
import { motion, AnimatePresence } from "framer-motion";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
// removed unused icons import (use react-icons instead)
import { AiOutlineEye, AiOutlineEdit, AiOutlineDelete } from "react-icons/ai";
import { FiMapPin, FiPhone, FiUser, FiClock, FiTag, FiImage, FiMap, FiDownload, FiFile } from "react-icons/fi";
import { RiHistoryLine } from "react-icons/ri";
import { FaHospitalAlt } from "react-icons/fa";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export type Hospital = {
  id: number;
  hospitalCode?: string | null;
  name: string;
  address?: string | null;
  contactEmail?: string | null;
  contactNumber?: string | null;
  // taxCode, contactPosition, and IT contact fields removed from this page model
  hisSystemId?: number | null;
  hisSystemName?: string | null;
  province?: string | null;
  projectStatus?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  completionDate?: string | null;
  notes?: string | null;
  apiFileUrl?: string | null;
  priority?: string | null;
  updatedAt?: string | null;
  assignedUserIds?: number[];
  hardwareId?: number | null;
  hardwareName?: string | null;
  personInChargeId?: number | null;
  personInChargeName?: string | null;
  personInChargeEmail?: string | null;
  personInChargePhone?: string | null;
  maintenancePersonInChargeId?: number | null;
  maintenancePersonInChargeName?: string | null;
  maintenancePersonInChargeEmail?: string | null;
  maintenancePersonInChargePhone?: string | null;
  contractCount?: number; // Tổng số hợp đồng (business + warranty)
  /** True when deployment handed off to maintenance (may differ from projectStatus until next sync). */
  transferredToMaintenance?: boolean | null;
  acceptedByMaintenance?: boolean | null;
  /** ISO yyyy-MM-dd (last valid day of maintenance, inclusive). */
  maintenanceExpiryDate?: string | null;
};

export type HospitalForm = {
  hospitalCode?: string;
  name: string;
  address?: string;
  contactEmail?: string;
  contactNumber?: string;
  province?: string;
  hisSystemId?: number;
  hardwareId?: number;
  hardwareName?: string;
  projectStatus: string;
  notes?: string;
  apiFile?: File | null;
  apiFileUrl?: string | null;
  priority: string;
  // assignedUserIds removed from Hospital form UI; assignment managed elsewhere
  personInChargeId?: number;
  personInChargeName?: string;
  maintenancePersonInChargeId?: number;
  maintenancePersonInChargeName?: string;
  maintenanceExpiryDate?: string;
};

type ITUserOption = {
  id: number;
  name: string;
  username?: string;
  email?: string | null;
  phone?: string | null;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BASE = `${API_BASE}/api/v1/auth/hospitals`; // GET, Search endpoints
const SUPERADMIN_BASE = `${API_BASE}/api/v1/superadmin/hospitals`; // CREATE, UPDATE, DELETE

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

const MIN_LOADING_MS = 800;

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
    : { Accept: "application/json" };
}

/**
 * Download file API bệnh viện qua secure endpoint
 * @param hospitalId ID bệnh viện
 * @param apiFileUrl URL hoặc path của file (để kiểm tra loại file)
 */
async function downloadHospitalApiFile(hospitalId: number, apiFileUrl: string | null | undefined) {
  if (!apiFileUrl) return;
  
  // Nếu là URL công khai (Cloudinary) → download trực tiếp (backward compatibility)
  if (apiFileUrl.startsWith('http://') || apiFileUrl.startsWith('https://')) {
    window.open(apiFileUrl, '_blank');
    return;
  }
  
  // Nếu là local file path → download qua secure endpoint
  try {
    const url = `${API_BASE}/api/v1/admin/hospitals/${hospitalId}/api-file/download`;
    const response = await fetch(url, {
      method: 'GET',
      headers: authHeader(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      if (response.status === 403) {
        toast.error('Bạn không có quyền truy cập file này.');
        return;
      }
      const errorText = await response.text();
      throw new Error(errorText || `Lỗi ${response.status}`);
    }
    
    // Lấy filename từ Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'api-file';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Download file
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    
    toast.success('Tải file thành công');
  } catch (error) {
    console.error('Error downloading file:', error);
    toast.error('Lỗi khi tải file: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

function toFormData(payload: Record<string, any>) {
  const fd = new FormData();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((item) => fd.append(k, String(item)));
    } else if (v instanceof File) {
      fd.append(k, v);
    } else {
      // Đảm bảo string được append đúng cách, không bị transform
      const strValue = typeof v === 'string' ? v : String(v);
      fd.append(k, strValue);
    }
  });
  return fd;
}

type EnumOption = { name: string; displayName: string };

const PRIORITY_FALLBACK: EnumOption[] = [
  { name: "P0", displayName: "Rất Khẩn cấp" },
  { name: "P1", displayName: "Khẩn cấp" },
  { name: "P2", displayName: "Quan trọng" },
  { name: "P3", displayName: "Thường xuyên" },
  { name: "P4", displayName: "Thấp" },
];

const STATUS_FALLBACK: EnumOption[] = [
  { name: "NOT_DEPLOYED", displayName: "Chưa triển khai" },
  { name: "IN_PROGRESS", displayName: "Đang thực hiện" },
  { name: "COMPLETED", displayName: "Hoàn thành" },
  { name: "ISSUE", displayName: "Gặp sự cố" },
  { name: "DEPLOYMENT_FINISHED", displayName: "Đã triển khai" },
  { name: "TRANSFERRED_TO_MAINTENANCE", displayName: "Đang bảo trì" },
  { name: "MAINTENANCE_EXPIRING_SOON", displayName: "Sắp hết hạn bảo trì" },
  { name: "MAINTENANCE_EXPIRED", displayName: "Đã hết hạn bảo trì" },
];

// Filter-only statuses: not offered in add/edit form select (only in page filter + display map)
const STATUS_NAMES_EXCLUDED_FROM_FORM = new Set<string>([
  "DEPLOYMENT_FINISHED",
  "TRANSFERRED_TO_MAINTENANCE",
  "MAINTENANCE_EXPIRING_SOON",
  "MAINTENANCE_EXPIRED",
]);

// Danh sách 64 tỉnh thành Việt Nam
const VIETNAM_PROVINCES = [
  "An Giang", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn", "Bắc Ninh",
  "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước", "Bình Thuận", "Cà Mau",
  "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk", "Đắk Nông", "Điện Biên",
  "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội",
  "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên",
  "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn",
  "Lào Cai", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận",
  "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh",
  "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên",
  "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "TP Hồ Chí Minh", "Trà Vinh",
  "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
];

function disp(map: Record<string, string>, key?: string | null) {
  if (!key) return "—";
  return map[key] ?? key;
}

function hasMaintenancePersonInCharge(
  h: Pick<Hospital, "maintenancePersonInChargeId" | "maintenancePersonInChargeName"> | null | undefined,
): boolean {
  if (!h) return false;
  const id = h.maintenancePersonInChargeId;
  if (id != null && Number(id) > 0) return true;
  const name = h.maintenancePersonInChargeName;
  return typeof name === "string" && name.trim().length > 0;
}

/** Card/detail status key: show as in-maintenance when transferred or maintenance PIC is set. */
function effectiveHospitalProjectStatusKey(
  h: Pick<
    Hospital,
    | "projectStatus"
    | "transferredToMaintenance"
    | "maintenancePersonInChargeId"
    | "maintenancePersonInChargeName"
  > | null | undefined,
): string | null | undefined {
  if (!h) return null;
  if (h.transferredToMaintenance === true || hasMaintenancePersonInCharge(h)) {
    return "TRANSFERRED_TO_MAINTENANCE";
  }
  return h.projectStatus ?? null;
}

function isHospitalInMaintenanceContext(
  h: Pick<Hospital, "transferredToMaintenance" | "maintenancePersonInChargeId" | "maintenancePersonInChargeName"> | null | undefined,
): boolean {
  if (!h) return false;
  return h.transferredToMaintenance === true || hasMaintenancePersonInCharge(h);
}

type MaintenanceExpiryBadge = {
  label: string;
  pillTextClass: string;
  pillBgClass: string;
  dotBgClass: string;
};

function todayLocalStartTs(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

/** Parse yyyy-MM-dd from API to local midnight timestamp. */
function maintenanceExpiryToStartTs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const slice = iso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const t = new Date(y, mo - 1, d).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Expired: after last valid day. Soon: from (expiry − 3 months) through last valid day. */
function getHospitalMaintenanceExpiryBadge(h: Hospital): MaintenanceExpiryBadge | null {
  if (!isHospitalInMaintenanceContext(h)) return null;
  const raw = h.maintenanceExpiryDate;
  const expiryTs = maintenanceExpiryToStartTs(raw ?? undefined);
  if (expiryTs == null) return null;
  const slice = String(raw).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const soonStartTs = new Date(y, mo - 1 - 3, d).getTime();
  const today = todayLocalStartTs();
  if (today > expiryTs) {
    return {
      label: "Hết hạn bảo trì",
      pillTextClass: "text-red-700 dark:text-red-200",
      pillBgClass: "bg-red-50 dark:bg-red-950/50",
      dotBgClass: "bg-red-500",
    };
  }
  if (today >= soonStartTs) {
    return {
      label: "Sắp hết hạn bảo trì",
      pillTextClass: "text-amber-800 dark:text-amber-200",
      pillBgClass: "bg-amber-50 dark:bg-amber-950/35",
      dotBgClass: "bg-amber-500",
    };
  }
  return null;
}

function formatMaintenanceExpiryVi(iso: string | null | undefined): string {
  const ts = maintenanceExpiryToStartTs(iso ?? undefined);
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString("vi-VN");
}

/** Value for `<input type="date" />` (yyyy-MM-dd, local calendar day). */
function maintenanceExpiryToInputValue(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

const MAINTENANCE_EXPIRY_FP_INPUT_CLASS =
  "w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

/**
 * Calendar + keyboard input without native type="date" cursor jumps.
 * Stores ISO yyyy-MM-dd; user sees/types dd/MM/yyyy (flatpickr altInput).
 */
function HospitalMaintenanceExpiryDateInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (isoYmd: string) => void;
  disabled?: boolean;
}) {
  const baseInputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<flatpickr.Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = baseInputRef.current;
    if (!el) return;

    const fp = flatpickr(el, {
      locale: Vietnamese,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      altInputClass: MAINTENANCE_EXPIRY_FP_INPUT_CLASS,
      allowInput: true,
      clickOpens: true,
      static: true,
      monthSelectorType: "static",
      disableMobile: true,
      defaultDate: value || undefined,
      onReady: (_d, _s, inst) => {
        if (inst.altInput) inst.altInput.placeholder = "dd/MM/yyyy";
      },
      onChange: (_dates, dateStr) => {
        onChangeRef.current(typeof dateStr === "string" ? dateStr : "");
      },
    });
    fpRef.current = fp;

    return () => {
      fp.destroy();
      fpRef.current = null;
    };
  }, []);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    const alt = fp.altInput;
    const active = document.activeElement;
    if ((alt && active === alt) || active === fp.input) return;

    if (!value) {
      fp.clear();
      return;
    }

    const sel = fp.selectedDates[0];
    if (sel) {
      const y = sel.getFullYear();
      const m = String(sel.getMonth() + 1).padStart(2, "0");
      const d = String(sel.getDate()).padStart(2, "0");
      if (`${y}-${m}-${d}` === value) return;
    }
    fp.setDate(value, false);
  }, [value]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    fp.input.disabled = !!disabled;
    if (fp.altInput) fp.altInput.disabled = !!disabled;
  }, [disabled]);

  return <input ref={baseInputRef} type="text" className="hidden" readOnly={false} tabIndex={-1} aria-hidden />;
}

// Hàm lấy màu cho trạng thái
function getStatusColor(status?: string | null): string {
  switch (status) {
    case "NOT_DEPLOYED":
      return "text-gray-600";
    case "IN_PROGRESS":
      return "text-orange-600";
    case "COMPLETED":
      return "text-green-600";
    case "ISSUE":
      return "text-red-600";
    case "TRANSFERRED_TO_MAINTENANCE":
      return "text-sky-700 dark:text-sky-300";
    case "DEPLOYMENT_FINISHED":
      return "text-teal-700 dark:text-teal-300";
    default:
      return "text-gray-600";
  }
}

// Hàm lấy màu cho độ ưu tiên
function getPriorityColor(priority?: string | null): string {
  switch (priority) {
    case "P0": // Rất Khẩn cấp
      return "text-red-700 ";
    case "P1": // Khẩn cấp
      return "text-orange-700 ";
    case "P2": // Quan trọng
      return "text-yellow-700 ";
    case "P3": // Thường xuyên
      return "text-blue-700 ";
    case "P4": // Thấp
      return "text-gray-700 ";
    default:
      return "text-gray-600 ";
  }
}

// Background color helpers for small status/priority indicators
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
    case "TRANSFERRED_TO_MAINTENANCE":
      return "bg-sky-500";
    case "DEPLOYMENT_FINISHED":
      return "bg-teal-500";
    default:
      return "bg-gray-300";
  }
}

function getPriorityBg(priority?: string | null): string {
  switch (priority) {
    case "P0":
      return "bg-red-700";
    case "P1":
      return "bg-orange-600";
    case "P2":
      return "bg-yellow-500";
    case "P3":
      return "bg-blue-600";
    case "P4":
      return "bg-gray-500";
    default:
      return "bg-gray-300";
  }
}



// Date helpers removed or consolidated; Hospital UI uses fmt() for display

// Helper function để format date time
function fmt(dt?: string | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "";

    // Lấy phần giờ: 08:52
    const time = d.toLocaleTimeString("vi-VN", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: false // Đảm bảo dùng định dạng 24h
    });

    // Lấy phần ngày: 12/12/2025
    const date = d.toLocaleDateString("vi-VN", { 
      year: "numeric", 
      month: "2-digit", 
      day: "2-digit" 
    });

    // Ghép lại
    return `${time}-${date}`;
  } catch {
    return "—";
  }
}

// Helper component để hiển thị thông tin
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
    <div className="flex items-start gap-4">
      <div className="min-w-[150px] flex items-center gap-3">
        {icon && <span className="text-gray-500 dark:text-gray-400 text-lg">{icon}</span>}
        <span className="font-semibold text-gray-900 dark:text-gray-100">{label}:</span>
      </div>
      <div className="flex-1 text-gray-700 dark:text-gray-300 break-words">{value ?? "—"}</div>
    </div>
  );
}

// DetailModal component tương tự implementation-tasks.tsx
function DetailModal({
  open,
  onClose,
  item,
  statusMap,
  priorityMap,
}: {
  open: boolean;
  onClose: () => void;
  item: Hospital | null;
  statusMap: Record<string, string>;
  priorityMap: Record<string, string>;
}) {
  if (!open || !item) return null;

  const detailMaintBadge = getHospitalMaintenanceExpiryBadge(item);
  const detailEffKey = effectiveHospitalProjectStatusKey(item);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 250, damping: 25 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header - Sticky */}
        <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              📋 Chi tiết bệnh viện
            </h2>
          
          </div>
        </div>

        {/* Content - Scrollable with hidden scrollbar */}
        <div 
          className="overflow-y-auto px-6 py-6 space-y-6 text-sm text-gray-800 dark:text-gray-200 [&::-webkit-scrollbar]:hidden" 
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Grid Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
            <Info label="Mã bệnh viện" icon={<FiTag />} value={item.hospitalCode || "—"} />
            <Info label="Tên bệnh viện" icon={<FaHospitalAlt />} value={item.name} />
            <Info label="Địa chỉ" icon={<FiMapPin />} value={item.address || "—"} />
            <Info label="Tỉnh/Thành" icon={<FiMap />} value={item.province || "—"} />

            <Info
              label="Trạng thái"
              icon={<FiClock />}
              value={
                detailMaintBadge ? (
                  <span
                    className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${detailMaintBadge.pillBgClass} ${detailMaintBadge.pillTextClass}`}
                  >
                    {detailMaintBadge.label}
                  </span>
                ) : (
                  <span
                    className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusBg(detailEffKey)} text-white`}
                  >
                    {disp(statusMap, detailEffKey)}
                  </span>
                )
              }
            />

            <Info label="Hạn bảo trì" icon={<FiClock />} value={formatMaintenanceExpiryVi(item.maintenanceExpiryDate)} />

            <Info
              label="Độ ưu tiên"
              icon={<FiTag />}
              value={
                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getPriorityBg(item.priority)} text-white`}>
                  {disp(priorityMap, item.priority)}
                </span>
              }
            />

            <Info
              label="Phụ trách triển khai"
              icon={<FiUser />}
              value={
                item.personInChargeName ? (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{item.personInChargeName}</span>
                ) : (
                  "—"
                )
              }
            />
            <Info
              label="Phụ trách bảo trì"
              icon={<FiUser />}
              value={
                item.maintenancePersonInChargeName ? (
                  <span className="font-medium text-gray-900 dark:text-gray-100">{item.maintenancePersonInChargeName}</span>
                ) : (
                  "—"
                )
              }
            />
            <Info label="SĐT liên hệ viện" icon={<FiPhone />} value={item.contactNumber || "—"} />
            <Info label="Đơn vị HIS" icon={<FiMapPin />} value={item.hisSystemName || item.hisSystemId || "—"} />
            <Info label="Phần cứng" icon={<FiImage />} value={item.hardwareName || item.hardwareId || "—"} />
            {/* Project dates are managed by BusinessProject (master) and are not shown here */}
            {/* Removed: Mã số thuế, Vị trí liên hệ, Phòng IT contact, and Tạo lúc per request */}
            <Info label="Cập nhật lúc" icon={<FiClock />} value={fmt(item.updatedAt)} />
          </div>

          {/* API File */}
          {item.apiFileUrl && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">File API bệnh viện:</p>
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                <button
                  onClick={() => downloadHospitalApiFile(item.id, item.apiFileUrl)}
                  className="flex items-center gap-3 text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  <FiDownload className="w-5 h-5" />
                  <span className="font-medium">Tải file API</span>
                </button>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 break-all">
                  {item.apiFileUrl.startsWith('http') ? item.apiFileUrl : 'File được lưu trên server (bảo mật)'}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Ghi chú:</p>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-gray-800 dark:text-gray-300 min-h-[60px]">
                {item.notes}
              </div>
            </div>
          )}

          {/* Assigned user info removed from Hospital detail view; assignment is managed elsewhere */}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-10 dark:bg-gray-800/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            Đóng
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import { useAuth } from "../../contexts/AuthContext";

export default function HospitalsPage() {
  // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
  const { canEdit } = useAuth();
  const [items, setItems] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [enableItemAnimation, setEnableItemAnimation] = useState(true);
  const animationTimer = useRef<number | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters (server-side)
  /** Single search: matches hospital name OR hospital code (API `keyword`). */
  const [qSearch, setQSearch] = useState("");
  const [debouncedQSearch, setDebouncedQSearch] = useState("");
  const [qProvince, setQProvince] = useState("");
  const [qStatus, setQStatus] = useState("");
  const [qPriority, setQPriority] = useState("");
  const [qPersonInCharge, setQPersonInCharge] = useState("");
  const hospitalSearchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (hospitalSearchDebounceRef.current) {
      window.clearTimeout(hospitalSearchDebounceRef.current);
    }
    hospitalSearchDebounceRef.current = window.setTimeout(() => {
      setDebouncedQSearch(qSearch);
    }, 300);
    return () => {
      if (hospitalSearchDebounceRef.current) {
        window.clearTimeout(hospitalSearchDebounceRef.current);
      }
    };
  }, [qSearch]);

  // Reset về trang đầu khi filter thay đổi
  useEffect(() => {
    setPage(0);
  }, [debouncedQSearch, qProvince, qStatus, qPriority, qPersonInCharge]);

  const [priorityOptions] = useState<EnumOption[]>(PRIORITY_FALLBACK);
  const [statusOptions] = useState<EnumOption[]>(STATUS_FALLBACK);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hospital | null>(null);
  const [viewing, setViewing] = useState<Hospital | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false); // Thêm state loading cho modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyHospital, setHistoryHospital] = useState<Hospital | null>(null);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [contractsHospital, setContractsHospital] = useState<Hospital | null>(null);
  const [contractsData, setContractsData] = useState<{
    businessContracts: any[];
    maintainContracts: any[];
    totalCount: number;
  } | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [historyData, setHistoryData] = useState<Array<{
    id: number;
    eventType: string;
    description: string;
    eventDate: string;
    performedBy: string;
    details: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete confirmation modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [maintenanceSwitchConfirmOpen, setMaintenanceSwitchConfirmOpen] = useState(false);
  const [hospitalSaveConfirmOpen, setHospitalSaveConfirmOpen] = useState(false);
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);
  const [hasContracts, setHasContracts] = useState(false);
  const [checkingContracts, setCheckingContracts] = useState(false);

  const priorityMap = useMemo(
    () => Object.fromEntries(priorityOptions.map(o => [o.name, o.displayName])),
    [priorityOptions]
  );
  const statusMap = useMemo(
    () => Object.fromEntries(statusOptions.map(o => [o.name, o.displayName])),
    [statusOptions]
  );

  const [form, setForm] = useState<HospitalForm>({
    hospitalCode: "",
    name: "",
    address: "",
    contactEmail: "",
    contactNumber: "",
    province: "",
    hisSystemId: undefined,
    hardwareId: undefined,
    hardwareName: "",
    projectStatus: "IN_PROGRESS",
  // Project dates are now managed by BusinessProject (master)
    notes: "",
    apiFile: null,
    apiFileUrl: null,
  priority: "P2",
    personInChargeId: undefined,
    personInChargeName: "",
    maintenancePersonInChargeId: undefined,
    maintenancePersonInChargeName: "",
    maintenanceExpiryDate: "",
  });

  const statusFormSelectOptions = useMemo(() => {
    const base = STATUS_FALLBACK.filter((o) => !STATUS_NAMES_EXCLUDED_FROM_FORM.has(o.name));
    const cur = form.projectStatus;
    if (cur && STATUS_NAMES_EXCLUDED_FROM_FORM.has(cur)) {
      const extra = STATUS_FALLBACK.find((o) => o.name === cur);
      return extra ? [...base, extra] : base;
    }
    return base;
  }, [form.projectStatus]);

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  // Hàm đóng modal chung
  function closeModal() {
    setOpen(false);
    setEditing(null);
    setViewing(null);
    setError(null);
    setIsModalLoading(false);
    setMaintenanceLeadEnabled(false);
  }

  // Hàm điền dữ liệu vào form từ object Hospital
  function fillForm(h: Hospital) {
    setForm({
      hospitalCode: h.hospitalCode ?? "",
      name: h.name ?? "",
      address: h.address ?? "",
      contactEmail: h.contactEmail ?? "",
      contactNumber: h.contactNumber ?? "",
      province: h.province ?? "",
      hisSystemId: h.hisSystemId ?? undefined,
      hardwareId: h.hardwareId ?? undefined,
      hardwareName: h.hardwareName ?? "",
      projectStatus: h.projectStatus ?? "IN_PROGRESS",
  // project dates are managed by BusinessProject
      notes: h.notes ?? "",
      apiFile: null,
      apiFileUrl: (h.apiFileUrl && h.apiFileUrl.trim()) ? h.apiFileUrl : null,
      priority: h.priority ?? "P2",
      // assignedUserIds removed from form; we don't populate it here
      personInChargeId: h.personInChargeId ?? undefined,
      personInChargeName: h.personInChargeName ?? "",
      maintenancePersonInChargeId: h.maintenancePersonInChargeId ?? undefined,
      maintenancePersonInChargeName: h.maintenancePersonInChargeName ?? "",
      maintenanceExpiryDate: maintenanceExpiryToInputValue(h.maintenanceExpiryDate),
    });
    const hasMaintenanceLead =
      (h.maintenancePersonInChargeId != null && Number(h.maintenancePersonInChargeId) > 0) ||
      (typeof h.maintenancePersonInChargeName === "string" && h.maintenancePersonInChargeName.trim().length > 0);
    setMaintenanceLeadEnabled(hasMaintenanceLead);
  }

  // Hardware search for RemoteSelect
  const searchHardwares = useMemo(
    () => async (term: string) => {
      try {
        // ✅ Dùng /api/v1/admin thay vì /api/v1/superadmin để admin thường cũng có thể dùng
        const url = `${API_BASE}/api/v1/admin/hardware/search?search=${encodeURIComponent(term)}`;
        const res = await fetch(url, { headers: { ...authHeader() }, credentials: "include" } as any);
        if (!res.ok) return [];
        const list = await res.json();
        const mapped = Array.isArray(list) ? list.map((x: any) => ({ id: Number(x.id), name: String(x.label ?? x.name ?? x.id) })) : [];
        return mapped.filter((x: any) => Number.isFinite(x.id) && x.name);
      } catch (e) {
        return [];
      }
    },
    []
  );

  const searchItUsers = useMemo(
    () => async (term: string) => {
      try {
        // ✅ Dùng /api/v1/admin thay vì /api/v1/superadmin để admin thường cũng có thể dùng
        const params = new URLSearchParams({
          department: "IT",
        });
        if (term && term.trim()) {
          params.set("name", term.trim()); // admin API dùng "name" thay vì "fullName"
        }
        const res = await fetch(`${API_BASE}/api/v1/admin/users/search?${params.toString()}`, {
          headers: { ...authHeader() },
          credentials: "include",
        } as any);
        if (!res.ok) return [];
        const list = await res.json();
        const array = Array.isArray(list) ? list : [];
        // ✅ Map từ EntitySelectDTO format (id, label, subLabel) sang ITUserOption
        return array
          .map((u: any) => ({
            id: Number(u.id),
            name: String(u.label ?? u.name ?? u.id),
            username: undefined, // admin API không trả về username
            email: u.subLabel ?? null, // subLabel là email trong admin API
            phone: null, // admin API không trả về phone
          }))
          .filter((u: ITUserOption) => Number.isFinite(u.id) && u.name);
      } catch (e) {
        return [];
      }
    },
    []
  );

  const searchMaintenanceUsers = useMemo(
    () => async (term: string) => {
      try {
        // ✅ Dùng /api/v1/admin/users/search với filter department: "IT" giống như "Phụ trách triển khai"
        const params = new URLSearchParams({
          department: "IT",
        });
        if (term && term.trim()) {
          params.set("name", term.trim()); // admin API dùng "name" thay vì "fullName"
        }
        const res = await fetch(`${API_BASE}/api/v1/admin/users/search?${params.toString()}`, {
          headers: { ...authHeader() },
          credentials: "include",
        } as any);
        if (!res.ok) return [];
        const list = await res.json();
        const array = Array.isArray(list) ? list : [];
        // ✅ Map từ EntitySelectDTO format (id, label, subLabel) sang ITUserOption
        return array
          .map((u: any) => ({
            id: Number(u.id),
            name: String(u.label ?? u.name ?? u.id),
            username: undefined, // admin API không trả về username
            email: u.subLabel ?? null, // subLabel là email trong admin API
            phone: null, // admin API không trả về phone
          }))
          .filter((u: ITUserOption) => Number.isFinite(u.id) && u.name);
      } catch (e) {
        return [];
      }
    },
    []
  );

  // Simple RemoteSelect for hardware (local component)
  function RemoteSelectHardware({
    label,
    placeholder,
    fetchOptions,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    placeholder?: string;
    fetchOptions: (q: string) => Promise<Array<{ id: number; name: string }>>;
    value: { id: number; name: string } | null;
    onChange: (v: { id: number; name: string } | null) => void;
    disabled?: boolean;
  }) {
    const [openBox, setOpenBox] = useState(false);
    const [q, setQ] = useState("");
    const [loadingBox, setLoadingBox] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [highlight, setHighlight] = useState(-1);

    useEffect(() => {
      if (!q.trim()) return;
      let alive = true;
      const t = setTimeout(async () => {
        setLoadingBox(true);
        try {
          const res = await fetchOptions(q.trim());
          if (alive) setOptions(res);
        } finally {
          if (alive) setLoadingBox(false);
        }
      }, 250);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }, [q, fetchOptions]);

    useEffect(() => {
      let alive = true;
      if (openBox && options.length === 0 && !q.trim()) {
        (async () => {
          setLoadingBox(true);
          try {
            const res = await fetchOptions("");
            if (alive) setOptions(res);
          } finally {
            if (alive) setLoadingBox(false);
          }
        })();
      }
      return () => { alive = false; };
    }, [openBox]);

    return (
      <div>
        <label className="mb-1 block text-sm font-medium">{label}</label>
        <div className="relative">
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
            placeholder={placeholder || "Nhập để tìm phần cứng..."}
            value={openBox ? q : value?.name || ""}
            onChange={(e) => { setQ(e.target.value); if (!openBox) setOpenBox(true); }}
            onFocus={() => setOpenBox(true)}
            onKeyDown={(e) => {
              if (!openBox) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, options.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (highlight >= 0 && options[highlight]) { onChange(options[highlight]); setOpenBox(false); } }
              else if (e.key === "Escape") { setOpenBox(false); }
            }}
            disabled={disabled}
          />
          {value && !openBox && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => onChange(null)} aria-label="Clear">✕</button>
          )}
          {openBox && (
            <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              {loadingBox && <div className="px-3 py-2 text-sm text-gray-500">Đang tải...</div>}
              {!loadingBox && options.length === 0 && (<div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>)}
              {!loadingBox && options.map((opt, idx) => (
                <div key={opt.id} className={`px-3 py-2 text-sm cursor-pointer ${idx === highlight ? 'bg-gray-100' : ''}`} onMouseEnter={() => setHighlight(idx)} onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpenBox(false); }}>
                  {opt.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function RemoteSelectPersonInCharge({
    label,
    placeholder,
    fetchOptions,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    placeholder?: string;
    fetchOptions: (q: string) => Promise<ITUserOption[]>;
    value: ITUserOption | null;
    onChange: (v: ITUserOption | null) => void;
    disabled?: boolean;
  }) {
    const [openBox, setOpenBox] = useState(false);
    const [q, setQ] = useState("");
    const [loadingBox, setLoadingBox] = useState(false);
    const [options, setOptions] = useState<ITUserOption[]>([]);
    const [highlight, setHighlight] = useState(-1);

    useEffect(() => {
      if (!q.trim()) return;
      let alive = true;
      const t = setTimeout(async () => {
        setLoadingBox(true);
        try {
          const res = await fetchOptions(q.trim());
          if (alive) setOptions(res);
        } finally {
          if (alive) setLoadingBox(false);
        }
      }, 250);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }, [q, fetchOptions]);

    useEffect(() => {
      let alive = true;
      if (openBox && options.length === 0 && !q.trim()) {
        (async () => {
          setLoadingBox(true);
          try {
            const res = await fetchOptions("");
            if (alive) setOptions(res);
          } finally {
            if (alive) setLoadingBox(false);
          }
        })();
      }
      return () => {
        alive = false;
      };
    }, [openBox, fetchOptions, options.length, q]);

    return (
      <div>
        <label className="mb-1 block text-sm font-medium">{label}</label>
        <div className="relative">
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
            placeholder={placeholder || "Chọn người phụ trách..."}
            value={openBox ? q : value?.name || ""}
            onChange={(e) => {
              setQ(e.target.value);
              if (!openBox) setOpenBox(true);
            }}
            onFocus={() => setOpenBox(true)}
            onKeyDown={(e) => {
              if (!openBox) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (highlight >= 0 && options[highlight]) {
                  onChange(options[highlight]);
                  setOpenBox(false);
                }
              } else if (e.key === "Escape") {
                setOpenBox(false);
              }
            }}
            disabled={disabled}
          />
          {value && !openBox && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
              onClick={() => onChange(null)}
              aria-label="Clear"
            >
              ✕
            </button>
          )}
          {openBox && (
            <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {loadingBox && <div className="px-3 py-2 text-sm text-gray-500">Đang tải...</div>}
              {!loadingBox && options.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
              )}
              {!loadingBox &&
                options.slice(0, 7).map((opt, idx) => (
                  <div
                    key={opt.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${idx === highlight ? "bg-gray-100" : ""}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(opt);
                      setOpenBox(false);
                    }}
                  >
                    <div className="font-medium text-gray-800">{opt.name}</div>
                    {opt.phone && (
                      <div className="text-xs text-gray-500">
                        {opt.phone}
                      </div>
                    )}
                  </div>
                ))}
              {!loadingBox && options.length > 7 && (
                <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                  Và {options.length - 7} kết quả khác... (cuộn để xem)
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const [hardwareOpt, setHardwareOpt] = useState<{ id: number; name: string } | null>(null);
  const [personInChargeOpt, setPersonInChargeOpt] = useState<ITUserOption | null>(null);
  const [maintenancePersonInChargeOpt, setMaintenancePersonInChargeOpt] = useState<ITUserOption | null>(null);
  /** When false, maintenance PIC field is hidden and cleared; PUT sends 0 to clear on server. */
  const [maintenanceLeadEnabled, setMaintenanceLeadEnabled] = useState(false);

  const [hisOptions, setHisOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [itUserOptions, setItUserOptions] = useState<ITUserOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        // ✅ Dùng /api/v1/admin thay vì /api/v1/superadmin để admin thường cũng có thể dùng
        const url = `${API_BASE}/api/v1/admin/his?page=0&size=200`;
        const res = await fetch(url, { headers: { ...authHeader() } });
        if (!res.ok) return;
        const data = await res.json();
        // data may be a Spring page or an array
        const list = Array.isArray(data) ? data : (Array.isArray(data.content) ? data.content : []);
        const mapped = list.map((x: any) => ({ id: Number(x.id), name: String(x.name ?? x.label ?? x.id) }));
        if (alive) setHisOptions(mapped.filter((x) => Number.isFinite(x.id)));
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    // when opening modal populate hardwareOpt from form or viewing/editing metadata
    if (!open) return;
    if (form.hardwareId) {
      const name = viewing?.hardwareName ?? editing?.hardwareName ?? form.hardwareName ?? String(form.hardwareId);
      setHardwareOpt({ id: form.hardwareId, name });
    } else {
      setHardwareOpt(null);
    }
  }, [open, form.hardwareId, viewing, editing]);

  useEffect(() => {
    if (!open) {
      setPersonInChargeOpt(null);
      setMaintenancePersonInChargeOpt(null);
      return;
    }
    if (form.personInChargeId) {
      const name =
        viewing?.personInChargeName ??
        editing?.personInChargeName ??
        form.personInChargeName ??
        `#${form.personInChargeId}`;
      const email = viewing?.personInChargeEmail ?? editing?.personInChargeEmail ?? null;
      const phone = viewing?.personInChargePhone ?? editing?.personInChargePhone ?? null;
      setPersonInChargeOpt({
        id: form.personInChargeId,
        name,
        email: email ?? null,
        phone: phone ?? null,
      });
    } else {
      setPersonInChargeOpt(null);
    }
    if (maintenanceLeadEnabled && form.maintenancePersonInChargeId) {
      const name =
        viewing?.maintenancePersonInChargeName ??
        editing?.maintenancePersonInChargeName ??
        form.maintenancePersonInChargeName ??
        `#${form.maintenancePersonInChargeId}`;
      const email = viewing?.maintenancePersonInChargeEmail ?? editing?.maintenancePersonInChargeEmail ?? null;
      const phone = viewing?.maintenancePersonInChargePhone ?? editing?.maintenancePersonInChargePhone ?? null;
      setMaintenancePersonInChargeOpt({
        id: form.maintenancePersonInChargeId,
        name,
        email: email ?? null,
        phone: phone ?? null,
      });
    } else if (
      maintenanceLeadEnabled &&
      !form.maintenancePersonInChargeId &&
      typeof form.maintenancePersonInChargeName === "string" &&
      form.maintenancePersonInChargeName.trim().length > 0
    ) {
      // Hiển thị tên khi API chỉ có tên (dữ liệu cũ); lưu lại cần chọn lại user hợp lệ nếu sửa
      setMaintenancePersonInChargeOpt({
        id: -1,
        name: form.maintenancePersonInChargeName.trim(),
        email: null,
        phone: null,
      });
    } else {
      setMaintenancePersonInChargeOpt(null);
    }
  }, [
    open,
    maintenanceLeadEnabled,
    form.personInChargeId,
    form.personInChargeName,
    form.maintenancePersonInChargeId,
    form.maintenancePersonInChargeName,
    viewing,
    editing,
  ]);

  // Load danh sách IT users cho dropdown filter
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // ✅ Dùng /api/v1/admin thay vì /api/v1/superadmin để admin thường cũng có thể dùng
        const params = new URLSearchParams({
          department: "IT",
        });
        const res = await fetch(`${API_BASE}/api/v1/admin/users/search?${params.toString()}`, {
          headers: { ...authHeader() },
          credentials: "include",
        } as any);
        if (!res.ok) return;
        const list = await res.json();
        const array = Array.isArray(list) ? list : [];
        // ✅ Map từ EntitySelectDTO format (id, label, subLabel) sang ITUserOption
        const mapped = array
          .map((u: any) => ({
            id: Number(u.id),
            name: String(u.label ?? u.name ?? u.id),
            username: undefined, // admin API không trả về username
            email: u.subLabel ?? null, // subLabel là email trong admin API
            phone: null, // admin API không trả về phone
          }))
          .filter((u: ITUserOption) => Number.isFinite(u.id) && u.name);
        if (alive) setItUserOptions(mapped);
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, []);

  // ✅ HÀM GỌI API GET CHI TIẾT
  async function fetchHospitalDetails(id: number): Promise<Hospital | null> {
    setIsModalLoading(true);
    setError(null);
    try {
      // API call: GET /api/v1/auth/hospitals/{hospitalId}
      const res = await fetch(`${BASE}/${id}`, { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET detail failed ${res.status}`);
      const data = await res.json();
      return data as Hospital;
    } catch (e: any) {
      setError(e.message || "Lỗi tải chi tiết bệnh viện");
      console.error("❌ FETCH DETAIL ERROR:", e);
      return null;
    } finally {
      setIsModalLoading(false);
    }
  }

  // ✅ fetchList() - Pagination đúng
  async function fetchList() {
    const start = Date.now();
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl(BASE);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(size));
      
      // Thêm filter params
      if (debouncedQSearch.trim()) url.searchParams.set("keyword", debouncedQSearch.trim());
      if (qProvince.trim()) url.searchParams.set("province", qProvince.trim());
      if (qStatus.trim()) url.searchParams.set("status", qStatus.trim());
      if (qPriority.trim()) url.searchParams.set("priority", qPriority.trim());
      if (qPersonInCharge.trim()) url.searchParams.set("personInChargeId", qPersonInCharge.trim());
      
      // console.log("🔍 Fetching hospitals with filters:", {
      //   name: qName,
      //   province: qProvince,
      //   status: qStatus,
      //   priority: qPriority,
      //   personInCharge: qPersonInCharge,
      //   url: url.toString()
      // });
      
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET failed ${res.status}`);
      const data = await res.json();
      const hospitals = Array.isArray(data.content) ? data.content : (Array.isArray(data) ? data : []);
      // Ensure contractCount is set (from backend or default to 0)
      const hospitalsWithCount = hospitals.map((h: any) => ({
        ...h,
        contractCount: h.contractCount ?? 0,
      }));
      setItems(hospitalsWithCount);
      setTotalElements(data.totalElements ?? hospitals.length ?? 0);
      setTotalPages(data.totalPages ?? Math.ceil((data.totalElements ?? hospitals.length ?? 0) / size));

      // schedule disabling item animation after stagger finishes
      if (enableItemAnimation) {
        const itemCount = hospitals.length;
        const maxDelay = itemCount > 1 ? 2000 + ((itemCount - 2) * 80) : 0;
        const animationDuration = 220;
        const buffer = 120;
        if (animationTimer.current) window.clearTimeout(animationTimer.current);
        animationTimer.current = window.setTimeout(() => setEnableItemAnimation(false), maxDelay + animationDuration + buffer) as unknown as number;
      }

    } catch (e: any) {
      setError(e.message || "Lỗi tải danh sách");
    } finally {
      const elapsed = Date.now() - start;
      if (isInitialLoad) {
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      }
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, size, debouncedQSearch, qProvince, qStatus, qPriority, qPersonInCharge]);

  // Server đã filter rồi, dùng trực tiếp items
  const filtered = items;

  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({
      hospitalCode: "",
      name: "",
      address: "",
      contactEmail: "",
      contactNumber: "",
      province: "",
      hisSystemId: undefined,
      hardwareId: undefined,
      hardwareName: "",
      projectStatus: "IN_PROGRESS",
  // project dates are managed by BusinessProject
      notes: "",
      apiFile: null,
      apiFileUrl: null,
      priority: "P2",
      // assignedUserIds removed from form
      personInChargeId: undefined,
      personInChargeName: "",
      maintenancePersonInChargeId: undefined,
      maintenancePersonInChargeName: "",
      maintenanceExpiryDate: "",
    });
    setMaintenanceLeadEnabled(false);
    setOpen(true);
  }

  async function onView(h: Hospital) {
    setEditing(null);
    setViewing(null);
    setOpen(true);

    const details = await fetchHospitalDetails(h.id);
    if (details) {
      setViewing(details);
      fillForm(details);
    } else {
      setOpen(false); // Đóng modal nếu tải thất bại
    }
  }

  async function onEdit(h: Hospital) {
    setViewing(null);
    setEditing(null);
    setOpen(true);

    const details = await fetchHospitalDetails(h.id);
    if (details) {
      setEditing(details);
      fillForm(details);
    } else {
      setOpen(false); // Đóng modal nếu tải thất bại
    }
  }



  async function onDelete(id: number) {
    if (!canEdit) {
      toast.error("Bạn không có quyền xóa bệnh viện");
      return;
    }

    // Tìm hospital object
    const hospital = items.find(h => h.id === id);
    if (!hospital) {
      toast.error("Không tìm thấy bệnh viện");
      return;
    }

    setHospitalToDelete(hospital);
    setCheckingContracts(true);
    setDeleteConfirmOpen(true);

    // Kiểm tra xem bệnh viện có hợp đồng (BusinessProject) không
    try {
      // ✅ Dùng /api/v1/admin thay vì /api/v1/superadmin để admin thường cũng có thể dùng
      const businessUrl = `${API_BASE}/api/v1/admin/business?search=${encodeURIComponent(hospital.name)}&page=0&size=50`;
      const businessRes = await fetch(businessUrl, {
        headers: { ...authHeader() },
      });
      
      if (businessRes.ok) {
        const businessData = await businessRes.json();
        const businessList = businessData.content || [];
        const foundContracts = businessList.some((bp: any) => 
          bp.hospital && bp.hospital.id === id
        );
        setHasContracts(foundContracts);
      }
    } catch (e) {
      // console.warn("Không thể kiểm tra hợp đồng:", e);
      setHasContracts(false);
    } finally {
      setCheckingContracts(false);
    }
  }

  async function confirmDelete() {
    if (!hospitalToDelete) return;

    setLoading(true);
    try {
      const res = await fetch(`${SUPERADMIN_BASE}/${hospitalToDelete.id}`, {
        method: "DELETE",
        headers: { ...authHeader() },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `DELETE failed ${res.status}`);
      }
      await fetchList();
      // close modal if currently viewing the deleted item
      if (isViewing && viewing?.id === hospitalToDelete.id) closeModal();
      setDeleteConfirmOpen(false);
      setHospitalToDelete(null);
      setHasContracts(false);
      toast.success("Xóa thành công");
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function onViewHistory(h: Hospital) {
    setHistoryHospital(h);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await fetch(`${BASE}/${h.id}/history`, {
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error(`GET history failed ${res.status}`);
      const data = await res.json();
      setHistoryData(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải lịch sử");
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function onViewContracts(h: Hospital) {
    setContractsHospital(h);
    setContractsOpen(true);
    setContractsLoading(true);
    setContractsData(null);
    try {
      const res = await fetch(`${BASE}/${h.id}/contracts`, {
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error(`GET contracts failed ${res.status}`);
      const data = await res.json();
      setContractsData({
        businessContracts: data.businessContracts || [],
        maintainContracts: data.maintainContracts || [],
        totalCount: data.totalCount || 0,
      });
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải danh sách hợp đồng");
      setContractsData({
        businessContracts: [],
        maintainContracts: [],
        totalCount: 0,
      });
    } finally {
      setContractsLoading(false);
    }
  }

  async function onExportHistory(hospitalId: number) {
    try {
      const res = await fetch(`${BASE}/${hospitalId}/history/export`, {
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error(`Export failed ${res.status}`);
      const blob = await res.blob();
      
      // Get filename from Content-Disposition header
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `lịch sử bệnh viện.xlsx`;
      if (contentDisposition) {
        // Try to get filename* first (RFC 5987, supports Unicode)
        const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (filenameStarMatch && filenameStarMatch[1]) {
          try {
            filename = decodeURIComponent(filenameStarMatch[1]);
          } catch (e) {
            // If decode fails, try regular filename
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].replace(/['"]/g, '');
            }
          }
        } else {
          // Fallback to regular filename
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            // Try to decode if it looks encoded
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // Keep original if decode fails
            }
          }
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Xuất Excel thành công");
    } catch (e: any) {
      toast.error(e?.message || "Xuất Excel thất bại");
    }
  }

  /** Persist hospital (POST/PUT). Called after validations; closes save confirm in finally. */
  async function performHospitalSave() {
    setLoading(true);
    setError(null);

    try {
      const nameValue = form.name.trim();

      const payload: any = {
        hospitalCode: form.hospitalCode?.trim() || undefined,
        name: nameValue,
        address: form.address?.trim() || undefined,
        contactEmail: form.contactEmail?.trim() || undefined,
        contactNumber: form.contactNumber?.trim() || undefined,
        province: form.province?.trim() || undefined,
        hisSystemId: form.hisSystemId ?? undefined,
        projectStatus: form.projectStatus,
        notes: form.notes?.trim() || undefined,
        apiFile: form.apiFile || undefined,
        priority: form.priority,
        personInChargeId: form.personInChargeId ?? undefined,
        maintenancePersonInChargeId: maintenanceLeadEnabled
          ? typeof form.maintenancePersonInChargeId === "number" && form.maintenancePersonInChargeId > 0
            ? form.maintenancePersonInChargeId
            : undefined
          : isEditing
            ? 0
            : undefined,
        ...(isEditing
          ? { maintenanceExpiryDate: (form.maintenanceExpiryDate ?? "").trim() }
          : (form.maintenanceExpiryDate ?? "").trim()
            ? { maintenanceExpiryDate: (form.maintenanceExpiryDate ?? "").trim() }
            : {}),
      };

      const method = isEditing ? "PUT" : "POST";
      const url = isEditing ? `${SUPERADMIN_BASE}/${editing!.id}` : SUPERADMIN_BASE;

      const formData = toFormData(payload);

      const res = await fetch(url, {
        method,
        headers: { ...authHeader() },
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${method} failed ${res.status}: ${txt}`);
      }

      closeModal();
      if (!isEditing) {
        setPage(0);
      }
      await fetchList();
      toast.success(isEditing ? "Cập nhật thành công" : "Tạo thành công");
    } catch (e: any) {
      setError(e.message || "Lưu thất bại");
      toast.error(e?.message || "Lưu thất bại");
    } finally {
      setLoading(false);
      setHospitalSaveConfirmOpen(false);
    }
  }

  // ✅ onSubmit — with in-app confirm when "Chuyển sang bảo trì" is enabled
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên bệnh viện không được để trống");
      return;
    }
    const hasMaintenancePicData =
      (form.maintenancePersonInChargeId != null && Number(form.maintenancePersonInChargeId) > 0) ||
      (typeof form.maintenancePersonInChargeName === "string" && form.maintenancePersonInChargeName.trim().length > 0);
    if (maintenanceLeadEnabled && !hasMaintenancePicData) {
      const msg = "Vui lòng chọn người phụ trách bảo trì hoặc bỏ tích \"Chuyển sang bảo trì\".";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (maintenanceLeadEnabled && form.projectStatus !== "COMPLETED") {
      const msg =
        "Chỉ khi trạng thái dự án là «Hoàn thành» mới được chuyển sang bảo trì. Vui lòng cập nhật trạng thái dự án hoặc bỏ tích.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (isViewing) return;
    if (!canEdit) {
      setError("Bạn không có quyền thực hiện thao tác này");
      return;
    }

    if (maintenanceLeadEnabled) {
      setHospitalSaveConfirmOpen(true);
      return;
    }

    await performHospitalSave();
  }

  // ✅ Pagination logic

  // Component Filter Province với search và scroll
  function FilterProvinceSelect({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) {
    const [openBox, setOpenBox] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlight, setHighlight] = useState(-1);
    const inputRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) return VIETNAM_PROVINCES;
      const q = searchQuery.toLowerCase().trim();
      return VIETNAM_PROVINCES.filter((province) =>
        province.toLowerCase().includes(q) ||
        province.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
      );
    }, [searchQuery]);

    const displayOptions = filteredOptions.slice(0, 10);
    const hasMore = filteredOptions.length > 10;

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          setOpenBox(false);
          setSearchQuery("");
        }
      };
      if (openBox) {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [openBox]);

    return (
      <div className="relative min-w-[200px]">
        <div
          ref={inputRef}
          className={`rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm cursor-pointer focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF] ${disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : ""}`}
          onClick={() => {
            if (!disabled) setOpenBox(!openBox);
          }}
        >
          {openBox ? (
            <input
              type="text"
              className="w-full outline-none bg-transparent"
              placeholder={placeholder || "Tìm kiếm tỉnh/thành..."}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlight(-1);
              }}
              onKeyDown={(e) => {
                const totalOptions = displayOptions.length + 1; // +1 for "Tất cả"
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, totalOptions - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (highlight === 0) {
                    onChange("");
                    setOpenBox(false);
                    setSearchQuery("");
                  } else if (highlight > 0 && highlight <= displayOptions.length) {
                    onChange(displayOptions[highlight - 1]);
                    setOpenBox(false);
                    setSearchQuery("");
                  } else if (highlight > displayOptions.length) {
                    const remainingOptions = filteredOptions.slice(10);
                    const selectedOption = remainingOptions[highlight - displayOptions.length - 1];
                    if (selectedOption) {
                      onChange(selectedOption);
                      setOpenBox(false);
                      setSearchQuery("");
                    }
                  }
                } else if (e.key === "Escape") {
                  setOpenBox(false);
                  setSearchQuery("");
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between">
              <span className={value ? "text-gray-900" : "text-gray-500"}>
                {value || placeholder || "Tất cả tỉnh/thành"}
              </span>
              <svg className={`w-4 h-4 transition-transform ${openBox ? 'rotate-180' : ''} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
        {openBox && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg"
            style={{ maxHeight: "300px", overflowY: "auto" }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
            ) : (
              <>
                {/* Option "Tất cả" */}
                <div
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
                    !value ? "bg-blue-50" : ""
                  } ${highlight === 0 ? "bg-gray-100" : ""}`}
                  onMouseEnter={() => setHighlight(0)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("");
                    setOpenBox(false);
                    setSearchQuery("");
                  }}
                >
                  <div className="font-medium text-gray-800">Tất cả tỉnh/thành</div>
                </div>
                {displayOptions.map((province, idx) => (
                  <div
                    key={province}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                      idx + 1 === highlight ? "bg-gray-100" : ""
                    } ${province === value ? "bg-blue-50" : ""}`}
                    onMouseEnter={() => setHighlight(idx + 1)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(province);
                      setOpenBox(false);
                      setSearchQuery("");
                    }}
                  >
                    <div className="font-medium text-gray-800">{province}</div>
                  </div>
                ))}
                {hasMore && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                    Và {filteredOptions.length - 10} kết quả khác... (cuộn để xem)
                  </div>
                )}
                {filteredOptions.length > 10 &&
                  filteredOptions.slice(10).map((province, idx) => {
                    const actualIndex = idx + 11; // 0 = "Tất cả", 1-10 = displayOptions, 11+ = remaining
                    return (
                      <div
                        key={province}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                          actualIndex === highlight ? "bg-gray-100" : ""
                        } ${province === value ? "bg-blue-50" : ""}`}
                        onMouseEnter={() => setHighlight(actualIndex)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChange(province);
                          setOpenBox(false);
                          setSearchQuery("");
                        }}
                      >
                        <div className="font-medium text-gray-800">{province}</div>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Component Filter Person In Charge với search và scroll
  function FilterPersonInChargeSelect({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: ITUserOption[];
  }) {
    const [openBox, setOpenBox] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlight, setHighlight] = useState(-1);
    const inputRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) return options;
      const q = searchQuery.toLowerCase().trim();
      return options.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.phone?.includes(q)
      );
    }, [options, searchQuery]);

    const displayOptions = filteredOptions.slice(0, 7);
    const hasMore = filteredOptions.length > 7;
    const selectedUser = options.find((u) => String(u.id) === value);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          setOpenBox(false);
          setSearchQuery("");
        }
      };
      if (openBox) {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [openBox]);

    return (
      <div className="relative min-w-[200px]">
        <div
          ref={inputRef}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm cursor-pointer focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF]"
          onClick={() => {
            setOpenBox(!openBox);
          }}
        >
          {openBox ? (
            <input
              type="text"
              className="w-full outline-none bg-transparent"
              placeholder="Tìm kiếm người phụ trách..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlight(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, displayOptions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (highlight >= 0 && displayOptions[highlight]) {
                    onChange(String(displayOptions[highlight].id));
                    setOpenBox(false);
                    setSearchQuery("");
                  }
                } else if (e.key === "Escape") {
                  setOpenBox(false);
                  setSearchQuery("");
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <div className="flex items-center justify-between">
              <span className={value ? "text-gray-900" : "text-gray-500"}>
                {selectedUser ? selectedUser.name : "Tất cả người phụ trách"}
              </span>
              <svg className={`w-4 h-4 transition-transform ${openBox ? 'rotate-180' : ''} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
        {openBox && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg"
            style={{ maxHeight: "200px", overflowY: "auto" }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
            ) : (
              <>
                {/* Option "Tất cả" */}
                <div
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
                    !value ? "bg-blue-50" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("");
                    setOpenBox(false);
                    setSearchQuery("");
                  }}
                >
                  <div className="font-medium text-gray-800">Tất cả người phụ trách</div>
                </div>
                {displayOptions.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                      idx === highlight ? "bg-gray-100" : ""
                    } ${String(opt.id) === value ? "bg-blue-50" : ""}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(String(opt.id));
                      setOpenBox(false);
                      setSearchQuery("");
                    }}
                  >
                    <div className="font-medium text-gray-800">{opt.name}</div>
                    {opt.phone && (
                      <div className="text-xs text-gray-500">
                        {opt.phone}
                      </div>
                    )}
                  </div>
                ))}
                {hasMore && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                    Và {filteredOptions.length - 7} kết quả khác... (cuộn để xem)
                  </div>
                )}
                {filteredOptions.length > 7 &&
                  filteredOptions.slice(7).map((opt, idx) => (
                    <div
                      key={opt.id}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                        idx + 7 === highlight ? "bg-gray-100" : ""
                      } ${String(opt.id) === value ? "bg-blue-50" : ""}`}
                      onMouseEnter={() => setHighlight(idx + 7)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onChange(String(opt.id));
                        setOpenBox(false);
                        setSearchQuery("");
                      }}
                    >
                      <div className="font-medium text-gray-800">{opt.name}</div>
                      {opt.phone && (
                        <div className="text-xs text-gray-500">
                          {opt.phone}
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Quản lý công việc | TAGTECH"
        description="Quản lý bệnh viện: danh sách, tìm kiếm, tạo, sửa, xóa"
      />

      <div className="space-y-10">
        {/* Filters & Actions */}
        <ComponentCard title="Tìm kiếm & Thao tác">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="min-w-[260px] rounded-full border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm"
              placeholder="Tìm theo tên hoặc mã bệnh viện"
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
            />
            <FilterProvinceSelect
              value={qProvince}
              onChange={setQProvince}
              placeholder="Tất cả tỉnh/thành"
            />
            <select 
              className="rounded-lg border px-3 py-2 text-sm border-gray-300 bg-white min-w-[180px]" 
              value={qStatus} 
              onChange={(e) => setQStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {statusOptions.map((s) => (
                <option key={s.name} value={s.name}>{s.displayName}</option>
              ))}
            </select>
            <select 
              className="rounded-lg border px-3 py-2 text-sm border-gray-300 bg-white min-w-[180px]" 
              value={qPriority} 
              onChange={(e) => setQPriority(e.target.value)}
            >
              <option value="">Tất cả độ ưu tiên</option>
              {priorityOptions.map((p) => (
                <option key={p.name} value={p.name}>{p.displayName}</option>
              ))}
            </select>
            <FilterPersonInChargeSelect
              value={qPersonInCharge}
              onChange={setQPersonInCharge}
              options={itUserOptions}
            />
            <button
              type="button"
              onClick={() => {
                setQSearch("");
                setQProvince("");
                setQStatus("");
                setQPriority("");
                setQPersonInCharge("");
              }}
              className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
            >
              Bỏ lọc
            </button>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">Tổng: <span className="font-semibold text-blue-800">{totalElements}</span></p>
            <div className="flex items-center gap-3">
              {canEdit && (
                <button className={`rounded-xl border border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-600 hover:shadow-md`} onClick={onCreate}> + Thêm bệnh viện</button>
              )}
            </div>
          </div>
        </ComponentCard>

        {/* Card list (replaces table) */}
        <ComponentCard title="Danh sách bệnh viện">
          {/* inline keyframes for fade-in-up used by cards */}
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div className="space-y-4">
            {filtered.map((h, idx) => {
              const delayMs = enableItemAnimation ? Math.round(idx * (2000 / Math.max(1, filtered.length))) : 0;
              const leftIndex = h.hospitalCode ? h.hospitalCode : String(page * size + idx + 1).padStart(3, "0");
              // detect first URL in notes (basic)
              const apiMatch = h.notes ? (h.notes.match(/https?:\/\/[^\s)]+/i) ?? null) : null;
              const apiUrl = apiMatch ? apiMatch[0] : null;
              const showApiPill = !!apiUrl || (h.notes && /API/i.test(h.notes));
              const maintBadge = getHospitalMaintenanceExpiryBadge(h);
              const effKey = effectiveHospitalProjectStatusKey(h);

              return (
                <div key={h.id} className="flex items-start gap-4" style={{ animation: `fadeInUp 600ms ease ${delayMs}ms both` }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onView(h)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onView(h);
                      }
                    }}
                    className="group w-full bg-white rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 group-hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 hover:border-blue-100 cursor-pointer relative"
                  >
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewContracts(h);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                        title="Xem danh sách hợp đồng"
                      >
                        <span>{h.contractCount ?? 0}</span>
                        <span>hợp đồng</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewHistory(h);
                        }}
                        title="Lịch sử"
                        aria-label={`Lịch sử ${h.name}`}
                        className="text-gray-600 hover:text-black transition"
                      >
                        <RiHistoryLine className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex items-start gap-4 w-full md:w-2/3">
                      {/* moved: badge + small icon box inside the card */}
                      <div className="flex-shrink-0 mt-0 flex items-center gap-2">
                        {/* Larger badge that includes project status/priority dots to avoid overflow */}
                        <div className="w-14 h-14 rounded-md bg-white border border-gray-100 flex flex-col items-center justify-center text-sm font-semibold text-gray-700 shadow-sm relative">
                          <span className="text-[10px] font-bold">{leftIndex}</span>
                          <div className="absolute -top-1 -right-1 flex space-x-1">
                            <span className={`${maintBadge ? maintBadge.dotBgClass : getStatusBg(effKey)} w-3 h-3 rounded-full border-2 border-white`} />
                            <span className={`${getPriorityBg(h.priority)} w-3 h-3 rounded-full border-2 border-white`} />
                          </div>
                        </div>
                      </div>

                      {/* hospital icon removed intentionally to avoid visual overflow */}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h4
                            title={h.name}
                            className="text-lg font-semibold text-blue-800 group-hover:text-blue-800 break-words whitespace-normal"
                          >
                            {h.name}
                          </h4>
                          {showApiPill && (
                            <a
                              href={apiUrl ?? '#'}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center ml-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-50"
                            >
                              Kiểm tra API
                            </a>
                          )}
                          <span className="ml-2 inline-flex items-center">
                            {maintBadge ? (
                              <span
                                className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${maintBadge.pillTextClass} ${maintBadge.pillBgClass}`}
                              >
                                {maintBadge.label}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(effKey)} bg-gray-50`}
                              >
                                {disp(statusMap, effKey)}
                              </span>
                            )}
                            <span className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(h.priority)} bg-gray-50 ml-2`}>{disp(priorityMap, h.priority)}</span>
                          </span>
                        </div>

                        {/* important summary: address, contact, project, HIS, bank */}
                        <div className="mt-2 text-sm text-gray-700">
                          <div className="truncate">{h.address || "—"}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Phụ trách triển khai:</span>
                              <span className="font-medium text-gray-800">{h.personInChargeName || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Phụ trách bảo trì:</span>
                              <span className="font-medium text-gray-800">{h.maintenancePersonInChargeName || "—"}</span>
                            </div>
                            {h.contactNumber && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">•</span>
                                <span className="text-sm text-gray-600">SĐT liên hệ viện: {h.contactNumber}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 text-sm text-gray-700">
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                              <div>
                                <span className="text-xs text-gray-400">Đơn vị HIS:</span>
                                <span className="font-medium text-orange-600 ml-2">{h.hisSystemName || '—'}</span>
                              </div>
                              {h.hardwareName && (
                                <div>
                                  <span className="text-xs text-gray-400">Phần cứng:</span>
                                  <span className="font-medium text-gray-800 ml-2">{h.hardwareName}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {apiUrl && (
                            <div className="mt-2 text-sm">
                              <span className="text-xs text-orange-500 font-medium">API: </span>
                              <a
                                href={apiUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-orange-600 underline text-sm truncate block max-w-full"
                              >
                                {apiUrl}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end w-full md:w-1/3">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onView(h); }} title="Xem" aria-label={`Xem ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-blue-100 text-blue-700 hover:bg-blue-50 transition transform text-xs font-medium">
                          <AiOutlineEye className="w-4 h-4" />
                          <span className="hidden sm:inline">Xem</span>
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); onEdit(h); }} title="Sửa" aria-label={`Sửa ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-amber-100 text-amber-700 hover:bg-amber-50 transition transform text-xs font-medium">
                              <AiOutlineEdit className="w-4 h-4" />
                              <span className="hidden sm:inline">Sửa</span>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(h.id); }} title="Xóa" aria-label={`Xóa ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-red-100 text-red-700 hover:bg-red-50 transition transform text-xs font-medium">
                              <AiOutlineDelete className="w-4 h-4" />
                              <span className="hidden sm:inline">Xóa</span>
                            </button>
                          </>
                        )}
                      </div>
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

          {loading && (
            <div className="mt-3 text-sm text-gray-500">Đang tải...</div>
          )}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </ComponentCard>
      </div>

      {/* Detail Modal - chỉ hiển thị khi isViewing */}
      <AnimatePresence mode="wait">
        {open && isViewing && viewing && (
          <DetailModal
            key={viewing.id}
            open={open && isViewing}
            onClose={closeModal}
            item={viewing}
            statusMap={statusMap}
            priorityMap={priorityMap}
          />
        )}
      </AnimatePresence>

      {/* Form Modal - chỉ hiển thị khi không phải viewing */}
      {open && !isViewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-white rounded-t-3xl px-8 pt-8 pb-4 border-b border-gray-200">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">
                  {isEditing ? "Cập nhật bệnh viện" : "Thêm bệnh viện"}
                </h3>
                <button className="rounded-xl p-2 transition-all hover:bg-gray-100 hover:scale-105" onClick={closeModal}>
                  {/* <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg> */}
                </button>
              </div>
            </div>
            {/* Scrollable Content */}

            <div className="overflow-y-auto px-8 pb-8 [&::-webkit-scrollbar]:hidden mt-6  " style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>


            {isModalLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <svg className="mb-4 h-12 w-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Đang tải chi tiết...</span>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* LEFT */}
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Mã bệnh viện</label>
                    <input
                      className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
                      value={form.hospitalCode || ""}
                      onChange={(e) => setForm((s) => ({ ...s, hospitalCode: e.target.value }))}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Tên bệnh viện*</label>
                    <input
                      required
                      type="text"
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
                      value={form.name}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((s) => ({ ...s, name: value }));
                      }}
                      onBlur={(e) => {
                        // Đảm bảo giá trị không bị thay đổi sau khi blur
                        const value = e.target.value;
                        if (form.name !== value) {
                          setForm((s) => ({ ...s, name: value }));
                        }
                      }}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Địa chỉ</label>
                    <input
                      className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
                      value={form.address || ""}
                      onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Tỉnh/Thành</label>
                      <FilterProvinceSelect
                        value={form.province || ""}
                        onChange={(v) => setForm((s) => ({ ...s, province: v }))}
                        placeholder="(không bắt buộc)"
                        disabled={isViewing || !canEdit}
                      />
                    </div>
                    <div className="hidden md:block" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm">SĐT liên hệ viện</label>
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                        value={form.contactNumber || ""}
                        onChange={(e) => setForm((s) => ({ ...s, contactNumber: e.target.value }))}
                        disabled={isViewing || !canEdit}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm">Email người phụ trách</label>
                      <input
                        type="email"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                        value={form.contactEmail || ""}
                        onChange={(e) => setForm((s) => ({ ...s, contactEmail: e.target.value }))}
                        disabled={isViewing || !canEdit}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <RemoteSelectPersonInCharge
                      label="Phụ trách triển khai"
                      placeholder="Chọn người phụ trách..."
                      fetchOptions={searchItUsers}
                      value={personInChargeOpt}
                      onChange={(v) => {
                        setPersonInChargeOpt(v);
                        setForm((s) => ({
                          ...s,
                          personInChargeId: v ? v.id : undefined,
                          personInChargeName: v ? v.name : "",
                        }));
                      }}
                      disabled={isViewing || !canEdit}
                    />
                    <div>
                      <label className="mb-1 block text-sm font-medium">Đơn vị HIS</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                        value={form.hisSystemId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((s) => ({ ...s, hisSystemId: v === "" ? undefined : Number(v) }));
                        }}
                        disabled={isViewing || !canEdit}
                      >
                        <option value="">(không bắt buộc)</option>
                        {(hisOptions || []).map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-gray-800 dark:text-gray-100">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                        checked={maintenanceLeadEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            if (form.projectStatus !== "COMPLETED") {
                              toast.error(
                                "Yêu cầu chuyển 'Trạng thái dự án' thành HOÀN THÀNH trước khi bật chuyển sang bảo trì.",
                              );
                              return;
                            }
                            setMaintenanceSwitchConfirmOpen(true);
                            return;
                          }
                          setMaintenanceLeadEnabled(false);
                          setMaintenancePersonInChargeOpt(null);
                          setForm((s) => ({
                            ...s,
                            maintenancePersonInChargeId: undefined,
                            maintenancePersonInChargeName: "",
                          }));
                        }}
                        disabled={isViewing || !canEdit}
                      />
                      <span>Chuyển sang bảo trì</span>
                    </label>
                    {!isViewing && form.projectStatus !== "COMPLETED" && (
                      <p className="text-xs text-amber-800 dark:text-amber-200/90">
                        Yêu cầu chuyển "Trạng thái dự án" thành HOÀN THÀNH trước khi bật chuyển sang bảo trì.
                      </p>
                    )}
                    {maintenanceLeadEnabled && (
                      <>
                        <RemoteSelectPersonInCharge
                          label="Phụ trách bảo trì"
                          placeholder="Chọn người phụ trách bảo trì..."
                          fetchOptions={searchMaintenanceUsers}
                          value={maintenancePersonInChargeOpt}
                          onChange={(v) => {
                            setMaintenancePersonInChargeOpt(v);
                            setForm((s) => ({
                              ...s,
                              maintenancePersonInChargeId: v ? v.id : undefined,
                              maintenancePersonInChargeName: v ? v.name : "",
                            }));
                          }}
                          disabled={isViewing || !canEdit}
                        />
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-700">
                            Hạn bảo trì{" "}
                            <span className="font-normal text-gray-500 dark:text-gray-400">(không bắt buộc)</span>
                          </label>
                          <HospitalMaintenanceExpiryDateInput
                            value={form.maintenanceExpiryDate ?? ""}
                            onChange={(isoYmd) =>
                              setForm((s) => ({ ...s, maintenanceExpiryDate: isoYmd }))
                            }
                            disabled={isViewing || !canEdit}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Hardware selector - Đã bỏ: Phần cứng sẽ được lấy từ hợp đồng (BusinessProject) */}
                  {/* <div className="mt-2">
                    <RemoteSelectHardware
                      label="Phần cứng"
                      placeholder="Tìm phần cứng..."
                      fetchOptions={searchHardwares}
                      value={hardwareOpt}
                      onChange={(v) => { setHardwareOpt(v); setForm((s) => ({ ...s, hardwareId: v ? v.id : undefined, hardwareName: v ? v.name : "" })); }}
                      disabled={isViewing || !canEdit}
                    />
                  </div> */}
                </div>

                {/* RIGHT */}
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">File API bệnh viện</label>
                    
                    {/* Hiển thị file API hiện tại hoặc file mới chọn */}
                    {(form.apiFileUrl || form.apiFile) && (
                      <div className="mb-3 p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
                        {form.apiFile ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <FiFile className="w-6 h-6 text-blue-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-800 truncate">{form.apiFile.name}</p>
                                <p className="text-xs text-blue-600">
                                  {(form.apiFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((s) => ({ ...s, apiFile: null }));
                              }}
                              className="ml-3 text-red-500 hover:text-red-700 transition-colors"
                              title="Xóa file đã chọn"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : form.apiFileUrl ? (
                          <div className="flex items-center gap-3">
                            <FiFile className="w-6 h-6 text-blue-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => editing?.id && downloadHospitalApiFile(editing.id, form.apiFileUrl)}
                                className="text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                <FiDownload className="w-4 h-4" />
                                Tải file API hiện tại
                              </button>
                              <p className="text-xs text-gray-600 mt-1 break-all">
                                {form.apiFileUrl.startsWith('http') ? form.apiFileUrl : 'File được lưu trên server (bảo mật)'}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* File input với giao diện đẹp và drag & drop */}
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf,.zip,.json,.doc,.docx,.txt,.xlsx,.xls"
                        id="hospital-api-file-input"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 50 * 1024 * 1024) {
                              toast.error("File API không được vượt quá 50MB");
                              return;
                            }
                            setForm((s) => ({ ...s, apiFile: file }));
                          }
                        }}
                        disabled={isViewing || !canEdit}
                      />
                      <label
                        htmlFor="hospital-api-file-input"
                        onDragEnter={(e) => {
                          if (!isViewing && canEdit) {
                            e.preventDefault();
                            setIsDragging(true);
                          }
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                        }}
                        onDragOver={(e) => {
                          if (!isViewing && canEdit) {
                            e.preventDefault();
                          }
                        }}
                        onDrop={(e) => {
                          if (!isViewing && canEdit) {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files[0];
                            if (file) {
                              const allowedTypes = ['.pdf', '.zip', '.json', '.doc', '.docx', '.txt', '.xlsx', '.xls'];
                              const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
                              if (!allowedTypes.includes(fileExtension)) {
                                toast.error("Vui lòng chọn file hợp lệ (PDF, ZIP, JSON, DOC, DOCX, TXT, XLSX, XLS)");
                                return;
                              }
                              if (file.size > 50 * 1024 * 1024) {
                                toast.error("File API không được vượt quá 50MB");
                                return;
                              }
                              setForm((s) => ({ ...s, apiFile: file }));
                            }
                          }
                        }}
                        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                          isViewing || !canEdit
                            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                            : isDragging
                            ? 'border-blue-500 bg-blue-50 scale-105'
                            : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <FiFile className={`w-10 h-10 mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click để chọn file API</span> hoặc kéo thả vào đây
                          </p>
                          <p className="text-xs text-gray-500">PDF, ZIP, JSON, DOC, DOCX, TXT, XLSX, XLS (MAX. 50MB)</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium leading-tight">Ưu tiên*</label>
                    <select
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                      value={form.priority}
                      onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}
                      disabled={isViewing || !canEdit}
                    >
                      {priorityOptions.map((p) => (
                        <option key={p.name} value={p.name}>{p.displayName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Trạng thái dự án*</label>
                    <select
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                      value={form.projectStatus}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v !== "COMPLETED" && maintenanceLeadEnabled) {
                          setMaintenanceLeadEnabled(false);
                          setMaintenancePersonInChargeOpt(null);
                          setForm((s) => ({
                            ...s,
                            projectStatus: v,
                            maintenancePersonInChargeId: undefined,
                            maintenancePersonInChargeName: "",
                          }));
                          toast("Đã tắt «Chuyển sang bảo trì» vì trạng thái dự án không còn Hoàn thành.", {
                            duration: 4500,
                          });
                          return;
                        }
                        setForm((s) => ({ ...s, projectStatus: v }));
                      }}
                      disabled={isViewing || !canEdit}
                    >
                      {statusFormSelectOptions.map((s) => (
                        <option key={s.name} value={s.name}>{s.displayName}</option>
                      ))}
                    </select>
                  </div>

                        {/* Project dates are managed on BusinessProject now; inputs removed from Hospital form */}

                  <div>
                    <label className="mb-1 block text-sm">Ghi chú</label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4693FF] disabled:bg-gray-50"
                      rows={3}
                      value={form.notes || ""}
                      onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                </div>

                {/* Footer */}
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
                      onClick={closeModal}
                    >
                      Huỷ
                    </button>
                    {canEdit && ( // Chỉ hiện nút Lưu/Cập nhật cho SuperAdmin
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
        </div>
      )}

      {/* History Modal */}
      {historyOpen && historyHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHistoryOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white rounded-t-3xl px-8 pt-8 pb-4 border-b border-gray-200">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 flex items-start gap-3">
                  <FiClock className="w-6 h-6 text-gray-600 mt-1" />
                  <span className="flex flex-col leading-tight">
                    <span>Lịch sử hoạt động</span>
                    <span className="text-base font-semibold text-blue-600 mt-1 break-words">{historyHospital.name}</span>
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onExportHistory(historyHospital.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition text-sm font-medium"
                  >
                    <FiDownload className="w-4 h-4" />
                    Xuất Excel
                  </button>
                  
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-8 pb-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <svg className="mb-4 h-12 w-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Đang tải lịch sử...</span>
                </div>
              ) : historyData.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <FiClock className="mx-auto h-12 w-12 mb-3 text-gray-300" />
                  <span className="text-sm">Chưa có lịch sử</span>
                </div>
              ) : (
                <div className="space-y-4 mt-6">
                  {historyData.map((item, idx) => {
                    const getEventTypeLabel = (type: string) => {
                      const map: Record<string, string> = {
                        "HOSPITAL_CREATED": "Tạo bệnh viện",
                        "HOSPITAL_UPDATED": "Cập nhật bệnh viện",
                        "HOSPITAL_DELETED": "Xóa bệnh viện",
                        "BUSINESS_CREATED": "Tạo hồ sơ kinh doanh",
                        "BUSINESS_STATUS_CHANGED": "Thay đổi trạng thái kinh doanh",
                        "IMPLEMENTATION_CREATED": "Tạo công việc triển khai",
                        "IMPLEMENTATION_TASK_ACCEPTED": "Triển khai tiếp nhận công việc",
                        "IMPLEMENTATION_STATUS_CHANGED": "Thay đổi trạng thái triển khai",
                        "IMPLEMENTATION_TRANSFERRED_TO_MAINTENANCE": "Triển khai chuyển sang bảo trì",
                        "MAINTENANCE_ACCEPTED_HOSPITAL": "Bảo trì tiếp nhận bệnh viện",
                        "MAINTENANCE_TASK_CREATED": "Bảo trì tạo công việc",
                        "MAINTENANCE_TASK_STATUS_CHANGED": "Thay đổi trạng thái bảo trì",
                        "WARRANTY_CONTRACT_CREATED": "Tạo hợp đồng bảo trì",
                        "WARRANTY_CONTRACT_UPDATED": "Cập nhật hợp đồng bảo trì",
                        "WARRANTY_CONTRACT_DELETED": "Xóa hợp đồng bảo trì",
                      };
                      return map[type] || type;
                    };

                    const getEventTypeColor = (type: string) => {
                      if (type.includes("CREATED")) return "bg-blue-100 text-blue-800";
                      if (type.includes("UPDATED") || type.includes("STATUS_CHANGED")) return "bg-yellow-100 text-yellow-800";
                      if (type.includes("ACCEPTED") || type.includes("ACCEPT")) return "bg-green-100 text-green-800";
                      if (type.includes("TRANSFERRED") || type.includes("TRANSFER")) return "bg-purple-100 text-purple-800";
                      if (type.includes("DELETED")) return "bg-red-100 text-red-800";
                      return "bg-gray-100 text-gray-800";
                    };

                    return (
                      <div key={idx} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getEventTypeColor(item.eventType)}`}>
                                {getEventTypeLabel(item.eventType)}
                              </span>
                              <span className="text-sm text-gray-500">
                                {item.eventDate ? new Date(item.eventDate).toLocaleString("vi-VN") : "—"}
                              </span>
                            </div>
                            <h4 className="font-semibold text-blue-800 mb-1">{item.description.replace(/task/gi, 'công việc')}</h4>
                            {item.performedBy && (
                              <p className="text-sm text-gray-600 mb-2">
                                Người thực hiện: <span className="font-medium">{item.performedBy}</span>
                              </p>
                            )}
                            {item.details && (() => {
                              // Mapping giá trị enum sang tiếng Việt
                              const formatValue = (value: string): string => {
                                if (!value || value.trim() === "—" || value.trim() === "null") return "—";
                                const trimmed = value.trim();
                                
                                // Priority mapping
                                const priorityMap: Record<string, string> = {
                                  "P0": "Rất Khẩn cấp",
                                  "P1": "Khẩn cấp",
                                  "P2": "Quan trọng",
                                  "P3": "Thường xuyên",
                                  "P4": "Thấp",
                                };
                                
                                // Status mapping
                                const statusMap: Record<string, string> = {
                                  "IN_PROGRESS": "Đang thực hiện",
                                  "COMPLETED": "Hoàn thành",
                                  "ISSUE": "Gặp sự cố",
                                  "CARING": "Đang chăm sóc",
                                  "CONTRACTED": "Ký hợp đồng",
                                  "CANCELLED": "Hủy",
                                };
                                
                                // Kiểm tra priority
                                if (priorityMap[trimmed]) {
                                  return priorityMap[trimmed];
                                }
                                
                                // Kiểm tra status
                                if (statusMap[trimmed]) {
                                  return statusMap[trimmed];
                                }
                                
                                return trimmed;
                              };

                              // Helper function để loại bỏ Task ID
                              const removeTaskId = (text: string): string => {
                                // Loại bỏ "Task ID: xxx" hoặc "task id: xxx" với các dấu phân cách
                                return text
                                  .replace(/\s*Task\s+ID\s*:\s*\d+\s*/gi, '')
                                  .replace(/\s*Công\s+việc\s+ID\s*:\s*\d+\s*/gi, '')
                                  .replace(/\s*\|\s*Task\s+ID\s*:\s*\d+\s*/gi, '')
                                  .replace(/\s*Task\s+ID\s*:\s*\d+\s*\|\s*/gi, '')
                                  .replace(/^\s*\|\s*/, '')
                                  .replace(/\s*\|\s*$/, '')
                                  .trim();
                              };

                              // Tạo helper function để format details
                              const formatDetails = (detailsText: string) => {
                                if (!detailsText) return null;
                                
                                const result: React.ReactNode[] = [];
                                
                                // Loại bỏ Task ID trước khi xử lý
                                let cleanedText = detailsText
                                  .replace(/\n/g, ' ')
                                  .replace(/\s+/g, ' ')
                                  .trim();
                                
                                // Loại bỏ Task ID
                                cleanedText = removeTaskId(cleanedText);
                                
                                if (!cleanedText) return null;
                                
                                // Tách theo dấu pipe HOẶC dấu phẩy (nhưng chỉ khi sau dấu phẩy KHÔNG phải là số)
                                // Điều này tránh tách dấu phẩy trong số tiền như "20,000,000 VNĐ"
                                const separatorPattern = /\||,(?!\d)/;
                                const parts = cleanedText
                                  .split(separatorPattern)
                                  .map(p => p.trim())
                                  .filter(p => {
                                    // Loại bỏ các phần chỉ chứa Task ID
                                    const trimmed = p.trim();
                                    if (!trimmed) return false;
                                    if (/^Task\s+ID\s*:\s*\d+$/i.test(trimmed)) return false;
                                    if (/^Công\s+việc\s+ID\s*:\s*\d+$/i.test(trimmed)) return false;
                                    return true;
                                  });
                                
                                // Format từng phần
                                parts.forEach((part, idx) => {
                                  const trimmed = part.trim();
                                  if (!trimmed) return;
                                  
                                  // Bỏ qua nếu là Task ID
                                  if (/^Task\s+ID\s*:\s*\d+$/i.test(trimmed) || 
                                      /^Công\s+việc\s+ID\s*:\s*\d+$/i.test(trimmed)) {
                                    return;
                                  }
                                  
                                  // Kiểm tra xem có dấu mũi tên không
                                  const arrowMatch = trimmed.match(/^([^:]+):\s*(.+?)\s*(→|->)\s*(.+)$/);
                                  
                                  if (arrowMatch) {
                                    // Đây là một thay đổi: Label: old → new
                                    const label = arrowMatch[1].trim();
                                    const oldValue = arrowMatch[2].trim();
                                    const newValue = arrowMatch[4].trim();
                                    
                                    // Bỏ qua nếu label là Task ID
                                    if (/^Task\s+ID$/i.test(label) || /^Công\s+việc\s+ID$/i.test(label)) {
                                      return;
                                    }
                                    
                                    result.push(
                                      <div key={idx} className="mb-2 last:mb-0">
                                        <span className="font-semibold text-gray-900">{label}:</span>
                                        <span className="ml-2 text-gray-600">{formatValue(oldValue)}</span>
                                        <span className="mx-2 text-blue-600 font-medium">→</span>
                                        <span className="text-gray-900 font-medium">{formatValue(newValue)}</span>
                                      </div>
                                    );
                                  } else if (trimmed.includes(':')) {
                                    // Đây là một field bình thường: Label: value
                                    const colonIndex = trimmed.indexOf(':');
                                    const label = trimmed.substring(0, colonIndex).trim();
                                    const value = trimmed.substring(colonIndex + 1).trim();
                                    
                                    // Bỏ qua nếu label là Task ID hoặc ID
                                    if (/^Task\s+ID$/i.test(label) || 
                                        /^Công\s+việc\s+ID$/i.test(label) ||
                                        (label.toLowerCase().includes('id') && label.length <= 15)) {
                                      return;
                                    }
                                    
                                    result.push(
                                      <div key={idx} className="mb-2 last:mb-0">
                                        <span className="font-semibold text-gray-900">{label}:</span>
                                        <span className="ml-2 text-gray-700">{formatValue(value) || "—"}</span>
                                      </div>
                                    );
                                  } else {
                                    // Text thuần
                                    result.push(
                                      <div key={idx} className="mb-2 last:mb-0 text-gray-700">
                                        {trimmed}
                                      </div>
                                    );
                                  }
                                });
                                
                                return result.length > 0 ? result : null;
                              };
                              
                              const formatted = formatDetails(item.details);
                              
                              return formatted ? (
                                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 mt-3 border border-gray-200">
                                  {formatted}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mt-2">
                                  {item.details}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex justify-end px-8 py-4 border-t border-gray-200 bg-gray-10">
              <button
                onClick={() => setHistoryOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-100 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contracts Modal */}
      {contractsOpen && contractsHospital && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="absolute inset-0 bg-black/50" onClick={() => setContractsOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white rounded-t-3xl px-8 pt-8 pb-4 border-b border-gray-200">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 flex items-start gap-3">
                  <FiTag className="w-6 h-6 text-gray-600 mt-1" />
                  <span className="flex flex-col leading-tight">
                    <span>Danh sách hợp đồng</span>
                    <span className="text-base font-semibold text-blue-600 mt-1 break-words">{contractsHospital.name}</span>
                  </span>
                </h3>
                <button
                  onClick={() => setContractsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-8 pb-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {contractsLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <svg className="mb-4 h-12 w-12 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Đang tải danh sách hợp đồng...</span>
                </div>
              ) : contractsData && contractsData.totalCount === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <FiTag className="mx-auto h-12 w-12 mb-3 text-gray-300" />
                  <span className="text-sm">Chưa có hợp đồng nào</span>
                </div>
              ) : contractsData ? (
                <div className="space-y-6 mt-6">
                  {/* Business Contracts */}
                  {contractsData.businessContracts.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Hợp đồng kinh doanh ({contractsData.businessContracts.length})
                      </h4>
                      <div className="space-y-3">
                        {contractsData.businessContracts.map((contract: any) => (
                          <div key={contract.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 mb-2">{contract.name || "—"}</h5>
                                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                                  <div>
                                    <span className="font-medium">Trạng thái:</span>{" "}
                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                      contract.status === 'CONTRACTED' ? 'bg-green-100 text-green-800' :
                                      contract.status === 'CARING' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {contract.status === 'CONTRACTED' ? 'Đã ký' :
                                       contract.status === 'CARING' ? 'Đang chăm sóc' :
                                       contract.status || '—'}
                                    </span>
                                  </div>
                                  {contract.quantity && (
                                    <div>
                                      <span className="font-medium">Số lượng:</span> {contract.quantity}
                                    </div>
                                  )}
                                  {/* {contract.unitPrice && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-medium">Đơn giá:</span> <span className="whitespace-nowrap inline-block">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(contract.unitPrice)}</span>
                                    </div>
                                  )}
                                  {contract.totalPrice && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-medium">Tổng giá:</span> <span className="whitespace-nowrap inline-block">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(contract.totalPrice)}</span>
                                    </div>
                                  )} */}
                                  {contract.picUser && (
                                    <div>
                                      <span className="font-medium">Người phụ trách:</span> {contract.picUser.label || "—"}
                                    </div>
                                  )}
                                  {contract.startDate && (
                                    <div>
                                      <span className="font-medium">Bắt đầu:</span> {new Date(contract.startDate).toLocaleDateString('vi-VN')}
                                    </div>
                                  )}
                                  {contract.deadline && (
                                    <div>
                                      <span className="font-medium">Hạn:</span> {new Date(contract.deadline).toLocaleDateString('vi-VN')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warranty Contracts */}
                  {contractsData.maintainContracts.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Hợp đồng bảo trì ({contractsData.maintainContracts.length})
                      </h4>
                      <div className="space-y-3">
                        {contractsData.maintainContracts.map((contract: any) => (
                          <div key={contract.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 mb-2">{contract.contractCode || "—"}</h5>
                                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                                  {contract.durationYears && (
                                    <div>
                                      <span className="font-medium">Thời hạn:</span> {contract.durationYears} 
                                    </div>
                                  )}
                                  {/* {contract.yearlyPrice && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-medium">Giá hàng năm:</span> <span className="whitespace-nowrap inline-block">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(contract.yearlyPrice)}</span>
                                    </div>
                                  )}
                                  {contract.totalPrice && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-medium">Tổng giá:</span> <span className="whitespace-nowrap inline-block">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(contract.totalPrice)}</span>
                                    </div>
                                  )} */}
                                  {contract.picUser && (
                                    <div>
                                      <span className="font-medium">Người phụ trách:</span> {contract.picUser.label || "—"}
                                    </div>
                                  )}
                                  {contract.startDate && (
                                    <div>
                                      <span className="font-medium">Bắt đầu:</span> {new Date(contract.startDate).toLocaleDateString('vi-VN')}
                                    </div>
                                  )}
                                  {contract.endDate && (
                                    <div>
                                      <span className="font-medium">Ngày kết thúc:</span> {new Date(contract.endDate).toLocaleDateString('vi-VN')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex justify-end px-8 py-4 border-t border-gray-200 bg-white">
              <button
                onClick={() => setContractsOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-800 bg-white border border-gray-300 hover:bg-gray-100 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={maintenanceSwitchConfirmOpen}
        title="Chuyển sang bảo trì"
        message={
          <div className="space-y-2">
            <p>Công việc triển khai tại viện đã hoàn thành chưa?</p>
            <p>Bạn có muốn chuyển sang giai đoạn bảo trì và gán phụ trách bảo trì không?</p>
          </div>
        }
        confirmLabel="Có, tiếp tục"
        cancelLabel="Huỷ"
        onClose={() => setMaintenanceSwitchConfirmOpen(false)}
        onConfirm={() => {
          if (form.projectStatus !== "COMPLETED") {
            toast.error("Trạng thái dự án phải là Hoàn thành mới có thể chuyển sang bảo trì.");
            setMaintenanceSwitchConfirmOpen(false);
            return;
          }
          setMaintenanceLeadEnabled(true);
          setMaintenanceSwitchConfirmOpen(false);
        }}
      />

      <ConfirmDialog
        open={hospitalSaveConfirmOpen}
        title={isEditing ? "Xác nhận cập nhật" : "Xác nhận lưu"}
        message={
          isEditing
            ? "Bạn có chắc muốn cập nhật thông tin bệnh viện (kèm phụ trách bảo trì) không?"
            : "Bạn có chắc muốn lưu bệnh viện mới (kèm phụ trách bảo trì) không?"
        }
        confirmLabel={isEditing ? "Cập nhật" : "Lưu"}
        cancelLabel="Huỷ"
        confirmLoading={loading}
        onClose={() => {
          if (!loading) setHospitalSaveConfirmOpen(false);
        }}
        onConfirm={async () => {
          await performHospitalSave();
        }}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmOpen && hospitalToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="absolute inset-0 bg-black/50" onClick={() => {
              if (!loading && !checkingContracts) {
                setDeleteConfirmOpen(false);
                setHospitalToDelete(null);
                setHasContracts(false);
              }
            }} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200"
            >
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${hasContracts ? 'bg-orange-100' : 'bg-red-100'}`}>
                  {hasContracts ? (
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {hasContracts ? "Xác nhận xóa bệnh viện có hợp đồng" : "Xác nhận xóa bệnh viện"}
                  </h3>
                  {checkingContracts ? (
                    <p className="text-sm text-gray-600">Đang kiểm tra hợp đồng...</p>
                  ) : (
                    <>
                      {hasContracts ? (
                        <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-sm font-semibold text-orange-800 mb-1">⚠️ Cảnh báo:</p>
                          <p className="text-sm text-orange-700">
                            Bệnh viện <span className="font-bold">"{hospitalToDelete.name}"</span> đã có hợp đồng. 
                            Việc xóa bệnh viện này sẽ tự động xóa tất cả các hợp đồng liên quan.
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 mt-2">
                          Bạn có chắc chắn muốn xóa bệnh viện <span className="font-semibold text-gray-900">"{hospitalToDelete.name}"</span>?
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setHospitalToDelete(null);
                    setHasContracts(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition"
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={loading || checkingContracts}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition ${
                    hasContracts 
                      ? 'bg-orange-600 hover:bg-orange-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? "Đang xóa..." : "Xóa"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
        )}
      </AnimatePresence>
    </>
  );
}
