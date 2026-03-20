import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export type HealthCount = {
  status: string;
  label: string;
  count: number;
  color: string;
};

const DEFAULT_COLORS: Record<string, string> = {
  in_progress: "#0ea5e9",   // sky blue (đang thực hiện)
  at_risk: "#f59e0b",
  blocked: "#ef4444",
  completed: "#22c55e",     // green (hoàn thành)
};

export type HealthStatusChartProps = {
  data: HealthCount[];
  totalLabel?: string;
  /** If set, center shows this (actual project count) instead of sum(data) because segments can overlap. */
  totalProjects?: number;
};

export default function HealthStatusChart({
  data,
  totalLabel = "TỔNG SỐ",
  totalProjects,
}: HealthStatusChartProps) {
  const sumSegments = data.reduce((s, d) => s + d.count, 0);
  const total = totalProjects !== undefined && totalProjects !== null ? totalProjects : sumSegments;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
        Phân bố theo trạng thái
      </h3>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              label={false}
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color || DEFAULT_COLORS[entry.status] || "#94a3b8"} />
              ))}
            </Pie>
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-600 dark:fill-gray-400 text-sm font-medium"
            >
              {total} {totalLabel}
            </text>
            <Tooltip
              formatter={(value: number | undefined, name, props) => {
                const v = value ?? 0;
                const denom = total > 0 ? total : sumSegments || 1;
                const pct = ((v / denom) * 100).toFixed(0);
                return [`${v} (${pct}%)`, props.payload?.label ?? name];
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={48}
              formatter={(value, entry) => {
                const item = data.find((d) => d.label === value);
                const denom = total > 0 ? total : sumSegments || 1;
                const pct = item ? ((item.count / denom) * 100).toFixed(0) : "0";
                return `${value} (${pct}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
