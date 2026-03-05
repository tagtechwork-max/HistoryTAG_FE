import { Link } from "react-router-dom";

export type HealthStatus = "in_progress" | "at_risk" | "blocked" | "completed";

export type AttentionRow = {
  id: number;
  hospitalName: string;
  projectCode: string;
  pmName: string;
  phase: number;
  phaseLabel?: string;
  reportDeadline: string | null;
  goLiveDeadline: string | null;
  health: HealthStatus;
  healthLabel: string;
  /** Base path for link (e.g. /implementation-tasks-new or /superadmin/implementation-tasks-new) */
  basePath?: string;
};

const healthBadgeClass: Record<HealthStatus, string> = {
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export type AttentionTableProps = {
  rows: AttentionRow[];
  viewAllHref?: string;
  basePath?: string;
};

export default function AttentionTable({
  rows,
  viewAllHref,
  basePath = "/implementation-tasks-new",
}: AttentionTableProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Cần chú ý
        </h3>
        {viewAllHref != null && (
          <Link
            to={viewAllHref}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Xem tất cả →
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-800/50">
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Tên bệnh viện
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Mã bệnh viện
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                PM Phụ trách
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Giai đoạn
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Hạn báo cáo
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Hạn Go-live
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Trạng thái
              </th>
              <th className="px-5 py-3 font-semibold text-gray-700 dark:text-gray-300">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-gray-100 dark:border-gray-800/80 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
              >
                <td className="px-5 py-3 text-gray-800 dark:text-gray-200">
                  {row.hospitalName}
                </td>
                <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                  {row.projectCode}
                </td>
                <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                  {row.pmName}
                </td>
                <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                  {row.phaseLabel ?? `Giai đoạn ${row.phase}`}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      row.reportDeadline === "Hôm nay" || row.reportDeadline?.startsWith("Quá hạn")
                        ? "text-red-600 dark:text-red-300 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }
                  >
                    {row.reportDeadline ?? "—"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      row.goLiveDeadline?.startsWith("Quá hạn")
                        ? "text-red-600 dark:text-red-300 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }
                  >
                    {row.goLiveDeadline ?? "—"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${healthBadgeClass[row.health] ?? healthBadgeClass.in_progress}`}
                  >
                    {row.healthLabel}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <Link
                    to={`${row.basePath ?? basePath}/${row.id}`}
                    className="inline-flex rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Xem
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Không có mục cần chú ý.
        </div>
      )}
    </div>
  );
}
