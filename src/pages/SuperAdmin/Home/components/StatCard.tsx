import { memo, type ReactNode } from "react";

type StatCardProps = {
  title: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
};

function StatCardComponent({ title, value, icon, color }: StatCardProps) {
  let display: ReactNode = value;
  if (typeof value === "string" && value.endsWith(" ₫")) {
    const amount = value.slice(0, -2);
    display = <span className="whitespace-nowrap"><span>{amount}</span><span className="ml-1">&nbsp;₫</span></span>;
  }

  return (
    <div className="flex h-28 items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-md">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-white ${color ?? "bg-slate-400"}`}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="text-xs text-gray-500">{title}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="whitespace-nowrap text-2xl font-extrabold text-gray-900" title={typeof value === "number" ? value.toLocaleString() : String(value)}>
            {display}
          </div>
        </div>
      </div>
    </div>
  );
}

export const StatCard = memo(StatCardComponent);
