import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  TaskIcon,
  UserIcon,
  BoxIcon,
} from "../../icons";
import { fetchWithAuth } from "../../api/client";

const API_ROOT = import.meta.env.VITE_API_URL || "";

type TaskSummary = {
  assignedCount: number;
  receivedCount: number;
  transferredCount: number;
  inProgressCount: number;
  completedCount: number;
  overdueCount: number;
  nearDueCount: number;
  completedThisMonth: number;
  completedLastMonth: number;
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("vi-VN") : "0";

export default function EcommerceMetrics() {
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(
          `${API_ROOT}/api/v1/admin/dashboard/user/summary`,
          {
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        const data: TaskSummary = await res.json();
        if (!controller.signal.aborted) {
          setSummary(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Error fetching dashboard summary", err);
        setSummary(null);
        setError(
          err instanceof Error ? err.message : "Không thể tải dữ liệu tổng quan."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, []);

  const assigned = summary?.assignedCount ?? 0;
  const received = summary?.receivedCount ?? 0;
  const transferred = summary?.transferredCount ?? 0;
  const inProgress = summary?.inProgressCount ?? 0;
  const completed = summary?.completedCount ?? 0;
  const overdue = summary?.overdueCount ?? 0;
  const nearDue = summary?.nearDueCount ?? 0;
  const completedThisMonth = summary?.completedThisMonth ?? 0;
  const completedLastMonth = summary?.completedLastMonth ?? 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 animate-pulse"
          >
            <div className="h-12 w-12 bg-gray-200 rounded-xl mb-5 dark:bg-gray-700" />
            <div className="h-4 w-24 bg-gray-200 rounded mb-2 dark:bg-gray-700" />
            <div className="h-8 w-32 bg-gray-200 rounded dark:bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-red-300 bg-red-50/50 px-5 py-4 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6 w-full">
      {/* Công việc phụ trách */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 flex flex-col h-full">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
          <TaskIcon className="size-6" />
        </div>
        <div className="mt-5 space-y-2 flex-1 flex flex-col">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Công việc phụ trách
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {formatNumber(assigned)}
            </h4>
          </div>
          <div className="mt-auto space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Đang xử lý:&nbsp;
              <span className="font-semibold text-blue-600 dark:text-blue-300">
                {formatNumber(inProgress)}
              </span>
            </div>
            <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="text-red-500 dark:text-red-300">
                Quá hạn: {formatNumber(overdue)}
              </span>
              <span className="text-amber-500 dark:text-amber-300">
                Sắp hạn: {formatNumber(nearDue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Công việc tiếp nhận */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 flex flex-col h-full">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300">
          <UserIcon className="size-6" />
        </div>
        <div className="mt-5 space-y-2 flex-1 flex flex-col">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Công việc tiếp nhận
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {formatNumber(received)}
            </h4>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-auto">
            Bao gồm cả công việc do đội khác phụ trách.
          </p>
        </div>
      </div>

      {/* Số lượng viện phụ trách */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 flex flex-col h-full">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
          <BoxIcon className="size-6" />
        </div>
        <div className="mt-5 space-y-2 flex-1 flex flex-col">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Số lượng viện phụ trách
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {formatNumber(transferred)}
            </h4>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-auto">
            Tổng số bệnh viện bạn đang phụ trách.
          </p>
        </div>
      </div>

      {/* Công việc đã hoàn thành */}
      <div className="relative rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 flex flex-col h-full">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircleIcon className="size-6" />
        </div>
       
        <div className="mt-5 space-y-2 flex-1 flex flex-col">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Công việc hoàn thành
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {formatNumber(completed)}
            </h4>
          </div>
          <div className="mt-auto space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Tháng này:&nbsp;
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                {formatNumber(completedThisMonth)}
              </span>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              Tháng trước: {formatNumber(completedLastMonth)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
