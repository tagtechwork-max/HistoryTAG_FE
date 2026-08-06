import api from "./client";
export type PO = {
  id: number;
  poCode: string;
  supplierId: number | null;
  supplier: string;
  totalQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  serialCount: number;
  status: string;
};
export type POSerial = {
  id: number;
  serialNumber: string;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
export type SupplierOption = {
  id: number;
  name: string;
  contactPerson?: string | null;
  phoneNumber?: string | null;
};
type SupplierPage = { content: SupplierOption[] };
export type Allocation = { poId: number; quantity: number };
export const getPOs = () => api.get<PO[]>("/api/v1/admin/purchase-orders");
export const createPO = (body: unknown) =>
  api.post("/api/v1/admin/purchase-orders", body);
export const updatePO = (id: number, body: unknown) =>
  api.put(`/api/v1/admin/purchase-orders/${id}`, body);
export const deletePO = (id: number) =>
  api.delete(`/api/v1/admin/purchase-orders/${id}`);
export const getPOSerials = (poId: number) =>
  api.get<POSerial[]>(`/api/v1/admin/purchase-orders/${poId}/serials`);
export const createPOSerial = (
  poId: number,
  body: { serialNumber: string; notes?: string },
) => api.post<POSerial>(`/api/v1/admin/purchase-orders/${poId}/serials`, body);
export const updatePOSerial = (
  poId: number,
  serialId: number,
  body: { serialNumber: string; notes?: string },
) =>
  api.put<POSerial>(
    `/api/v1/admin/purchase-orders/${poId}/serials/${serialId}`,
    body,
  );
export const deletePOSerial = (poId: number, serialId: number) =>
  api.delete(`/api/v1/admin/purchase-orders/${poId}/serials/${serialId}`);
export const getDeliveryContracts = () =>
  api.get("/api/v1/admin/purchase-orders/contracts");
export const createDeliveryContract = (body: unknown) =>
  api.post("/api/v1/admin/purchase-orders/contracts", body);
export const updateDeliveryContract = (id: number, body: unknown) =>
  api.put(`/api/v1/admin/purchase-orders/contracts/${id}`, body);
export const searchSuppliers = (search = "") =>
  api.get<SupplierPage>("/api/v1/superadmin/suppliers", {
    params: { search, page: 0, size: 30, sortBy: "name", sortDir: "asc" },
  });
