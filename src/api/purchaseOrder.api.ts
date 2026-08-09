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
export type BusinessContractOption = {
  id: number;
  contractCode: string;
  hospitalId: number;
  hospitalName: string;
  deliveryStatus: "CHUA_GIAO" | "DA_GIAO";
  deliveryDates: string[];
};
export type DeliveryAllocation = Allocation & {
  poCode: string;
  remainingQuantity: number;
  serialNumbers: string[];
};
export type DeliveryContract = {
  id: number;
  businessProjectId: number | null;
  contractCode: string;
  hospitalId: number;
  hospitalName: string;
  deliveryDate: string;
  notes?: string | null;
  totalQuantity: number;
  allocations: DeliveryAllocation[];
};
export const getPOs = () => api.get<PO[]>("/api/v1/admin/purchase-orders");
export const createPO = (body: unknown) =>
  api.post("/api/v1/admin/purchase-orders", body);
export const updatePO = (id: number, body: unknown) =>
  api.put(`/api/v1/admin/purchase-orders/${id}`, body);
export const deletePO = (id: number) =>
  api.delete(`/api/v1/admin/purchase-orders/${id}`);
export const getPOSerials = (poId: number) =>
  api.get<POSerial[]>(`/api/v1/admin/purchase-orders/${poId}/serials`);
export const getAvailablePOSerials = (poId: number) =>
  api.get<POSerial[]>(`/api/v1/admin/purchase-orders/${poId}/available-serials`);
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
  api.get<DeliveryContract[]>("/api/v1/admin/purchase-orders/contracts");
export const getBusinessContractsForDelivery = () =>
  api.get<BusinessContractOption[]>(
    "/api/v1/admin/purchase-orders/business-contracts",
  );
export const createDeliveryContract = (body: unknown) =>
  api.post("/api/v1/admin/purchase-orders/contracts", body);
export const updateDeliveryContract = (id: number, body: unknown) =>
  api.put(`/api/v1/admin/purchase-orders/contracts/${id}`, body);
export const searchSuppliers = (search = "") =>
  api.get<SupplierPage>("/api/v1/superadmin/suppliers", {
    params: { search, page: 0, size: 30, sortBy: "name", sortDir: "asc" },
  });
