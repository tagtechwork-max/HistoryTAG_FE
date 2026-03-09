import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const PHASE_LABELS: Record<number, string> = {
  1: "GĐ 1: Thu thập thông tin",
  2: "GĐ 2: Lắp đặt cơ bản",
  3: "GĐ 3: Giám sát & khắc phục",
  4: "GĐ 4: Nghiệm thu & vận hành",
};

export type PhaseCount = {
  phase: number;
  label: string;
  count: number;
  fullLabel?: string;
};

export type DeploymentPhaseChartProps = {
  data: PhaseCount[];
};

const BAR_COLOR = "#3b82f6";

const Y_AXIS_LEFT = 8;
const Y_AXIS_WIDTH = 260;

export default function DeploymentPhaseChart({ data }: DeploymentPhaseChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    fullLabel: d.fullLabel ?? `${PHASE_LABELS[d.phase] ?? `GĐ ${d.phase}`} (${d.count} dự án)`,
  }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
        Phân bố theo giai đoạn triển khai
      </h3>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            margin={{ top: 8, right: 24, left: Y_AXIS_LEFT, bottom: 8 }}
            data={chartData}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="fullLabel"
              width={Y_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              tick={(props: { y?: number | string; payload?: { value?: string; fullLabel?: string } }) => {
                const { y = 0, payload } = props;
                const text = payload?.value ?? payload?.fullLabel ?? "";
                return (
                  <g transform={`translate(${Y_AXIS_LEFT},${y})`}>
                    <text
                      x={0}
                      y={0}
                      textAnchor="start"
                      dominantBaseline="middle"
                      className="fill-gray-700 dark:fill-gray-300"
                      style={{ fontSize: 11 }}
                    >
                      {text}
                    </text>
                  </g>
                );
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid var(--gray-200)",
              }}
              formatter={(value: number | undefined) => [`${value ?? 0} dự án`, "Số dự án"]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullLabel ?? ""
              }
            />
            <Bar dataKey="count" name="Số dự án" radius={[0, 4, 4, 0]} barSize={24}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={BAR_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
