import { useEffect, useMemo, useRef, useState } from "react";
import { FiShare2 } from "react-icons/fi";
import toast from "react-hot-toast";
import flatpickr from "flatpickr";
import { Vietnamese } from "flatpickr/dist/l10n/vn";
import {
  fetchImplementationTaskDetail,
  fetchMilestones,
  fetchWorkItems,
  type WorkItemListDto,
} from "../../api/api";

type UserOpt = { id: number; label: string };
type PreviewItem = {
  dateLabel: string;
  taskName: string;
  status: string;
  note: string;
  additionalRequest?: string;
};
type PreviewData = {
  fullName: string;
  department: string;
  title: string;
  fromDateLabel: string;
  toDateLabel: string;
  allTasks: PreviewItem[];
  incompleteTasks: PreviewItem[];
};
type GroupedPreviewRow = {
  item: PreviewItem;
  dateFacilityRowSpan: number;
  isDateFacilityStart: boolean;
  statusRowSpan: number;
  isStatusStart: boolean;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCompletedPreviewItem(item: PreviewItem): boolean {
  const status = normalizeText(item.status);
  const taskName = normalizeText(item.taskName);
  return (
    status.includes("hoan thanh") ||
    status.includes("completed") ||
    status.includes("done") ||
    status === "xong" ||
    taskName.includes("(hoan thanh)")
  );
}

function buildPreviewItemKey(item: PreviewItem): string {
  return [
    normalizeText(item.dateLabel),
    normalizeText(item.note),
    normalizeText(item.taskName),
  ].join("|");
}

function withCompletedSuffix(item: PreviewItem): PreviewItem {
  if (!isCompletedPreviewItem(item)) return item;
  const taskName = String(item.taskName ?? "");
  const normalizedTaskName = normalizeText(taskName);
  if (normalizedTaskName.includes("(hoan thanh)")) return item;
  return { ...item, taskName: `${taskName} (Hoàn thành)` };
}

function normalizeTaskName(taskName: string | null | undefined): string {
  return normalizeText(taskName).replace(/\(hoan thanh\)/g, "").trim();
}

function dedupePreviewItems(items: PreviewItem[]): PreviewItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = buildPreviewItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildGroupedRows(items: PreviewItem[]): GroupedPreviewRow[] {
  const rows: GroupedPreviewRow[] = items.map((item) => ({
    item,
    dateFacilityRowSpan: 0,
    isDateFacilityStart: false,
    statusRowSpan: 0,
    isStatusStart: false,
  }));

  let i = 0;
  while (i < items.length) {
    const current = items[i];
    let dateFacilitySpan = 1;
    let j = i + 1;
    while (j < items.length) {
      const next = items[j];
      const sameDateFacility = next.dateLabel === current.dateLabel && next.note === current.note;
      if (!sameDateFacility) break;
      dateFacilitySpan += 1;
      j += 1;
    }
    rows[i].isDateFacilityStart = true;
    rows[i].dateFacilityRowSpan = dateFacilitySpan;
    i += dateFacilitySpan;
  }

  i = 0;
  while (i < items.length) {
    const current = items[i];
    let statusSpan = 1;
    let j = i + 1;
    while (j < items.length) {
      const next = items[j];
      const sameStatusGroup =
        next.dateLabel === current.dateLabel &&
        next.note === current.note &&
        next.status === current.status;
      if (!sameStatusGroup) break;
      statusSpan += 1;
      j += 1;
    }
    rows[i].isStatusStart = true;
    rows[i].statusRowSpan = statusSpan;
    i += statusSpan;
  }
  return rows;
}

export default function WorkReportExportButton({ role }: { role: "admin" | "superadmin" }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
  );
  const [toDate, setToDate] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  );
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const fromDateRef = useRef<HTMLInputElement | null>(null);
  const toDateRef = useRef<HTMLInputElement | null>(null);
  const completedTasks = useMemo(() => {
    if (!previewData) return [];
    return previewData.allTasks
      .filter((item) => isCompletedPreviewItem(item))
      .map((item) => withCompletedSuffix(item));
  }, [previewData]);
  const groupedAllTasks = useMemo(
    () => buildGroupedRows(completedTasks),
    [completedTasks],
  );
  const filteredIncompleteTasks = useMemo(() => {
    if (!previewData) return [];
    const completedKeys = new Set(completedTasks.map((item) => buildPreviewItemKey(item)));
    const fromAllTasks = previewData.allTasks.filter((item) => !isCompletedPreviewItem(item));
    const fromIncompleteTasks = previewData.incompleteTasks.filter((item) => !completedKeys.has(buildPreviewItemKey(item)));
    const merged = [...fromAllTasks, ...fromIncompleteTasks];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = buildPreviewItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [previewData, completedTasks]);
  const groupedIncompleteTasks = useMemo(
    () => buildGroupedRows(filteredIncompleteTasks),
    [filteredIncompleteTasks],
  );

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      const parsed = raw ? JSON.parse(raw) : null;
      const id = Number(parsed?.id ?? parsed?.userId ?? localStorage.getItem("userId") ?? sessionStorage.getItem("userId"));
      const label = String(
        parsed?.fullname ?? parsed?.fullName ?? parsed?.name ?? parsed?.username ?? localStorage.getItem("username") ?? "Tài khoản hiện tại",
      );
      return Number.isFinite(id) && id > 0 ? { id, label } : null;
    } catch {
      return null;
    }
  }, []);

  const normalizeWithBoardStatus = async (
    preview: PreviewData,
    userId: number,
  ): Promise<PreviewData> => {
    try {
      const pathname = window.location.pathname;
      const match = pathname.match(/\/(?:superadmin\/)?implementation-tasks-new\/(\d+)(?:\/(\d+))?/);
      if (!match) return preview;
      const implementationTaskId = match[1];
      const phaseInPath = match[2];

      const [detail, milestones] = await Promise.all([
        fetchImplementationTaskDetail(implementationTaskId),
        fetchMilestones(implementationTaskId),
      ]);

      let milestoneId: string | null = null;
      if (phaseInPath) {
        const foundByIdOrNumber = milestones.find(
          (m) => String(m.id) === phaseInPath || String(m.number) === phaseInPath,
        );
        milestoneId = foundByIdOrNumber ? String(foundByIdOrNumber.id) : phaseInPath;
      } else {
        const currentPhaseNumber = Number(detail.currentPhase ?? 1);
        const currentMilestone = milestones.find((m) => m.number === currentPhaseNumber);
        milestoneId = currentMilestone ? String(currentMilestone.id) : null;
      }
      if (!milestoneId) return preview;

      const boardItems = await fetchWorkItems({
        implementationTaskId,
        milestoneId,
      });
      const userBoardItems = boardItems.filter((w: WorkItemListDto) => Number(w.assigneeUserId) === Number(userId));
      const completedNameSet = new Set(
        userBoardItems
          .filter((w: WorkItemListDto) => w.status === "completed")
          .map((w: WorkItemListDto) => normalizeTaskName(w.title)),
      );
      if (completedNameSet.size === 0) return preview;

      const promotedFromIncomplete = preview.incompleteTasks
        .filter((item) => completedNameSet.has(normalizeTaskName(item.taskName)))
        .map((item) => withCompletedSuffix(item));

      const nextAllTasks = dedupePreviewItems([
        ...preview.allTasks.map((item) => (completedNameSet.has(normalizeTaskName(item.taskName)) ? withCompletedSuffix(item) : item)),
        ...promotedFromIncomplete,
      ]);
      const nextIncompleteTasks = dedupePreviewItems(
        preview.incompleteTasks.filter((item) => !completedNameSet.has(normalizeTaskName(item.taskName))),
      );

      return {
        ...preview,
        allTasks: nextAllTasks,
        incompleteTasks: nextIncompleteTasks,
      };
    } catch {
      return preview;
    }
  };

  useEffect(() => {
    if (!open) return;
    if (role === "admin") {
      if (currentUser) {
        setUsers([{ id: currentUser.id, label: currentUser.label }]);
        setSelectedUserId(currentUser.id);
      } else {
        setUsers([]);
        setSelectedUserId("");
      }
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/${role}/users/search?name=&limit=200`, {
          headers: { ...authHeaders() },
          credentials: "include",
        });
        if (!res.ok || !alive) return;
        const list = await res.json();
        const mapped: UserOpt[] = Array.isArray(list)
          ? list
              .map((u: any) => ({
                id: Number(u.id),
                label: String(u.label ?? u.name ?? u.fullName ?? u.fullname ?? u.id),
              }))
              .filter((u: UserOpt) => Number.isFinite(u.id) && u.label)
          : [];
        if (alive) setUsers(mapped);
      } catch {
        if (alive) setUsers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, role, currentUser]);

  useEffect(() => {
    if (!open) return;
    const fromEl = fromDateRef.current;
    const toEl = toDateRef.current;
    if (!fromEl || !toEl) return;

    const fromFp = flatpickr(fromEl, {
      locale: Vietnamese,
      dateFormat: "Y-m-d",
      defaultDate: fromDate || undefined,
      static: true,
      monthSelectorType: "static",
      onChange: (selectedDates) => {
        const d = selectedDates?.[0];
        if (!d) return;
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        setFromDate(v);
      },
    });

    const toFp = flatpickr(toEl, {
      locale: Vietnamese,
      dateFormat: "Y-m-d",
      defaultDate: toDate || undefined,
      static: true,
      monthSelectorType: "static",
      onChange: (selectedDates) => {
        const d = selectedDates?.[0];
        if (!d) return;
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        setToDate(v);
      },
    });

    return () => {
      fromFp.destroy();
      toFp.destroy();
    };
  }, [open]);

  const onExport = async () => {
    if (!selectedUserId) {
      toast.error("Chọn nhân sự cần xuất báo cáo");
      return;
    }
    if (!fromDate || !toDate) {
      toast.error("Vui lòng chọn từ ngày và đến ngày");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        userId: String(selectedUserId),
        fromDate,
        toDate,
      });
      const res = await fetch(`${API_BASE}/api/v1/${role}/reports/work-report/export?${params.toString()}`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const userName = users.find((u) => u.id === selectedUserId)?.label || "nhan-su";
      a.href = url;
      a.download = `bao-cao-cong-viec-${userName.replace(/\s+/g, "-")}.docx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Xuất báo cáo thành công");
      setOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xuất báo cáo thất bại");
    } finally {
      setLoading(false);
    }
  };

  const onPreview = async () => {
    if (!selectedUserId) {
      toast.error("Chọn nhân sự cần xem báo cáo");
      return;
    }
    if (!fromDate || !toDate) {
      toast.error("Vui lòng chọn từ ngày và đến ngày");
      return;
    }
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        userId: String(selectedUserId),
        fromDate,
        toDate,
      });
      const res = await fetch(`${API_BASE}/api/v1/${role}/reports/work-report/preview?${params.toString()}`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PreviewData;
      const normalized = await normalizeWithBoardStatus(data, Number(selectedUserId));
      setPreviewData(normalized);
      setPreviewOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xem trước báo cáo thất bại");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-blue-500 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 dark:border-blue-400 dark:bg-slate-800 dark:text-blue-200 dark:hover:bg-slate-700"
      >
        <FiShare2 className="h-4 w-4" />
        Xuất báo cáo
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Xuất báo cáo công việc</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Nhân sự</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : "")}
                  disabled={role === "admin"}
                >
                  <option value="">{role === "admin" ? "-- Tài khoản hiện tại --" : "-- Chọn nhân sự --"}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Từ ngày</label>
                  <input
                    ref={fromDateRef}
                    type="text"
                    readOnly
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    value={fromDate}
                    onChange={() => {}}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Đến ngày</label>
                  <input
                    ref={toDateRef}
                    type="text"
                    readOnly
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    value={toDate}
                    onChange={() => {}}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={onPreview}
                disabled={previewLoading}
                className="rounded-lg border border-blue-500 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-slate-800"
              >
                {previewLoading ? "Đang tải..." : "Xem trước"}
              </button>
              <button
                type="button"
                onClick={onExport}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Đang xuất..." : "Xuất file"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && previewData && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100">
            <div className="overflow-y-auto p-6">
              <div className="font-['Times_New_Roman'] text-[18px] leading-8">
              <p className="text-center font-bold">CÔNG TY CỔ PHẦN GIẢI PHÁP CÔNG NGHỆ TAG VIỆT NAM</p>
              <h3 className="mt-3 text-center text-[38px] font-bold leading-tight">Báo cáo công việc</h3>
              <p className="text-center font-bold">
                (Từ ngày {previewData.fromDateLabel} đến ngày {previewData.toDateLabel})
              </p>
              <p className="mt-2 text-center font-bold">Kính gửi: Trưởng bộ phận kỹ thuật kiosk</p>
              <div className="mt-3 space-y-1">
                <p>
                  <span className="font-bold underline">Họ và tên:</span> {previewData.fullName}
                </p>
                <p>
                  <span className="font-bold underline">Phòng/Ban:</span> {previewData.department}
                </p>
              </div>
              <p className="mt-3 font-bold underline">1. Chi tiết công việc</p>
              <table className="mt-2 w-full table-fixed border-collapse border border-slate-400 text-[16px]">
                <thead>
                  <tr>
                    <th className="w-[12%] border border-slate-400 px-2 py-1 text-left font-bold">Ngày</th>
                    <th className="w-[20%] border border-slate-400 px-2 py-1 text-left font-bold">Cơ sở</th>
                    <th className="w-[10%] border border-slate-400 px-2 py-1 text-left font-bold">Trạng thái</th>
                    <th className="w-[24%] border border-slate-400 px-2 py-1 text-left font-bold">Nội dung công việc</th>
                    <th className="w-[34%] border border-slate-400 px-2 py-1 text-left font-bold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedAllTasks.map((row, idx) => (
                    <tr key={`all-${idx}`}>
                      {row.isDateFacilityStart && (
                        <>
                          <td rowSpan={row.dateFacilityRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.dateLabel}</td>
                          <td rowSpan={row.dateFacilityRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.note}</td>
                        </>
                      )}
                      {row.isStatusStart && (
                        <td rowSpan={row.statusRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.status}</td>
                      )}
                      <td className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.taskName}</td>
                      <td className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.additionalRequest || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-bold underline">2. Công việc chưa hoàn thành</p>
              <table className="mt-2 w-full table-fixed border-collapse border border-slate-400 text-[16px]">
                <thead>
                  <tr>
                    <th className="w-[12%] border border-slate-400 px-2 py-1 text-left font-bold">Ngày</th>
                    <th className="w-[20%] border border-slate-400 px-2 py-1 text-left font-bold">Cơ sở</th>
                    <th className="w-[10%] border border-slate-400 px-2 py-1 text-left font-bold">Trạng thái</th>
                    <th className="w-[24%] border border-slate-400 px-2 py-1 text-left font-bold">Nội dung công việc</th>
                    <th className="w-[34%] border border-slate-400 px-2 py-1 text-left font-bold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedIncompleteTasks.map((row, idx) => (
                    <tr key={`in-${idx}`}>
                      {row.isDateFacilityStart && (
                        <>
                          <td rowSpan={row.dateFacilityRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.dateLabel}</td>
                          <td rowSpan={row.dateFacilityRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.note}</td>
                        </>
                      )}
                      {row.isStatusStart && (
                        <td rowSpan={row.statusRowSpan} className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.status}</td>
                      )}
                      <td className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.taskName}</td>
                      <td className="border border-slate-400 px-2 py-1 align-top break-words whitespace-pre-wrap">{row.item.additionalRequest || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 p-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                Đóng xem trước
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

