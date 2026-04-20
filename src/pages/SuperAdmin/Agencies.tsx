import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import toast from "react-hot-toast";
import { AiOutlineEye, AiOutlineEdit, AiOutlineDelete } from "react-icons/ai";
import { BoxCubeIcon } from "../../icons";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { FiHash, FiMapPin, FiUser, FiMail, FiPhone, FiClock, FiFileText } from "react-icons/fi";

type Agency = {
  id: number;
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AgencyForm = {
  name: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phoneNumber?: string;
  notes?: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const BASE = `${API_BASE}/api/v1/superadmin/agencies`;

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

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("access_token");
  return token
    ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
    : { Accept: "application/json" };
}

function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${hours}:${minutes}-${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

export default function AgenciesPage() {
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters (client-side placeholders for now)
  const [qName, setQName] = useState("");
  const [qContact, setQContact] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agency | null>(null);
  const [viewing, setViewing] = useState<Agency | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const [form, setForm] = useState<AgencyForm>({
    name: "",
    address: "",
    contactPerson: "",
    email: "",
    phoneNumber: "",
    notes: "",
  });

  const isEditing = !!editing?.id;
  const isViewing = !!viewing?.id;

  // Helper for aligned rows with optional icon and stacked value
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
    const IconCol = icon ? (
      <div className="min-w-[40px] flex items-center justify-center">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">{icon}</div>
      </div>
    ) : (
      <div className="min-w-[40px]" />
    );

    if (stacked) {
      return (
        <div className="flex items-start gap-3">
          {IconCol}
          <div className="flex-1 min-w-0">
            <div className="min-w-[140px] font-semibold text-gray-800">{label}</div>
            <div className="mt-2 text-gray-600 text-sm text-left break-words whitespace-normal">{value ?? "—"}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-3">
        {IconCol}
        <div className="flex-1 flex items-start">
          <div className="min-w-[120px] font-semibold text-gray-800">{label}</div>
          <div className="text-gray-600 flex-1 text-left break-words whitespace-normal">{value ?? "—"}</div>
        </div>
      </div>
    );
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setViewing(null);
    setError(null);
    setIsModalLoading(false);
  }

  function fillForm(a: Agency) {
    setForm({
      name: a.name ?? "",
      address: a.address ?? "",
      contactPerson: a.contactPerson ?? "",
      email: a.email ?? "",
      phoneNumber: a.phoneNumber ?? "",
      notes: a.notes ?? "",
    });
  }

  async function fetchDetails(id: number): Promise<Agency | null> {
    setIsModalLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/${id}`, { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET detail failed ${res.status}`);
      const data = await res.json();
      return data as Agency;
    } catch (e: any) {
      setError(e.message || "Lỗi tải chi tiết đại lý");
      console.error("FETCH AGENCY DETAIL ERROR:", e);
      return null;
    } finally {
      setIsModalLoading(false);
    }
  }

  async function fetchList() {
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl(BASE);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(size));
      url.searchParams.set("sortBy", sortBy);
      url.searchParams.set("sortDir", sortDir);
      const search = [qName, qContact].filter(Boolean).join(" ").trim();
      if (search) url.searchParams.set("search", search);
      const res = await fetch(url.toString(), { headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`GET failed ${res.status}`);
      const data = await res.json();
      setItems(data.content ?? data);
      setTotalElements(data.totalElements ?? data.length ?? 0);
      setTotalPages(data.totalPages ?? Math.ceil((data.totalElements ?? data.length ?? 0) / size));
    } catch (e: any) {
      setError(e.message || "Lỗi tải danh sách");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [page, size, sortBy, sortDir]);

  const filtered = useMemo(() => {
    return items.filter((it) =>
      (qName ? it.name.toLowerCase().includes(qName.toLowerCase()) : true) &&
      (qContact
        ? (it.contactPerson || "").toLowerCase().includes(qContact.toLowerCase()) ||
          (it.phoneNumber || "").toLowerCase().includes(qContact.toLowerCase())
        : true)
    );
  }, [items, qName, qContact]);

  function onCreate() {
    setEditing(null);
    setViewing(null);
    setForm({ name: "", address: "", contactPerson: "", email: "", phoneNumber: "", notes: "" });
    setOpen(true);
  }

  async function onView(a: Agency) {
    setEditing(null);
    setViewing(null);
    setOpen(true);
    const details = await fetchDetails(a.id);
    if (details) {
      setViewing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onEdit(a: Agency) {
    setViewing(null);
    setEditing(null);
    setOpen(true);
    const details = await fetchDetails(a.id);
    if (details) {
      setEditing(details);
      fillForm(details);
    } else {
      setOpen(false);
    }
  }

  async function onDelete(id: number) {
    const ok = await askConfirm({
      title: "Xóa đại lý?",
      message: "Bạn có chắc muốn xóa đại lý này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: { ...authHeader() } });
      if (!res.ok) throw new Error(`DELETE failed ${res.status}`);
      await fetchList();
      toast.success("Xóa đại lý thành công");
    } catch (e: any) {
      toast.error(e.message || "Xóa thất bại");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Tên đại lý không được để trống");
      return;
    }
    if (isViewing) return;

    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        address: form.address?.trim() || undefined,
        contactPerson: form.contactPerson?.trim() || undefined,
        email: form.email?.trim() || undefined,
        phoneNumber: form.phoneNumber?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };

      const method = isEditing ? "PUT" : "POST";
      const url = isEditing ? `${BASE}/${editing!.id}` : BASE;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${method} failed ${res.status}: ${txt}`);
      }
      closeModal();
      setPage(0);
      await fetchList();
      toast.success(isEditing ? "Cập nhật đại lý thành công" : "Tạo đại lý thành công");
    } catch (e: any) {
      setError(e.message || "Lưu thất bại");
      toast.error(e.message || "Lưu thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta title="Quản lý Đại lý – CRUD" description="Quản lý đại lý: danh sách, tìm kiếm, tạo, sửa, xóa" />

      <div className="space-y-10">
        <ComponentCard title="Tìm kiếm & Thao tác">
          <div className="flex flex-wrap items-center gap-3">
            <input className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] border-gray-300 bg-white" placeholder="Tìm theo tên" value={qName} onChange={(e) => setQName(e.target.value)} />
            <input className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[180px] border-gray-300 bg-white" placeholder="Liên hệ (người/điện thoại)" value={qContact} onChange={(e) => setQContact(e.target.value)} />
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
              <button className="rounded-xl border border-blue-500 bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-600 hover:shadow-md" onClick={onCreate}> + Thêm đại lý</button>
            </div>
          </div>
        </ComponentCard>

        <ComponentCard title="Danh sách đại lý">
          <style>{`
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
          <div className="space-y-4">
            {filtered.map((a, idx) => {
              const delayMs = Math.round(idx * (2000 / Math.max(1, filtered.length)));
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onView(a)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(a); } }}
                  className="group bg-white rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1 group-hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 cursor-pointer"
                  style={{ animation: `fadeInUp 600ms ease ${delayMs}ms both` }}
                >
                  <div className="flex items-center gap-4 w-full md:w-2/3">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-lg bg-white flex items-center justify-center text-indigo-600 font-semibold text-sm border border-gray-100 transition-colors duration-200 group-hover:border-blue-200 group-hover:bg-blue-50">
                        <BoxCubeIcon className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>

                    <div className="hidden md:block w-px h-10 bg-gray-100 rounded mx-2" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 title={a.name} className="font-semibold text-gray-900 truncate group-hover:text-blue-800">{a.name}</h4>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="truncate"><span className="text-xs text-gray-400">Người liên hệ: </span><span title={a.contactPerson || ""} className="font-medium text-gray-800">{a.contactPerson || "—"}</span>{a.phoneNumber && <span className="ml-2 text-xs text-gray-500">• {a.phoneNumber}</span>}</div>
                        <div className="truncate mt-1"><span className="text-xs text-gray-400">Email: </span><span title={a.email || ""} className="text-gray-700">{a.email || "—"}</span></div>
                        <div className="truncate mt-1"><span className="text-xs text-gray-400">Địa chỉ: </span><span title={a.address || ""} className="text-gray-700">{a.address || "—"}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full md:w-1/3">
                    <div className="hidden md:flex flex-col text-right text-sm text-gray-600">
                      <span className="text-xs text-gray-400">Ngày tạo</span>
                      <span className="font-medium">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); onView(a); }} title="Xem" aria-label={`Xem ${a.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition transform group-hover:scale-105 text-xs font-medium">
                        <AiOutlineEye className="w-4 h-4" />
                        <span className="hidden sm:inline">Xem</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(a); }} title="Sửa" aria-label={`Sửa ${a.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition transform group-hover:scale-105 text-xs font-medium">
                        <AiOutlineEdit className="w-4 h-4" />
                        <span className="hidden sm:inline">Sửa</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} title="Xóa" aria-label={`Xóa ${a.name}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition transform group-hover:scale-105 text-xs font-medium">
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
              <h3 className="text-2xl font-bold text-gray-900">{isViewing ? "Chi tiết đại lý" : (isEditing ? "Cập nhật đại lý" : "Thêm đại lý")}</h3>
              <button className="rounded-xl p-2 transition-all hover:bg-gray-100 hover:scale-105" onClick={closeModal}>✕</button>
            </div>

            {isModalLoading ? (
              <div className="text-center py-12 text-gray-500">Đang tải chi tiết...</div>
            ) : isViewing ? (
              <div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-5">
                    <Info icon={<FiHash className="w-5 h-5" />} label="Tên đại lý:" value={<div className="text-lg font-semibold text-blue-800">{viewing?.name ?? "—"}</div>} />
                    <Info icon={<FiMapPin className="w-5 h-5" />} label="Địa chỉ:" value={viewing?.address ?? "—"} />
                    <Info icon={<FiClock className="w-5 h-5" />} label="Cập nhật:" value={formatDateTime(viewing?.updatedAt)} />
                  </div>
                  <div className="space-y-5">
                    <Info icon={<FiUser className="w-5 h-5" />} label="Người liên hệ:" value={viewing?.contactPerson ?? "—"} />
                    <Info icon={<FiPhone className="w-5 h-5" />} label="Điện thoại:" value={viewing?.phoneNumber ?? "—"} />
                    <Info icon={<FiMail className="w-5 h-5" />} label="Email:" value={viewing?.email ?? "—"} />
                    <Info icon={<FiClock className="w-5 h-5" />} label="Ngày tạo:" value={formatDateTime(viewing?.createdAt)} />
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <Info icon={<FiFileText className="w-5 h-5" />} label="Ghi chú" value={viewing?.notes ?? "—"} stacked />
                </div>
                <div className="mt-6 flex items-center justify-end border-t border-gray-200 pt-6">
                  <button type="button" className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400" onClick={closeModal}>Đóng</button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Tên đại lý*</label>
                    <input required className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} disabled={isViewing} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Địa chỉ</label>
                    <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.address || ""} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} disabled={isViewing} />
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">Người liên hệ</label>
                      <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.contactPerson || ""} onChange={(e) => setForm((s) => ({ ...s, contactPerson: e.target.value }))} disabled={isViewing} />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">Điện thoại</label>
                        <input className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.phoneNumber || ""} onChange={(e) => setForm((s) => ({ ...s, phoneNumber: e.target.value }))} disabled={isViewing} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Email</label>
                      <input type="email" className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" value={form.email || ""} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} disabled={isViewing} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">Ghi chú</label>
                    <textarea className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed" rows={3} value={form.notes || ""} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} disabled={isViewing} />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 mt-4 flex items-center justify-between border-t border-gray-200 pt-6">
                  {error && <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
                  <div className="ml-auto flex items-center gap-3">
                    <button type="button" className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400" onClick={closeModal}>{isViewing ? "Đóng" : "Huỷ"}</button>
                    {!isViewing && (
                      <button type="submit" className="rounded-xl border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" disabled={loading}>
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
      {genericConfirmDialog}
    </>
  );
}

