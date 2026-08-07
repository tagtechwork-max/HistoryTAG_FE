import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import ChartTab from "../common/ChartTab";

const API_ROOT = import.meta.env.VITE_API_URL || "";

type Period = "monthly" | "quarterly" | "yearly";

type UserTaskStatsItemDTO = {
  label: string;
  assignedCount: number;
  receivedCount: number;
  transferredCount: number;
};

type UserTaskStatsResponseDTO = {
  period: string;
  year?: number | null;
  startYear?: number | null;
  endYear?: number | null;
  data: UserTaskStatsItemDTO[];
};

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const periodLabels: Record<Period, string> = {
  monthly: "theo tháng",
  quarterly: "theo quý",
  yearly: "theo năm",
};

export default function StatisticsChart() {
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<number>(currentYear);
  const [stats, setStats] = useState<UserTaskStatsResponseDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ period });
        if (period !== "yearly") {
          params.append("year", String(year));
        } else {
          params.append("range", "5");
        }
        const res = await fetch(
          `${API_ROOT}/api/v1/admin/dashboard/user/task-stats?${params.toString()}`,
          {
            headers: authHeaders(),
            credentials: "include",
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const data: UserTaskStatsResponseDTO = await res.json();
        if (!controller.signal.aborted) {
          setStats(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Error fetching công việc stats", err);
        setStats(null);
        setError(
          err instanceof Error ? err.message : "Không thể tải dữ liệu thống kê."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [period, year]);

  const categories = useMemo(
    () => stats?.data.map((item) => item.label) ?? [],
    [stats]
  );

  const chartSeries = useMemo(() => {
    if (!stats || stats.data.length === 0) return [];
    return [
      {
        name: "Công việc phụ trách",
        data: stats.data.map((item) => item.assignedCount),
      },
      {
        name: "Công việc tiếp nhận",
        data: stats.data.map((item) => item.receivedCount),
      },
      {
        name: "Công việc chuyển giao",
        data: stats.data.map((item) => item.transferredCount),
      },
    ];
  }, [stats]);

  const chartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        fontFamily: "Be Vietnam Pro, sans-serif",
        height: 310,
        type: "area",
        toolbar: { show: false },
      },
      colors: ["#2563eb", "#22c55e", "#f97316"],
      legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
      },
      stroke: {
        curve: "smooth",
        width: 2,
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.6,
          opacityFrom: 0.55,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      markers: {
        size: 0,
        strokeColors: "#fff",
        strokeWidth: 2,
        hover: { size: 6 },
      },
      grid: {
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
      },
      dataLabels: { enabled: false },
      tooltip: {
        enabled: true,
        shared: true,
        intersect: false,
      },
      xaxis: {
        type: "category",
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: {
          style: {
            fontSize: "12px",
            colors: ["#6B7280"],
          },
        },
      },
    }),
    [categories]
  );

  const activeYear = stats?.year ?? year;
  const rangeLabel =
    stats && stats.startYear && stats.endYear
      ? `${stats.startYear} - ${stats.endYear}`
      : null;

  const handlePeriodChange = (value: Period) => {
    setPeriod(value);
    if (value !== "yearly" && activeYear > currentYear) {
      setYear(currentYear);
    }
  };

  const handlePrevYear = () => {
    setYear((prev) => prev - 1);
  };

  const handleNextYear = () => {
    setYear((prev) => Math.min(currentYear, prev + 1));
  };

  const disableNext = activeYear >= currentYear;
  const showYearControls = period !== "yearly";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Thống kê công việc
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            {`Số công việc của bạn ${periodLabels[period]} ${
              period === "yearly"
                ? rangeLabel ?? ""
                : `năm ${activeYear ?? currentYear}`
            }`}
          </p>
        </div>
        <div className="flex items-start w-full gap-3 sm:justify-end">
          {showYearControls && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <button
                type="button"
                onClick={handlePrevYear}
                className="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Năm trước"
              >
                ‹
              </button>
              <span className="font-semibold">{activeYear}</span>
              <button
                type="button"
                onClick={handleNextYear}
                className="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                disabled={disableNext}
                aria-label="Năm kế tiếp"
              >
                ›
              </button>
            </div>
          )}
          <ChartTab value={period} onChange={handlePeriodChange} />
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div
          className={
            categories.length > 12 ? "min-w-[1200px]" : "min-w-[800px] xl:min-w-full"
          }
        >
          {loading ? (
            <div className="h-[260px] animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800/40" />
          ) : error ? (
            <div className="flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-red-300 bg-red-50/40 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          ) : stats && stats.data.length > 0 ? (
            <Chart options={chartOptions} series={chartSeries} type="area" height={310} />
          ) : (
            <div className="flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/40 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-300">
              Không có dữ liệu để hiển thị.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
