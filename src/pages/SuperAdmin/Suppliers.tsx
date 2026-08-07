import { FormEvent, useCallback, useEffect, useState } from "react";
import { AiOutlineDelete, AiOutlineEdit, AiOutlineEye } from "react-icons/ai";
import { FiFileText, FiMail, FiMapPin, FiPhone, FiUser, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import Pagination from "../../components/common/Pagination";
import { fetchWithAuth } from "../../api/client";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

type Supplier = {
  id: number;
  name: string;
  address?: string | null;
  contactPerson?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  taxCode?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SupplierForm = Omit<Supplier, "id" | "createdAt" | "updatedAt">;
const emptyForm: SupplierForm = { name: "", address: "", contactPerson: "", phoneNumber: "", email: "", taxCode: "", notes: "" };
const baseUrl = `${import.meta.env.VITE_API_URL ?? ""}/api/v1/superadmin/suppliers`;

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("vi-VN") : "—";
}

export default function SuppliersPage() {
  const { ask, dialog } = useConfirmDialog();
  const [items, setItems] = useState<Supplier[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | "view" | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(size));
      url.searchParams.set("sortBy", "id");
      url.searchParams.set("sortDir", "desc");
      if (search) url.searchParams.set("search", search);
      const response = await fetchWithAuth(url.toString());
      if (!response.ok) throw new Error("Không thể tải danh sách nhà cung cấp");
      const data = await response.json();
      setItems(data.content ?? []);
      setTotalElements(data.totalElements ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải danh sách nhà cung cấp");
    } finally {
      setLoading(false);
    }
  }, [page, search, size]);

  useEffect(() => { void load(); }, [load]);

  function closeModal() {
    setModal(null);
    setSelected(null);
    setForm(emptyForm);
    setError(null);
  }

  function openCreate() {
    setForm(emptyForm);
    setSelected(null);
    setModal("create");
  }

  async function openExisting(mode: "edit" | "view", id: number) {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`${baseUrl}/${id}`);
      if (!response.ok) throw new Error("Không thể tải chi tiết nhà cung cấp");
      const supplier = await response.json() as Supplier;
      setSelected(supplier);
      setForm({ name: supplier.name, address: supplier.address ?? "", contactPerson: supplier.contactPerson ?? "", phoneNumber: supplier.phoneNumber ?? "", email: supplier.email ?? "", taxCode: supplier.taxCode ?? "", notes: supplier.notes ?? "" });
      setModal(mode);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Không thể tải chi tiết");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError("Tên nhà cung cấp không được để trống");
    setSaving(true);
    setError(null);
    try {
      const isEdit = modal === "edit" && selected;
      const response = await fetchWithAuth(isEdit ? `${baseUrl}/${selected.id}` : baseUrl, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error((await response.text()) || "Không thể lưu nhà cung cấp");
      toast.success(isEdit ? "Cập nhật nhà cung cấp thành công" : "Tạo nhà cung cấp thành công");
      closeModal();
      setPage(0);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể lưu nhà cung cấp");
    } finally {
      setSaving(false);
    }
  }

  async function remove(supplier: Supplier) {
    const accepted = await ask({ title: "Xóa nhà cung cấp?", message: `Bạn có chắc muốn xóa “${supplier.name}”?`, variant: "danger", confirmLabel: "Xóa" });
    if (!accepted) return;
    try {
      const response = await fetchWithAuth(`${baseUrl}/${supplier.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Không thể xóa nhà cung cấp");
      toast.success("Đã xóa nhà cung cấp");
      await load();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Không thể xóa nhà cung cấp");
    }
  }

  const setField = (field: keyof SupplierForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return <>
    <PageMeta title="Quản lý Nhà cung cấp" description="Danh sách và thông tin nhà cung cấp" />
    <div className="space-y-10">
      <ComponentCard title="Tìm kiếm & Thao tác">
        <form className="flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()); }}>
          <input className="min-w-[240px] rounded-full border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm" placeholder="Tìm theo tên, liên hệ, SĐT, email" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <button className="rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50" type="submit">Tìm kiếm</button>
          <button className="rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50" type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(0); }}>Bỏ lọc</button>
        </form>
        <div className="mt-6 flex items-center justify-between"><p className="text-sm text-gray-600">Tổng: <b>{totalElements}</b></p><button className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600" onClick={openCreate}>+ Thêm nhà cung cấp</button></div>
      </ComponentCard>

      <ComponentCard title="Danh sách nhà cung cấp">
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Nhà cung cấp</th><th className="px-4 py-3">Người liên hệ</th><th className="px-4 py-3">Điện thoại</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Mã số thuế</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody>
          {items.map((supplier) => <tr key={supplier.id} className="border-b border-gray-100 hover:bg-blue-50/40"><td className="px-4 py-4"><p className="font-semibold text-gray-900">{supplier.name}</p><p className="max-w-xs truncate text-xs text-gray-500">{supplier.address || "—"}</p></td><td className="px-4 py-4">{supplier.contactPerson || "—"}</td><td className="px-4 py-4">{supplier.phoneNumber || "—"}</td><td className="px-4 py-4">{supplier.email || "—"}</td><td className="px-4 py-4">{supplier.taxCode || "—"}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button aria-label={`Xem ${supplier.name}`} className="rounded-lg bg-blue-50 p-2 text-blue-700" onClick={() => void openExisting("view", supplier.id)}><AiOutlineEye /></button><button aria-label={`Sửa ${supplier.name}`} className="rounded-lg bg-amber-50 p-2 text-amber-700" onClick={() => void openExisting("edit", supplier.id)}><AiOutlineEdit /></button><button aria-label={`Xóa ${supplier.name}`} className="rounded-lg bg-red-50 p-2 text-red-700" onClick={() => void remove(supplier)}><AiOutlineDelete /></button></div></td></tr>)}
        </tbody></table></div>
        {!loading && !items.length && <div className="py-16 text-center text-sm text-gray-400">Không có dữ liệu</div>}
        {loading && <div className="py-6 text-center text-sm text-gray-500">Đang tải...</div>}
        {error && !modal && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Pagination currentPage={page} totalPages={totalPages} totalItems={totalElements} itemsPerPage={size} onPageChange={setPage} onItemsPerPageChange={(value) => { setPage(0); setSize(value); }} itemsPerPageOptions={[10, 20, 50]} />
      </ComponentCard>
    </div>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button aria-label="Đóng" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} /><div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white p-8 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-bold">{modal === "create" ? "Thêm nhà cung cấp" : modal === "edit" ? "Cập nhật nhà cung cấp" : "Chi tiết nhà cung cấp"}</h2><button className="rounded-lg p-2 hover:bg-gray-100" onClick={closeModal}><FiX /></button></div>
      {modal === "view" ? <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><Detail icon={<FiMapPin />} label="Địa chỉ" value={selected?.address} /><Detail icon={<FiUser />} label="Người liên hệ" value={selected?.contactPerson} /><Detail icon={<FiPhone />} label="Điện thoại" value={selected?.phoneNumber} /><Detail icon={<FiMail />} label="Email" value={selected?.email} /><Detail icon={<FiFileText />} label="Mã số thuế" value={selected?.taxCode} /><Detail icon={<FiFileText />} label="Ghi chú" value={selected?.notes} /><Detail icon={<FiFileText />} label="Ngày tạo" value={formatDate(selected?.createdAt)} /><Detail icon={<FiFileText />} label="Cập nhật" value={formatDate(selected?.updatedAt)} /><div className="md:col-span-2 mt-3 flex justify-end border-t pt-5"><button className="rounded-xl border px-6 py-3 text-sm font-semibold" onClick={closeModal}>Đóng</button></div></div> : <form className="grid grid-cols-1 gap-5 md:grid-cols-2" onSubmit={submit}><Field required label="Tên nhà cung cấp" value={form.name} onChange={(value) => setField("name", value)} /><Field label="Người liên hệ" value={form.contactPerson ?? ""} onChange={(value) => setField("contactPerson", value)} /><Field label="Điện thoại" value={form.phoneNumber ?? ""} onChange={(value) => setField("phoneNumber", value)} inputMode="numeric" /><Field label="Email" type="email" value={form.email ?? ""} onChange={(value) => setField("email", value)} /><Field label="Mã số thuế" value={form.taxCode ?? ""} onChange={(value) => setField("taxCode", value)} /><Field label="Địa chỉ" value={form.address ?? ""} onChange={(value) => setField("address", value)} /><label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-gray-700">Ghi chú</span><textarea className="w-full rounded-xl border-2 border-gray-300 px-4 py-3" rows={3} value={form.notes ?? ""} onChange={(event) => setField("notes", event.target.value)} /></label>{error && <p className="md:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="md:col-span-2 flex justify-end gap-3 border-t pt-5"><button type="button" className="rounded-xl border px-6 py-3 text-sm font-semibold" onClick={closeModal}>Hủy</button><button disabled={saving} className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Đang lưu..." : modal === "edit" ? "Cập nhật" : "Tạo mới"}</button></div></form>}</div></div>}
    {dialog}
  </>;
}

function Field({ label, value, onChange, required, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; inputMode?: "numeric" }) {
  return <label><span className="mb-2 block text-sm font-semibold text-gray-700">{label}{required ? "*" : ""}</span><input required={required} type={type} inputMode={inputMode} className="w-full rounded-xl border-2 border-gray-300 px-4 py-3" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return <div className="flex gap-3"><span className="rounded-lg bg-gray-100 p-2 text-gray-600">{icon}</span><div><p className="text-xs text-gray-500">{label}</p><p className="font-medium text-gray-800">{value || "—"}</p></div></div>;
}
