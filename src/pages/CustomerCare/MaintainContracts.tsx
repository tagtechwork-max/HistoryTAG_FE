import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { AiOutlineEye, AiOutlineEdit, AiOutlineDelete } from "react-icons/ai";
import { FiUser, FiClock, FiCalendar, FiDollarSign, FiFileText, FiEye, FiEdit3, FiTrash2, FiArrowUp, FiArrowDown, FiX, FiBriefcase, FiTag, FiCheckCircle, FiAlertCircle, FiDownload } from "react-icons/fi";
import { FaHospitalAlt } from "react-icons/fa";
import toast from "react-hot-toast";
import ExcelJS from "exceljs";
import {
  createMaintainContract,
  updateMaintainContract,
  deleteMaintainContract,
  getMaintainContractById,
  getMaintainContracts,
  getMaintainContractPicOptions,
  type MaintainContractResponseDTO,
  type MaintainContractRequestDTO,
} from "../../api/maintain.api";
import { searchHospitals } from "../../api/business.api";
import { PlusIcon } from "../../icons";
import MaintainContractForm, { type WarrantyContractForm } from "./Form/MaintainContractForm";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    }
    : { Accept: "application/json", "Content-Type": "application/json" };
}

// Format số tiền VND
function formatCurrency(amount?: number | null): string {
  if (!amount && amount !== 0) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date time: HH:mm-dd/MM/yyyy
// Parse directly from ISO string to avoid timezone conversion issues
function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    // Backend trả về LocalDateTime dạng "yyyy-MM-ddTHH:mm:ss" hoặc "yyyy-MM-ddTHH:mm:ss.SSS"
    // Parse trực tiếp từ string để tránh timezone conversion
    const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      return `${hours}:${minutes}-${day}/${month}/${year}`;
    }
    // Fallback: thử parse bằng Date nếu format khác
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "—";
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes}-${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

// Format date only
function fmtDate(dt?: string | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

// Format filter date label
function formatFilterDateLabel(value?: string | null) {
  if (!value) return "—";
  if (value.includes("T")) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("vi-VN");
  }
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

// Normalize date for start
function normalizeDateForStart(value?: string | null) {
  if (!value || value.trim() === "") return undefined;
  if (value.length === 10) return `${value}T00:00:00`;
  if (value.length === 16) return `${value}:00`;
  if (value.length >= 19) return value.substring(0, 19);
  return value;
}

// Normalize date for end
function normalizeDateForEnd(value?: string | null) {
  if (!value || value.trim() === "") return undefined;
  if (value.length === 10) return `${value}T23:59:59`;
  if (value.length === 16) return `${value}:59`;
  if (value.length >= 19) return value.substring(0, 19);
  return value;
}

export type WarrantyContract = MaintainContractResponseDTO;

export type { WarrantyContractForm } from "./Form/MaintainContractForm";

type PicUserOption = {
  id: number;
  label: string;
  subLabel?: string;
  phone?: string | null;
};

type HospitalOption = {
  id: number;
  label: string;
};

const DURATION_OPTIONS = [
  { value: 1, label: "1 năm" },
  { value: 2, label: "2 năm" },
  { value: 3, label: "3 năm" },
  { value: 4, label: "4 năm" },
  { value: 5, label: "5 năm" },
  { value: 7, label: "7 năm" },
];

const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; borderColor?: string }> = {
  SAP_HET_HAN: { label: "Sắp hết hạn", bgColor: "bg-amber-100", textColor: "text-amber-700", borderColor: "border-amber-300" },
  DA_GIA_HAN: { label: "Đã gia hạn", bgColor: "bg-green-100", textColor: "text-green-700", borderColor: "border-green-300" },
  HET_HAN: { label: "Hết hạn", bgColor: "bg-red-100", textColor: "text-red-700", borderColor: "border-red-300" },
  DANG_HOAT_DONG: { label: "Đang hoạt động", bgColor: "bg-blue-100", textColor: "text-blue-700", borderColor: "border-blue-300" },
};

export default function MaintainContractsPage() {
  // Determine if current user can perform write actions
  // Allow SUPERADMIN or team CUSTOMER_SERVICE/SALES
  const canEdit = (() => {
    try {
      // Check SUPERADMIN role
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (rolesStr) {
        const roles = JSON.parse(rolesStr);
        const isSuperAdmin = Array.isArray(roles) && roles.some((r: string) =>
          r === "SUPERADMIN" || r === "SUPER_ADMIN" || r === "Super Admin"
        );
        if (isSuperAdmin) return true;
      }

      // Check CUSTOMER_SERVICE/SALES team from user object
      const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const directTeam = user?.team ? String(user.team).toUpperCase() : null;
        const activeTeam = user?.activeTeam ? String(user.activeTeam).toUpperCase() : null;
        const teamList = Array.isArray(user?.teams)
          ? user.teams.map((t: unknown) => String(t).toUpperCase())
          : [];
        const allowedTeams = [directTeam, activeTeam, ...teamList];
        if (allowedTeams.includes("CUSTOMER_SERVICE") || allowedTeams.includes("SALES")) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  })();

  // Detail Field Component for CRM-style view (hides empty fields)
  function DetailField({ label, value }: { label: string; value?: React.ReactNode | string | null }) {
    if (!value || value === '—' || (typeof value === 'string' && value.trim() === '')) {
      return null; // Hide empty fields
    }
    return (
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1.5">{label}</div>
        <div className="text-sm text-gray-900">{typeof value === 'string' ? value : value}</div>
      </div>
    );
  }

  const [items, setItems] = useState<WarrantyContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Sorting
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filters
  const [qSearch, setQSearch] = useState("");
  const [debouncedQSearch, setDebouncedQSearch] = useState(""); // Debounced version for API calls
  const [qPicUserId, setQPicUserId] = useState("");
  const [filterStartFrom, setFilterStartFrom] = useState<string>("");
  const [filterStartTo, setFilterStartTo] = useState<string>("");
  const [dateFilterOpen, setDateFilterOpen] = useState<boolean>(false);
  const [pendingFilterStart, setPendingFilterStart] = useState<string>("");
  const [pendingFilterEnd, setPendingFilterEnd] = useState<string>("");
  const dateFilterRef = useRef<HTMLDivElement | null>(null);
  const pendingStartInputRef = useRef<HTMLInputElement | null>(null);
  const pendingEndInputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceTimeoutRef = useRef<number | null>(null);

  // ✅ New filter states
  const [filterStatus, setFilterStatus] = useState<string>(""); // DANG_HOAT_DONG, SAP_HET_HAN, HET_HAN, DA_GIA_HAN
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>(""); // CHUA_THANH_TOAN, DA_THANH_TOAN
  const [filterExpiresWithinDays, setFilterExpiresWithinDays] = useState<string>(""); // 7, 30, 60, 90

  // Debounce search input: update debouncedQSearch after 300ms of no typing
  useEffect(() => {
    if (searchDebounceTimeoutRef.current) {
      window.clearTimeout(searchDebounceTimeoutRef.current);
    }
    searchDebounceTimeoutRef.current = window.setTimeout(() => {
      setDebouncedQSearch(qSearch);
    }, 300);
    return () => {
      if (searchDebounceTimeoutRef.current) {
        window.clearTimeout(searchDebounceTimeoutRef.current);
      }
    };
  }, [qSearch]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQSearch, qPicUserId, filterStartFrom, filterStartTo, filterStatus, filterPaymentStatus, filterExpiresWithinDays, sortBy, sortDir]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarrantyContract | null>(null);
  const [viewing, setViewing] = useState<WarrantyContract | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{
    payload: MaintainContractRequestDTO;
    isEditing: boolean;
  } | null>(null);
  const [hospitalNameForConfirm, setHospitalNameForConfirm] = useState<string>("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState<WarrantyContractForm>({
    contractCode: "",
    picUserId: undefined,
    hospitalId: undefined,
    durationYears: "",
    yearlyPrice: "",
    totalPrice: "",
    paymentStatus: "CHUA_THANH_TOAN",
    paidAmount: "",
    startDate: null,
    endDate: null,
  });
  const [yearlyPriceDisplay, setYearlyPriceDisplay] = useState<string>("");

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setViewing(null);
    setError(null);
    setIsModalLoading(false);
    setYearlyPriceDisplay("");
    setTotalPriceDisplay("");
    setPaidAmountDisplay("");
    setPaidAmountError(null);
  }

  function fillForm(item: WarrantyContract) {
    const yearlyPrice = typeof item.yearlyPrice === 'number' ? item.yearlyPrice : (item.yearlyPrice ? Number(item.yearlyPrice) : "");

    // Parse startDate trực tiếp từ ISO string để tránh timezone conversion
    let startDateForInput: string | null = null;
    if (item.startDate) {
      try {
        // Backend trả về LocalDateTime dạng "yyyy-MM-ddTHH:mm:ss" hoặc "yyyy-MM-ddTHH:mm:ss.SSS"
        // Parse trực tiếp để tránh timezone conversion
        const match = item.startDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
        if (match) {
          const [, year, month, day, hours, minutes] = match;
          // Format cho datetime-local input: "yyyy-MM-ddTHH:mm"
          startDateForInput = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
          // Fallback: thử parse bằng Date nếu format khác
          const d = new Date(item.startDate);
          if (!Number.isNaN(d.getTime())) {
            // Lấy local time để hiển thị đúng
            const year = String(d.getFullYear());
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            startDateForInput = `${year}-${month}-${day}T${hours}:${minutes}`;
          }
        }
      } catch {
        startDateForInput = null;
      }
    }

    // Parse endDate tương tự startDate
    let endDateForInput: string | null = null;
    if (item.endDate) {
      try {
        const match = item.endDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
        if (match) {
          const [, year, month, day, hours, minutes] = match;
          endDateForInput = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
          const d = new Date(item.endDate);
          if (!Number.isNaN(d.getTime())) {
            const year = String(d.getFullYear());
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            endDateForInput = `${year}-${month}-${day}T${hours}:${minutes}`;
          }
        }
      } catch {
        endDateForInput = null;
      }
    }

    // Parse totalPrice
    const totalPrice = typeof item.totalPrice === 'number' ? item.totalPrice : (item.totalPrice ? Number(item.totalPrice) : "");

    const paymentStatus = (item as any)?.paymentStatus ? String((item as any).paymentStatus) : "CHUA_THANH_TOAN";
    const paidAmount = typeof (item as any).paidAmount === 'number'
      ? (item as any).paidAmount
      : ((item as any).paidAmount ? Number((item as any).paidAmount) : "");

    setForm({
      contractCode: item.contractCode || "",
      picUserId: item.picUser?.id,
      hospitalId: item.hospital?.id,
      durationYears: item.durationYears ? String(item.durationYears) : "",
      yearlyPrice: yearlyPrice,
      totalPrice: totalPrice,
      kioskQuantity: item.kioskQuantity || "",
      paymentStatus: (paymentStatus === "DA_THANH_TOAN" ? "DA_THANH_TOAN" : paymentStatus === "THANH_TOAN_HET" ? "THANH_TOAN_HET" : "CHUA_THANH_TOAN") as "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET",
      paidAmount: (paymentStatus === "DA_THANH_TOAN" || paymentStatus === "THANH_TOAN_HET" ? paidAmount : ""),
      startDate: startDateForInput,
      endDate: endDateForInput,
    });
    // Set display values
    if (yearlyPrice !== '') {
      setYearlyPriceDisplay(formatNumber(yearlyPrice));
    } else {
      setYearlyPriceDisplay('');
    }
    if (totalPrice !== '') {
      setTotalPriceDisplay(formatNumber(totalPrice));
    } else {
      setTotalPriceDisplay('');
    }

    if ((paymentStatus === "DA_THANH_TOAN" || paymentStatus === "THANH_TOAN_HET") && paidAmount !== '') {
      setPaidAmountDisplay(formatNumber(paidAmount as any));
    } else {
      setPaidAmountDisplay('');
    }
  }

  // Pic User và Hospital options
  const [picOptions, setPicOptions] = useState<PicUserOption[]>([]);
  const [hospitalOptions, setHospitalOptions] = useState<HospitalOption[]>([]);
  const [selectedPic, setSelectedPic] = useState<PicUserOption | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<HospitalOption | null>(null);

  // Load pic options
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const options = await getMaintainContractPicOptions();
        if (alive) setPicOptions(options);
      } catch (e) {
        console.error("Failed to load pic options:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // KHÔNG load tất cả bệnh viện khi mount - chỉ load khi user search
  // useEffect(() => {
  //   let alive = true;
  //   (async () => {
  //     try {
  //       const options = await searchHospitals("");
  //       if (alive) {
  //         const mapped = Array.isArray(options) ? options.map((h: any) => ({
  //           id: Number(h.id),
  //           label: String(h.label || h.name || h.id),
  //         })) : [];
  //         setHospitalOptions(mapped);
  //       }
  //     } catch (e) {
  //       console.error("Failed to load hospitals:", e);
  //     }
  //   })();
  //   return () => { alive = false; };
  // }, []);

  // Set selected values khi mở modal với dữ liệu
  useEffect(() => {
    if (!open) {
      setSelectedPic(null);
      setSelectedHospital(null);
      return;
    }
    if (form.picUserId) {
      const pic = picOptions.find((p) => p.id === form.picUserId);
      setSelectedPic(pic || null);
    }
    if (form.hospitalId) {
      const hospital = hospitalOptions.find((h) => h.id === form.hospitalId);
      setSelectedHospital(hospital || null);
    }
  }, [open, form.picUserId, form.hospitalId, picOptions, hospitalOptions]);

  // State cho totalPrice display
  const [totalPriceDisplay, setTotalPriceDisplay] = useState<string>("");
  const [paidAmountDisplay, setPaidAmountDisplay] = useState<string>("");
  const [paidAmountError, setPaidAmountError] = useState<string | null>(null);


  async function fetchList() {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        size,
        sortBy,
        sortDir,
      };
      if (debouncedQSearch.trim()) params.search = debouncedQSearch.trim();
      if (qPicUserId) params.picUserId = Number(qPicUserId);

      // ✅ New filters
      if (filterStatus) params.status = filterStatus;
      if (filterPaymentStatus) params.paymentStatus = filterPaymentStatus;
      if (filterExpiresWithinDays) params.expiresWithinDays = Number(filterExpiresWithinDays);

      // ✅ Date range filter
      if (filterStartFrom) params.startDateFrom = normalizeDateForStart(filterStartFrom);
      if (filterStartTo) params.startDateTo = normalizeDateForEnd(filterStartTo);

      const data = await getMaintainContracts(params);
      setItems(data.content || []);
      setTotalElements(data.totalElements || 0);
      setTotalPages(data.totalPages || 0);
    } catch (e: any) {
      setError(e.message || "Lỗi tải danh sách");
      toast.error(e?.message || "Lỗi tải danh sách");
    } finally {
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, size, debouncedQSearch, qPicUserId, filterStartFrom, filterStartTo, filterStatus, filterPaymentStatus, filterExpiresWithinDays, sortBy, sortDir]);

  // ========== EXPORT EXCEL ==========
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      // Fetch ALL items matching current filters (no pagination)
      const params: any = {
        page: 0,
        size: 99999,
        sortBy,
        sortDir,
      };
      if (debouncedQSearch.trim()) params.search = debouncedQSearch.trim();
      if (qPicUserId) params.picUserId = Number(qPicUserId);
      if (filterStatus) params.status = filterStatus;
      if (filterPaymentStatus) params.paymentStatus = filterPaymentStatus;
      if (filterExpiresWithinDays) params.expiresWithinDays = Number(filterExpiresWithinDays);
      if (filterStartFrom) params.startDateFrom = normalizeDateForStart(filterStartFrom);
      if (filterStartTo) params.startDateTo = normalizeDateForEnd(filterStartTo);

      const data = await getMaintainContracts(params);
      const allItems: WarrantyContract[] = data.content || [];

      if (allItems.length === 0) {
        toast.error("Không có dữ liệu để xuất");
        setExporting(false);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Hợp đồng bảo trì");

      const colCount = 13;

      // ── Title row ──
      const titleRow = worksheet.addRow(Array(colCount).fill(""));
      titleRow.height = 32;
      worksheet.mergeCells(1, 1, 1, colCount);
      const titleCell = titleRow.getCell(1);
      titleCell.value = "BÁO CÁO HỢP ĐỒNG BẢO TRÌ";
      titleCell.font = { bold: true, size: 14, color: { argb: "FF1A237E" } };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };

      // ── Filter info row ──
      const filterParts: string[] = [];
      if (debouncedQSearch.trim()) filterParts.push(`Tìm kiếm: "${debouncedQSearch.trim()}"`);
      if (qPicUserId) {
        const picName = picOptions.find(p => String(p.id) === String(qPicUserId))?.label || qPicUserId;
        filterParts.push(`Người phụ trách: ${picName}`);
      }
      if (filterStartFrom || filterStartTo) filterParts.push(`Ngày ký HĐ: ${formatFilterDateLabel(filterStartFrom)} - ${formatFilterDateLabel(filterStartTo)}`);
      if (filterStatus) {
        const statusLabel = statusConfig[filterStatus]?.label || filterStatus;
        filterParts.push(`Trạng thái HĐ: ${statusLabel}`);
      }
      if (filterPaymentStatus) {
        const payLabel = filterPaymentStatus === "THANH_TOAN_HET" ? "Thanh toán hết" : filterPaymentStatus === "DA_THANH_TOAN" ? "Đã thanh toán" : "Chưa thanh toán";
        filterParts.push(`Thanh toán: ${payLabel}`);
      }
      if (filterExpiresWithinDays) filterParts.push(`Hết hạn trong: ${filterExpiresWithinDays} ngày`);

      if (filterParts.length > 0) {
        const filterRow = worksheet.addRow(Array(colCount).fill(""));
        worksheet.mergeCells(worksheet.rowCount, 1, worksheet.rowCount, colCount);
        const fc = filterRow.getCell(1);
        fc.value = `Bộ lọc: ${filterParts.join(" | ")}`;
        fc.font = { italic: true, size: 10, color: { argb: "FF666666" } };
        fc.alignment = { vertical: "middle", horizontal: "left" };
      }

      // Empty spacer row
      worksheet.addRow([]);

      // ── Header row ──
      const headers = [
        "STT", "Bệnh viện", "Mã hợp đồng", "Người phụ trách",
        "Thời hạn", "Số Kiosk BT", "Ngày ký HĐ", "Ngày hết hạn HĐ",
        "Trạng thái", "Thanh toán", "Tổng tiền", "Đã thanh toán", "Còn lại",
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 28;
      for (let col = 1; col <= colCount; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1976D2" } };
        cell.border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      }

      // Column widths
      const widths = [6, 35, 18, 22, 14, 12, 16, 16, 16, 18, 18, 18, 18];
      widths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

      // ── Data rows ──
      allItems.forEach((item, index) => {
        const totalPrice = item.totalPrice || 0;
        const paidAmount = typeof item.paidAmount === "number" ? item.paidAmount : 0;
        const remaining = totalPrice - paidAmount;

        const statusLabel = statusConfig[item.status]?.label || item.status || "";
        const payLabel = item.paymentStatus === "THANH_TOAN_HET"
          ? "Thanh toán hết"
          : item.paymentStatus === "DA_THANH_TOAN"
            ? "Đã thanh toán"
            : "Chưa thanh toán";

        const row = worksheet.addRow([
          index + 1,
          item.hospital?.label || "",
          item.contractCode || "",
          item.picUser?.label || "",
          item.durationYears || "",
          typeof item.kioskQuantity === "number" ? item.kioskQuantity : "",
          fmtDate(item.startDate),
          fmtDate(item.endDate),
          statusLabel,
          payLabel,
          totalPrice,
          paidAmount,
          remaining,
        ]);
        row.height = 22;

        for (let col = 1; col <= colCount; col++) {
          const cell = row.getCell(col);
          cell.alignment = { vertical: "middle", horizontal: col === 1 ? "center" : "left", wrapText: col === 2 };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE0E0E0" } },
            left: { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            right: { style: "thin", color: { argb: "FFE0E0E0" } },
          };
          // Alternate row background
          if (index % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
          }
        }

        // Number format for currency columns (11=Tổng tiền, 12=Đã TT, 13=Còn lại)
        for (const colIdx of [11, 12, 13]) {
          row.getCell(colIdx).numFmt = '#,##0';
          row.getCell(colIdx).alignment = { vertical: "middle", horizontal: "right" };
        }

        // Color coding for status
        const statusCell = row.getCell(9);
        if (item.status === "HET_HAN") {
          statusCell.font = { color: { argb: "FFDC2626" }, bold: true };
        } else if (item.status === "SAP_HET_HAN") {
          statusCell.font = { color: { argb: "FFD97706" }, bold: true };
        } else if (item.status === "DA_GIA_HAN") {
          statusCell.font = { color: { argb: "FF16A34A" } };
        }

        // Color coding for payment status
        const payCell = row.getCell(10);
        if (item.paymentStatus === "THANH_TOAN_HET") {
          payCell.font = { color: { argb: "FF059669" }, bold: true };
        } else if (item.paymentStatus === "DA_THANH_TOAN") {
          payCell.font = { color: { argb: "FF16A34A" } };
        } else {
          payCell.font = { color: { argb: "FF9CA3AF" } };
        }
      });

      // ── Summary row ──
      worksheet.addRow([]);
      const summaryRow = worksheet.addRow([
        "", "", "", "", "", "", "", "",
        `Tổng: ${allItems.length} hợp đồng`, "",
        allItems.reduce((s, i) => s + (i.totalPrice || 0), 0),
        allItems.reduce((s, i) => s + (typeof i.paidAmount === "number" ? i.paidAmount : 0), 0),
        allItems.reduce((s, i) => s + ((i.totalPrice || 0) - (typeof i.paidAmount === "number" ? i.paidAmount : 0)), 0),
      ]);
      summaryRow.height = 26;
      for (let col = 1; col <= colCount; col++) {
        const cell = summaryRow.getCell(col);
        cell.font = { bold: true, size: 11 };
        cell.border = {
          top: { style: "medium" }, bottom: { style: "medium" },
          left: { style: "thin" }, right: { style: "thin" },
        };
      }
      for (const colIdx of [11, 12, 13]) {
        summaryRow.getCell(colIdx).numFmt = '#,##0';
        summaryRow.getCell(colIdx).alignment = { vertical: "middle", horizontal: "right" };
      }
      summaryRow.getCell(9).alignment = { vertical: "middle", horizontal: "right" };

      // ── Generate & download ──
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      a.download = `hop_dong_bao_tri_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Xuất Excel thành công (${allItems.length} hợp đồng)`);
    } catch (e: any) {
      console.error("Export Excel error:", e);
      toast.error(e?.message || "Xuất Excel thất bại");
    } finally {
      setExporting(false);
    }
  }

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      // Toggle direction if same column
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      // New column, default to desc
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(0); // Reset to first page when sorting
  };

  // Helper to render sort icon
  const renderSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <FiArrowUp className="ml-1 h-3 w-3 text-gray-400 opacity-50" />;
    }
    return sortDir === "asc" ? (
      <FiArrowUp className="ml-1 h-3 w-3 text-blue-600" />
    ) : (
      <FiArrowDown className="ml-1 h-3 w-3 text-blue-600" />
    );
  };

  // Handle click outside date filter
  useEffect(() => {
    if (!dateFilterOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
        setDateFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [dateFilterOpen]);

  async function fetchDetail(id: number): Promise<WarrantyContract | null> {
    setIsModalLoading(true);
    setError(null);
    try {
      const data = await getMaintainContractById(id);
      return data;
    } catch (e: any) {
      setError(e.message || "Lỗi tải chi tiết");
      console.error("❌ FETCH DETAIL ERROR:", e);
      return null;
    } finally {
      setIsModalLoading(false);
    }
  }

  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({
      contractCode: "",
      picUserId: undefined,
      hospitalId: undefined,
      durationYears: "",
      yearlyPrice: "",
      kioskQuantity: "",
      totalPrice: "",
      paymentStatus: "CHUA_THANH_TOAN",
      paidAmount: "",
      startDate: null,
      endDate: null,
    });
    setYearlyPriceDisplay("");
    setTotalPriceDisplay("");
    setPaidAmountDisplay("");
    setPaidAmountError(null);
    setOpen(true);
  }

  async function onView(item: WarrantyContract) {
    setEditing(null);
    setViewing(null);
    setOpen(true);

    const details = await fetchDetail(item.id);
    if (details) {
      setViewing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onEdit(item: WarrantyContract) {
    setViewing(null);
    setEditing(null);
    setOpen(true);

    const details = await fetchDetail(item.id);
    if (details) {
      setEditing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  function onDelete(id: number) {
    if (!canEdit) {
      toast.error("Bạn không có quyền xóa hợp đồng bảo trì");
      return;
    }
    setPendingDeleteId(id);
    setConfirmDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const idToDelete = pendingDeleteId;
    setConfirmDeleteOpen(false);
    setPendingDeleteId(null);
    setLoading(true);
    try {
      await deleteMaintainContract(idToDelete, canEdit);
      await fetchList();
      if (isViewing && viewing?.id === idToDelete) closeModal();
      toast.success("Xóa thành công");
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }

  function cancelDelete() {
    setConfirmDeleteOpen(false);
    setPendingDeleteId(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contractCode.trim()) {
      setError("Mã hợp đồng không được để trống");
      return;
    }
    if (!form.picUserId) {
      setError("Người phụ trách không được để trống");
      return;
    }
    if (!form.hospitalId) {
      setError("Bệnh viện không được để trống");
      return;
    }
    if (!form.durationYears || form.durationYears.trim() === "") {
      setError("Thời hạn hợp đồng không được để trống");
      return;
    }
    if (!form.yearlyPrice || (typeof form.yearlyPrice === "number" && form.yearlyPrice <= 0)) {
      setError("Giá hợp đồng phải lớn hơn 0");
      return;
    }
    if (!form.totalPrice || (typeof form.totalPrice === "number" && form.totalPrice <= 0)) {
      setError("Tổng tiền phải lớn hơn 0");
      return;
    }
    if ((form.paymentStatus || "CHUA_THANH_TOAN") === "DA_THANH_TOAN") {
      if (!form.paidAmount || (typeof form.paidAmount === "number" && form.paidAmount <= 0)) {
        setError("Khi trạng thái là 'Đã thanh toán', số tiền thanh toán phải lớn hơn 0");
        return;
      }
      // Kiểm tra số tiền thanh toán không được vượt quá tổng tiền
      if (typeof form.paidAmount === "number" && typeof form.totalPrice === "number" && form.paidAmount > form.totalPrice) {
        setError("Số tiền thanh toán không được vượt quá tổng tiền hợp đồng");
        return;
      }
    }
    if (isViewing) return;
    if (!canEdit) {
      setError("Bạn không có quyền thực hiện thao tác này");
      return;
    }

    // Convert startDate từ format "yyyy-MM-ddTHH:mm" sang ISO string mà không bị timezone conversion
    let startDateForPayload: string | null = null;
    if (form.startDate) {
      try {
        // Parse trực tiếp từ format "yyyy-MM-ddTHH:mm" để tránh timezone conversion
        const match = form.startDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (match) {
          const [, year, month, day, hours, minutes] = match;
          // Format thành ISO string "yyyy-MM-ddTHH:mm:ss" (không có timezone, backend sẽ parse như LocalDateTime)
          startDateForPayload = `${year}-${month}-${day}T${hours}:${minutes}:00`;
        } else {
          // Fallback: nếu format khác, thử parse bằng Date nhưng giữ nguyên local time
          const d = new Date(form.startDate);
          if (!Number.isNaN(d.getTime())) {
            const year = String(d.getFullYear());
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            startDateForPayload = `${year}-${month}-${day}T${hours}:${minutes}:00`;
          }
        }
      } catch {
        startDateForPayload = null;
      }
    }

    // Convert endDate tương tự startDate
    let endDateForPayload: string | null = null;
    if (form.endDate) {
      try {
        const match = form.endDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (match) {
          const [, year, month, day, hours, minutes] = match;
          endDateForPayload = `${year}-${month}-${day}T${hours}:${minutes}:00`;
        } else {
          const d = new Date(form.endDate);
          if (!Number.isNaN(d.getTime())) {
            const year = String(d.getFullYear());
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            endDateForPayload = `${year}-${month}-${day}T${hours}:${minutes}:00`;
          }
        }
      } catch {
        endDateForPayload = null;
      }
    }

    const payload: MaintainContractRequestDTO = {
      contractCode: form.contractCode.trim(),
      type: "Bảo trì (Maintenance)",
      picUserId: form.picUserId!,
      hospitalId: form.hospitalId!,
      durationYears: form.durationYears.trim(), // Gửi dạng string
      yearlyPrice: typeof form.yearlyPrice === "number" ? form.yearlyPrice : 0,
      totalPrice: typeof form.totalPrice === "number" ? form.totalPrice : 0,
      kioskQuantity: form.kioskQuantity && typeof form.kioskQuantity === "number" ? form.kioskQuantity : (form.kioskQuantity === "" ? null : Number(form.kioskQuantity)),
      startDate: startDateForPayload,
      endDate: endDateForPayload,
      paymentStatus: form.paymentStatus || "CHUA_THANH_TOAN",
      paidAmount:
        (form.paymentStatus === "THANH_TOAN_HET" && typeof form.totalPrice === "number")
          ? form.totalPrice
          : (form.paymentStatus === "DA_THANH_TOAN" && typeof form.paidAmount === "number")
            ? form.paidAmount
            : null,

      // careId không có trong trang này, backend sẽ tự tìm từ hospitalId
    };

    // Check nếu đang tạo mới (không phải edit) và bệnh viện đã có hợp đồng
    if (!isEditing && form.hospitalId) {
      try {
        setLoading(true);
        const existingContracts = await getMaintainContracts({ hospitalId: form.hospitalId, page: 0, size: 1 });
        setLoading(false);
        const hasExisting = (existingContracts.content && existingContracts.content.length > 0) ||
          (Array.isArray(existingContracts) && existingContracts.length > 0);

        if (hasExisting) {
          const hospitalName = selectedHospital?.label ||
            hospitalOptions.find(h => h.id === form.hospitalId)?.label ||
            items.find(h => h.hospital?.id === form.hospitalId)?.hospital?.label ||
            "bệnh viện này";
          setHospitalNameForConfirm(hospitalName);
          setPendingSubmit({ payload, isEditing: false });
          setConfirmCreateOpen(true);
          return;
        }
      } catch (e) {
        setLoading(false);
        // console.warn("Failed to check existing warranty contracts, proceeding anyway", e);
      }
    }

    // Tiếp tục submit
    setLoading(true);
    setError(null);
    try {
      // Kiểm tra token trước khi gửi request
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
      if (!token) {
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        setLoading(false);
        return;
      }

      if (isEditing) {
        await updateMaintainContract(editing!.id, payload, canEdit);
      } else {
        await createMaintainContract(payload, canEdit);
      }

      closeModal();
      setPage(0);
      await fetchList();
      toast.success(isEditing ? "Cập nhật thành công" : "Tạo thành công");
    } catch (e: any) {
      console.error("Error saving warranty contract:", e);
      const errorMessage = e?.response?.data?.message || e?.message || "Lưu thất bại";
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        const msg = e?.response?.status === 401
          ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
          : "Bạn không có quyền thực hiện thao tác này.";
        setError(msg);
        toast.error(msg);
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  async function confirmCreate() {
    if (!pendingSubmit) return;
    setConfirmCreateOpen(false);
    setLoading(true);
    setError(null);

    try {
      // Kiểm tra token trước khi gửi request
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
      if (!token) {
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        return;
      }

      if (pendingSubmit.isEditing) {
        await updateMaintainContract(editing!.id, pendingSubmit.payload, canEdit);
      } else {
        await createMaintainContract(pendingSubmit.payload, canEdit);
      }
      closeModal();
      setPage(0);
      await fetchList();
      toast.success(pendingSubmit.isEditing ? "Cập nhật thành công" : "Tạo thành công");
      setPendingSubmit(null);
      setHospitalNameForConfirm("");
    } catch (e: any) {
      console.error("Error saving warranty contract:", e);
      const errorMessage = e?.response?.data?.message || e?.message || "Lưu thất bại";
      if (e?.response?.status === 401) {
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  function cancelCreate() {
    setConfirmCreateOpen(false);
    setPendingSubmit(null);
    setHospitalNameForConfirm("");
  }


  // Helper functions để format số với dấu chấm phân cách hàng nghìn
  function formatNumber(value: number | ''): string {
    if (value === '' || value === null || value === undefined) return '';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function parseFormattedNumber(value: string): number | '' {
    // Loại bỏ dấu chấm phân cách hàng nghìn (chỉ giữ lại số)
    // Ví dụ: "1.000.000" -> "1000000", "7.000.000.000" -> "7000000000"
    const cleaned = value.replace(/\./g, '').replace(/[^\d]/g, '');
    if (cleaned === '' || cleaned === '0') return '';
    // Sử dụng parseInt thay vì parseFloat để tránh mất độ chính xác với số nguyên lớn
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? '' : num;
  }

  // Format input giá tiền
  function handlePriceChange(value: string) {
    // Lưu giá trị hiển thị ngay (cho phép user nhập tự do)
    setYearlyPriceDisplay(value);
    // Parse giá trị số từ input (loại bỏ dấu chấm và ký tự không phải số)
    const parsed = parseFormattedNumber(value);
    // Lưu giá trị số
    setForm((s) => ({ ...s, yearlyPrice: parsed }));
  }

  function handlePriceBlur() {
    // Format lại khi blur
    if (form.yearlyPrice !== '' && typeof form.yearlyPrice === 'number') {
      setYearlyPriceDisplay(formatNumber(form.yearlyPrice));
    } else {
      setYearlyPriceDisplay('');
    }
  }

  function handlePriceFocus() {
    // Khi focus, hiển thị giá trị đã format
    if (form.yearlyPrice !== '' && typeof form.yearlyPrice === 'number') {
      setYearlyPriceDisplay(formatNumber(form.yearlyPrice));
    } else {
      setYearlyPriceDisplay('');
    }
  }

  // Handler cho totalPrice tương tự yearlyPrice
  function handleTotalPriceChange(value: string) {
    setTotalPriceDisplay(value);
    const parsed = parseFormattedNumber(value);
    setForm((s) => ({ ...s, totalPrice: parsed }));

    // Re-validate paid amount khi total price thay đổi
    if (typeof form.paidAmount === "number" && typeof parsed === "number" && form.paidAmount > parsed) {
      setPaidAmountError("Số tiền thanh toán không được vượt quá tổng tiền hợp đồng");
    } else {
      setPaidAmountError(null);
    }
  }

  function handleTotalPriceBlur() {
    if (form.totalPrice !== '' && typeof form.totalPrice === 'number') {
      setTotalPriceDisplay(formatNumber(form.totalPrice));
    } else {
      setTotalPriceDisplay('');
    }
  }

  function handleTotalPriceFocus() {
    if (typeof form.totalPrice === "number") {
      setTotalPriceDisplay(formatNumber(form.totalPrice));
    }
  }

  // Handler cho paidAmount tương tự yearlyPrice/totalPrice
  function handlePaidAmountChange(value: string) {
    setPaidAmountDisplay(value);
    const parsed = parseFormattedNumber(value);
    setForm((s) => ({ ...s, paidAmount: parsed }));

    // Validation real-time: kiểm tra số tiền thanh toán không vượt quá tổng tiền
    if (typeof parsed === "number" && typeof form.totalPrice === "number" && parsed > form.totalPrice) {
      setPaidAmountError("Số tiền thanh toán không được vượt quá tổng tiền hợp đồng");
    } else {
      setPaidAmountError(null);
    }
  }

  function handlePaidAmountBlur() {
    if (form.paidAmount !== '' && typeof form.paidAmount === 'number') {
      setPaidAmountDisplay(formatNumber(form.paidAmount));
    } else {
      setPaidAmountDisplay('');
    }
  }

  function handlePaidAmountFocus() {
    if (typeof form.paidAmount === "number") {
      setPaidAmountDisplay(formatNumber(form.paidAmount));
    }
  }

  // Filter Components
  type ITUserOption = { id: number; name: string; phone?: string | null };

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
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm cursor-pointer focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF]"
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
                <div
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${!value ? "bg-blue-50" : ""
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
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${idx === highlight ? "bg-gray-100" : ""
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
                      <div className="text-xs text-gray-500">{opt.phone}</div>
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
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${idx + 7 === highlight ? "bg-gray-100" : ""
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
                        <div className="text-xs text-gray-500">{opt.phone}</div>
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
        title="Hợp đồng bảo trì | TAGTECH"
        description="Quản lý hợp đồng bảo trì: danh sách, tìm kiếm, tạo, sửa, xóa"
      />

      <div className="space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold mb-0">Hợp đồng bảo trì</h1>
          {canEdit && (
            <button
              className="rounded-xl border border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-600 hover:shadow-md flex items-center gap-2"
              onClick={onCreate}
            >
              <PlusIcon style={{ width: 18, height: 18, fill: 'white' }} />
              <span>Thêm mới</span>
            </button>
          )}
        </div>

        {/* Filters & Actions */}
        <ComponentCard title="Tìm kiếm & Lọc">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Tìm theo mã hợp đồng / bệnh viện"
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              className="rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm min-w-[240px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
            />
            <div className="relative" ref={dateFilterRef}>
              <button
                type="button"
                onClick={() => {
                  setPendingFilterStart(filterStartFrom);
                  setPendingFilterEnd(filterStartTo);
                  setDateFilterOpen((prev) => !prev);
                }}
                className="rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm hover:bg-gray-50 transition flex items-center gap-2"
              >
                <span>📅</span>
                <span>Lọc theo ngày ký HD</span>
              </button>
              {dateFilterOpen && (
                <div className="absolute z-40 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Bắt đầu từ</label>
                    <input
                      type="date"
                      value={pendingFilterStart}
                      onChange={(e) => setPendingFilterStart(e.target.value)}
                      ref={pendingStartInputRef}
                      onFocus={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          e.currentTarget.showPicker();
                        }
                      }}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          e.currentTarget.showPicker();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Đến</label>
                    <input
                      type="date"
                      value={pendingFilterEnd}
                      onChange={(e) => setPendingFilterEnd(e.target.value)}
                      ref={pendingEndInputRef}
                      onFocus={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          e.currentTarget.showPicker();
                        }
                      }}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          e.currentTarget.showPicker();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFilterStart("");
                        setPendingFilterEnd("");
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Xóa chọn
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDateFilterOpen(false)}
                        className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFilterOpen(false);
                          setFilterStartFrom(pendingFilterStart);
                          setFilterStartTo(pendingFilterEnd);
                        }}
                        className="px-3 py-1.5 text-sm rounded-full bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Lọc
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Người phụ trách</span>
              <FilterPersonInChargeSelect
                value={qPicUserId ? String(qPicUserId) : ""}
                onChange={(v) => setQPicUserId(v)}
                options={picOptions.map(opt => ({
                  id: opt.id,
                  name: opt.label,
                  phone: opt.phone || null,
                }))}
              />
            </div>
          </div>
          {/* ✅ New filter row */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Trạng thái hợp đồng */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Trạng thái HĐ</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition min-w-[150px]"
              >
                <option value="">Tất cả</option>
                <option value="DANG_HOAT_DONG">🔵 Đang hoạt động</option>
                <option value="SAP_HET_HAN">🟡 Sắp hết hạn</option>
                <option value="HET_HAN">🔴 Hết hạn</option>
                <option value="DA_GIA_HAN">🟢 Đã gia hạn</option>
              </select>
            </div>
            {/* Trạng thái thanh toán */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Thanh toán</span>
              <select
                value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition min-w-[150px]"
              >
                <option value="">Tất cả</option>
                <option value="THANH_TOAN_HET"> Thanh toán hết</option>
                <option value="DA_THANH_TOAN"> Đã thanh toán</option>
                <option value="CHUA_THANH_TOAN"> Chưa thanh toán</option>
              </select>
            </div>
            {/* Hết hạn trong X ngày */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Hết hạn trong</span>
              <select
                value={filterExpiresWithinDays}
                onChange={(e) => setFilterExpiresWithinDays(e.target.value)}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition min-w-[130px]"
              >
                <option value="">Tất cả</option>
                <option value="7">7 ngày</option>
                <option value="30">30 ngày</option>
                <option value="60">60 ngày</option>
                <option value="90">90 ngày</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* <button
                type="button"
                onClick={() => {
                  setFilterStartFrom(pendingFilterStart);
                  setFilterStartTo(pendingFilterEnd);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 transition"
              >
                <span>Lọc</span>
              </button> */}
              <button
                type="button"
                onClick={() => {
                  setQSearch("");
                  setQPicUserId("");
                  setFilterStartFrom("");
                  setFilterStartTo("");
                  setPendingFilterStart("");
                  setPendingFilterEnd("");
                  setFilterStatus("");
                  setFilterPaymentStatus("");
                  setFilterExpiresWithinDays("");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                <span>Xóa</span>
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={exporting || loading || items.length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Đang xuất...</span>
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    <span>Xuất Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="mt-4 text-sm font-semibold text-gray-700">
            Tổng hợp đồng:
            <span className="ml-1 text-blue-800">{totalElements}</span>
          </div>
          {/* ✅ Active filters display */}
          {(filterStartFrom || filterStartTo || filterStatus || filterPaymentStatus || filterExpiresWithinDays) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              {(filterStartFrom || filterStartTo) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                  📅 {formatFilterDateLabel(filterStartFrom)} - {formatFilterDateLabel(filterStartTo)}
                  <button onClick={() => { setFilterStartFrom(""); setFilterStartTo(""); setPendingFilterStart(""); setPendingFilterEnd(""); }} className="ml-1 text-blue-500 hover:text-blue-700">×</button>
                </span>
              )}
              {filterStatus && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                  {filterStatus === "DANG_HOAT_DONG" && "🔵 Đang hoạt động"}
                  {filterStatus === "SAP_HET_HAN" && "🟡 Sắp hết hạn"}
                  {filterStatus === "HET_HAN" && "🔴 Hết hạn"}
                  {filterStatus === "DA_GIA_HAN" && "🟢 Đã gia hạn"}
                  <button onClick={() => setFilterStatus("")} className="ml-1 text-blue-500 hover:text-blue-700">×</button>
                </span>
              )}
              {filterPaymentStatus && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-green-700">
                  {filterPaymentStatus === "THANH_TOAN_HET" ? " Thanh toán hết" : filterPaymentStatus === "DA_THANH_TOAN" ? " Đã thanh toán" : " Chưa thanh toán"}
                  <button onClick={() => setFilterPaymentStatus("")} className="ml-1 text-green-500 hover:text-green-700">×</button>
                </span>
              )}
              {filterExpiresWithinDays && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-orange-700">
                  ⏰ Hết hạn trong {filterExpiresWithinDays} ngày
                  <button onClick={() => setFilterExpiresWithinDays("")} className="ml-1 text-orange-500 hover:text-orange-700">×</button>
                </span>
              )}
            </div>
          )}
        </ComponentCard>

        {/* Table list */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
              Danh sách hợp đồng bảo trì
            </h3>
          </div>
          <div className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("id")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        STT
                        {renderSortIcon("id")}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("hospital")}
                    >
                      <div className="flex items-center gap-1">
                        Bệnh viện
                        {renderSortIcon("hospital")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("contractCode")}
                    >
                      <div className="flex items-center gap-1">
                        Mã hợp đồng
                        {renderSortIcon("contractCode")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("picUser")}
                    >
                      <div className="flex items-center gap-1">
                        Người phụ trách
                        {renderSortIcon("picUser")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("durationYears")}
                    >
                      <div className="flex items-center gap-1">
                        Thời hạn
                        {renderSortIcon("durationYears")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400"
                    >
                      Số Kiosk BT
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("startDate")}
                    >
                      <div className="flex items-center gap-1">
                        Ngày ký HD
                        {renderSortIcon("startDate")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("endDate")}
                    >
                      <div className="flex items-center gap-1">
                        Ngày hết hạn HD
                        {renderSortIcon("endDate")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("status")}
                    >
                      <div className="flex items-center gap-1">
                        Trạng thái
                        {renderSortIcon("status")}
                      </div>
                    </th>
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("paymentStatus")}
                    >
                      <div className="flex items-center gap-1">
                        Thanh toán
                        {renderSortIcon("paymentStatus")}
                      </div>
                    </th>
                    {/* <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Giá (1 năm)
                    </th> */}
                    <th
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      onClick={() => handleSort("totalPrice")}
                    >
                      <div className="flex items-center gap-1">
                        Tổng tiền
                        {renderSortIcon("totalPrice")}
                      </div>
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                      Còn lại
                    </th>
                    <th className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)]">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                          <span>Đang tải dữ liệu...</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-12 text-center text-red-500 dark:text-red-400">
                        {error}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col items-center">
                          <svg
                            className="mb-3 h-12 w-12 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                          </svg>
                          <span className="text-sm">Không có dữ liệu</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const stt = page * size + index + 1;
                      return (
                        <tr
                          key={item.id}
                          className="group transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          onMouseEnter={() => setHoveredId(item.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          {/* STT */}
                          <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                            {stt}
                          </td>
                          {/* Bệnh viện */}
                          <td className="min-w-[180px] px-4 py-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.hospital?.label ?? '—'}
                            </div>
                          </td>
                          {/* Mã hợp đồng */}
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                              {item.contractCode ?? '—'}
                            </span>
                          </td>
                          {/* Người phụ trách */}
                          <td className="whitespace-nowrap px-4 py-3 min-w-[140px]">
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium">{item.picUser?.label ?? '—'}</div>
                              {item.picUser?.subLabel && (
                                <div className="text-xs text-gray-500">{item.picUser.subLabel}</div>
                              )}
                            </div>
                          </td>
                          {/* Thời hạn */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {item.durationYears ? `${item.durationYears} ` : '—'}
                          </td>
                          {/* Số Kiosk BT */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {typeof item.kioskQuantity === "number" ? item.kioskQuantity : (item.kioskQuantity ?? "—")}
                          </td>
                          {/* Ngày ký HD */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.startDate ? (
                              <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                                <FiCalendar className="h-4 w-4 text-gray-400" />
                                <span>{fmtDate(item.startDate)}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          {/* Ngày kết thúc */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.endDate ? (
                              <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                                <FiCalendar className="h-4 w-4 text-gray-400" />
                                <span>{fmtDate(item.endDate)}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          {/* Trạng thái */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.status ? (
                              (() => {
                                const config = statusConfig[item.status] || { label: item.status, bgColor: "bg-gray-100", textColor: "text-gray-700" };
                                return (
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                                    {config.label}
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          {/* Thanh toán */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.paymentStatus === "THANH_TOAN_HET" ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                                  Thanh toán hết
                                </span>
                                {typeof item.paidAmount === "number" && (
                                  <span className="text-xs text-center text-gray-600">
                                    {formatCurrency(item.paidAmount)}
                                  </span>
                                )}
                              </div>
                            ) : item.paymentStatus === "DA_THANH_TOAN" ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                                  Đã thanh toán
                                </span>
                                {typeof item.paidAmount === "number" && (
                                  <span className="text-xs text-center text-gray-600">
                                    {formatCurrency(item.paidAmount)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                                Chưa thanh toán
                              </span>
                            )}
                          </td>
                          {/* Giá (1 năm) */}
                          {/* <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {formatCurrency(item.yearlyPrice)}
                          </td> */}
                          {/* Tổng tiền */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(item.totalPrice)}
                          </td>
                          {/* Còn lại */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">
                            {(() => {
                              const totalPrice = item.totalPrice || 0;
                              const paidAmount = (typeof item.paidAmount === "number" ? item.paidAmount : 0) || 0;
                              const remaining = totalPrice - paidAmount;
                              return formatCurrency(remaining);
                            })()}
                          </td>
                          {/* Thao tác */}
                          <td className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-white px-4 py-3 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)] dark:group-hover:bg-gray-800/50">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                title="Xem chi tiết"
                                onClick={() => onView(item)}
                                className="rounded-lg p-1.5 text-gray-500 transition hover:bg-blue-100 hover:text-blue-600"
                              >
                                <FiEye className="h-4 w-4" />
                              </button>
                              {canEdit && (
                                <>
                                  <button
                                    title="Sửa"
                                    onClick={() => onEdit(item)}
                                    className="rounded-lg p-1.5 text-gray-500 transition hover:bg-yellow-100 hover:text-yellow-600"
                                  >
                                    <FiEdit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    title="Xóa"
                                    onClick={() => onDelete(item.id)}
                                    className="rounded-lg p-1.5 text-gray-500 transition hover:bg-red-100 hover:text-red-600"
                                  >
                                    <FiTrash2 className="h-4 w-4" />
                                  </button>
                                </>
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

          {/* Pagination */}
          {!loading && totalElements > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalElements}
                itemsPerPage={size}
                onPageChange={setPage}
                onItemsPerPageChange={(newSize) => {
                  setSize(newSize);
                  setPage(0);
                }}
                itemsPerPageOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      </div>

      {/* View Modal */}
      <AnimatePresence>
        {open && isViewing && viewing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white text-xl font-bold">
                    📋
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {isModalLoading ? "Đang tải..." : "Chi tiết hợp đồng bảo trì"}
                    </h3>
                    {viewing && !isModalLoading && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {viewing.contractCode || "Hợp đồng bảo trì"}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto flex-1">
                {isModalLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600 dark:text-gray-400">Đang tải...</p>
                    </div>
                  </div>
                ) : viewing ? (
                  <div className="p-6">
                    <div className="space-y-5">
                      {/* Thông tin chung */}
                      <div>
                        <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Thông tin chung</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <DetailField label="Mã hợp đồng" value={viewing.contractCode} />
                          <DetailField label="Bệnh viện" value={viewing.hospital?.label} />
                          <DetailField
                            label="Người phụ trách"
                            value={viewing.picUser?.label ? (
                              <div>
                                <div className="font-medium text-gray-900">{viewing.picUser.label}</div>
                                {viewing.picUser.subLabel && (
                                  <div className="text-sm text-gray-500 mt-0.5">{viewing.picUser.subLabel}</div>
                                )}
                              </div>
                            ) : null}
                          />
                          <DetailField label="Thời hạn" value={viewing.durationYears} />
                          {(viewing as any).status && (
                            <DetailField
                              label="Trạng thái hợp đồng"
                              value={
                                (() => {
                                  const status = (viewing as any).status;
                                  const config = statusConfig[status] || statusConfig.DANG_HOAT_DONG;
                                  return (
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bgColor} ${config.textColor} border ${config.borderColor || 'border-transparent'}`}>
                                      {config.label}
                                    </span>
                                  );
                                })()
                              }
                            />
                          )}
                        </div>
                      </div>
                      <hr className="my-3 border-gray-200" />

                      {/* Thông tin tài chính */}
                      <div>
                        <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Thông tin tài chính</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {viewing.yearlyPrice != null && (
                            <DetailField
                              label="Giá/năm"
                              value={<span className="font-semibold text-gray-900">{formatCurrency(viewing.yearlyPrice)}</span>}
                            />
                          )}
                          {viewing.totalPrice != null && (
                            <DetailField
                              label="Tổng tiền"
                              value={<span className="font-semibold text-lg text-gray-900">{formatCurrency(viewing.totalPrice)}</span>}
                            />
                          )}
                          <DetailField
                            label="Trạng thái thanh toán"
                            value={
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(viewing as any).paymentStatus === 'THANH_TOAN_HET' ? 'bg-emerald-100 text-emerald-800' :
                                (viewing as any).paymentStatus === 'DA_THANH_TOAN' ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                {(viewing as any).paymentStatus === 'THANH_TOAN_HET' ? 'Thanh toán hết' :
                                  (viewing as any).paymentStatus === 'DA_THANH_TOAN' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                              </span>
                            }
                          />
                          {typeof (viewing as any).paidAmount === 'number' && (viewing as any).paidAmount > 0 && (
                            <DetailField
                              label="Đã thanh toán"
                              value={<span className="font-semibold text-gray-900">{formatCurrency((viewing as any).paidAmount)}</span>}
                            />
                          )}
                          {(() => {
                            const total = viewing.totalPrice ?? 0;
                            const paid = typeof (viewing as any).paidAmount === 'number' ? (viewing as any).paidAmount : 0;
                            const remaining = total - paid;
                            return (
                              <DetailField
                                label="Còn lại"
                                value={
                                  <span className={`font-semibold ${remaining <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {remaining <= 0 ? '0 ₫' : formatCurrency(remaining)}
                                  </span>
                                }
                              />
                            );
                          })()}
                        </div>
                      </div>
                      <hr className="my-3 border-gray-200" />

                      {/* Timeline */}
                      <div>
                        <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Timeline</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {viewing.startDate && <DetailField label="Ngày ký HD" value={fmt(viewing.startDate)} />}
                          {viewing.endDate && <DetailField label="Ngày hết hạn HD" value={fmt(viewing.endDate)} />}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-gray-500 dark:text-gray-400">Không tìm thấy thông tin</p>
                  </div>
                )}
              </div>

              {/* Footer - close button on the right (same as Business detail modal) */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition dark:bg-indigo-600 dark:hover:bg-indigo-700"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <MaintainContractForm
        open={open && !isViewing}
        isViewing={isViewing}
        isEditing={isEditing}
        isModalLoading={isModalLoading}
        form={form}
        setForm={setForm}
        onSubmit={onSubmit}
        onClose={closeModal}
        error={error}
        loading={loading}
        canEdit={canEdit}
        selectedHospital={selectedHospital}
        setSelectedHospital={setSelectedHospital}
        selectedPic={selectedPic}
        setSelectedPic={setSelectedPic}
        picOptions={picOptions}
        yearlyPriceDisplay={yearlyPriceDisplay}
        setYearlyPriceDisplay={setYearlyPriceDisplay}
        totalPriceDisplay={totalPriceDisplay}
        setTotalPriceDisplay={setTotalPriceDisplay}
        handlePriceChange={handlePriceChange}
        handlePriceBlur={handlePriceBlur}
        handlePriceFocus={handlePriceFocus}
        handleTotalPriceChange={handleTotalPriceChange}
        handleTotalPriceBlur={handleTotalPriceBlur}
        handleTotalPriceFocus={handleTotalPriceFocus}
        paidAmountDisplay={paidAmountDisplay}
        setPaidAmountDisplay={setPaidAmountDisplay}
        handlePaidAmountChange={handlePaidAmountChange}
        handlePaidAmountBlur={handlePaidAmountBlur}
        handlePaidAmountFocus={handlePaidAmountFocus}
        paidAmountError={paidAmountError}
      />

      {/* Confirm Create Modal */}
      <AnimatePresence>
        {confirmCreateOpen && pendingSubmit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="absolute inset-0 bg-black/50" onClick={cancelCreate} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative z-[111] w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-orange-100">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      Xác nhận tạo hợp đồng mới
                    </h3>
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-sm text-orange-700">
                        Bệnh viện <span className="font-bold">"{hospitalNameForConfirm}"</span> đã có hợp đồng bảo trì. Bạn có muốn tạo thêm hợp đồng mới không?
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={cancelCreate}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition"
                    disabled={loading}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={confirmCreate}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Đang tạo..." : "Tạo mới"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {confirmDeleteOpen && pendingDeleteId !== null && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="absolute inset-0 bg-black/50" onClick={cancelDelete} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative z-[111] w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-red-100">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      Xác nhận xóa hợp đồng bảo trì
                    </h3>
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        Bạn có chắc chắn muốn xóa hợp đồng bảo trì này? Hành động này không thể hoàn tác.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition"
                    disabled={loading}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

