import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createPO,
  createPOSerial,
  deletePO,
  deletePOSerial,
  getDeliveryContracts,
  getPOs,
  getPOSerials,
  PO,
  POSerial,
  searchSuppliers,
  SupplierOption,
  updatePO,
  updatePOSerial,
} from "../../api/purchaseOrder.api";
import DeliveryContracts from "./DeliveryContracts";
import {
  FiBox,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiEye,
  FiFilter,
  FiHash,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTruck,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import toast from "react-hot-toast";

type POForm = {
  poCode: string;
  supplierId: number | null;
  totalQuantity: number | "";
};
type FieldErrors = {
  poCode?: string;
  supplierId?: string;
  totalQuantity?: string;
};
type StatusFilter = "all" | "available" | "processing" | "completed";
type FilterState = { poCode: string; supplier: string; status: StatusFilter };
const emptyForm: POForm = { poCode: "", supplierId: null, totalQuantity: 1 };
const pageSize = 10;

function statusOf(po: PO) {
  if (po.remainingQuantity <= 0)
    return {
      label: "Hoàn tất",
      className: "bg-slate-100 text-slate-600 ring-slate-200",
    };
  if (po.usedQuantity > 0)
    return {
      label: "Đang xử lý",
      className: "bg-blue-50 text-blue-700 ring-blue-200",
    };
  return {
    label: "Còn hàng",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
}

function exportPurchaseOrders(items: PO[]) {
  const rows = [
    [
      "Mã PO",
      "Nhà cung cấp",
      "Tổng số lượng",
      "Đã phân bổ",
      "Còn lại",
      "Trạng thái",
    ],
    ...items.map((item) => [
      item.poCode,
      item.supplier,
      item.totalQuantity,
      item.usedQuantity,
      item.remainingQuantity,
      statusOf(item).label,
    ]),
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PurchaseOrders() {
  const [items, setItems] = useState<PO[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [filterPOId, setFilterPOId] = useState<number | null>(null);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [serialPO, setSerialPO] = useState<PO | null>(null);
  const [serials, setSerials] = useState<POSerial[]>([]);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialSaving, setSerialSaving] = useState(false);
  const [editingSerial, setEditingSerial] = useState<POSerial | null>(null);
  const [serialForm, setSerialForm] = useState({ serialNumber: "", notes: "" });
  const [serialFormError, setSerialFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<POForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<SupplierOption[]>([]);
  const [poCodeFilter, setPoCodeFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    poCode: "",
    supplier: "",
    status: "all",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const { ask: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      const [poResponse, contractResponse] = await Promise.all([
        getPOs(),
        getDeliveryContracts(),
      ]);
      setItems(poResponse.data);
      setContracts(contractResponse.data);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Không tải được danh sách PO",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    void searchSuppliers("")
      .then((response) => setAllSuppliers(response.data.content ?? []))
      .catch(() => setAllSuppliers([]));
  }, []);
  useEffect(() => {
    if (!formOpen) return;
    const timer = window.setTimeout(async () => {
      setSupplierLoading(true);
      try {
        const response = await searchSuppliers(supplierQuery.trim());
        setSupplierOptions(response.data.content ?? []);
      } catch {
        setSupplierOptions([]);
      } finally {
        setSupplierLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [formOpen, supplierQuery]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const poMatches =
          !appliedFilters.poCode ||
          item.poCode
            .toLocaleLowerCase()
            .includes(appliedFilters.poCode.toLocaleLowerCase());
        const supplierMatches =
          !appliedFilters.supplier || item.supplier === appliedFilters.supplier;
        const statusMatches =
          appliedFilters.status === "all" ||
          (appliedFilters.status === "available" &&
            item.usedQuantity === 0 &&
            item.remainingQuantity > 0) ||
          (appliedFilters.status === "processing" &&
            item.usedQuantity > 0 &&
            item.remainingQuantity > 0) ||
          (appliedFilters.status === "completed" &&
            item.remainingQuantity <= 0);
        return poMatches && supplierMatches && statusMatches;
      }),
    [items, appliedFilters],
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageItems = filteredItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const beginCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSupplierQuery("");
    setFieldErrors({});
    setFormOpen(true);
  };
  const beginEdit = (item: PO) => {
    setEditing(item.id);
    setForm({
      poCode: item.poCode,
      supplierId: item.supplierId,
      totalQuantity: item.totalQuantity,
    });
    setSupplierQuery(item.supplier);
    setFieldErrors({});
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setSupplierDropdownOpen(false);
    setFieldErrors({});
  };
  const selectSupplier = (supplier: SupplierOption) => {
    setForm((current) => ({ ...current, supplierId: supplier.id }));
    setSupplierQuery(supplier.name);
    setSupplierDropdownOpen(false);
    setFieldErrors((current) => ({ ...current, supplierId: undefined }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!form.poCode.trim()) errors.poCode = "Vui lòng nhập mã PO";
    if (!form.supplierId)
      errors.supplierId = "Vui lòng chọn nhà cung cấp trong danh sách";
    if (form.totalQuantity === "" || Number(form.totalQuantity) <= 0)
      errors.totalQuantity = "Tổng số lượng phải lớn hơn 0";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        poCode: form.poCode.trim(),
        totalQuantity: Number(form.totalQuantity),
      };
      if (editing) {
        await updatePO(editing, body);
        toast.success("Đã cập nhật Purchase Order");
      } else {
        await createPO(body);
        toast.success("Đã tạo Purchase Order mới");
      }
      closeForm();
      await load();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Không thể lưu Purchase Order",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    const accepted = await askConfirm({
      title: "Xóa Purchase Order?",
      message:
        "PO chưa được phân bổ mới có thể xóa. Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa PO",
      cancelLabel: "Hủy",
    });
    if (!accepted) return;
    try {
      await deletePO(id);
      toast.success("Đã xóa Purchase Order");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xóa PO");
    }
  };
  const loadSerials = async (poId: number) => {
    setSerialLoading(true);
    try {
      const response = await getPOSerials(poId);
      setSerials(response.data);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Không tải được danh sách seri",
      );
    } finally {
      setSerialLoading(false);
    }
  };
  const openSerialManager = (po: PO) => {
    setSerialPO(po);
    setSerials([]);
    setEditingSerial(null);
    setSerialForm({ serialNumber: "", notes: "" });
    setSerialFormError("");
    void loadSerials(po.id);
  };
  const closeSerialManager = () => {
    setSerialPO(null);
    setSerials([]);
    setEditingSerial(null);
    setSerialForm({ serialNumber: "", notes: "" });
    setSerialFormError("");
  };
  const saveSerial = async (event: FormEvent) => {
    event.preventDefault();
    if (!serialPO) return;
    if (!serialForm.serialNumber.trim()) {
      setSerialFormError("Vui lòng nhập số seri trước khi lưu.");
      return;
    }
    if (!editingSerial && serials.length >= serialPO.totalQuantity) {
      setSerialFormError(`PO này đã đủ ${serialPO.totalQuantity} seri. Hãy xóa một seri trước khi thêm mới.`);
      return;
    }
    setSerialFormError("");
    setSerialSaving(true);
    try {
      const payload = {
        serialNumber: serialForm.serialNumber.trim(),
        notes: serialForm.notes.trim() || undefined,
      };
      if (editingSerial) {
        await updatePOSerial(serialPO.id, editingSerial.id, payload);
        toast.success("Đã cập nhật số seri");
      } else {
        await createPOSerial(serialPO.id, payload);
        toast.success("Đã thêm số seri");
      }
      setEditingSerial(null);
      setSerialForm({ serialNumber: "", notes: "" });
      setSerialFormError("");
      await Promise.all([loadSerials(serialPO.id), load()]);
    } catch (error: any) {
      setSerialFormError(error?.response?.data?.message || "Không thể lưu số seri");
    } finally {
      setSerialSaving(false);
    }
  };
  const removeSerial = async (serial: POSerial) => {
    if (!serialPO) return;
    const accepted = await askConfirm({
      title: "Xóa số seri?",
      message: `Số seri “${serial.serialNumber}” sẽ bị xóa vĩnh viễn.`,
      variant: "danger",
      confirmLabel: "Xóa seri",
      cancelLabel: "Hủy",
    });
    if (!accepted) return;
    try {
      await deletePOSerial(serialPO.id, serial.id);
      toast.success("Đã xóa số seri");
      await Promise.all([loadSerials(serialPO.id), load()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Không thể xóa số seri");
    }
  };
  const applyFilter = () => {
    setAppliedFilters({
      poCode: poCodeFilter.trim(),
      supplier: supplierFilter,
      status: statusFilter,
    });
    setCurrentPage(1);
  };
  const resetFilter = () => {
    setPoCodeFilter("");
    setSupplierFilter("");
    setStatusFilter("all");
    setAppliedFilters({ poCode: "", supplier: "", status: "all" });
    setCurrentPage(1);
  };

  if (deliveryOpen) {
    return (
      <div className="p-6">
        <button
          onClick={() => {
            setDeliveryOpen(false);
            setFilterPOId(null);
          }}
          className="mb-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <FiChevronLeft /> Quay lại Purchase Orders
        </button>
        <DeliveryContracts filterPOId={filterPOId} />
      </div>
    );
  }

  const displaySuppliers = allSuppliers.length
    ? allSuppliers
    : [
        ...new Map(
          items.map((item) => [
            item.supplier,
            { id: item.supplierId ?? 0, name: item.supplier },
          ]),
        ).values(),
      ];
  const allocationRows = selectedPO
    ? contracts
        .filter((contract) =>
          contract.allocations?.some(
            (allocation: any) => allocation.poId === selectedPO.id,
          ),
        )
        .map((contract) => ({
          contractCode: contract.contractCode,
          hospitalName: contract.hospitalName,
          deliveryDate: contract.deliveryDate,
          quantity:
            contract.allocations.find(
              (allocation: any) => allocation.poId === selectedPO.id,
            )?.quantity ?? 0,
        }))
    : [];
  const serialLimitReached = Boolean(
    serialPO && serials.length >= serialPO.totalQuantity,
  );
  const serialOverLimit = Boolean(
    serialPO && serials.length > serialPO.totalQuantity,
  );

  return (
    <div className="min-h-full bg-slate-50/80 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold text-blue-600">
              PROCUREMENT
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Quản lý Purchase Order
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Theo dõi đơn đặt hàng, nhà cung cấp và tiến độ phân bổ thiết bị.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportPurchaseOrders(filteredItems)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <FiDownload /> Xuất Excel
            </button>
            <button
              onClick={() => {
                setFilterPOId(null);
                setDeliveryOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
            >
              <FiTruck /> Giao hàng
            </button>
            <button
              onClick={beginCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <FiPlus className="text-base" /> Tạo PO mới
            </button>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto] xl:items-end">
            <FilterField label="Mã PO">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={poCodeFilter}
                  onChange={(event) => setPoCodeFilter(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && applyFilter()}
                  placeholder="Tìm mã PO..."
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </FilterField>
            <FilterField label="Nhà cung cấp">
              <select
                value={supplierFilter}
                onChange={(event) => setSupplierFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Tất cả nhà cung cấp</option>
                {displaySuppliers.map((supplier) => (
                  <option
                    key={`${supplier.id}-${supplier.name}`}
                    value={supplier.name}
                  >
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Trạng thái">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="available">Còn hàng</option>
                <option value="processing">Đang xử lý</option>
                <option value="completed">Hoàn tất</option>
              </select>
            </FilterField>
            <div className="flex gap-2">
              <button
                onClick={resetFilter}
                className="inline-flex h-[42px] items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                title="Đặt lại bộ lọc"
              >
                <FiRefreshCw />
              </button>
              <button
                onClick={applyFilter}
                className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <FiFilter /> Lọc
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Danh sách Purchase Order
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {filteredItems.length} kết quả · {items.length} PO trong hệ
                thống
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Dữ liệu
              cập nhật
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-28 px-5 py-3.5">Mã PO</th>
                  <th className="min-w-52 px-4 py-3.5">Nhà cung cấp</th>
                  <th className="px-4 py-3.5 text-center">Tổng SL</th>
                  <th className="px-4 py-3.5 text-center">Đã phân bổ</th>
                  <th className="px-4 py-3.5 text-center">Còn lại</th>
                  <th className="px-4 py-3.5 text-center">Quản lý Seri</th>
                  <th className="px-4 py-3.5 text-center">Quản lý phân bổ</th>
                  <th className="px-4 py-3.5 text-center">Trạng thái</th>
                  <th className="w-40 px-5 py-3.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-16 text-center text-slate-500"
                    >
                      Đang tải Purchase Orders...
                    </td>
                  </tr>
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center">
                      <FiBox className="mx-auto mb-3 text-3xl text-slate-300" />
                      <p className="font-medium text-slate-600">
                        Không tìm thấy Purchase Order
                      </p>
                      <button
                        onClick={resetFilter}
                        className="mt-2 text-sm font-semibold text-blue-600 hover:underline"
                      >
                        Xóa bộ lọc
                      </button>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((item) => {
                    const status = statusOf(item);
                    return (
                      <tr
                        key={item.id}
                        className="transition hover:bg-blue-50/40"
                      >
                        <td className="px-5 py-4">
                          <button
                            onClick={() => setSelectedPO(item)}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            #{item.poCode}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              <FiBox />
                            </div>
                            <span className="font-medium text-slate-800">
                              {item.supplier}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-slate-700">
                          {item.totalQuantity.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-slate-600">
                          {item.usedQuantity.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-4 py-4 text-center font-semibold text-slate-900">
                          {item.remainingQuantity.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => openSerialManager(item)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                          >
                            <FiHash /> {item.serialCount || 0} seri
                          </button>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => {
                              setFilterPOId(item.id);
                              setDeliveryOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <FiTruck />{" "}
                            {item.usedQuantity.toLocaleString("vi-VN")} /{" "}
                            {item.totalQuantity.toLocaleString("vi-VN")}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-center gap-1">
                            <ActionButton
                              label="Xem phân bổ"
                              onClick={() => setSelectedPO(item)}
                            >
                              <FiEye />
                            </ActionButton>
                            <ActionButton
                              label="Sửa PO"
                              onClick={() => beginEdit(item)}
                            >
                              <FiEdit2 />
                            </ActionButton>
                            <ActionButton
                              label="Giao hàng"
                              onClick={() => {
                                setFilterPOId(item.id);
                                setDeliveryOpen(true);
                              }}
                            >
                              <FiTruck />
                            </ActionButton>
                            <ActionButton
                              label="Xóa PO"
                              danger
                              onClick={() => void remove(item.id)}
                            >
                              <FiTrash2 />
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3.5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Hiển thị{" "}
              {filteredItems.length ? (currentPage - 1) * pageSize + 1 : 0}–
              {Math.min(currentPage * pageSize, filteredItems.length)} trên{" "}
              {filteredItems.length} kết quả
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => page - 1)}
                className="rounded-md border border-slate-200 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiChevronLeft />
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .slice(
                  Math.max(0, currentPage - 3),
                  Math.max(0, currentPage - 3) + 5,
                )
                .map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-8 rounded-md px-2 py-1.5 text-xs font-semibold ${page === currentPage ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {page}
                  </button>
                ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => page + 1)}
                className="rounded-md border border-slate-200 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiChevronRight />
              </button>
            </div>
          </footer>
        </section>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Đóng form PO"
            onClick={closeForm}
          />
          <form
            onSubmit={submit}
            className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Purchase Order
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {editing
                    ? "Cập nhật Purchase Order"
                    : "Tạo Purchase Order mới"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Chọn nhà cung cấp từ danh mục dữ liệu để liên kết PO.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="text-lg" />
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Mã PO" error={fieldErrors.poCode}>
                <input
                  value={form.poCode}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      poCode: event.target.value,
                    }));
                    setFieldErrors((current) => ({
                      ...current,
                      poCode: undefined,
                    }));
                  }}
                  placeholder="VD: PO-2026-001"
                  className={inputClass(Boolean(fieldErrors.poCode))}
                />
              </FormField>
              <FormField
                label="Tổng số lượng"
                error={fieldErrors.totalQuantity}
              >
                <input
                  type="number"
                  min="1"
                  value={form.totalQuantity}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      totalQuantity:
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                    }));
                    setFieldErrors((current) => ({
                      ...current,
                      totalQuantity: undefined,
                    }));
                  }}
                  className={inputClass(Boolean(fieldErrors.totalQuantity))}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Nhà cung cấp" error={fieldErrors.supplierId}>
                  <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={supplierQuery}
                      autoComplete="off"
                      onFocus={() => setSupplierDropdownOpen(true)}
                      onChange={(event) => {
                        setSupplierQuery(event.target.value);
                        setSupplierDropdownOpen(true);
                        setForm((current) => ({
                          ...current,
                          supplierId: null,
                        }));
                        setFieldErrors((current) => ({
                          ...current,
                          supplierId: undefined,
                        }));
                      }}
                      placeholder="Tìm theo tên, người liên hệ hoặc điện thoại"
                      className={`${inputClass(Boolean(fieldErrors.supplierId))} pl-9`}
                    />
                    {supplierDropdownOpen && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                        {supplierLoading && (
                          <p className="px-3 py-2.5 text-sm text-slate-500">
                            Đang tìm nhà cung cấp...
                          </p>
                        )}
                        {!supplierLoading && supplierOptions.length === 0 && (
                          <p className="px-3 py-2.5 text-sm text-slate-500">
                            Không tìm thấy nhà cung cấp phù hợp
                          </p>
                        )}
                        {!supplierLoading &&
                          supplierOptions.map((supplier) => (
                            <button
                              key={supplier.id}
                              type="button"
                              onMouseDown={() => selectSupplier(supplier)}
                              className="block w-full px-3 py-2.5 text-left text-sm transition hover:bg-blue-50"
                            >
                              <span className="font-semibold text-slate-800">
                                {supplier.name}
                              </span>
                              {(supplier.contactPerson ||
                                supplier.phoneNumber) && (
                                <span className="ml-2 text-xs text-slate-500">
                                  {[
                                    supplier.contactPerson,
                                    supplier.phoneNumber,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </FormField>
              </div>
            </div>
            <div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiPlus />{" "}
                {saving
                  ? "Đang lưu..."
                  : editing
                    ? "Lưu thay đổi"
                    : "Tạo PO mới"}
              </button>
            </div>
          </form>
        </div>
      )}
      {serialPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Đóng quản lý seri"
            onClick={closeSerialManager}
          />
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
                  Quản lý Seri
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  #{serialPO.poCode}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {serialPO.supplier} · Thêm từng seri để dễ theo dõi và chỉnh sửa.
                </p>
              </div>
              <button
                onClick={closeSerialManager}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="text-lg" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <form
                onSubmit={saveSerial}
                className="rounded-xl border border-violet-100 bg-violet-50/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {editingSerial ? "Cập nhật số seri" : "Thêm số seri"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Mỗi số seri được lưu riêng và không được trùng toàn hệ thống.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${serialOverLimit ? "bg-red-100 text-red-700" : serialLimitReached ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                      {serials.length} / {serialPO.totalQuantity} seri
                    </span>
                    {editingSerial && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSerial(null);
                          setSerialForm({ serialNumber: "", notes: "" });
                          setSerialFormError("");
                        }}
                        className="text-xs font-semibold text-violet-700 hover:underline"
                      >
                        Hủy sửa
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1.1fr_1.4fr_auto] sm:items-end">
                  <FormField label="Số seri">
                    <input
                      required
                      disabled={serialLimitReached && !editingSerial}
                      value={serialForm.serialNumber}
                      onChange={(event) =>
                        { setSerialForm((current) => ({ ...current, serialNumber: event.target.value })); setSerialFormError(""); }
                      }
                      placeholder="VD: SN-2026-0001"
                      className={`${inputClass(Boolean(serialFormError))} disabled:cursor-not-allowed disabled:bg-slate-100`}
                    />
                  </FormField>
                  <FormField label="Ghi chú">
                    <input
                      value={serialForm.notes}
                      disabled={serialLimitReached && !editingSerial}
                      onChange={(event) =>
                        { setSerialForm((current) => ({ ...current, notes: event.target.value })); setSerialFormError(""); }
                      }
                      placeholder="Tùy chọn"
                      className={`${inputClass(false)} disabled:cursor-not-allowed disabled:bg-slate-100`}
                    />
                  </FormField>
                  <button
                    disabled={serialSaving || (!editingSerial && serialLimitReached)}
                    className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FiPlus /> {serialSaving ? "Đang lưu" : editingSerial ? "Cập nhật" : "Thêm seri"}
                  </button>
                </div>
                {serialFormError && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"><FiHash className="mt-0.5 shrink-0" /><span>{serialFormError}</span></div>}
                {!editingSerial && serialLimitReached && !serialFormError && <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${serialOverLimit ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><FiHash className="mt-0.5 shrink-0" /><span>{serialOverLimit ? `PO đang có ${serials.length} seri, vượt Tổng SL ${serialPO.totalQuantity}. Hãy xóa seri dư trước khi thêm mới.` : `Đã đủ ${serialPO.totalQuantity} seri theo Tổng SL của PO. Muốn thêm seri mới, hãy xóa một seri cũ hoặc tăng Tổng SL.`}</span></div>}
              </form>
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Danh sách seri
                  </p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${serialOverLimit ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"}`}>
                    {serials.length} / {serialPO.totalQuantity} seri
                  </span>
                </div>
                {serialLoading ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    Đang tải seri...
                  </p>
                ) : serials.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <FiHash className="mx-auto mb-2 text-3xl text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">
                      PO này chưa có số seri
                    </p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white text-left text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Số seri</th>
                          <th className="px-4 py-3">Ghi chú</th>
                          <th className="px-4 py-3">Ngày tạo</th>
                          <th className="px-4 py-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {serials.map((serial) => (
                          <tr key={serial.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                              {serial.serialNumber}
                            </td>
                            <td className="max-w-48 truncate px-4 py-3 text-slate-600">
                              {serial.notes || "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {serial.createdAt
                                ? new Date(serial.createdAt).toLocaleDateString("vi-VN")
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <ActionButton
                                  label="Sửa seri"
                                  onClick={() => {
                                    setEditingSerial(serial);
                                    setSerialForm({
                                      serialNumber: serial.serialNumber,
                                      notes: serial.notes || "",
                                    });
                                  }}
                                >
                                  <FiEdit2 />
                                </ActionButton>
                                <ActionButton
                                  label="Xóa seri"
                                  danger
                                  onClick={() => void removeSerial(serial)}
                                >
                                  <FiTrash2 />
                                </ActionButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            aria-label="Đóng chi tiết PO"
            onClick={() => setSelectedPO(null)}
          />
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Phân bổ Purchase Order
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  #{selectedPO.poCode}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPO.supplier} · Còn lại{" "}
                  <b>{selectedPO.remainingQuantity.toLocaleString("vi-VN")}</b>{" "}
                  / {selectedPO.totalQuantity.toLocaleString("vi-VN")}
                </p>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <FiX className="text-lg" />
              </button>
            </div>
            {allocationRows.length === 0 ? (
              <div className="py-10 text-center">
                <FiTruck className="mx-auto mb-3 text-3xl text-slate-300" />
                <p className="font-medium text-slate-600">
                  PO này chưa được phân bổ
                </p>
                <button
                  onClick={() => {
                    setSelectedPO(null);
                    setFilterPOId(selectedPO.id);
                    setDeliveryOpen(true);
                  }}
                  className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                >
                  Tạo giao hàng cho PO
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Mã hợp đồng</th>
                      <th className="px-4 py-3">Bệnh viện</th>
                      <th className="px-4 py-3 text-center">Số lượng</th>
                      <th className="px-4 py-3">Ngày giao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocationRows.map((row, index) => (
                      <tr key={`${row.contractCode}-${index}`}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {row.contractCode}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {row.hospitalName}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-blue-700">
                          {row.quantity.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.deliveryDate || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setSelectedPO(null);
                  setFilterPOId(selectedPO.id);
                  setDeliveryOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <FiTruck /> Quản lý giao hàng
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 block text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
function ActionButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-2 transition ${danger ? "text-slate-400 hover:bg-red-50 hover:text-red-600" : "text-slate-400 hover:bg-blue-50 hover:text-blue-600"}`}
    >
      {children}
    </button>
  );
}
function inputClass(error: boolean) {
  return `w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition ${error ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100" : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"}`;
}
