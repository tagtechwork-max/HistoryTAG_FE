export type PMWorkloadRow = {
  pmUserId: number;
  pmName: string;
  roleLabel?: string;
  avatarUrl?: string | null;
  projectCount: number;
  atRiskCount: number;
  overdueCount?: number;
  deadlineSoonCount: number;
};

export type PMWorkloadTableProps = {
  rows: PMWorkloadRow[];
};

export default function PMWorkloadTable({ rows }: PMWorkloadTableProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Khối lượng công việc theo PM
        </h3>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-4">
          {rows.map((row) => (
            <div
              key={row.pmUserId}
              className="flex min-w-0 flex-1 basis-64 items-center gap-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/30"
            >
              <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                {row.avatarUrl ? (
                  <img
                    src={row.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-gray-600 dark:text-gray-400">
                    {(row.pmName ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800 dark:text-white/90">
                  {row.pmName}
                </p>
                {row.roleLabel != null && row.roleLabel !== "" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {row.roleLabel}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {row.projectCount} DỰ ÁN
                  </span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {row.atRiskCount} BỊ CHẶN
                  </span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    {(row.overdueCount ?? 0)} QUÁ HẠN
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Chưa có dữ liệu PM.
          </div>
        )}
      </div>
    </div>
  );
}
