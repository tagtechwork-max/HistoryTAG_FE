import { useEffect, useState } from 'react';
import { searchHospitalsForSelect } from '../../api/api';
import { createDeliveryContract, getDeliveryContracts, getPOs, PO, updateDeliveryContract } from '../../api/purchaseOrder.api';
import { FiTruck } from 'react-icons/fi';

type Row = { poId: number; quantity: number };

interface DeliveryContractsProps {
  filterPOId?: number | null;
}

export default function DeliveryContracts({ filterPOId }: DeliveryContractsProps = {}) {
  const [rows, setRows] = useState<any[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [query, setQuery] = useState('');
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [form, setForm] = useState({
    contractCode: '',
    hospitalId: '',
    deliveryDate: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [alloc, setAlloc] = useState<Row[]>([{ poId: 0, quantity: 1 }]);
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState<{ contract: any; allocations: Row[]; total: number } | null>(null);

  const load = () =>
    Promise.all([getDeliveryContracts(), getPOs()]).then(([c, p]) => {
      setRows(c.data);
      setPos(p.data);
    }).catch(e => setError(e?.response?.data?.message || 'Không tải được dữ liệu'));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (filterPOId) {
      setAlloc([{ poId: filterPOId, quantity: 1 }]);
    } else {
      setAlloc([{ poId: 0, quantity: 1 }]);
    }
  }, [filterPOId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchHospitalsForSelect(query).then(setHospitals);
      } else {
        setHospitals([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const reset = () => {
    setForm({ ...form, contractCode: '', hospitalId: '', notes: '' });
    setQuery('');
    setAlloc(filterPOId ? [{ poId: filterPOId, quantity: 1 }] : [{ poId: 0, quantity: 1 }]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const a = alloc.filter(x => x.poId > 0).map(x => ({ ...x, quantity: Number(x.quantity) }));
    const body = { ...form, hospitalId: Number(form.hospitalId), allocations: a };
    try {
      await createDeliveryContract(body);
      reset();
      load();
    } catch (e: any) {
      const old = rows.find(r => String(r.contractCode).toLowerCase() === form.contractCode.trim().toLowerCase());
      if (old) {
        setDuplicate({
          contract: old,
          allocations: a,
          total: a.reduce((s, x) => s + x.quantity, 0)
        });
      } else {
        setError(e?.response?.data?.message || 'Không thể lưu hợp đồng');
      }
    }
  };

  const add = async () => {
    if (!duplicate) return;
    try {
      const merged = [
        ...(duplicate.contract.allocations || []).map((a: any) => ({ poId: a.poId, quantity: a.quantity })),
        ...duplicate.allocations
      ];
      await updateDeliveryContract(duplicate.contract.id, {
        ...form,
        hospitalId: Number(form.hospitalId),
        allocations: merged
      });
      setDuplicate(null);
      reset();
      load();
    } catch (e: any) {
      setDuplicate(null);
      setError(e?.response?.data?.message || 'Không thể bổ sung hợp đồng');
    }
  };

  const filteredPos = filterPOId
    ? pos.filter(p => p.id === filterPOId)
    : pos.filter(p => p.remainingQuantity > 0);

  const displayedRows = filterPOId
    ? rows.filter(c => c.allocations?.some((a: any) => a.poId === filterPOId))
    : rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {duplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-950">Hợp đồng đã tồn tại</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Bạn đã có hợp đồng này. Bạn có muốn bổ sung cho <span className="font-semibold text-blue-600">{query}</span> số lượng <span className="font-semibold text-blue-600">{duplicate.total} kiosk</span> không?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDuplicate(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Hủy
              </button>
              <button onClick={add} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                Bổ sung
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          {filterPOId ? (
            <>
              Quản lý giao hàng của PO:{' '}
              <span className="text-blue-600 font-bold">
                {pos.find(p => p.id === filterPOId)?.poCode || '...'}
              </span>
            </>
          ) : (
            'Quản lý giao hàng'
          )}
        </h1>
      </div>

      <form onSubmit={save} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Mã hợp đồng</label>
            <input
              required
              placeholder="Nhập mã hợp đồng"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={form.contractCode}
              onChange={e => setForm({ ...form, contractCode: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5 relative">
            <label className="text-sm font-semibold text-gray-700">Bệnh viện</label>
            <input
              required
              autoComplete="off"
              placeholder="Nhập ít nhất 2 ký tự"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setForm({ ...form, hospitalId: '' });
              }}
            />
            {form.hospitalId && (
              <span className="text-xs text-emerald-600 font-semibold mt-1">
                Đã chọn bệnh viện
              </span>
            )}
            {hospitals.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-16 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {hospitals.map(h => (
                  <button
                    type="button"
                    key={h.id}
                    className="block w-full border-b border-gray-100 px-4 py-2.5 text-left text-sm hover:bg-blue-50 transition-colors"
                    onMouseDown={e => {
                      e.preventDefault();
                      setQuery(h.name);
                      setForm({ ...form, hospitalId: String(h.id) });
                      setHospitals([]);
                    }}
                  >
                    {h.name}
                    {h.code ? ` (${h.code})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Ngày giao</label>
            <input
              required
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={form.deliveryDate}
              onChange={e => setForm({ ...form, deliveryDate: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="text-sm font-semibold text-gray-700 block">Phân bổ từ PO</label>
          <div className="space-y-2">
            {alloc.map((a, i) => (
              <div className="flex items-center gap-3" key={i}>
                {filterPOId ? (
                  <div className="flex-1 rounded-lg border border-gray-300 p-2.5 text-sm bg-gray-100 text-gray-700 select-none">
                    {pos.find(p => p.id === a.poId)?.poCode} -{' '}
                    <span className={pos.find(p => p.id === a.poId)?.remainingQuantity === 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}>
                      còn {pos.find(p => p.id === a.poId)?.remainingQuantity}
                    </span>
                  </div>
                ) : (
                  <select
                    className={`flex-1 rounded-lg border border-gray-300 p-2.5 text-sm outline-none bg-gray-50/50 focus:border-blue-500 ${
                      a.poId === 0 
                        ? 'text-gray-500' 
                        : (pos.find(p => p.id === a.poId)?.remainingQuantity === 0 
                          ? 'text-red-600 font-semibold' 
                          : 'text-amber-600 font-semibold')
                    }`}
                    value={a.poId}
                    onChange={e => {
                      const n = [...alloc];
                      n[i] = { ...a, poId: Number(e.target.value) };
                      setAlloc(n);
                    }}
                  >
                    <option value={0} className="text-gray-500">Chọn PO còn hàng</option>
                    {filteredPos.map(p => (
                      <option 
                        key={p.id} 
                        value={p.id} 
                        className={p.remainingQuantity === 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}
                      >
                        {p.poCode} - còn {p.remainingQuantity}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  min={1}
                  type="number"
                  className="w-28 rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-blue-500"
                  value={a.quantity}
                  onChange={e => {
                    const n = [...alloc];
                    n[i] = { ...a, quantity: Number(e.target.value) };
                    setAlloc(n);
                  }}
                />
                {!filterPOId && (
                  <button
                    type="button"
                    onClick={() => setAlloc(alloc.filter((_, j) => j !== i))}
                    className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>
          {!filterPOId && (
            <button
              type="button"
              onClick={() => setAlloc([...alloc, { poId: 0, quantity: 1 }])}
              className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-semibold transition-colors mt-1"
            >
              + Thêm PO
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <button
            disabled={!form.hospitalId}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Lưu hợp đồng
          </button>
          {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/50">
              {['Mã hợp đồng', 'Bệnh viện', 'Ngày giao', 'Danh sách PO', 'Tổng kiosk'].map((x, i) => (
                <th
                  className={`px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
                    [2, 4].includes(i) ? 'text-center' : 'text-left'
                  }`}
                  key={x}
                >
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedRows.map(c => (
              <tr className="hover:bg-gray-50/50 transition-colors" key={c.id}>
                <td className="px-4 py-4 text-sm font-medium text-gray-900">{c.contractCode}</td>
                <td className="px-4 py-4 text-sm text-blue-600 font-semibold">{c.hospitalName}</td>
                <td className="px-4 py-4 text-sm text-center text-gray-500">{c.deliveryDate}</td>
                <td
                  className="px-4 py-4 text-sm text-gray-600 max-w-[250px] truncate"
                  title={c.allocations?.map((a: any) => `${a.poCode} (${a.quantity})`).join(', ')}
                >
                  {c.allocations?.map((a: any) => `${a.poCode} (${a.quantity})`).join(', ')}
                </td>
                <td className="px-4 py-4 text-sm text-center text-blue-600 font-bold">{c.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
