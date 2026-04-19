import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { FiActivity, FiInfo, FiLink, FiUser, FiClock } from "react-icons/fi";
import TaskFormModal from "./TaskFormModal";
import TaskCard from "./TaskCardNew";
import toast from "react-hot-toast";
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from "../../hooks/useConfirmDialog";

const API_ROOT = import.meta.env.VITE_API_URL || "";
const MIN_LOADING_MS = 2000;

type DevTask = {
  id: number;
  name: string;
  hospitalName?: string | null;
  picDeploymentName?: string | null;
  status?: string | null;
  createdAt?: string | null;
  apiUrl?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  notes?: string | null;
};

function authHeaders() {
  const token = localStorage.getItem("access_token");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

type CanonicalStatus = "RECEIVED" | "IN_PROCESS" | "COMPLETED" | "ISSUE" | "CANCELLED";

const CANONICAL_STATUS_CLASSES: Record<CanonicalStatus, string> = {
  RECEIVED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  IN_PROCESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ISSUE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  RECEIVED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang làm",
  API_TESTING: "Test thông api",
  INTEGRATING: "Tích hợp với viện",
  WAITING_FOR_DEV: "Chờ cập nhật",
  IN_PROCESS: "Đang làm",
  ACCEPTED: "Hoàn thành",
  COMPLETED: "Hoàn thành",
  DONE: "Hoàn thành",
  FINISHED: "Hoàn thành",
  HOAN_THANH: "Hoàn thành",
  HOÀN_THÀNH: "Hoàn thành",
  ISSUE: "Gặp sự cố",
  FAILED: "Gặp sự cố",
  ERROR: "Gặp sự cố",
  CANCELLED: "Đã hủy",
  CANCELED: "Đã hủy",
};

const STATUS_CANONICAL_MAP: Record<string, CanonicalStatus> = {
  NOT_STARTED: "RECEIVED",
  RECEIVED: "RECEIVED",
  PENDING: "RECEIVED",
  IN_PROGRESS: "IN_PROCESS",
  API_TESTING: "IN_PROCESS",
  INTEGRATING: "IN_PROCESS",
  WAITING_FOR_DEV: "IN_PROCESS",
  IN_PROCESS: "IN_PROCESS",
  ACCEPTED: "COMPLETED",
  COMPLETED: "COMPLETED",
  DONE: "COMPLETED",
  FINISHED: "COMPLETED",
  HOAN_THANH: "COMPLETED",
  HOÀN_THÀNH: "COMPLETED",
  ISSUE: "ISSUE",
  FAILED: "ISSUE",
  ERROR: "ISSUE",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
};

function formatStatusKey(status?: string | null) {
  if (!status) return "";
  return status.toString().trim().toUpperCase().replace(/\s+/g, "_");
}

function normalizeStatus(status?: string | null): CanonicalStatus | undefined {
  const key = formatStatusKey(status);
  return (key && STATUS_CANONICAL_MAP[key]) || undefined;
}

function statusLabel(status?: string | null) {
  const key = formatStatusKey(status);
  if (!key) return status ? String(status) : "-";
  return STATUS_LABELS[key] || String(status);
}

function statusBadgeClasses(status?: string | null) {
  const normalized = normalizeStatus(status);
  return normalized ? CANONICAL_STATUS_CLASSES[normalized] : CANONICAL_STATUS_CLASSES.CANCELLED;
}

const DevSuperTaskPage: React.FC = () => {
  // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
  const { isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin;

  const [data, setData] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  // hospitalOptions is used only for datalist; we don't need the setter here
  const hospitalOptions = useState<Array<{ id: number; label: string }>>([])[0];
  const searchDebounce = useRef<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortDir, setSortDir] = useState<string>("asc");
  const [picFilter, setPicFilter] = useState<string[]>([]);
  const [picFilterOpen, setPicFilterOpen] = useState<boolean>(false);
  const [picFilterQuery, setPicFilterQuery] = useState<string>("");
  const [picOptions, setPicOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [page, setPage] = useState<number>(0);
  const [size, setSize] = useState<number>(10);
  const [enableItemAnimation, setEnableItemAnimation] =
    useState<boolean>(true);

  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();

  const apiBase = `${API_ROOT}/api/v1/superadmin/dev/tasks`;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DevTask | null>(null);
  const [viewOnly, setViewOnly] = useState<boolean>(false);
  const picFilterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        picFilterDropdownRef.current &&
        !picFilterDropdownRef.current.contains(event.target as Node)
      ) {
        setPicFilterOpen(false);
      }
    }
    if (picFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [picFilterOpen]);

  useEffect(() => {
    if (!picFilterOpen) {
      setPicFilterQuery("");
    }
  }, [picFilterOpen]);

  const filteredPicOptions = useMemo(() => {
    const q = picFilterQuery.trim().toLowerCase();
    if (!q) return picOptions;
    return picOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [picOptions, picFilterQuery]);

  async function fetchList() {
    const start = Date.now();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        size: String(size),
        sortBy,
        sortDir,
      });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);

      const url = `${apiBase}?${params.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      const resp = await res.json();
      const items = Array.isArray(resp?.content)
        ? resp.content
        : Array.isArray(resp)
        ? resp
        : [];
      setData(items);
      const picMap = new Map<string, string>();
      items.forEach((item) => {
        const label = (item.picDeploymentName || "").toString().trim();
        if (label) picMap.set(label, label);
      });
      setPicOptions(Array.from(picMap.entries()).map(([id, label]) => ({ id, label })));
      if (resp && typeof resp.totalElements === "number")
        setTotalCount(resp.totalElements);
      else setTotalCount(Array.isArray(resp) ? resp.length : null);

      if (enableItemAnimation) {
        const itemCount = items.length;
        const maxDelay = itemCount > 1 ? 2000 + (itemCount - 2) * 80 : 0;
        const animationDuration = 220;
        const buffer = 120;
        window.setTimeout(
          () => setEnableItemAnimation(false),
          maxDelay + animationDuration + buffer
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      const elapsed = Date.now() - start;
      if (isInitialLoad) {
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        await new Promise((res) => setTimeout(res, remaining));
      }
      setLoading(false);
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchList();
  }, [page, size]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => {
      fetchList();
    }, 600);
    return () => {
      if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    };
  }, [searchTerm, statusFilter, sortBy, sortDir]);

  const handleDelete = async (id: number) => {
    const ok = await askConfirm({
      title: "Xóa công việc?",
      message: "Bạn có chắc muốn xóa bản ghi này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    const res = await fetch(`${apiBase}/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const msg = await res.text();
      toast.error(`Xóa thất bại: ${msg || res.status}`);
      return;
    }
    setData((s) => s.filter((x) => x.id !== id));
    toast.success("Đã xóa thành công");
  };

  const togglePicFilterValue = (value: string, checked: boolean) => {
    setPicFilter((prev) => {
      if (checked) {
        if (prev.includes(value)) return prev;
        return [...prev, value];
      }
      return prev.filter((id) => id !== value);
    });
    setPage(0);
  };

  const clearPicFilter = () => {
    setPicFilter([]);
    setPicFilterOpen(false);
    setPicFilterQuery("");
    setPage(0);
  };

  const clearTaskStatusFilter = () => {
    setStatusFilter("");
    setPage(0);
  };

  const handleSubmit = async (payload: Record<string, unknown>, id?: number) => {
    const isUpdate = Boolean(id);
    const url = isUpdate ? `${apiBase}/${id}` : apiBase;
    const method = isUpdate ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const msg = await res.text();
      toast.error(`${method} thất bại: ${msg || res.status}`);
      return;
    }
    await fetchList();
    toast.success(isUpdate ? "Cập nhật thành công" : "Tạo mới thành công");
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setViewOnly(false);
    setEditing(null);
  };

  const filteredData = useMemo(() => {
    if (picFilter.length === 0) return data;
    const selected = new Set(picFilter);
    return data.filter((item) => {
      const name = (item.picDeploymentName || "").toString().trim();
      return name && selected.has(name);
    });
  }, [data, picFilter]);

  if (!isSuper) {
    return (
      <div className="p-6 text-red-600">
        Bạn không có quyền truy cập trang SuperAdmin.
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Công việc Dev (SuperAdmin)</h1>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {/* Search & Filter */}
      <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-3">Tìm kiếm & Thao tác</h3>
            <div className="flex flex-wrap items-center gap-3">
                <input
                list="hospital-list"
                type="text"
                className="rounded-full border px-4 py-3 text-sm shadow-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                placeholder="Tìm theo tên"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchList();
                }}
              />
              <datalist id="hospital-list">
                {hospitalOptions.map((h) => (
                  <option key={h.id} value={h.label} />
                ))}
              </datalist>

              <div className="flex items-center gap-2 w-[260px]">
                <select
                  className="w-[200px] rounded-full border px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="" disabled hidden>— Trạng thái —</option>
              {["NOT_STARTED", "IN_PROGRESS", "API_TESTING", "INTEGRATING", "WAITING_FOR_DEV", "ACCEPTED"].map((value) => (
                <option key={value} value={value}>{statusLabel(value)}</option>
              ))}
                </select>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${statusFilter ? "visible" : "invisible pointer-events-none"}`}
                  onClick={clearTaskStatusFilter}
                >
                  Bỏ lọc
                </button>
              </div>
            </div>
            <div ref={picFilterDropdownRef} className="mt-3 flex flex-col gap-2">
              <div className="relative w-full max-w-[200px]">
                <button
                  type="button"
                  className="w-full rounded-full border px-3 py-2 text-sm shadow-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  onClick={() => setPicFilterOpen((prev) => !prev)}
                >
                  <span className="truncate">
                    {picFilter.length === 0
                      ? "Lọc người phụ trách"
                      : picFilter.length === 1
                        ? picOptions.find((opt) => opt.id === picFilter[0])?.label ?? "Đã chọn 1"
                        : `Đã chọn ${picFilter.length} người phụ trách`}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${picFilterOpen ? 'rotate-180' : ''} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {picFilterOpen && (
                  <div className="absolute z-30 mt-2 w-60 rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3">
                    <input
                      type="text"
                      value={picFilterQuery}
                      onChange={(e) => setPicFilterQuery(e.target.value)}
                      placeholder="Tìm người phụ trách"
                      className="w-full rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {filteredPicOptions.length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-6">
                          Không có dữ liệu người phụ trách
                        </div>
                      ) : (
                        filteredPicOptions.map((opt) => {
                          const value = opt.id;
                          const checked = picFilter.includes(value);
                          return (
                            <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => togglePicFilterValue(value, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate">{opt.label}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm text-blue-600 hover:underline focus:outline-none"
                        onClick={clearPicFilter}
                        disabled={picFilter.length === 0}
                      >
                        Bỏ lọc
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 focus:outline-none"
                        onClick={() => setPicFilterOpen(false)}
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`self-start px-3 py-1.5 text-xs text-blue-600 hover:underline focus:outline-none ${picFilter.length === 0 ? "invisible pointer-events-none" : ""}`}
                onClick={clearPicFilter}
              >
                Bỏ lọc người phụ trách
              </button>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              Tổng:{" "}
              <span className="font-semibold text-gray-800">
                {loading ? "..." : filteredData.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="rounded-xl bg-blue-600 text-white px-5 py-2 shadow hover:bg-blue-700"
              onClick={() => {
                setEditing(null);
                setViewOnly(false);
                setModalOpen(true);
              }}
            >
              + Thêm mới
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading && isInitialLoad ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-blue-600 text-4l font-extrabold tracking-wider animate-pulse">
              TAG
            </div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500">
            Không có dữ liệu
          </div>
        ) : (
          filteredData.map((row, idx) => (
                <TaskCard
                  key={row.id}
                  task={row as unknown as import("../PageClients/implementation-tasks").ImplementationTaskResponseDTO}
              idx={idx}
              animate={enableItemAnimation}
              onOpen={(t) => {
                setEditing(t);
                setViewOnly(true);
                setModalOpen(true);
              }}
              onEdit={(t) => {
                setEditing(t);
                setViewOnly(false);
                setModalOpen(true);
              }}
              onDelete={(id) => handleDelete(id)}
              statusLabelOverride={statusLabel}
              statusClassOverride={statusBadgeClasses}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between py-3">
        <div className="text-sm text-gray-600">
          {(() => {
            const total = filteredData.length;
            if (!total || total === 0) return <span>Hiển thị 0 trong tổng số 0 mục</span>;
            const from = page * size + 1;
            const to = Math.min((page + 1) * size, total);
            return <span>Hiển thị {from} đến {to} trong tổng số {total} mục</span>;
          })()}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Hiển thị:</label>
            <select value={String(size)} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="border rounded px-2 py-1 text-sm">
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={page <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Đầu">«</button>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Trước">‹</button>

            {(() => {
              const total = Math.max(1, Math.ceil(filteredData.length / size));
              const pages: number[] = [];
              const start = Math.max(1, page + 1 - 2);
              const end = Math.min(total, start + 4);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map((p) => (
                <button key={p} onClick={() => setPage(p - 1)} className={`px-3 py-1 border rounded text-sm ${page + 1 === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>
                  {p}
                </button>
              ));
            })()}

            <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * size >= filteredData.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Tiếp">›</button>
            <button onClick={() => setPage(Math.max(0, Math.ceil(filteredData.length / size) - 1))} disabled={(page + 1) * size >= filteredData.length} className="px-2 py-1 border rounded text-sm disabled:opacity-50" title="Cuối">»</button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {viewOnly ? (
        <DetailModal
          open={modalOpen}
          onClose={handleModalClose}
          item={editing}
        />
      ) : (
        <TaskFormModal
          open={modalOpen}
          onClose={handleModalClose}
          initial={editing ?? undefined}
          onSubmit={handleSubmit}
          readOnly={false}
        />
      )}
      {genericConfirmDialog}
    </div>
  );
};

// =======================
// Detail Modal
// =======================
function DetailModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: DevTask | null;
}) {
  if (!open || !item) return null;
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("vi-VN") : "—");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header (sticky) */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <span className="text-blue-600 dark:text-blue-400"><FiActivity /></span>
            <span>Chi tiết tác vụ Dev</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="p-6 max-h-[60vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <Info label="Tên" value={item.name} icon={<FiInfo />} />
            <Info label="Bệnh viện" value={item.hospitalName} icon={<FiUser />} />
            <Info label="Người phụ trách" value={item.picDeploymentName} icon={<FiUser />} />
            <Info
              label="Trạng thái"
              icon={<FiActivity />}
              value={
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusBadgeClasses(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              }
            />
            <Info
              label="API URL"
              icon={<FiLink />}
              value={
                item.apiUrl ? (
                  <a href={item.apiUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {item.apiUrl}
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Info label="Ngày bắt đầu" icon={<FiClock />} value={fmt(item.startDate)} />
            <Info label="Ngày hoàn thành" icon={<FiClock />} value={fmt(item.finishDate)} />
            <Info label="Tạo lúc" icon={<FiClock />} value={fmt(item.createdAt)} />
          </div>

          <div className="mt-6">
            <p className="text-gray-500 mb-2">Ghi chú / Mô tả:</p>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 min-h-[60px] whitespace-pre-wrap break-words">
              {item.notes?.trim() || "—"}
            </div>
          </div>
        </div>

        {/* Footer (sticky) */}
        <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-6 py-4 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            Đóng
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start">
      <div className="flex items-center gap-2 min-w-[140px]">
        {icon && <span className="text-gray-400">{icon}</span>}
        <span className="font-semibold text-gray-900 dark:text-gray-100">{label}:</span>
      </div>
      <div className="text-gray-700 dark:text-gray-300 text-right max-w-[60%] break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}

export default DevSuperTaskPage;
