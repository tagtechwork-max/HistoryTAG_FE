import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export type HealthCount = {
  status: string;
  label: string;
  count: number;
  color: string;
};

const DEFAULT_COLORS: Record<string, string> = {
  in_progress: "#22c55e",
  at_risk: "#f59e0b",
  blocked: "#ef4444",
  completed: "#3b82f6",
};

export type HealthStatusChartProps = {
  data: HealthCount[];
  totalLabel?: string;
};

export default function HealthStatusChart({
  data,
  totalLabel = "TỔNG SỐ",
}: HealthStatusChartProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

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
                const pct = total > 0 ? ((v / total) * 100).toFixed(0) : 0;
                return [`${v} (${pct}%)`, props.payload?.label ?? name];
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={48}
              formatter={(value, entry) => {
                const item = data.find((d) => d.label === value);
                const pct = total > 0 && item ? ((item.count / total) * 100).toFixed(0) : "0";
                return `${value} (${pct}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
