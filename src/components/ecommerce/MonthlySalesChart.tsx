import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import { useState, useEffect } from "react";
import { getMonthlySalesStats } from "../../api/business.api";

interface MonthlySalesStats {
  month: number;
  expectedRevenue: number;
  actualRevenue: number;
  count: number;
  contractedCount: number;
}

export default function MonthlySalesChart() {
  // Check if user is in SALES team or BUSINESS department
  const storedUserRaw = localStorage.getItem('user') || sessionStorage.getItem('user');
  let storedUser: Record<string, any> | null = null;
  try {
    storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
  } catch {
    storedUser = null;
  }
  
  const userTeam = storedUser && storedUser.team ? String(storedUser.team).toUpperCase() : null;
  const userDepartment = storedUser && storedUser.department ? String(storedUser.department).toUpperCase() : null;
  
  // Only show for SALES team or BUSINESS department
  const canViewSalesChart = userTeam === 'SALES' || userDepartment === 'BUSINESS';

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<MonthlySalesStats[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Generate year options (from 2020 to current year + 1)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2020 + 2 }, (_, i) => 2020 + i);

  // Load data when year changes
  useEffect(() => {
    if (canViewSalesChart) {
      loadData();
    }
  }, [selectedYear, canViewSalesChart]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getMonthlySalesStats(selectedYear);
      setStatsData(data || []);
    } catch (error) {
      console.error('Failed to load monthly sales stats:', error);
      setStatsData([]);
    } finally {
      setLoading(false);
    }
  }

  // Don't render if user doesn't have permission
  if (!canViewSalesChart) {
    return null;
  }

  // Format currency VND
  const formatVND = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const options: ApexOptions = {
    colors: ["#e75050ff", "#469cffff"], // Light blue for Expected, Dark blue for Actual
    chart: {
      fontFamily: "Be Vietnam Pro, sans-serif",
      type: "bar",
      height: 350,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "65%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 1,
      colors: ["transparent"],
    },
    xaxis: {
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Be Vietnam Pro",
    },
    yaxis: {
      title: {
        text: undefined,
      },
      labels: {
        formatter: (val: number) => {
          if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)}B`;
          if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
          if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
          return val.toFixed(0);
        },
      },
    },
    grid: {
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    fill: {
      opacity: 5,
    },
    tooltip: {
      x: {
        show: true,
      },
      y: {
        formatter: (val: number) => formatVND(val),
      },
    },
  };

  const series = [
    {
      name: "Doanh thu dự kiến",
      data: statsData.map(s => Number(s.expectedRevenue) || 0),
    },
    {
      name: "Doanh thu thực tế",
      data: statsData.map(s => Number(s.actualRevenue) || 0),
    },
  ];

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white w-full max-w-none px-0 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-0 sm:pt-6">
      <div className="flex items-center justify-between mb-4 px-5 sm:px-6">
        <h3 className=" text-lg font-semibold text-gray-800 dark:text-white/90">
          Thống kê doanh thu theo tháng
        </h3>
        <div className="flex items-center gap-3">
          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          {/* More Options Dropdown */}
          <div className="relative inline-block">
            <button className="dropdown-toggle" onClick={toggleDropdown}>
              <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 size-6" />
            </button>
            <Dropdown
              isOpen={isOpen}
              onClose={closeDropdown}
              className="w-40 p-2"
            >
              <DropdownItem
                onItemClick={() => { loadData(); closeDropdown(); }}
                className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
              >
                Làm mới
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[350px] px-5 sm:px-6">
          <div className="text-gray-500 dark:text-gray-400">Đang tải...</div>
        </div>
      ) : (
        <div className="w-full px-5 sm:px-6">
          <Chart options={options} series={series} type="bar" height={350} />
        </div>
      )}
    </div>
  );
}
