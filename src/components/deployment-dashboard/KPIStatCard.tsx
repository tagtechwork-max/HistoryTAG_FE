import type { ReactNode } from "react";

export type KPIStatVariant = "normal" | "warning" | "danger";

const variantIconStyles: Record<KPIStatVariant, string> = {
  normal: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};

const trendColors: Record<KPIStatVariant, string> = {
  normal: "text-emerald-600 dark:text-emerald-300",
  warning: "text-amber-600 dark:text-amber-300",
  danger: "text-red-600 dark:text-red-300",
};

export type KPIStatCardProps = {
  icon: ReactNode;
  label: string;
  value: number | string;
  trend?: string;
  variant?: KPIStatVariant;
};

export default function KPIStatCard({
  icon,
  label,
  value,
  trend,
  variant = "normal",
}: KPIStatCardProps) {
  const iconStyle = variantIconStyles[variant];
  const trendCls = trendColors[variant];

  return (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div
        className={`flex items-center justify-center w-12 h-12 rounded-xl ${iconStyle}`}
      >
        <span className="[&>svg]:size-6">{icon}</span>
      </div>
      <div className="mt-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`mt-2 text-2xl font-bold text-gray-800 dark:text-white/90 ${variant !== "normal" ? (variant === "danger" ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300") : ""}`}>
          {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
        </p>
        {trend != null && trend !== "" && (
          <p className={`mt-1 text-xs font-medium ${trendCls}`}>{trend}</p>
        )}
      </div>
    </div>
  );
}
