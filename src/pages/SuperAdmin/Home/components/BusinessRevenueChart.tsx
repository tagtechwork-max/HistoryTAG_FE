import { memo, useMemo } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

type BusinessRevenueChartProps = {
  labels: string[];
  expected: number[];
  actual: number[];
  totalExpected: number | null;
  totalActual: number | null;
};

export const BusinessRevenueChart = memo(function BusinessRevenueChart({
  labels,
  expected,
  actual,
  totalExpected,
  totalActual,
}: BusinessRevenueChartProps) {
  const hasTimeline = labels.length > 0;
  const options = useMemo<ApexOptions>(() => hasTimeline ? ({
    chart: { toolbar: { show: false }, type: "bar" },
    plotOptions: { bar: { horizontal: false, columnWidth: "40%", borderRadius: 6 } },
    xaxis: { categories: labels },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (value: number) => `${value.toLocaleString()} ₫` } },
    legend: { position: "top" },
    colors: ["#7c3aed", "#10b981"],
  }) : ({
    chart: { toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 8, columnWidth: "30%" } },
    xaxis: { categories: ["Tổng thu", "Tổng nợ"] },
    dataLabels: { enabled: false },
    colors: ["#465fff", "#10b981"],
  }), [hasTimeline, labels]);

  const series = useMemo(() => hasTimeline ? [
    { name: "Tổng thu", type: "bar", data: expected },
    { name: "Tổng nợ", type: "bar", data: actual },
  ] : [{ name: "VNĐ", data: [totalExpected ?? 0, totalActual ?? 0] }], [actual, expected, hasTimeline, totalActual, totalExpected]);

  return <Chart options={options} series={series} type="bar" height={hasTimeline ? 420 : 260} width="100%" />;
});
