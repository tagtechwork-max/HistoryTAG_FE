export type BusinessGroupBy = "day" | "month" | "year";
export type HardwareGroupBy = "hardware" | "type" | "supplier";

export type BusinessItem = {
  totalPrice: number;
  commission: number;
  status: string;
  date: Date | null;
};

export type HardwareReportRow = {
  key: string;
  label: string;
  revenue: number;
  quantity: number;
  taskCount: number;
  impl: number;
  dev: number;
  maint: number;
  image?: string;
};

export type EmployeePerformance = {
  userId?: number | null;
  fullName?: string | null;
  team?: string | null;
  department?: string | null;
  totalAssigned?: number;
  totalInProgress?: number;
  totalCompleted?: number;
  totalLate?: number;
  totalReceived?: number;
  totalTransferred?: number;
  avgProcessingHours?: number;
};

export type ApexFormatterOptions = {
  w?: { globals?: { series?: number[] } };
  seriesIndex?: number;
} | undefined;
