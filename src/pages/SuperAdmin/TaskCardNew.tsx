// This file contains the TaskCardNew component
// It is responsible for displaying task information in a card format

import { AiOutlineEdit, AiOutlineDelete, AiOutlineEye } from "react-icons/ai";
import { FaTasks } from "react-icons/fa";
import { ImplementationTaskResponseDTO } from "../PageClients/implementation-tasks";
import { isBusinessContractTaskName as isBusinessContractTask } from "../../utils/businessContract";

// 🔹 Base type chung cho cả Implementation và Maintenance tasks
type BaseTask = {
  id: number;
  name: string;
  hospitalId?: number | null;
  hospitalName?: string | null;
  picDeploymentId?: number | null;
  picDeploymentName?: string | null;
  receivedById?: number | null;
  receivedByName?: string | null;
  receivedDate?: string | null;
  status?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  apiUrl?: string | null;
  hisSystemName?: string | null;
  readOnlyForDeployment?: boolean | null;
  transferredToMaintenance?: boolean | null;
  // Additional fields that may exist in either type
  [key: string]: any;
};

// 🔹 Dùng union type để hỗ trợ cả Implementation và Maintenance tasks
type ImplTask = BaseTask | ImplementationTaskResponseDTO;

// ✅ Thay thế statusBadgeClass bằng bản có màu rõ ràng + dark mode
function statusBadgeClass(status?: string) {
  if (!status) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";

  const normalized = status.toUpperCase();

  switch (normalized) {
    case "RECEIVED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "IN_PROCESS":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "ISSUE":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "CANCELLED":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
}

// ✅ Giữ nguyên logic nhận dạng trạng thái ban đầu
function getDisplayStatus(status?: string) {
  if (!status) return "-";
  const s = status.toLowerCase().replace(/[-\s]/g, "_");
  const map: Record<string, string> = {
    received: "Đã tiếp nhận",
    in_process: "Đang xử lý",
    completed: "Hoàn thành",
    issue: "Gặp sự cố",
    cancelled: "Hủy",
    // Legacy support (backward compatibility)
    not_started: "Đã tiếp nhận",
    in_progress: "Đang xử lý",
    accepted: "Hoàn thành",
    done: "Hoàn thành",
    pending: "Đang chờ",
    failed: "Thất bại",
  };
  if (map[s]) return map[s];
  return status;
}

/** Normalize role typos / shorthand from API for list display (Admin + SuperAdmin). */
function formatPersonDisplayLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "-";
  let s = String(raw).trim();
  s = s.replace(/\(\s*supper\s*\)/gi, "(SuperAdmin)");
  s = s.replace(/\(\s*super\s*admin\s*\)/gi, "(SuperAdmin)");
  s = s.replace(/\bsupper\b/gi, "SuperAdmin");
  s = s.replace(/\(\s*adm\s*\)/gi, "(Admin)");
  return s;
}

function formatRelativeUpdatedVi(task: ImplTask): string | null {
  const raw =
    (task as any).updatedAt || (task as any).completionDate || task.receivedDate || task.startDate;
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 45) return `${days} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

function splitPrimarySecondaryPics(task: ImplTask): { primary: string; secondaryText: string } {
  const fmt = formatPersonDisplayLabel;
  const mainId = (task as any).picDeploymentId as number | undefined;
  const ids = ((task as any).picDeploymentIds as number[] | undefined) ?? [];
  const names = ((task as any).picDeploymentNames as string[] | undefined) ?? [];
  let primary = fmt(task.picDeploymentName ?? undefined);

  const second: string[] = [];
  if (ids.length && names.length) {
    ids.forEach((id, i) => {
      const n = names[i];
      if (!n || !String(n).trim()) return;
      if (mainId != null && Number(id) === Number(mainId)) return;
      second.push(fmt(String(n)));
    });
  }

  if (second.length === 0) {
    const additionalReq = (task as any).additionalRequest as string | undefined;
    if (additionalReq) {
      const match = additionalReq.match(/\[PIC_IDS:\s*([^\]]+)\]/);
      if (match) {
        const picIds = match[1].split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && x > 0);
        const allIds = mainId ? [...new Set([mainId, ...picIds])] : picIds;
        if (allIds.length > 1 && primary !== "-") {
          return { primary, secondaryText: `+${allIds.length - 1} người phụ` };
        }
      }
    }
  }

  return { primary, secondaryText: second.length ? second.join(", ") : "—" };
}

/** Calendar days from record creation (local date) to today; prefers createdAt. */
function daysSinceCreatedLabel(task: ImplTask): string {
  const raw = (task as any).createdAt ?? task.receivedDate ?? task.startDate;
  if (!raw) return "—";
  const dt = new Date(String(raw));
  if (Number.isNaN(dt.getTime())) return "—";
  const createdDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - createdDay.getTime()) / 86400000);
  if (!Number.isFinite(diffDays)) return "—";
  if (diffDays < 0) return "0 ngày";
  return `${diffDays} ngày`;
}

export default function TaskCardNew({
  task,
  onEdit,
  onDelete,
  onOpen,
  idx,
  displayIndex,
  animate = true,
  canView = true,
  canEdit = true,
  canDelete = true,
  statusLabelOverride,
  statusClassOverride,
  leadingTopLeft,
  allowEditCompleted = false, // ✅ Cho phép SuperAdmin sửa/xóa task đã hoàn thành
  clinicalTaskRow = false,
}: {
  task: ImplTask;
  onEdit: (t: ImplTask) => void;
  onDelete: (id: number) => void;
  onOpen: (t: ImplTask) => void;
  idx?: number;
  displayIndex?: number;
  animate?: boolean;
  canView?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  statusLabelOverride?: (status?: string) => string;
  statusClassOverride?: (status?: string) => string;
  leadingTopLeft?: React.ReactNode;
  allowEditCompleted?: boolean; // ✅ Cho phép SuperAdmin sửa/xóa task đã hoàn thành
  /** Maintenance hospital task list: table-like row (Admin + SuperAdmin). */
  clinicalTaskRow?: boolean;
}) {
  const delayMs = typeof idx === "number" && idx > 0 ? 2000 + (idx - 1) * 80 : 0;
  const style = animate ? { animation: "fadeInUp 220ms both", animationDelay: `${delayMs}ms` } : undefined;

  const orderNumber = (() => {
    if (typeof displayIndex === "number" && !Number.isNaN(displayIndex)) return displayIndex + 1;
    if (typeof idx === "number" && !Number.isNaN(idx)) return idx + 1;
    const rawId = (task as any)?.id;
    if (rawId != null && Number.isFinite(Number(rawId))) return Number(rawId);
    return 0;
  })();
  const orderLabel = String(orderNumber).padStart(3, "0");

  const transferredToMaintenance =
    Boolean((task as any)?.transferredToMaintenance) ||
    String(task.status ?? "").toUpperCase() === "TRANSFERRED";
  const statusValue = typeof task.status === "string" ? task.status : undefined;
  const effectiveStatus = transferredToMaintenance ? "COMPLETED" : (statusValue ?? "");
  const badgeClass = (statusClassOverride || statusBadgeClass)(effectiveStatus);
  const badgeLabel = statusLabelOverride
    ? statusLabelOverride(effectiveStatus)
    : getDisplayStatus(effectiveStatus);

  // Tính toán deadline status (quá hạn / sắp hạn)
  const deadlineStatus = (() => {
    // Chỉ hiển thị khi task chưa hoàn thành và có deadline
    // For implementation: COMPLETED = hoàn thành
    // For maintenance: ACCEPTED (Nghiệm thu) và WAITING_FOR_DEV (Hoàn thành) = hoàn thành
    const normalizedStatus = effectiveStatus.toUpperCase();
    const isCompleted = normalizedStatus === "COMPLETED" || 
                       normalizedStatus === "ACCEPTED" || 
                       normalizedStatus === "WAITING_FOR_DEV";
    if (isCompleted || !task.deadline) return null;

    try {
      const deadline = new Date(task.deadline);
      if (Number.isNaN(deadline.getTime())) return null;

      deadline.setHours(0, 0, 0, 0);
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const dayDiff = Math.round((deadline.getTime() - startToday) / (24 * 60 * 60 * 1000));

      // Quá hạn: deadline đã qua (dayDiff < 0)
      if (dayDiff < 0) return { type: "overdue", label: "Quá hạn", class: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" };
      // Sắp đến hạn: hôm nay hoặc trong 3 ngày tới (0 <= dayDiff <= 3)
      if (dayDiff >= 0 && dayDiff <= 3) return { type: "nearDue", label: "Sắp đến hạn", class: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200" };
      return null;
    } catch {
      return null;
    }
  })();

  const taskTitle = (task.name || "").toString();
  const titleIsLong = taskTitle.length > 36;
  const headerAlignClass = titleIsLong ? "items-start" : "items-center";
  const iconOffsetClass = titleIsLong ? "mt-0.5" : "";

  const fromBusiness =
    Boolean((task as any)?.fromBusinessContract) ||
    Boolean((task as any)?.businessProjectId) ||
    isBusinessContractTask(taskTitle);

  const updatedLine = formatRelativeUpdatedVi(task);
  const { primary: picPrimary } = splitPrimarySecondaryPics(task);
  const receiverLabel = formatPersonDisplayLabel(task.receivedByName ?? undefined);
  const startStr = task.startDate ? new Date(task.startDate).toLocaleDateString("vi-VN") : "—";
  const deadlineStr = task.deadline ? new Date(task.deadline).toLocaleDateString("vi-VN") : "—";
  const picInitial =
    picPrimary && picPrimary !== "-"
      ? (() => {
          const m = picPrimary.match(/[A-Za-zÀ-ỹ0-9]/);
          return (m ? m[0] : picPrimary.charAt(0)).toUpperCase();
        })()
      : "?";

  if (clinicalTaskRow) {
    return (
      <div
        className={`group relative w-full overflow-hidden rounded-2xl border bg-white shadow-sm transition-all dark:bg-gray-900 ${
          fromBusiness
            ? "border-purple-300 ring-1 ring-purple-200/70 dark:border-purple-600"
            : "border-slate-200/90 hover:border-sky-300/80 dark:border-slate-700 dark:hover:border-sky-700/50"
        } hover:shadow-md`}
        style={style}
      >
        {leadingTopLeft && <div className="absolute left-2 top-3 z-[5]">{leadingTopLeft}</div>}
        <div className={`grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-12 md:items-center md:gap-4 ${leadingTopLeft ? "pl-9" : ""}`}>
          <div className="flex min-w-0 gap-3 md:col-span-4">
            <div className="flex shrink-0 flex-col items-center">
              <div
                className={`flex h-9 min-w-[2.75rem] items-center justify-center rounded-lg border text-xs font-bold ${
                  fromBusiness
                    ? "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-600 dark:bg-purple-950 dark:text-purple-100"
                    : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {orderLabel}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold leading-snug text-slate-900 dark:text-white" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                {task.name}
              </h3>
              {updatedLine && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cập nhật: {updatedLine}</p>
              )}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tiếp nhận bởi: <span className="font-medium text-slate-700 dark:text-slate-200">{receiverLabel}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Bắt đầu: {startStr}</span>
                <span>Deadline: {deadlineStr}</span>
              </div>
              {task.hisSystemName && (
                <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">HIS: {task.hisSystemName}</div>
              )}
              {task.apiUrl && (
                <div className="mt-1 truncate text-[11px]">
                  <a className="text-orange-600 underline hover:text-orange-700 dark:text-orange-400" href={task.apiUrl} target="_blank" rel="noreferrer">
                    API
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:col-span-2 md:flex-col md:items-center md:justify-center md:gap-1.5">
            {(statusValue || transferredToMaintenance) && (
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>{badgeLabel}</span>
            )}
            {deadlineStatus && (
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${deadlineStatus.class}`}>
                {deadlineStatus.label}
              </span>
            )}
          </div>

          <div className="min-w-0 md:col-span-2">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:hidden">PIC chính</div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                {picInitial}
              </span>
              <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{picPrimary}</span>
            </div>
          </div>

          <div className="min-w-0 md:col-span-2">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:hidden">Thời gian tạo</div>
            <div className="flex min-w-0 items-center md:min-h-[2.5rem]">
              <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{daysSinceCreatedLabel(task)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
            {canEdit && (allowEditCompleted || !task.readOnlyForDeployment) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(task);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:border-orange-800 dark:bg-gray-900 dark:text-orange-400 dark:hover:bg-orange-950/40"
              >
                <AiOutlineEdit />
                <span>Sửa</span>
              </button>
            )}
            {canDelete && (allowEditCompleted || !task.readOnlyForDeployment) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <AiOutlineDelete />
                <span>Xóa</span>
              </button>
            )}
            {canView && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(task);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                title="Xem"
              >
                <AiOutlineEye className="text-sm" />
                <span>Xem</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative w-full rounded-2xl bg-white dark:bg-gray-900 px-6 py-5 shadow-sm transition-all border ${
        fromBusiness
          ? "border-purple-300 dark:border-purple-600 ring-1 ring-purple-200/70"
          : "border-gray-100 dark:border-gray-800 hover:border-blue-200"
      } hover:shadow-lg`}
      style={style}
    >
      {leadingTopLeft && (
        <div className="absolute left-1.5 top-1  z-5">
          {leadingTopLeft}
        </div>
      )}
      <div className={`flex gap-4 ${headerAlignClass} ${leadingTopLeft ? 'pl-0   pt-0' : ''}`}>
        {/* Left badge + icon */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-md border flex items-center justify-center text-sm font-semibold ${
              fromBusiness
                ? "bg-purple-50 border-purple-300 text-purple-800 dark:bg-purple-900 dark:border-purple-500 dark:text-purple-100"
                : "bg-gray-50 dark:bg-blue-800 border-gray-200 text-gray-700 dark:text-gray-200"
            }`}>
              {orderLabel}
            </div>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-200 shadow-sm ${iconOffsetClass}`}>
            <FaTasks className="text-xl" />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3 flex-wrap">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-gray-100 break-words min-w-0 flex-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {task.name}
                </h3>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {(statusValue || transferredToMaintenance) && (
                    <span
                      className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${badgeClass}`}
                    >
                      {badgeLabel}
                    </span>
                  )}

                  {/* Hiển thị badge "Quá hạn" hoặc "Sắp hạn" */}
                  {deadlineStatus && (
                    <span
                      className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${deadlineStatus.class}`}
                    >
                      {deadlineStatus.label}
                    </span>
                  )}
                </div>
              </div>

              {task.hisSystemName && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                  Đơn vị HIS: {task.hisSystemName}
                </div>
              )}

              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Người phụ trách:{" "}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {(() => {
                    // Ưu tiên lấy từ picDeploymentIds/picDeploymentNames trong response (backend mới)
                    if ((task as any).picDeploymentIds && Array.isArray((task as any).picDeploymentIds)) {
                      const picIds = (task as any).picDeploymentIds as number[];
                      const mainPicId = (task as any).picDeploymentId;
                      const allPicIds = mainPicId ? [...new Set([mainPicId, ...picIds])] : picIds;
                      const mainPic = formatPersonDisplayLabel(task.picDeploymentName || "-");
                      if (allPicIds.length > 1) {
                        return `${mainPic} (+${allPicIds.length - 1} người khác)`;
                      }
                      return mainPic;
                    }
                    
                    // Fallback: Parse PICs từ additionalRequest (backward compatible với dữ liệu cũ)
                    const additionalReq = (task as any).additionalRequest;
                    const picId = (task as any).picDeploymentId;
                    if (additionalReq) {
                      const match = additionalReq.match(/\[PIC_IDS:\s*([^\]]+)\]/);
                      if (match) {
                        const picIds = match[1].split(',').map((id: string) => Number(id.trim())).filter((id: number) => !isNaN(id) && id > 0);
                        const allPicIds = picId ? [...new Set([picId, ...picIds])] : picIds;
                        // Hiển thị PIC đầu tiên + số lượng PIC khác
                        const mainPic = formatPersonDisplayLabel(task.picDeploymentName || "-");
                        return allPicIds.length > 1 ? `${mainPic} (+${allPicIds.length - 1} người khác)` : mainPic;
                      }
                    }
                    return formatPersonDisplayLabel(task.picDeploymentName ?? "-");
                  })()}
                </span>
              </div>  

              {/* {!hideHospitalName && task.hospitalName &&
                task.name &&
                task.name.trim() &&
                task.name.trim() !== task.hospitalName.trim() && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Tên bệnh viện:{" "}
                    <span
                      title={task.hospitalName}
                      className="inline-block font-medium text-gray-800 dark:text-gray-100 rounded px-2 py-0.5 transition-colors duration-150 hover:bg-blue-50 dark:hover:bg-blue-800/40 hover:text-blue-700"
                    >
                      {task.hospitalName}
                    </span>
                  </div>
                )} */}

              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Tiếp nhận bởi:{" "}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {formatPersonDisplayLabel(task.receivedByName ?? undefined)}
                </span>
              </div>
            </div>

            {/* Right column: dates */}
            <div className="flex flex-col items-end ml-4 gap-1 text-right">
              <div className="text-sm text-gray-400 dark:text-gray-500">Bắt đầu</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {task.startDate
                  ? new Date(task.startDate).toLocaleDateString("vi-VN")
                  : "-"}
              </div>
              <div className="text-sm text-gray-400 dark:text-gray-500 mt-2">Deadline</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {task.deadline
                  ? new Date(task.deadline).toLocaleDateString("vi-VN")
                  : "-"}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-orange-500">
              {task.apiUrl && (
                <span>
                  API:{" "}
                  <a
                    className="underline text-orange-500 dark:text-orange-300 hover:text-orange-600"
                    href={task.apiUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {task.apiUrl}
                  </a>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              
              {/* ✅ SuperAdmin có thể sửa/xóa task đã hoàn thành nếu allowEditCompleted = true */}
              {canEdit && (allowEditCompleted || !task.readOnlyForDeployment) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  className="inline-flex items-center gap-2 bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-800 text-orange-500 px-3 py-1 rounded-lg text-sm hover:bg-orange-50 dark:hover:bg-orange-900/40"
                >
                  <AiOutlineEdit />
                  <span className="hidden md:inline">Sửa</span>
                </button>
              )}
              {canDelete && (allowEditCompleted || !task.readOnlyForDeployment) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task.id);
                  }}
                  className="inline-flex items-center gap-2 bg-white dark:bg-gray-900 border border-red-100 dark:border-red-800 text-red-600 px-3 py-1 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/40"
                >
                  <AiOutlineDelete />
                  <span className="hidden md:inline">Xóa</span>
                </button>
              )}

              {canView && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(task);
                  }}
                  className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-200 px-3 py-1 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-800"
                  title="Xem"
                >
                  <AiOutlineEye className="text-base" />
                  <span>Xem</span>
                </button>
              )}
              {/* Non-clickable indicators shown next to Xem */}
              {/* Status badges for transfer are intentionally hidden in the implementation tasks list
                  per UX: conversion actions/indicators are surfaced at the hospital list level only. */}
              {/* Convert action intentionally removed from the list/card view.
                  The convert-to-maintenance action should only be visible
                  inside the task detail modal when the task is fully accepted. */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
