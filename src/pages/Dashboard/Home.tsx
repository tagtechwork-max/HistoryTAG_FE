import { useMemo } from "react";
import EcommerceMetrics from "../../components/ecommerce/EcommerceMetrics";
import MonthlySalesChart from "../../components/ecommerce/MonthlySalesChart";
import StatisticsChart from "../../components/ecommerce/StatisticsChart";
import RecentOrders from "../../components/ecommerce/RecentOrders";
import DemographicCard from "../../components/ecommerce/DemographicCard";
import PageMeta from "../../components/common/PageMeta";
import TetCelebration from "../../components/common/TetCelebration";
import FlowerFall from "../../components/common/FlowerFall";
import UserDashboard from "../../components/reports/UserDashboard";
import WorkReportExportButton from "../../components/reports/WorkReportExportButton";

export default function Home() {
  // Kiểm tra team của user hiện tại
  const isCSKH = useMemo(() => {
    try {
      // Ưu tiên lấy từ user profile (localStorage)
      const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const team = user?.team ? String(user.team).toUpperCase() : "";
        if (team === "CUSTOMER_SERVICE") return true;
      }

      // Fallback: check activeTeam từ JWT token
      const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
      if (token) {
        const parts = token.split(".");
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          const activeTeam = payload.activeTeam || "";
          if (activeTeam.toUpperCase() === "CUSTOMER_SERVICE") return true;
        }
      }
    } catch {
      // ignore parse errors
    }
    return false;
  }, []);

  return (
    <>
      <PageMeta
        title="Quản lý công việc | TAGTECH"
        description=""
      />
      {/* <FlowerFall /> */}
      {/* <TetCelebration /> */}

      {isCSKH ? (
        /* === Dashboard riêng cho team CSKH === */
        <div className="space-y-4">
          <div className="flex justify-end">
            <WorkReportExportButton role="admin" />
          </div>
          <UserDashboard />
        </div>
      ) : (
        /* === Dashboard mặc định cho các team khác === */
        <div className="space-y-4">
          <div className="flex justify-end">
            <WorkReportExportButton role="admin" />
          </div>
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            <div className="col-span-12">
            <EcommerceMetrics />
            </div>
          
            <div className="col-span-12 space-y-6">
              <MonthlySalesChart />
            </div>

            <div className="col-span-12">
              <StatisticsChart />
            </div>

            {/* <div className="col-span-12 xl:col-span-5">
            <DemographicCard />
          </div>

          <div className="col-span-12 xl:col-span-7">
            <RecentOrders />
          </div> */}
          </div>
        </div>
      )}
    </>
  );
}
