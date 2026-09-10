import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import PageMeta from "../../components/common/PageMeta";
import UserDashboard from "../../components/reports/UserDashboard";
import WorkReportExportButton from "../../components/reports/WorkReportExportButton";
import { useAuth } from "../../contexts/AuthContext";
import DeploymentDashboard from "./DeploymentDashboard";

const TEAM_TITLES: Record<string, string> = {
  DEV: "Thống kê phát triển",
  DEPLOYMENT: "Thống kê triển khai",
  MAINTENANCE: "Thống kê bảo trì",
  SALES: "Thống kê kinh doanh",
  CUSTOMER_SERVICE: "Thống kê chăm sóc khách hàng",
};

function getStoredTeam(): string | null {
  try {
    const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    const team = user?.activeTeam ?? user?.team ?? user?.teamName;
    return typeof team === "string" && team.trim()
      ? team.trim().toUpperCase()
      : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const { activeTeam } = useAuth();
  const effectiveTeam = String(activeTeam ?? getStoredTeam() ?? "")
    .trim()
    .toUpperCase();
  const dashboardTitle = TEAM_TITLES[effectiveTeam] ?? "Thống kê công việc";

  if (effectiveTeam === "DEPLOYMENT") {
    return (
      <div key={effectiveTeam} className="space-y-4">
        <div className="flex justify-end">
          <WorkReportExportButton role="admin" />
        </div>
        <DeploymentDashboard />
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Quản lý công việc | TAGTECH" description="" />

      {effectiveTeam === "CUSTOMER_SERVICE" ? (
        <div key={effectiveTeam} className="space-y-4">
          <div className="flex justify-end">
            <WorkReportExportButton role="admin" />
          </div>
          <UserDashboard />
        </div>
      ) : (
        <div key={effectiveTeam || "default"} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {dashboardTitle}
            </h1>
            <WorkReportExportButton role="admin" />
          </div>

          <div className="grid grid-cols-12 gap-4 md:gap-6">
            <div className="col-span-12">
              <EcommerceMetrics activeTeam={effectiveTeam} />
            </div>

            {effectiveTeam === "SALES" && (
              <div className="col-span-12 space-y-6">
                <MonthlySalesChart />
              </div>
            )}

            <div className="col-span-12">
              <StatisticsChart activeTeam={effectiveTeam} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
