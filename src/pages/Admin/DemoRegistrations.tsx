import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  FiBriefcase,
  FiHome,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiDownload,
  FiEye,
  FiFilter,
  FiInbox,
  FiPhone,
  FiRefreshCw,
  FiSearch,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import PageMeta from "../../components/common/PageMeta";
import {
  getDemoRegistrations,
  getDemoRegistrationSummary,
  updateDemoRegistrationStatus,
  type DemoRegistration,
  type DemoRegistrationStatus as RegistrationStatus,
  type DemoRegistrationSummary,
} from "../../api/demoRegistration.api";

type StatusConfig = {
  label: string;
  badgeClass: string;
  dotClass: string;
};

const STATUS_CONFIG: Record<RegistrationStatus, StatusConfig> = {
  NEW: {
    label: "Mới đăng ký",
    badgeClass: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
    dotClass: "bg-blue-500",
  },
  CONTACTED: {
    label: "Đã liên hệ",
    badgeClass: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30",
    dotClass: "bg-cyan-500",
  },
  SCHEDULED: {
    label: "Đã hẹn demo",
    badgeClass: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
    dotClass: "bg-violet-500",
  },
  CONSULTING: {
    label: "Đang tư vấn",
    badgeClass: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
    dotClass: "bg-amber-500",
  },
  CONVERTED: {
    label: "Đã chuyển đổi",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  NO_NEED: {
    label: "Không có nhu cầu",
    badgeClass: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600",
    dotClass: "bg-slate-400",
  },
};

const SOLUTION_OPTIONS = [
  ["SMART_KIOSK", "Hệ thống Kiosk tiếp đón tự phục vụ (Đề án 06)"],
  ["QUEUE_SYSTEM", "Hệ thống xếp hàng tự động"],
  ["PATIENT_SURVEY", "Khảo sát hài lòng người bệnh"],
  ["HIS", "Hệ thống Quản lý bệnh viện (HIS)"],
  ["EMR", "Bệnh án điện tử (EMR) & ký số HSM"],
  ["PACS", "Lưu trữ hình ảnh y tế (PACS)"],
  ["FULL_SOLUTION", "Khảo sát tổng thể & demo giải pháp"],
  ["OTHER", "Giải pháp khác"],
] as const;

const PAGE_SIZE = 10;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function exportCsv(items: DemoRegistration[]) {
  const rows = [
    ["Mã", "Họ và tên", "Số điện thoại", "Đơn vị", "Chức vụ", "Nhu cầu", "Trạng thái", "Người phụ trách", "Ngày đăng ký"],
    ...items.map((item) => [
      `DK-${String(item.id).padStart(5, "0")}`,
      item.contactName,
      item.phoneNumber,
      item.organizationName,
      item.position ?? "",
      item.solutionName,
      STATUS_CONFIG[item.status].label,
      item.assignedToName ?? "",
      formatDateTime(item.createdAt),
    ]),
  ];
  const csv = `\uFEFF${rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `khach-hang-lien-he-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DemoRegistrations() {
  const [items, setItems] = useState<DemoRegistration[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | "ALL">("ALL");
  const [solutionFilter, setSolutionFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<DemoRegistration | null>(null);
  const [summary, setSummary] = useState<DemoRegistrationSummary>({
    totalCount: 0,
    newCount: 0,
    scheduledCount: 0,
    convertedCount: 0,
  });
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [pageData, summaryData] = await Promise.all([
          getDemoRegistrations({
            search,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            solutionCode: solutionFilter === "ALL" ? undefined : solutionFilter,
            page: currentPage - 1,
            size: PAGE_SIZE,
          }, controller.signal),
          getDemoRegistrationSummary(controller.signal),
        ]);
        setItems(pageData.content);
        setTotalElements(pageData.totalElements);
        setTotalPages(Math.max(1, pageData.totalPages));
        setSummary(summaryData);
      } catch (error) {
        if (controller.signal.aborted) return;
        setItems([]);
        setLoadError(error instanceof Error ? error.message : "Không thể tải danh sách khách hàng liên hệ.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentPage, refreshVersion, search, solutionFilter, statusFilter]);

  const updateStatus = async (id: number, status: RegistrationStatus) => {
    setUpdatingId(id);
    try {
      const updated = await updateDemoRegistrationStatus(id, status);
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
      setSelected((current) => (current?.id === id ? updated : current));
      const summaryData = await getDemoRegistrationSummary();
      setSummary(summaryData);
      toast.success("Đã cập nhật trạng thái khách hàng");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật trạng thái");
    } finally {
      setUpdatingId(null);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setSolutionFilter("ALL");
    setCurrentPage(1);
  };

  return (
    <>
      <PageMeta title="Khách hàng liên hệ | TAGTECH" description="Danh sách đăng ký khảo sát và demo giải pháp" />
      <div className="min-h-full bg-slate-50/80 px-4 py-6 dark:bg-gray-950/30 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] space-y-5">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  Phòng kinh doanh
                </p>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Khách hàng liên hệ
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                Tiếp nhận và theo dõi khách hàng đăng ký khảo sát, tư vấn hoặc demo giải pháp.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRefreshVersion((value) => value + 1)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <FiRefreshCw className={loading ? "animate-spin" : ""} /> Tải lại
              </button>
              <button
                type="button"
                onClick={() => exportCsv(items)}
                disabled={items.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <FiDownload /> Xuất danh sách
              </button>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={<FiUsers />} label="Tổng liên hệ" value={summary.totalCount} tone="blue" />
            <SummaryCard icon={<FiInbox />} label="Mới đăng ký" value={summary.newCount} tone="cyan" />
            <SummaryCard icon={<FiCalendar />} label="Đã hẹn demo" value={summary.scheduledCount} tone="violet" />
            <SummaryCard icon={<FiCheckCircle />} label="Đã chuyển đổi" value={summary.convertedCount} tone="emerald" />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1.5fr)_1fr_1fr_auto] lg:items-end">
              <FilterField label="Tìm kiếm">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Tên, số điện thoại hoặc đơn vị..."
                    className={fieldClass}
                  />
                </div>
              </FilterField>
              <FilterField label="Trạng thái">
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as RegistrationStatus | "ALL");
                    setCurrentPage(1);
                  }}
                  className={selectClass}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  {(Object.entries(STATUS_CONFIG) as [RegistrationStatus, StatusConfig][]).map(([value, config]) => (
                    <option key={value} value={value}>{config.label}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Nhu cầu triển khai">
                <select
                  value={solutionFilter}
                  onChange={(event) => {
                    setSolutionFilter(event.target.value);
                    setCurrentPage(1);
                  }}
                  className={selectClass}
                >
                  <option value="ALL">Tất cả nhu cầu</option>
                  {SOLUTION_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </FilterField>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <FiFilter /> Xóa lọc
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">Danh sách khách hàng liên hệ</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
                  {totalElements} kết quả trên tổng số {summary.totalCount} lượt đăng ký
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Sắp xếp mới nhất trước
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="w-16 px-5 py-3.5 text-center">STT</th>
                    <th className="min-w-56 px-4 py-3.5">Khách hàng liên hệ</th>
                    <th className="w-40 px-4 py-3.5">Số điện thoại</th>
                    <th className="min-w-60 px-4 py-3.5">Đơn vị/Bệnh viện</th>
                    <th className="min-w-56 px-4 py-3.5">Nhu cầu triển khai</th>
                    <th className="w-44 px-4 py-3.5">Ngày đăng ký</th>
                    <th className="w-48 px-4 py-3.5">Trạng thái</th>
                    <th className="w-32 px-5 py-3.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center text-slate-500 dark:text-gray-400">
                        <FiRefreshCw className="mx-auto mb-3 animate-spin text-3xl text-blue-500" />
                        Đang tải danh sách...
                      </td>
                    </tr>
                  ) : loadError ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <p className="font-medium text-red-600 dark:text-red-400">{loadError}</p>
                        <button type="button" onClick={() => setRefreshVersion((value) => value + 1)} className="mt-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          Thử tải lại
                        </button>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <FiInbox className="mx-auto mb-3 text-4xl text-slate-300 dark:text-gray-600" />
                        <p className="font-medium text-slate-700 dark:text-gray-200">Không tìm thấy khách hàng liên hệ</p>
                        <button type="button" onClick={resetFilters} className="mt-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          Xóa bộ lọc
                        </button>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const status = STATUS_CONFIG[item.status];
                      return (
                        <tr key={item.id} className="transition hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.04]">
                          <td className="px-5 py-4 text-center text-slate-500 dark:text-gray-400">
                            {(currentPage - 1) * PAGE_SIZE + index + 1}
                          </td>
                          <td className="px-4 py-4">
                            <button type="button" onClick={() => setSelected(item)} className="text-left">
                              <span className="block font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">{item.contactName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-gray-400">{item.position || "Chưa cung cấp chức vụ"}</span>
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <a href={`tel:${item.phoneNumber.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 font-medium text-blue-700 hover:underline dark:text-blue-400">
                              <FiPhone /> {item.phoneNumber}
                            </a>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-2.5">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-300"><FiHome /></span>
                              <span className="font-medium leading-5 text-slate-700 dark:text-gray-200">{item.organizationName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-700 dark:text-gray-200">{item.solutionName}</td>
                          <td className="px-4 py-4 text-slate-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1.5"><FiClock /> {formatDateTime(item.createdAt)}</span>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={item.status}
                              onChange={(event) => updateStatus(item.id, event.target.value as RegistrationStatus)}
                              disabled={updatingId === item.id}
                              className={`w-full rounded-lg border-0 px-2.5 py-2 text-xs font-semibold ring-1 ring-inset outline-none focus:ring-2 focus:ring-blue-500 ${status.badgeClass}`}
                            >
                              {(Object.entries(STATUS_CONFIG) as [RegistrationStatus, StatusConfig][]).map(([value, config]) => (
                                <option key={value} value={value} className="bg-white text-slate-800 dark:bg-gray-900 dark:text-gray-100">{config.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelected(item)}
                              title="Xem chi tiết"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                            >
                              <FiEye className="text-lg" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3.5 text-sm text-slate-500 dark:border-gray-800 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Hiển thị {totalElements ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, totalElements)} trên {totalElements} kết quả
              </p>
              <div className="flex items-center gap-1">
                <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)} className={pageButtonClass} aria-label="Trang trước"><FiChevronLeft /></button>
                <span className="min-w-20 text-center text-xs font-semibold">Trang {currentPage}/{totalPages}</span>
                <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)} className={pageButtonClass} aria-label="Trang sau"><FiChevronRight /></button>
              </div>
            </footer>
          </section>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Đóng chi tiết" />
          <section className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-gray-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Đăng ký demo #{String(selected.id).padStart(5, "0")}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Chi tiết khách hàng liên hệ</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"><FiX className="text-xl" /></button>
            </div>

            <div className="space-y-6 p-6">
              <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4 dark:bg-gray-800/60 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-xl text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"><FiUser /></span>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{selected.contactName}</h3>
                    <p className="text-sm text-slate-500 dark:text-gray-400">{selected.position || "Chưa cung cấp chức vụ"}</p>
                  </div>
                </div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${STATUS_CONFIG[selected.status].badgeClass}`}>
                  <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[selected.status].dotClass}`} />{STATUS_CONFIG[selected.status].label}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem icon={<FiPhone />} label="Số điện thoại"><a href={`tel:${selected.phoneNumber.replace(/\s/g, "")}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{selected.phoneNumber}</a></DetailItem>
                <DetailItem icon={<FiHome />} label="Đơn vị/Bệnh viện">{selected.organizationName}</DetailItem>
                <DetailItem icon={<FiBriefcase />} label="Nhu cầu triển khai">{selected.solutionName}</DetailItem>
                <DetailItem icon={<FiUser />} label="Người phụ trách">{selected.assignedToName || "Chưa phân công"}</DetailItem>
                <DetailItem icon={<FiClock />} label="Ngày đăng ký">{formatDateTime(selected.createdAt)}</DetailItem>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Cập nhật trạng thái</p>
                  <select
                    value={selected.status}
                    onChange={(event) => updateStatus(selected.id, event.target.value as RegistrationStatus)}
                    disabled={updatingId === selected.id}
                    className={selectClass}
                  >
                    {(Object.entries(STATUS_CONFIG) as [RegistrationStatus, StatusConfig][]).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Ghi chú cụ thể</p>
                <div className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                  {selected.note || "Khách hàng không để lại ghi chú."}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-6 py-4 dark:border-gray-800 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Đóng</button>
              <a href={`tel:${selected.phoneNumber.replace(/\s/g, "")}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><FiPhone /> Liên hệ khách hàng</a>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-500/20";
const selectClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-blue-500/20";
const pageButtonClass = "rounded-md border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800";

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">{label}</span>{children}</label>;
}

function DetailItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400"><span className="text-blue-500">{icon}</span>{label}</div>
      <div className="text-sm font-medium text-slate-800 dark:text-gray-100">{children}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "cyan" | "violet" | "emerald" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-medium text-slate-500 dark:text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString("vi-VN")}</p></div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${toneClass}`}>{icon}</span>
      </div>
    </div>
  );
}
