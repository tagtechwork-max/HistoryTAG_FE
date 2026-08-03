import { useEffect, useState } from 'react';
import { createPO, deletePO, getPOs, PO, updatePO, getDeliveryContracts } from '../../api/purchaseOrder.api';
import DeliveryContracts from './DeliveryContracts';
import { FiPlusCircle, FiEdit2, FiTruck, FiTrash2 } from 'react-icons/fi';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import toast from 'react-hot-toast';

export default function PurchaseOrders() {
  const [items, setItems] = useState<PO[]>([]); const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [form, setForm] = useState<{ poCode: string; supplier: string; totalQuantity: number | '' }>({ poCode: '', supplier: '', totalQuantity: 1 }); const [editing, setEditing] = useState<number | null>(null); const [error, setError] = useState('');
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterPOId, setFilterPOId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ poCode?: string; supplier?: string; totalQuantity?: string }>({});
  const { ask: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const handleInputChange = (field: 'poCode' | 'supplier' | 'totalQuantity', value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!form.poCode.trim()) {
      errors.poCode = 'Vui lòng nhập mã PO';
    }
    if (!form.supplier.trim()) {
      errors.supplier = 'Vui lòng nhập tên nhà cung cấp';
    }
    if (form.totalQuantity === '') {
      errors.totalQuantity = 'Vui lòng nhập tổng số lượng';
    } else if (Number(form.totalQuantity) < 0) {
      errors.totalQuantity = 'Số lượng không được nhỏ hơn 0';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const load = () => {
    getPOs().then(r => setItems(r.data)).catch(e => toast.error(e?.response?.data?.message || 'Không tải được danh sách PO'));
    getDeliveryContracts().then(r => setContracts(r.data)).catch(() => { });
  };
  useEffect(() => {
    if (!deliveryOpen) {
      load();
    }
  }, [deliveryOpen]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const body = { ...form, totalQuantity: Number(form.totalQuantity) };
      if (editing) {
        await updatePO(editing, body);
        toast.success('Cập nhật PO thành công');
      } else {
        await createPO(body);
        toast.success('Tạo PO mới thành công');
      }
      setForm({ poCode: '', supplier: '', totalQuantity: 1 });
      setEditing(null);
      setIsFormOpen(false);
      setFieldErrors({});
      load();
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || 'Không thể lưu PO';
      setError(errMsg);
      toast.error(errMsg);
    }
  };
  const remove = async (id: number) => {
    const ok = await askConfirm({
      title: 'Xóa PO này?',
      message: 'Hành động này sẽ xóa vĩnh viễn PO và không thể hoàn tác.',
      variant: 'danger',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy'
    });
    if (!ok) return;
    try {
      await deletePO(id);
      toast.success('Xóa PO thành công');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Không thể xóa PO');
    }
  };
  if (deliveryOpen) {
    return (
      <div className="p-6">
        <button
          onClick={() => {
            setDeliveryOpen(false);
            setFilterPOId(null);
          }}
          className="mb-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors shadow-sm cursor-pointer"
        >
          Quay lại danh sách PO
        </button>
        <DeliveryContracts filterPOId={filterPOId} />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Danh sách Purchase Orders(PO)</h1>
        <div className="flex items-center gap-3">
          {!isFormOpen && !editing && (
            <>
              <button
                onClick={() => {
                  setFilterPOId(null);
                  setDeliveryOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
              >
                <FiTruck className="w-4 h-4" />
                Giao hàng
              </button>
              <button
                onClick={() => setIsFormOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ fill: 'none' }}>
                  <circle cx="12" cy="12" r="10" style={{ fill: 'none' }} />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8" />
                </svg>
                Tạo PO
              </button>
            </>
          )}
        </div>
      </div>

      {(isFormOpen || editing) && (
        <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="text-sm font-semibold text-gray-700">Mã PO</label>
              <input
                placeholder="Nhập mã PO"
                className={`w-full rounded-lg border px-3.5 py-2 text-sm outline-none transition-colors ${fieldErrors.poCode
                  ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                value={form.poCode}
                onChange={e => handleInputChange('poCode', e.target.value)}
              />
              {fieldErrors.poCode && <span className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.poCode}</span>}
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">Nhà cung cấp</label>
              <input
                placeholder="Tên hoặc mã nhà cung cấp"
                className={`w-full rounded-lg border px-3.5 py-2 text-sm outline-none transition-colors ${fieldErrors.supplier
                  ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                value={form.supplier}
                onChange={e => handleInputChange('supplier', e.target.value)}
              />
              {fieldErrors.supplier && <span className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.supplier}</span>}
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-1">
              <label className="text-sm font-semibold text-gray-700">Tổng SL</label>
              <input
                type="number"
                className={`w-full rounded-lg border px-3.5 py-2 text-sm outline-none transition-colors ${fieldErrors.totalQuantity
                  ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50/20'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                value={form.totalQuantity}
                onChange={e => handleInputChange('totalQuantity', e.target.value === '' ? '' : Number(e.target.value))}
              />
              {fieldErrors.totalQuantity && <span className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.totalQuantity}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {error && <span className="text-sm text-red-600 font-medium">{error}</span>}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditing(null);
                  setForm({ poCode: '', supplier: '', totalQuantity: 1 });
                  setFieldErrors({});
                  setError('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer">
                {editing ? (
                  'Lưu thay đổi'
                ) : (
                  <>
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ fill: 'none' }}>
                      <circle cx="12" cy="12" r="10" style={{ fill: 'none' }} />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8" />
                    </svg>
                    Tạo PO Mới
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/50">
              {['Mã PO', 'Nhà cung cấp', 'Tổng SL', 'Đã phân bổ', 'Còn lại', 'Trạng thái', 'Thao tác'].map((x, i) => (
                <th
                  className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${[2, 3, 4, 5, 6].includes(i) ? 'text-center' : 'text-left'
                    }`}
                  key={x}
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(x => (
              <tr className="hover:bg-gray-50/50 transition-colors" key={x.id}>
                <td className="px-4 py-4 text-sm font-medium">
                  <button
                    onClick={() => setSelectedPO(x)}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-semibold cursor-pointer text-left focus:outline-none max-w-[200px] truncate block"
                    title={x.poCode}
                  >
                    {x.poCode}
                  </button>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 max-w-[250px] break-words whitespace-normal">
                  {x.supplier}
                </td>
                <td className="px-4 py-4 text-sm text-center text-gray-700 font-medium">
                  {x.totalQuantity}
                </td>
                <td className="px-4 py-4 text-sm text-center text-gray-700 font-medium">
                  {x.usedQuantity}
                </td>
                <td className="px-4 py-4 text-sm text-center text-gray-700 font-medium">
                  {x.remainingQuantity}
                </td>
                <td className="px-4 py-4 text-sm text-center">
                  {x.remainingQuantity ? (
                    <span className="inline-flex items-center rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      Còn hàng
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                      Hết hàng
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-center">
                  <div className="flex items-center justify-center gap-3">
                    <button
                      className="text-gray-500 hover:text-blue-600 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setEditing(x.id);
                        setForm({ poCode: x.poCode, supplier: x.supplier, totalQuantity: x.totalQuantity });
                        setIsFormOpen(true);
                      }}
                      title="Sửa"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    <button
                      className="text-gray-500 hover:text-emerald-600 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setFilterPOId(x.id);
                        setDeliveryOpen(true);
                      }}
                      title="Giao hàng"
                    >
                      <FiTruck className="w-4 h-4" />
                    </button>
                    <button
                      className="text-gray-500 hover:text-red-600 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                      onClick={() => remove(x.id)}
                      title="Xóa"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Chi tiết phân bổ PO</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Mã PO: <span className="font-semibold text-blue-600">{selectedPO.poCode}</span>
                </p>
              </div>
              <button onClick={() => setSelectedPO(null)} className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1.5 hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              {(() => {
                const poAllocations = contracts.filter(c =>
                  c.allocations?.some((a: any) => a.poId === selectedPO.id)
                ).map(c => {
                  const a = c.allocations.find((a: any) => a.poId === selectedPO.id);
                  return {
                    contractCode: c.contractCode,
                    hospitalName: c.hospitalName,
                    deliveryDate: c.deliveryDate,
                    quantity: a ? a.quantity : 0
                  };
                });
                if (poAllocations.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <p>PO này chưa được phân bổ cho bệnh viện nào.</p>
                    </div>
                  );
                }
                return (
                  <div className="border rounded-xl overflow-hidden bg-gray-50">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Mã hợp đồng</th>
                          <th className="px-4 py-3 text-left font-semibold">Bệnh viện</th>
                          <th className="px-4 py-3 text-center font-semibold">Số lượng</th>
                          <th className="px-4 py-3 text-left font-semibold">Ngày giao</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {poAllocations.map((alloc, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{alloc.contractCode}</td>
                            <td className="px-4 py-3 text-blue-600 font-medium">{alloc.hospitalName}</td>
                            <td className="px-4 py-3 text-center font-semibold text-blue-600">{alloc.quantity}</td>
                            <td className="px-4 py-3 text-gray-500">{alloc.deliveryDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            <div className="mt-6 flex justify-end border-t pt-4">
              <button onClick={() => setSelectedPO(null)} className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
