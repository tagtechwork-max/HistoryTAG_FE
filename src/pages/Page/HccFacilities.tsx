import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { AiOutlineDelete, AiOutlineEdit, AiOutlineEye, AiOutlinePlus } from "react-icons/ai";
import { FiMapPin, FiUsers } from "react-icons/fi";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

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
  "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái",
];

type SortDir = "asc" | "desc";

export interface HccFacilityUserBrief {
  id: number;
  fullname: string;
  email?: string | null;
}

export interface HccFacilityResponseDTO {
  id: number;
  name: string;
  province?: string | null;
  primaryResponsibleUserId: number;
  primaryResponsibleFullname?: string | null;
  secondaryResponsibles: HccFacilityUserBrief[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

type EntitySelect = { id: number; label: string; subLabel?: string | null };

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const ADMIN_BASE = `${API_BASE}/api/v1/admin/hcc-facilities`;
const SUPERADMIN_BASE = `${API_BASE}/api/v1/superadmin/hcc-facilities`;

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }
    : { "Content-Type": "application/json", Accept: "application/json" };
}

function buildUrl(path: string): URL {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return new URL(path);
  }
  if (API_BASE) {
    return new URL(path, API_BASE);
  }
  return new URL(path, window.location.origin);
}

function getApiBase(method: string, isSuperAdminUser: boolean): string {
  if (method === "GET") {
    return ADMIN_BASE;
  }
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    return isSuperAdminUser ? SUPERADMIN_BASE : ADMIN_BASE;
  }
  return ADMIN_BASE;
}

function readRoles(): string[] {
  try {
    const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
    if (!rolesStr) return [];
    const roles = JSON.parse(rolesStr);
    return Array.isArray(roles) ? roles.map((r: unknown) => String(r).toUpperCase()) : [];
  } catch {
    return [];
  }
}

function ProvinceSearchSelect({
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
    return VIETNAM_PROVINCES.filter(
      (province) =>
        province.toLowerCase().includes(q) ||
        province
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(q),
    );
  }, [searchQuery]);

  const displayOptions = filteredOptions.slice(0, 12);
  const hasMore = filteredOptions.length > 12;

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
        className={`cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-within:border-[#4693FF] focus-within:ring-1 focus-within:ring-[#4693FF] dark:border-slate-600 dark:bg-slate-800 ${disabled ? "cursor-not-allowed bg-gray-50 opacity-50 dark:bg-slate-900" : ""}`}
        onClick={() => {
          if (!disabled) setOpenBox(!openBox);
        }}
      >
        {openBox ? (
          <input
            type="text"
            className="w-full bg-transparent outline-none"
            placeholder={placeholder || "Tìm kiếm tỉnh/thành..."}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHighlight(-1);
            }}
            onKeyDown={(e) => {
              const total = displayOptions.length + (hasMore ? 1 : 0);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(0, total - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (highlight >= 0 && highlight < displayOptions.length) {
                  onChange(displayOptions[highlight]);
                  setOpenBox(false);
                  setSearchQuery("");
                }
              } else if (e.key === "Escape") {
                setOpenBox(false);
                setSearchQuery("");
              }
            }}
            onClick={(ev) => ev.stopPropagation()}
            autoFocus
            disabled={disabled}
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className={value ? "text-gray-900 dark:text-slate-100" : "text-gray-500"}>
              {value || placeholder || "Chọn tỉnh/thành"}
            </span>
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </div>
      {openBox && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700"
            onClick={() => {
              onChange("");
              setOpenBox(false);
              setSearchQuery("");
            }}
          >
            (Không chọn)
          </button>
          {displayOptions.map((p, i) => (
            <button
              key={p}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-700 ${highlight === i ? "bg-blue-50 dark:bg-slate-700" : ""}`}
              onClick={() => {
                onChange(p);
                setOpenBox(false);
                setSearchQuery("");
              }}
            >
              {p}
            </button>
          ))}
          {hasMore && (
            <div className="px-3 py-2 text-xs text-gray-400">Gõ thêm để thu hẹp… ({filteredOptions.length} tỉnh)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HccFacilitiesPage() {
  const [items, setItems] = useState<HccFacilityResponseDTO[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [qSearch, setQSearch] = useState("");
  /** Empty = all; otherwise user id as string for &responsibleUserId= */
  const [qResponsibleUserId, setQResponsibleUserId] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HccFacilityResponseDTO | null>(null);
  const [viewing, setViewing] = useState<HccFacilityResponseDTO | null>(null);
  const [formName, setFormName] = useState("");
  const [formProvince, setFormProvince] = useState("");
  const [formPrimaryId, setFormPrimaryId] = useState<number | null>(null);
  const [formSecondaryIds, setFormSecondaryIds] = useState<number[]>([]);
  const [formErrors, setFormErrors] = useState<{ name?: string; primary?: string }>({});
  const [isModalLoading, setIsModalLoading] = useState(false);

  const [itUsers, setItUsers] = useState<EntitySelect[]>([]);

  const roles = useMemo(() => readRoles(), []);
  const canEdit = roles.some((r) => ["ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(r));
  const isSuperAdmin = roles.some((r) => ["SUPERADMIN", "SUPER_ADMIN"].includes(r));

  const { ask: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBase("GET", false);
      const url = buildUrl(base);
      url.searchParams.set("search", qSearch.trim());
      if (qResponsibleUserId.trim() !== "") {
        url.searchParams.set("responsibleUserId", qResponsibleUserId.trim());
      }
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(size));
      url.searchParams.set("sortBy", sortBy);
      url.searchParams.set("sortDir", sortDir);
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const data = (await res.json()) as SpringPage<HccFacilityResponseDTO>;
      setItems(data.content ?? []);
      setTotalElements(data.totalElements ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lỗi tải dữ liệu";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, size, sortBy, sortDir, qSearch, qResponsibleUserId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = buildUrl(`${API_BASE}/api/v1/admin/users/search`);
        url.searchParams.set("name", "");
        url.searchParams.set("department", "IT");
        url.searchParams.set("includeSuperAdmin", "true");
        const res = await fetch(url.toString(), { headers: { ...authHeader() } });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as EntitySelect[];
        if (alive) setItUsers(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setItUsers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function resetForm() {
    setFormName("");
    setFormProvince("");
    setFormPrimaryId(null);
    setFormSecondaryIds([]);
    setFormErrors({});
  }

  function onCreate() {
    setEditing(null);
    setViewing(null);
    resetForm();
    setOpen(true);
  }

  async function loadDetail(id: number): Promise<HccFacilityResponseDTO | null> {
    const base = getApiBase("GET", false);
    const res = await fetch(`${base}/${id}`, { headers: { ...authHeader() } });
    if (!res.ok) return null;
    return (await res.json()) as HccFacilityResponseDTO;
  }

  async function onEdit(row: HccFacilityResponseDTO) {
    setViewing(null);
    setIsModalLoading(true);
    setOpen(true);
    try {
      const detail = await loadDetail(row.id);
      if (!detail) throw new Error("Không tải được chi tiết");
      setEditing(detail);
      setFormName(detail.name ?? "");
      setFormProvince(detail.province ?? "");
      setFormPrimaryId(detail.primaryResponsibleUserId ?? null);
      setFormSecondaryIds((detail.secondaryResponsibles ?? []).map((u) => u.id));
      setFormErrors({});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      setOpen(false);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function onView(row: HccFacilityResponseDTO) {
    setEditing(null);
    setIsModalLoading(true);
    setOpen(true);
    try {
      const detail = await loadDetail(row.id);
      if (!detail) throw new Error("Không tải được chi tiết");
      setViewing(detail);
      setFormName(detail.name ?? "");
      setFormProvince(detail.province ?? "");
      setFormPrimaryId(detail.primaryResponsibleUserId ?? null);
      setFormSecondaryIds((detail.secondaryResponsibles ?? []).map((u) => u.id));
      setFormErrors({});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
      setOpen(false);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function onDelete(id: number) {
    if (!canEdit) {
      toast.error("Không có quyền xóa");
      return;
    }
    const ok = await askConfirm({
      title: "Xóa cơ sở HCC?",
      message: "Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    setLoading(true);
    try {
      const base = getApiBase("DELETE", isSuperAdmin);
      const res = await fetch(`${base}/${id}`, { method: "DELETE", headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      if (items.length === 1 && page > 0) setPage((p) => p - 1);
      await fetchList();
      toast.success("Đã xóa");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }

  function validate(): boolean {
    const e: { name?: string; primary?: string } = {};
    if (!formName.trim()) e.name = "Bắt buộc";
    if (formPrimaryId == null) e.primary = "Chọn phụ trách chính (phòng IT)";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (viewing) {
      setOpen(false);
      return;
    }
    if (!validate() || !canEdit) return;
    setLoading(true);
    try {
      const method = editing ? "PUT" : "POST";
      const base = getApiBase(method, isSuperAdmin);
      const url = editing ? `${base}/${editing.id}` : base;
      const body = editing
        ? {
            name: formName.trim(),
            province: formProvince.trim() || null,
            primaryResponsibleUserId: formPrimaryId,
            secondaryResponsibleUserIds: formSecondaryIds,
          }
        : {
            name: formName.trim(),
            province: formProvince.trim() || null,
            primaryResponsibleUserId: formPrimaryId,
            secondaryResponsibleUserIds: formSecondaryIds,
          };
      const res = await fetch(url, {
        method,
        headers: { ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `${method} ${res.status}`);
      }
      setOpen(false);
      setEditing(null);
      await fetchList();
      toast.success(editing ? "Cập nhật thành công" : "Tạo mới thành công");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setLoading(false);
    }
  }

  const readOnly = !!viewing?.id;

  function toggleSecondary(uid: number) {
    if (readOnly) return;
    if (uid === formPrimaryId) return;
    setFormSecondaryIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
  }

  return (
    <>
      {confirmDialog}
      <PageMeta title="Cơ sở hành chính công" description="Quản lý cơ sở HCC" />
      <div className="space-y-8">
        <ComponentCard title="Cơ sở hành chính công (HCC)">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[9.5rem] shrink-0 sm:w-44">
              <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Cơ sở
              </label>
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Tên, tỉnh…"
                value={qSearch}
                onChange={(ev) => {
                  setQSearch(ev.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="min-w-0 w-[11rem] shrink-0 sm:w-48">
              <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Người phụ trách
              </label>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={qResponsibleUserId}
                onChange={(ev) => {
                  setQResponsibleUserId(ev.target.value);
                  setPage(0);
                }}
              >
                <option value="">Tất cả</option>
                {itUsers.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            {(qSearch.trim() !== "" || qResponsibleUserId !== "") && (
              <button
                type="button"
                className="mb-0.5 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => {
                  setQSearch("");
                  setQResponsibleUserId("");
                  setPage(0);
                }}
              >
                Xóa lọc
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onCreate}
                className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:ml-auto"
              >
                <AiOutlinePlus className="h-3.5 w-3.5" />
                Thêm cơ sở
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </ComponentCard>

        <ComponentCard title="Danh sách">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-slate-700">
                  <th className="pb-2 pr-4">Tên cơ sở</th>
                  <th className="pb-2 pr-4">Tỉnh/thành</th>
                  <th className="pb-2 pr-4">Phụ trách chính</th>
                  <th className="pb-2 pr-4">Phụ trách phụ</th>
                  <th className="pb-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-slate-800">
                    <td className="py-3 pr-4 font-medium text-gray-900 dark:text-slate-100">{row.name}</td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-slate-300">{row.province || "—"}</td>
                    <td className="py-3 pr-4 text-gray-700 dark:text-slate-200">
                      {row.primaryResponsibleFullname || "—"}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-slate-300">
                      {(row.secondaryResponsibles ?? []).length
                        ? `${(row.secondaryResponsibles ?? []).length} người`
                        : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        className="mr-2 rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-800"
                        onClick={() => onView(row)}
                      >
                        <AiOutlineEye className="inline h-4 w-4" /> Xem
                      </button>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            className="mr-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                            onClick={() => onEdit(row)}
                          >
                            <AiOutlineEdit className="inline h-4 w-4" /> Sửa
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                            onClick={() => onDelete(row.id)}
                          >
                            <AiOutlineDelete className="inline h-4 w-4" /> Xóa
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && items.length === 0 && (
              <p className="py-8 text-center text-gray-400">Chưa có dữ liệu</p>
            )}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalElements}
            itemsPerPage={size}
            onPageChange={setPage}
            onItemsPerPageChange={(n) => {
              setSize(n);
              setPage(0);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Sắp xếp:</span>
            <select
              className="rounded border border-gray-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
              value={sortBy}
              onChange={(ev) => setSortBy(ev.target.value)}
            >
              <option value="id">ID</option>
              <option value="name">Tên</option>
              <option value="province">Tỉnh</option>
              <option value="createdAt">Ngày tạo</option>
            </select>
            <select
              className="rounded border border-gray-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
              value={sortDir}
              onChange={(ev) => setSortDir(ev.target.value as SortDir)}
            >
              <option value="desc">Giảm dần</option>
              <option value="asc">Tăng dần</option>
            </select>
          </div>
        </ComponentCard>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {viewing ? "Chi tiết cơ sở HCC" : editing ? "Sửa cơ sở HCC" : "Thêm cơ sở HCC"}
            </h3>
            {isModalLoading ? (
              <p className="mt-4 text-sm text-gray-500">Đang tải…</p>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Tên cơ sở HCC *</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:disabled:bg-slate-900"
                    value={formName}
                    onChange={(ev) => setFormName(ev.target.value)}
                    disabled={readOnly}
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium">
                    <FiMapPin className="h-4 w-4" /> Tỉnh/thành
                  </label>
                  <ProvinceSearchSelect
                    value={formProvince}
                    onChange={setFormProvince}
                    placeholder="(tùy chọn)"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Phụ trách chính (IT) *</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 dark:border-slate-600 dark:bg-slate-800"
                    value={formPrimaryId ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value ? Number(ev.target.value) : null;
                      setFormPrimaryId(v);
                      if (v != null) {
                        setFormSecondaryIds((prev) => prev.filter((x) => x !== v));
                      }
                    }}
                    disabled={readOnly}
                  >
                    <option value="">— Chọn —</option>
                    {itUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                        {u.subLabel ? ` (${u.subLabel})` : ""}
                      </option>
                    ))}
                  </select>
                  {formErrors.primary && <p className="mt-1 text-xs text-red-600">{formErrors.primary}</p>}
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-1 text-sm font-medium">
                    <FiUsers className="h-4 w-4" />
                    Phụ trách phụ (phòng IT)
                  </label>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-slate-600">
                    {itUsers.length === 0 && <p className="text-xs text-gray-400">Không tải được danh sách IT</p>}
                    {itUsers.map((u) => {
                      const disabledRow = readOnly || u.id === formPrimaryId;
                      const checked = formSecondaryIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 ${disabledRow ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabledRow}
                            onChange={() => toggleSecondary(u.id)}
                          />
                          <span>{u.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-slate-600"
                    onClick={() => setOpen(false)}
                  >
                    Đóng
                  </button>
                  {!readOnly && (
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {editing ? "Cập nhật" : "Tạo"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
