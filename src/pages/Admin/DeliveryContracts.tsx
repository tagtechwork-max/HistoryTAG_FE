import { FormEvent, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BusinessContractOption,
  DeliveryContract,
  createDeliveryContract,
  deleteDeliveryContract,
  getDeliveryContracts,
  getAvailablePOSerials,
  getPOs,
  getBusinessContractsForDelivery,
  PO,
  POSerial,
} from "../../api/purchaseOrder.api";

type AllocationRow = { poId: number; quantity: number; serialIds: number[] };
type DeliveryPayload = { businessProjectId: number; deliveryDate: string; notes: string; allocations: AllocationRow[] };
type DeliveryContractsProps = { filterPOId?: number | null };

const today = () => new Date().toISOString().slice(0, 10);
const responseMessage = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

export default function DeliveryContracts({ filterPOId }: DeliveryContractsProps = {}) {
  const [rows, setRows] = useState<DeliveryContract[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [businessContracts, setBusinessContracts] = useState<BusinessContractOption[]>([]);
  const [contractCodeInput, setContractCodeInput] = useState("");
  const [contractSuggestionsOpen, setContractSuggestionsOpen] = useState(false);
  const [form, setForm] = useState({ businessProjectId: 0, deliveryDate: today(), notes: "" });
  const [allocations, setAllocations] = useState<AllocationRow[]>([{ poId: filterPOId ?? 0, quantity: 1, serialIds: [] }]);
  const [availableSerials, setAvailableSerials] = useState<Record<number, POSerial[]>>({});
  const [saving, setSaving] = useState(false);
  const [repeatDelivery, setRepeatDelivery] = useState<DeliveryPayload | null>(null);
  const [returnTarget, setReturnTarget] = useState<DeliveryContract | null>(null);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [deliveryResponse, poResponse, businessResponse] = await Promise.all([
        getDeliveryContracts(),
        getPOs(),
        getBusinessContractsForDelivery(),
      ]);
      setRows(deliveryResponse.data);
      setPos(poResponse.data);
      setBusinessContracts(businessResponse.data);
      setError("");
    } catch (requestError: unknown) {
      setError(responseMessage(requestError, "Không tải được dữ liệu giao hàng"));
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setAllocations([{ poId: filterPOId ?? 0, quantity: 1, serialIds: [] }]);
  }, [filterPOId]);

  const allocationPoIdsKey = useMemo(
    () => [...new Set(allocations.map((allocation) => allocation.poId).filter((poId) => poId > 0))].sort().join(","),
    [allocations],
  );
  useEffect(() => {
    const poIds = allocationPoIdsKey.split(",").map(Number).filter((poId) => poId > 0);
    if (!poIds.length) return;
    void Promise.all(poIds.map(async (poId) => ({ poId, serials: (await getAvailablePOSerials(poId)).data })))
      .then((results) => setAvailableSerials((current) => ({
        ...current,
        ...Object.fromEntries(results.map((result) => [result.poId, result.serials])),
      })))
      .catch((requestError: unknown) => setError(responseMessage(requestError, "Không tải được danh sách seri")));
  }, [allocationPoIdsKey]);

  const selectedContract = useMemo(
    () => businessContracts.find((contract) => contract.id === form.businessProjectId),
    [businessContracts, form.businessProjectId],
  );
  const suggestedContracts = useMemo(() => {
    const keyword = contractCodeInput.trim().toLocaleLowerCase();
    if (!keyword) return [];
    return businessContracts.filter((contract) =>
      contract.contractCode.toLocaleLowerCase().includes(keyword) ||
      contract.hospitalName.toLocaleLowerCase().includes(keyword),
    ).slice(0, 12);
  }, [businessContracts, contractCodeInput]);
  const availablePos = filterPOId ? pos.filter((po) => po.id === filterPOId) : pos.filter((po) => po.remainingQuantity > 0);
  const displayedRows = filterPOId
    ? rows.filter((contract) => contract.allocations?.some((allocation) => allocation.poId === filterPOId))
    : rows;

  const reset = () => {
    setContractCodeInput("");
    setContractSuggestionsOpen(false);
    setForm({ businessProjectId: 0, deliveryDate: today(), notes: "" });
    setAllocations([{ poId: filterPOId ?? 0, quantity: 1, serialIds: [] }]);
  };

  const performSave = async (payload: DeliveryPayload) => {
    setSaving(true);
    setError("");
    try {
      await createDeliveryContract(payload);
      setRepeatDelivery(null);
      reset();
      await load();
    } catch (requestError: unknown) {
      setError(responseMessage(requestError, "Không thể lưu giao hàng"));
    } finally {
      setSaving(false);
    }
  };

  const confirmReturn = async () => {
    if (!returnTarget || returning) return;
    setReturning(true);
    setError("");
    try {
      const returnedPoIds = [...new Set(returnTarget.allocations.map((allocation) => allocation.poId))];
      await deleteDeliveryContract(returnTarget.id);
      setReturnTarget(null);
      await load();
      const refreshedSerials = await Promise.all(
        returnedPoIds.map(async (poId) => ({ poId, serials: (await getAvailablePOSerials(poId)).data })),
      );
      setAvailableSerials((current) => ({
        ...current,
        ...Object.fromEntries(refreshedSerials.map(({ poId, serials }) => [poId, serials])),
      }));
    } catch (requestError: unknown) {
      setError(responseMessage(requestError, "Không thể hoàn hàng"));
    } finally {
      setReturning(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const validAllocations = allocations
      .filter((allocation) => allocation.poId > 0)
      .map((allocation) => ({ ...allocation, quantity: Number(allocation.quantity) }));
    if (!form.businessProjectId) return setError("Mã hợp đồng không tồn tại");
    if (!validAllocations.length) return setError("Vui lòng chọn ít nhất một PO");
    const invalidSerialAllocation = validAllocations.find((allocation) => allocation.serialIds.length !== allocation.quantity);
    if (invalidSerialAllocation) {
      const poCode = pos.find((po) => po.id === invalidSerialAllocation.poId)?.poCode ?? invalidSerialAllocation.poId;
      return setError(`PO ${poCode} phải chọn đúng ${invalidSerialAllocation.quantity} số seri`);
    }
    const payload = { ...form, allocations: validAllocations };
    if (selectedContract?.deliveryDates?.length) {
      setError("");
      setRepeatDelivery(payload);
      return;
    }
    void performSave(payload);
  };

  const formatDeliveryDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {repeatDelivery && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Xác nhận giao hàng lần nữa</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Hợp đồng <strong className="text-blue-700">{selectedContract.contractCode}</strong> đã được giao vào ngày{' '}
              <strong>{formatDeliveryDate(selectedContract.deliveryDates[selectedContract.deliveryDates.length - 1])}</strong>.
              {' '}Bạn có muốn giao hàng lần nữa không?
            </p>
            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setRepeatDelivery(null); setError(""); }} disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Không</button>
              <button type="button" onClick={() => void performSave(repeatDelivery)} disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Đang lưu..." : "Có, giao lần nữa"}
              </button>
            </div>
          </div>
        </div>
      )}
      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Xác nhận hoàn hàng</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Bạn có muốn hoàn lần giao của hợp đồng <strong className="text-blue-700">{returnTarget.contractCode}</strong> không?
              Thao tác này sẽ hoàn lại <strong>{returnTarget.totalQuantity} kiosk</strong> về PO và giải phóng các serial đã giao.
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              {returnTarget.allocations?.map((allocation) => (
                <div key={allocation.poId} className="text-sm text-gray-700">
                  <div><strong>{allocation.poCode}</strong>: hoàn {allocation.quantity} kiosk</div>
                  <div className="mt-1 text-xs text-gray-600">
                    Serial: {allocation.serialNumbers?.length ? allocation.serialNumbers.join(", ") : "Không có"}
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setReturnTarget(null); setError(""); }} disabled={returning}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Không
              </button>
              <button type="button" onClick={() => void confirmReturn()} disabled={returning}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {returning ? "Đang hoàn..." : "Có, hoàn hàng"}
              </button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-semibold text-gray-900">
        {filterPOId ? <>Quản lý giao hàng của PO: <span className="font-bold text-blue-600">{pos.find((po) => po.id === filterPOId)?.poCode || "..."}</span></> : "Quản lý giao hàng"}
      </h1>

      <form onSubmit={save} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="relative flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Mã hợp đồng</label>
            <input
              required
              autoComplete="off"
              placeholder="Nhập mã hợp đồng"
              value={contractCodeInput}
              onChange={(event) => {
                const value = event.target.value;
                const matched = businessContracts.find(
                  (contract) => contract.contractCode.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase(),
                );
                setContractCodeInput(value);
                setContractSuggestionsOpen(true);
                setForm((current) => ({ ...current, businessProjectId: matched?.id ?? 0 }));
              }}
              onFocus={() => setContractSuggestionsOpen(true)}
              onBlur={() => window.setTimeout(() => setContractSuggestionsOpen(false), 150)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {contractSuggestionsOpen && suggestedContracts.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {suggestedContracts.map((contract) => (
                  <button
                    key={contract.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setContractCodeInput(contract.contractCode);
                      setForm((current) => ({ ...current, businessProjectId: contract.id }));
                      setContractSuggestionsOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3.5 py-2.5 text-left text-sm hover:bg-blue-50"
                  >
                    <span><strong className="text-blue-700">{contract.contractCode}</strong><span className="ml-2 text-gray-600">{contract.hospitalName}</span></span>
                    <span className={`shrink-0 text-xs font-medium ${contract.deliveryStatus === "DA_GIAO" ? "text-emerald-600" : "text-amber-600"}`}>
                      {contract.deliveryStatus === "DA_GIAO" ? "Đã giao" : "Chưa giao"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Bệnh viện</label>
            <div className="min-h-[38px] rounded-lg border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-700">
              {selectedContract?.hospitalName || "Tự động theo hợp đồng"}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Ngày giao</label>
            <input required type="date" value={form.deliveryDate}
              onChange={(event) => setForm((current) => ({ ...current, deliveryDate: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="block text-sm font-semibold text-gray-700">Phân bổ từ PO</label>
          {allocations.map((allocation, index) => (
            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/40 p-3" key={index}>
              <div className="flex items-center gap-3">
                {filterPOId ? (
                  <div className="flex-1 rounded-lg border border-gray-300 bg-gray-100 p-2.5 text-sm text-gray-700">
                    {pos.find((po) => po.id === allocation.poId)?.poCode} — còn {pos.find((po) => po.id === allocation.poId)?.remainingQuantity}
                  </div>
                ) : (
                  <select value={allocation.poId} onChange={(event) => setAllocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, poId: Number(event.target.value), serialIds: [] } : row))}
                    className="flex-1 rounded-lg border border-gray-300 bg-white p-2.5 text-sm outline-none focus:border-blue-500">
                    <option value={0}>Chọn PO còn hàng</option>
                    {availablePos.map((po) => <option key={po.id} value={po.id}>{po.poCode} — còn {po.remainingQuantity}</option>)}
                  </select>
                )}
                <input min={1} type="number" value={allocation.quantity}
                  onChange={(event) => {
                    const quantity = Math.max(1, Number(event.target.value));
                    setAllocations((current) => current.map((row, rowIndex) => rowIndex === index
                      ? { ...row, quantity, serialIds: row.serialIds.slice(0, quantity) }
                      : row));
                  }}
                  className="w-28 rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-blue-500" />
                {!filterPOId && <button type="button" onClick={() => setAllocations((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50">Xóa</button>}
              </div>
              {allocation.poId > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-700">Seri</label>
                    <span className={`text-xs font-medium ${allocation.serialIds.length === allocation.quantity ? "text-emerald-600" : "text-amber-600"}`}>
                      Đã chọn {allocation.serialIds.length}/{allocation.quantity}
                    </span>
                  </div>
                  {(availableSerials[allocation.poId] ?? []).length ? (
                    <div className="flex max-h-36 flex-wrap gap-2 overflow-auto">
                      {(availableSerials[allocation.poId] ?? []).map((serial) => {
                        const checked = allocation.serialIds.includes(serial.id);
                        return (
                          <label key={serial.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700"}`}>
                            <input type="checkbox" checked={checked}
                              onChange={() => setAllocations((current) => current.map((row, rowIndex) => {
                                if (rowIndex !== index) return row;
                                const serialIds = checked
                                  ? row.serialIds.filter((id) => id !== serial.id)
                                  : [...row.serialIds, serial.id];
                                return { ...row, serialIds, quantity: Math.max(row.quantity, serialIds.length) };
                              }))} />
                            {serial.serialNumber}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-red-600">PO này không còn số seri khả dụng.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!filterPOId && <button type="button" onClick={() => setAllocations((current) => [...current, { poId: 0, quantity: 1, serialIds: [] }])} className="text-sm font-semibold text-blue-600 hover:text-blue-800">+ Thêm PO</button>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <button disabled={saving || !form.businessProjectId} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Đang lưu..." : "Lưu giao hàng"}
          </button>
          {error && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="border-b bg-gray-50/50">
            {["Mã hợp đồng", "Bệnh viện", "Ngày giao", "Danh sách PO", "Tổng kiosk", "Thao tác"].map((label) => <th key={label} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {displayedRows.map((contract) => <tr className="hover:bg-gray-50/50" key={contract.id}>
              <td className="px-4 py-4 font-medium text-gray-900">{contract.contractCode}</td>
              <td className="px-4 py-4 font-semibold text-blue-600">{contract.hospitalName}</td>
              <td className="px-4 py-4 text-gray-500">{contract.deliveryDate}</td>
              <td className="max-w-[250px] truncate px-4 py-4 text-gray-600" title={contract.allocations?.map((allocation) => `${allocation.poCode} (${allocation.quantity})`).join(", ")}>{contract.allocations?.map((allocation) => `${allocation.poCode} (${allocation.quantity})`).join(", ")}</td>
              <td className="px-4 py-4 font-bold text-blue-600">{contract.totalQuantity}</td>
              <td className="px-4 py-4">
                <button type="button" onClick={() => { setError(""); setReturnTarget(contract); }}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                  Hoàn hàng
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
