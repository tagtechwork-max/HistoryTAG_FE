import { useEffect, useState, useMemo } from "react";
import {
  getCSKHSummary,
  getContractsByStatus,
  getContractsByPayment,
  getCasesByType,
  getDebtReport,
  type CSKHSummaryDTO,
  type ContractStatusReportDTO,
  type PaymentStatusReportDTO,
  type CareTypeReportDTO,
  type DebtReportDTO,
} from "../../api/cskh-report.api";
import { isRequestCanceled } from "../../api/client";
import {
  FiUsers,
  FiClock,
  FiAlertTriangle,
  FiFileText,
  FiDollarSign,
  FiMessageSquare,
  FiTrendingUp,
  FiTrendingDown,
} from "react-icons/fi";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// Format currency VND
function formatCurrency(amount?: number | null): string {
  if (!amount && amount !== 0) return "0đ";
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(0)}tr`;
  }
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

// Format full currency
function formatFullCurrency(amount?: number | null): string {
  if (!amount && amount !== 0) return "0 VNĐ";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Summary Card Component
function SummaryCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
  trend,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
  trend?: number;
}) {
  return (
    <div className={`rounded-xl p-4 ${color} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="p-2 rounded-lg bg-white/50">
          <Icon className="h-5 w-5 text-gray-700" />
        </div>
      </div>
      {trend !== undefined && trend !== 0 && (
        <div className="mt-2 flex items-center gap-1">
          {trend > 0 ? (
            <FiTrendingUp className="h-3 w-3 text-green-600" />
          ) : (
            <FiTrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span
            className={`text-xs font-medium ${
              trend > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// Custom Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-200">
        <p className="text-sm font-medium text-gray-900">{data.name}</p>
        <p className="text-sm text-gray-600">
          Số lượng: <span className="font-semibold">{data.value}</span>
        </p>
        {data.amount !== undefined && (
          <p className="text-sm text-gray-600">
            Giá trị: <span className="font-semibold">{formatFullCurrency(data.amount)}</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

// Main Component
export default function CSKHReport() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CSKHSummaryDTO | null>(null);
  const [contractStatus, setContractStatus] = useState<ContractStatusReportDTO | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusReportDTO | null>(null);
  const [casesByType, setCasesByType] = useState<CareTypeReportDTO | null>(null);
  const [debtReport, setDebtReport] = useState<DebtReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, contractData, paymentData, casesData, debtData] =
          await Promise.all([
            getCSKHSummary(controller.signal),
            getContractsByStatus(controller.signal),
            getContractsByPayment(controller.signal),
            getCasesByType(controller.signal),
            getDebtReport(controller.signal),
          ]);
        if (controller.signal.aborted) return;
        setSummary(summaryData);
        setContractStatus(contractData);
        setPaymentStatus(paymentData);
        setCasesByType(casesData);
        setDebtReport(debtData);
      } catch (e: any) {
        if (isRequestCanceled(e) || controller.signal.aborted) return;
        console.error("Error fetching CSKH report:", e);
        setError(e?.message || "Không thể tải báo cáo");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchData();
    return () => controller.abort();
  }, []);

  // Chart data
  const contractStatusChartData = useMemo(() => {
    if (!contractStatus?.chartData) return [];
    return contractStatus.chartData.filter((item) => item.value > 0);
  }, [contractStatus]);

  const paymentChartData = useMemo(() => {
    if (!paymentStatus?.chartData) return [];
    return paymentStatus.chartData.filter((item) => item.value > 0);
  }, [paymentStatus]);

  const careTypeChartData = useMemo(() => {
    if (!casesByType?.items) return [];
    return casesByType.items
      .filter((item) => item.total > 0)
      .slice(0, 8)
      .map((item) => ({
        name: item.label,
        total: item.total,
        completed: item.completed,
        inProgress: item.inProgress,
        pending: item.pending,
      }));
  }, [casesByType]);

  const debtAgeChartData = useMemo(() => {
    if (!debtReport?.byAge) return [];
    return debtReport.byAge.map((item) => ({
      name: item.label,
      value: item.count,
      amount: item.value,
    }));
  }, [debtReport]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <span className="text-gray-600">Đang tải báo cáo CSKH...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-700">
        <p className="font-medium">Lỗi tải báo cáo</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-800">
            📊 Báo cáo Chăm sóc Khách hàng
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tổng quan hoạt động CSKH và hợp đồng bảo trì
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={FiUsers}
            title="BV đang chăm sóc"
            value={summary.totalHospitals}
            color="bg-blue-50"
          />
          {/* <SummaryCard
            icon={FiClock}
            title="Cases đang xử lý"
            value={summary.casesInProgress}
            color="bg-yellow-50"
          />
          <SummaryCard
            icon={FiAlertTriangle}
            title="Cases quá hạn"
            value={summary.casesOverdue}
            color="bg-red-50"
          /> */}
          <SummaryCard
            icon={FiFileText}
            title="HĐ sắp hết hạn"
            value={summary.contractsExpiringSoon}
            color="bg-orange-50"
          />
          <SummaryCard
            icon={FiDollarSign}
            title="HĐ chưa thanh toán hết"
            value={summary.unpaidContracts}
            subtitle={formatCurrency(summary.totalDebt)}
            color="bg-purple-50"
          />
          <SummaryCard
            icon={FiMessageSquare}
            title="Tickets đang mở"
            value={summary.openTickets}
            color="bg-green-50"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contract Status Pie Chart */}
        <div className="rounded-xl bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Hợp đồng theo trạng thái
          </h3>
          {contractStatusChartData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={contractStatusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {contractStatusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400">
              Chưa có dữ liệu
            </div>
          )}
          {contractStatus && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span>Đang hoạt động: {contractStatus.active?.count || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span>Sắp hết hạn: {contractStatus.expiringSoon?.count || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span>Hết hạn: {contractStatus.expired?.count || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                <span>Đã gia hạn: {contractStatus.renewed?.count || 0}</span>
              </div>
            </div>
          )}
        </div>

        {/* Payment Status Pie Chart */}
        <div className="rounded-xl bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Trạng thái thanh toán
          </h3>
          {paymentChartData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400">
              Chưa có dữ liệu
            </div>
          )}
          {paymentStatus && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Đã thanh toán hết:</span>
                <span className="font-semibold text-green-600">
                  {paymentStatus.paid?.count || 0} HĐ ({formatCurrency(paymentStatus.totalPaidAmount)})
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Chưa thanh toán:</span>
                <span className="font-semibold text-orange-600">
                  {paymentStatus.unpaid?.count || 0} HĐ ({formatCurrency(paymentStatus.totalDebtAmount)})
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Care Types Bar Chart */}
      {/* {careTypeChartData.length > 0 && (
        <div className="rounded-xl bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Hoạt động theo loại chăm sóc
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={careTypeChartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="Hoàn thành" fill="#22c55e" stackId="a" />
                <Bar dataKey="inProgress" name="Đang xử lý" fill="#eab308" stackId="a" />
                <Bar dataKey="pending" name="Chờ xử lý" fill="#94a3b8" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )} */}

      {/* Debt Report */}
      {debtReport && (debtReport.totalDebt > 0 || debtReport.unpaidContracts > 0) && (
        <div className="rounded-xl bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            💰 Báo cáo Công nợ
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Debt Summary */}
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Tổng công nợ:</span>
                <span className="text-lg font-bold text-red-600">
                  {formatFullCurrency(debtReport.totalDebt)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Số HĐ chưa thanh toán:</span>
                <span className="text-lg font-bold text-gray-900">
                  {debtReport.unpaidContracts}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Công nợ quá hạn:</span>
                <span className="text-lg font-bold text-orange-600">
                  {formatFullCurrency(debtReport.overdueDebt)}
                </span>
              </div>

              {/* Debt by Age */}
              {debtReport.byAge && debtReport.byAge.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Phân loại theo tuổi nợ:
                  </p>
                  <div className="space-y-2">
                    {debtReport.byAge.map((item) => (
                      <div
                        key={item.range}
                        className="flex justify-between items-center text-xs bg-white p-2 rounded"
                      >
                        <span className="text-gray-600">{item.label}:</span>
                        <span className="font-medium">
                          {item.count} HĐ ({formatCurrency(item.value)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Top Debtors */}
            {debtReport.topDebtors && debtReport.topDebtors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Top bệnh viện nợ nhiều nhất:
                </p>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {debtReport.topDebtors.map((item, index) => (
                    <div
                      key={item.hospitalId}
                      className="flex items-center gap-3 p-2 bg-white rounded-lg"
                    >
                      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.hospitalName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.contractCount} HĐ • Nợ {item.oldestDebtDays} ngày
                        </p>
                      </div>
                      <span className="text-sm font-bold text-red-600">
                        {formatCurrency(item.debtAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
