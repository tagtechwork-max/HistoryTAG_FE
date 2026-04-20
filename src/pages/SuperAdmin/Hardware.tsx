import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import toast from "react-hot-toast";
import { AiOutlineEye, AiOutlineEdit, AiOutlineDelete } from "react-icons/ai";
import { FaHospital } from "react-icons/fa";
import { FiMapPin, FiUser, FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import ExcelJS from "exceljs";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { HardwareAPI, HardwareRequestDTO, HardwareResponseDTO } from "../../api/superadmin.api";

type Hardware = HardwareResponseDTO;

// API config
const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
    : { Accept: "application/json" };
}

type HardwareForm = {
  name: string;
  type?: string;
  supplier?: string;
  warrantyPeriod?: string;
  notes?: string;
  imageFile?: File | null;
  price?: number | null;
};

// Hospital type for statistics
interface HospitalStat {
  id: number;
  name: string;
  province?: string | null;
  address?: string | null;
  projectStatus?: string | null;
  personInChargeName?: string | null;
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

export default function HardwarePage() {
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<Hardware[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hardware | null>(null);
  const [viewing, setViewing] = useState<Hardware | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  // Hospital statistics
  const [hospitalStats, setHospitalStats] = useState<Record<number, number>>({}); // Only store count
  const [hospitalsModalOpen, setHospitalsModalOpen] = useState(false);
  const [selectedHardwareId, setSelectedHardwareId] = useState<number | null>(null);
  const [selectedHospitals, setSelectedHospitals] = useState<HospitalStat[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);

  const [form, setForm] = useState<HardwareForm>({
    name: "",
    type: "",
    supplier: "",
    warrantyPeriod: "",
    notes: "",
    imageFile: null,
    price: null,
  });

  function formatPrice(v?: number | null) {
    if (v == null) return "—";
    try {
      return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
    } catch (e) {
      return String(v);
    }
  }

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setViewing(null);
    setError(null);
    setIsModalLoading(false);
    setForm({ name: "", type: "", supplier: "", warrantyPeriod: "", notes: "", imageFile: null, price: null });
    setImagePreview(null);
    setShowImageModal(false);
  }

  function fillForm(h: Hardware) {
    setForm({
      name: h.name ?? "",
      type: h.type ?? "",
      supplier: h.supplier ?? "",
      warrantyPeriod: h.warrantyPeriod ?? "",
      notes: h.notes ?? "",
      imageFile: null,
      price: h.price != null ? Number(h.price) : null,
    });
    setImagePreview(h.imageUrl || null);
  }

  async function fetchDetails(id: number): Promise<Hardware | null> {
    setIsModalLoading(true);
    setError(null);
    try {
      const data = await HardwareAPI.getHardwareById(id);
      return data as Hardware;
    } catch (e: any) {
      setError(e.message || "Lỗi tải chi tiết phần cứng");
      return null;
    } finally {
      setIsModalLoading(false);
    }
  }

  async function fetchList() {
    setLoading(true);
    setError(null);
    try {
      const data = await HardwareAPI.getAllHardware({
        search: search || undefined,
        type: filterType || undefined,
        page,
        size,
        sortBy,
        sortDir,
      });
      if (Array.isArray(data)) {
        setItems(data);
        setTotalElements(data.length);
        setTotalPages(Math.ceil(data.length / size));
      } else {
        setItems((data as any).content || []);
        setTotalElements((data as any).totalElements || 0);
        setTotalPages((data as any).totalPages || Math.ceil(((data as any).totalElements || 0) / size));
      }
    } catch (e: any) {
      setError(e.message || "Lỗi tải danh sách");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, size, sortBy, sortDir]);

  // Load hospital counts for all hardware items
  useEffect(() => {
    if (items.length === 0) return;
    
    const loadCounts = async () => {
      try {
        // Fetch all hospitals once
        const url = new URL(`${API_BASE}/api/v1/auth/hospitals`);
        url.searchParams.set("page", "0");
        url.searchParams.set("size", "10000"); // Get all hospitals
        
        const res = await fetch(url.toString(), { headers: { ...authHeader() } });
        if (!res.ok) return;
        
        const data = await res.json();
        const allHospitals = Array.isArray(data) ? data : (data.content ?? []);
        
        // Count hospitals per hardware
        const counts: Record<number, number> = {};
        items.forEach((hw) => {
          counts[hw.id] = allHospitals.filter((h: any) => h.hardwareId === hw.id).length;
        });
        
        setHospitalStats(counts);
      } catch (e) {
        console.error("Error loading hospital counts:", e);
      }
    };
    
    loadCounts();
  }, [items]);

  // Fetch hospitals when modal opens
  async function loadHospitalsForHardware(hardwareId: number) {
    setHospitalsLoading(true);
    try {
      const url = new URL(`${API_BASE}/api/v1/auth/hospitals`);
      url.searchParams.set("page", "0");
      url.searchParams.set("size", "10000");
      
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) {
        setSelectedHospitals([]);
        return;
      }
      
      const data = await res.json();
      const allHospitals = Array.isArray(data) ? data : (data.content ?? []);
      
      // Filter hospitals by hardwareId
      const hospitals = allHospitals
        .filter((h: any) => h.hardwareId === hardwareId)
        .map((h: any) => ({
          id: h.id,
          name: h.name,
          province: h.province,
          address: h.address,
          projectStatus: h.projectStatus,
          personInChargeName: h.personInChargeName,
        }));
      
      setSelectedHospitals(hospitals);
    } catch (e) {
      console.error("Error loading hospitals:", e);
      setSelectedHospitals([]);
    } finally {
      setHospitalsLoading(false);
    }
  }

  // Export hospitals to Excel
  async function exportHospitalsExcel() {
    if (!selectedHardwareId || selectedHospitals.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    try {
      const hardwareName = items.find((h) => h.id === selectedHardwareId)?.name || "Phần cứng";
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Danh sách bệnh viện");

      // Title row: "Tên Phần cứng" - only style the first 5 cells
      const titleRow = worksheet.addRow([hardwareName, "", "", "", ""]); // Add empty cells for columns B, C, D, E
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
      titleCell.value = hardwareName;
      
      // Clear any style from cells beyond column 5 in title row
      for (let col = 6; col <= 20; col++) {
        try {
          const cell = titleRow.getCell(col);
          if (cell) {
            cell.value = null;
            cell.style = {};
            try { delete (cell as any).fill; } catch {}
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
      a.download = `danh_sach_benh_vien_${hardwareName.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
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

  const filtered = useMemo(() => {
    if (!search) return items;
    return items.filter((it) => (it.name || "").toLowerCase().includes(search.toLowerCase()));
  }, [items, search]);

  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({ name: "", type: "", supplier: "", warrantyPeriod: "", notes: "", imageFile: null, price: null });
    setImagePreview(null);
    setOpen(true);
  }

  async function onView(h: Hardware) {
    setEditing(null);
    setViewing(null);
    setOpen(true);
    const details = await fetchDetails(h.id);
    if (details) {
      setViewing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onEdit(h: Hardware) {
    setViewing(null);
    setEditing(null);
    setOpen(true);
    const details = await fetchDetails(h.id);
    if (details) {
      setEditing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onDelete(id: number) {
    const ok = await askConfirm({
      title: "Xóa phần cứng?",
      message: "Bạn có chắc muốn xóa phần cứng này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await HardwareAPI.deleteHardware(id);
      await fetchList();
      toast.success("Xóa phần cứng thành công");
    } catch (e: any) {
      toast.error(e.message || "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên phần cứng không được để trống");
      return;
    }
    if (isViewing) return;

    setLoading(true);
    setError(null);
    try {
      const payload: HardwareRequestDTO = {
        name: form.name.trim(),
        type: form.type || undefined,
        supplier: form.supplier || undefined,
        warrantyPeriod: form.warrantyPeriod || undefined,
        notes: form.notes || undefined,
          imageFile: form.imageFile || undefined,
          price: form.price != null ? form.price : undefined,
      };

      if (isEditing) {
        await HardwareAPI.updateHardware(editing!.id, payload);
      } else {
        await HardwareAPI.createHardware(payload);
      }
      closeModal();
      setPage(0);
      await fetchList();
      toast.success(isEditing ? "Cập nhật phần cứng thành công" : "Tạo phần cứng thành công");
    } catch (e: any) {
      setError(e.message || "Lưu thất bại");
      toast.error(e.message || "Lưu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function onFileChange(file: File | null) {
    setForm((s) => ({ ...s, imageFile: file }));
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }

  return (
    <>
      <PageMeta title="Quản lý Phần cứng – CRUD" description="Quản lý phần cứng: danh sách, tìm kiếm, tạo, sửa, xóa" />

      <div className="space-y-10">
        <ComponentCard title="Tìm kiếm & Thao tác">
          <div className="flex flex-wrap items-center gap-3">
            <input className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 bg-white" placeholder="Tìm theo tên" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-lg border px-3 py-2 text-sm border-gray-300 bg-white min-w-[180px]" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">Tất cả loại</option>
              {Array.from(new Set(items.map((i) => i.type).filter(Boolean))).map((t) => (
                <option key={t as string} value={t as string}>{t as string}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterType("");
              }}
              className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
            >
              Bỏ lọc
            </button>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">Tổng: <span className="font-semibold text-gray-900">{totalElements}</span></p>
            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-600 hover:shadow-md" onClick={onCreate}> + Thêm phần cứng</button>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard title="Danh sách phần cứng">
          <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div className="space-y-4">
            {filtered.map((h, idx) => {
              const delayMs = Math.round(idx * (2000 / Math.max(1, filtered.length)));
              return (
                <div
                  key={h.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onView(h)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(h); } }}
                  className="group bg-white rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1 group-hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 cursor-pointer"
                  style={{ animation: `fadeInUp 600ms ease ${delayMs}ms both` }}
                >
                  <div className="flex items-center gap-4 w-full md:w-2/3">
                    <div className="flex-shrink-0">
                      {h.imageUrl ? (
                        <img src={h.imageUrl} alt={h.name} className="h-12 w-12 rounded-lg object-cover ring-2 ring-gray-100" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 ring-2 ring-gray-100" />
                      )}
                    </div>

                    <div className="hidden md:block w-px h-10 bg-gray-100 rounded mx-2" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 title={h.name} className="font-semibold text-gray-900 truncate group-hover:text-blue-800">{h.name}</h4>
                        <span className="ml-2">
                          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm">{h.type || "—"}</span>
                          {h.warrantyPeriod && <span className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-0.5 text-xs font-semibold text-white shadow-sm ml-2">{h.warrantyPeriod}</span>}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="truncate"><span className="text-xs text-gray-400">Nhà cung cấp: </span><span title={h.supplier || ""} className="font-medium text-gray-800">{h.supplier || "—"}</span></div>
                        <div className="truncate mt-1"><span className="text-xs text-gray-400">Ghi chú: </span><span title={h.notes || ""} className="text-gray-700">{h.notes || "—"}</span></div>
                        <div className="truncate mt-1"><span className="text-xs text-gray-400">Giá: </span><span title={String(h.price ?? "—")} className="font-medium text-gray-800">{formatPrice(h.price)}</span></div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHardwareId(h.id);
                              setHospitalsModalOpen(true);
                              loadHospitalsForHardware(h.id);
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

                  <div className="flex items-center justify-between w-full md:w-1/3">
                    <div className="hidden md:flex flex-col text-right text-sm text-gray-600">
                      <span className="text-xs text-gray-400">Ngày tạo</span>
                      <span className="font-medium">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : "—"}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); onView(h); }} title="Xem" aria-label={`Xem ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition transform group-hover:scale-105 text-xs font-medium">
                        <AiOutlineEye className="w-4 h-4" />
                        <span className="hidden sm:inline">Xem</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(h); }} title="Sửa" aria-label={`Sửa ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition transform group-hover:scale-105 text-xs font-medium">
                        <AiOutlineEdit className="w-4 h-4" />
                        <span className="hidden sm:inline">Sửa</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(h.id); }} title="Xóa" aria-label={`Xóa ${h.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition transform group-hover:scale-105 text-xs font-medium">
                        <AiOutlineDelete className="w-4 h-4" />
                        <span className="hidden sm:inline">Xóa</span>
                      </button>
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
          {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </ComponentCard>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-gray-900">{isViewing ? "Chi tiết phần cứng" : (isEditing ? "Cập nhật phần cứng" : "Thêm phần cứng")}</h3>
              <button className="rounded-xl p-2 transition-all hover:bg-gray-100 hover:scale-105" onClick={closeModal}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
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
              // Layout cho chế độ xem chi tiết - ảnh bên trái, nội dung bên phải
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Phần ảnh bên trái */}
                <div className="lg:w-1/3 flex flex-col items-center">
                  <div className="w-full max-w-sm">
                    {imagePreview ? (
                      <div className="relative cursor-pointer group" onClick={() => setShowImageModal(true)}>
                        <img 
                          src={imagePreview} 
                          alt={form.name} 
                          className="w-full h-80 rounded-3xl object-cover shadow-2xl ring-4 ring-gray-100 transition-transform group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/20 to-transparent group-hover:from-black/30 transition-colors"></div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg">
                            <svg className="h-8 w-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-80 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 shadow-2xl ring-4 ring-gray-100 flex items-center justify-center">
                        <div className="text-center text-gray-400">
                          <svg className="mx-auto h-16 w-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm">Không có ảnh</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <h2 className="mt-6 text-2xl font-bold text-gray-900 text-center">{form.name}</h2>
                </div>

                {/* Phần nội dung bên phải */}
                <div className="lg:w-2/3 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-blue-800 mb-2">Loại phần cứng</label>
                      <p className="text-lg font-medium text-blue-900">{form.type || "—"}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-green-800 mb-2">Nhà cung cấp</label>
                      <p className="text-lg font-medium text-green-900">{form.supplier || "—"}</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-purple-800 mb-2">Thời gian bảo hành</label>
                      <p className="text-lg font-medium text-purple-900">{form.warrantyPeriod || "—"}</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-orange-800 mb-2">ID</label>
                      <p className="text-lg font-medium text-orange-900">#{viewing?.id}</p>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-yellow-800 mb-2">Giá</label>
                      <p className="text-lg font-medium text-yellow-900">{formatPrice(form.price)}</p>
                    </div>
                  </div>
                  
                  {form.notes && (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6">
                      <label className="block text-sm font-semibold text-gray-800 mb-3">Ghi chú</label>
                      <p className="text-gray-700 leading-relaxed">{form.notes}</p>
                    </div>
                  )}

                  <div className="flex justify-end pt-6 border-t border-gray-200">
                    <button 
                      type="button" 
                      className="rounded-xl border-2 border-gray-300 bg-white px-8 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400 hover:shadow-md" 
                      onClick={closeModal}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Layout cho chế độ chỉnh sửa/tạo mới
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Tên phần cứng*</label>
                    <input required className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} disabled={isViewing} />
                  </div>
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Giá (VND)</label>
                    <input type="number" step="0.01" min="0" className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.price ?? ""} onChange={(e) => setForm((s) => ({ ...s, price: e.target.value === "" ? null : Number(e.target.value) }))} disabled={isViewing} />
                  </div>
                </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Loại</label>
                    <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.type || ""} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))} disabled={isViewing} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Hình ảnh</label>
                    <input type="file" accept="image/*" disabled={isViewing} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
                    {imagePreview && (
                      <div className="mt-3">
                        <img src={imagePreview} className="h-32 w-32 rounded-2xl object-cover shadow-md ring-2 ring-gray-200" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Nhà cung cấp</label>
                    <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.supplier || ""} onChange={(e) => setForm((s) => ({ ...s, supplier: e.target.value }))} disabled={isViewing} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Thời gian bảo hành</label>
                    <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.warrantyPeriod || ""} onChange={(e) => setForm((s) => ({ ...s, warrantyPeriod: e.target.value }))} disabled={isViewing} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Ghi chú</label>
                    <textarea className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" rows={3} value={form.notes || ""} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} disabled={isViewing} />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 mt-4 flex items-center justify-between border-t border-gray-200 pt-6">
                  {error && <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
                  <div className="ml-auto flex items-center gap-3">
                    <button type="button" className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400" onClick={closeModal}>Huỷ</button>
                      <button type="submit" className="rounded-xl border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading}>
                        {loading ? "Đang lưu..." : (isEditing ? "Cập nhật" : "Tạo mới")}
                      </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal xem ảnh phóng to */}
      {showImageModal && imagePreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowImageModal(false)} />
          <div className="relative z-10 max-w-6xl max-h-[90vh] flex flex-col items-center">
            <div className="mb-4 flex items-center justify-between w-full">
              <h3 className="text-xl font-semibold text-white">{form.name}</h3>
              <button 
                className="rounded-full bg-white/20 backdrop-blur-sm p-2 text-white transition-all hover:bg-white/30 hover:scale-105" 
                onClick={() => setShowImageModal(false)}
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="relative max-w-5xl max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl">
              <img 
                src={imagePreview} 
                alt={form.name} 
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="mt-4 text-center text-white/80 text-sm">
              Click vào vùng tối để đóng
            </div>
          </div>
        </div>
      )}

      {/* Hospitals Modal */}
      <AnimatePresence mode="wait">
        {hospitalsModalOpen && selectedHardwareId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setHospitalsModalOpen(false);
                setSelectedHardwareId(null);
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
                      Danh sách bệnh viện sử dụng phần cứng:{" "}
                      <span className="text-blue-600">{items.find((h) => h.id === selectedHardwareId)?.name}</span>
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
                        setSelectedHardwareId(null);
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
                    <span className="text-sm">Chưa có bệnh viện nào sử dụng phần cứng này</span>
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
                    setSelectedHardwareId(null);
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
}

