import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  HiBan,
  HiChevronRight,
  HiCursorClick,
  HiDesktopComputer,
  HiDeviceMobile,
  HiDocumentDownload,
  HiLocationMarker,
  HiLogin,
  HiMap,
  HiOfficeBuilding,
  HiPencil,
  HiPlus,
  HiRefresh,
  HiShieldCheck,
  HiTrash,
  HiUserAdd,
} from "react-icons/hi";
import { getUserDetail } from "./userAnalyticsMock";

function ActivityIcon({ tone }: { tone: "emerald" | "blue" | "teal" | "red" }) {
  const ring =
    tone === "emerald"
      ? "border-emerald-400 bg-emerald-50 text-emerald-600"
      : tone === "blue"
        ? "border-blue-400 bg-blue-50 text-blue-600"
        : tone === "teal"
          ? "border-teal-400 bg-teal-50 text-teal-600"
          : "border-red-400 bg-red-50 text-red-600";
  const Icon =
    tone === "emerald"
      ? HiPlus
      : tone === "blue"
        ? HiPencil
        : tone === "teal"
          ? HiUserAdd
          : HiTrash;
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${ring} shadow-sm`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

const ACTIVITY_ROW_BG: Record<
  "emerald" | "blue" | "teal" | "red",
  string
> = {
  emerald: "bg-emerald-50/80",
  blue: "bg-blue-50/70",
  teal: "bg-teal-50/70",
  red: "bg-red-50/70",
};

export default function DetailActivity() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const user = getUserDetail(userId);

  if (!userId || !user) {
    return <Navigate to="/superadmin/user-analytics" replace />;
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="min-h-screen min-w-0 overflow-x-hidden bg-[#F8F9FA] text-slate-900">
      <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          className="mb-4 flex min-w-0 flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
          aria-label="Breadcrumb"
        >
          <Link
            to="/superadmin/user-analytics"
            className="shrink-0 text-slate-500 transition hover:text-blue-600"
          >
            Người dùng
          </Link>
          <HiChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
          <span className="min-w-0 truncate text-slate-800" title={user.name}>
            {user.name.toUpperCase()}
          </span>
        </nav>

        {/* Title + actions */}
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
            Chi tiết Người dùng
          </h1>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end lg:max-w-[min(100%,28rem)] xl:max-w-none">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto sm:px-4 sm:text-sm"
            >
              <HiDocumentDownload className="h-5 w-5 shrink-0 text-slate-500" />
              Xuất nhật ký kiểm tra
            </button>
            {/* <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto sm:px-4 sm:text-sm"
            >
              <HiRefresh className="h-5 w-5 shrink-0 text-slate-500" />
              Đặt lại mật khẩu
            </button>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100 sm:w-auto sm:px-4 sm:text-sm"
            >
              <HiBan className="h-5 w-5 shrink-0" />
              Thu hồi quyền truy cập
            </button> */}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
            {/* Profile + stats + module intensity (top block) */}
            <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
              {/* Left: profile card */}
              <div className="w-full min-w-0 shrink-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6 lg:max-w-[280px] xl:max-w-xs">
                <div className="relative mx-auto w-fit">
                  <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-[3px] border-blue-500 bg-gradient-to-br from-slate-100 to-slate-200 text-2xl font-bold text-slate-700 shadow-inner">
                    {initials}
                  </div>
                  <span
                    className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-sm"
                    title="Online"
                  />
                </div>
                <h2 className="mt-4 text-center text-lg font-bold text-slate-900">
                  {user.name}
                </h2>
                <p className="mt-1 break-words text-center text-sm text-slate-500">
                  {user.roleTitle}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-100 px-2.5 py-3 sm:px-3">
                    <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500">
                      Ngày tham gia
                    </p>
                    <p className="mt-1.5 text-xs font-semibold leading-snug text-slate-900 sm:text-sm">
                      {user.joinDateLabel}
                    </p>
                  </div>
                  <div className="rounded-xl bg-sky-50 px-2.5 py-3 ring-1 ring-inset ring-sky-100 sm:px-3">
                    <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-sky-600">
                      Mức độ tương tác
                    </p>
                    <p className="mt-1.5 text-xs font-bold leading-snug text-blue-600 sm:text-sm">
                      {user.engagementLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: 3 metric cards + module intensity */}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                      <HiCursorClick className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      {user.totalActions}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                      Tổng số hành động
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                      <HiLogin className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      {user.loginFrequencyLabel}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                      Tần suất đăng nhập
                    </p>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                      <HiOfficeBuilding className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="break-words text-base font-bold leading-snug text-slate-900 sm:text-lg">
                      {user.topModule}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
                      Mô-đun dùng nhiều nhất
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Cường độ tương tác mô-đun
                  </p>
                  <div className="mt-4 space-y-4">
                    {user.modules.map((m) => (
                      <div key={m.name} className="min-w-0">
                        <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                          <span className="min-w-0 break-words text-[11px] font-semibold uppercase leading-snug tracking-wide text-slate-600 sm:text-xs">
                            {m.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-sm font-bold text-slate-900">
                            {Math.round(m.percent)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${Math.min(100, m.percent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: activity stream (~8) + device / location (~4) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
              {/* Recent activity — wide column */}
              <div className="min-w-0 lg:col-span-8">
                <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                    <h3 className="text-sm font-bold text-slate-900">
                      Luồng hoạt động gần đây
                    </h3>
                    <button
                      type="button"
                      className="shrink-0 self-start text-sm font-semibold text-blue-600 hover:text-blue-700 sm:self-auto"
                    >
                      Xem toàn bộ nhật ký
                    </button>
                  </div>
                  <div className="space-y-0 px-3 py-5 sm:px-6 sm:py-6">
                    <ul className="relative">
                      {user.activities.map((item, idx) => (
                        <li
                          key={item.id}
                          className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4"
                        >
                          {idx < user.activities.length - 1 && (
                            <span
                              className="absolute left-5 top-11 bottom-0 w-px bg-slate-200 sm:left-5"
                              aria-hidden
                            />
                          )}
                          <div className="relative z-[1] shrink-0">
                            <ActivityIcon tone={item.iconTone} />
                          </div>
                          <div
                            className={`min-w-0 flex-1 rounded-xl border border-slate-100/80 p-4 shadow-sm ${ACTIVITY_ROW_BG[item.iconTone]}`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {item.title}
                                </span>
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide ${item.tagClass}`}
                                >
                                  {item.tag}
                                </span>
                              </div>
                              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-right">
                                {item.timeLabel.toUpperCase()}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600 [word-break:break-word]">
                              {item.description}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <aside className="flex min-w-0 flex-col gap-6 lg:col-span-4">
                <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white shadow-md">
                  <HiShieldCheck
                    className="pointer-events-none absolute -bottom-4 -right-4 h-36 w-36 text-slate-700/35"
                    aria-hidden
                  />
                  <div className="relative z-[1]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Dấu vân tay thiết bị
                    </p>
                    <ul className="mt-4 space-y-3">
                      {user.devices.map((d, i) => (
                        <li
                          key={`${d.label}-${i}`}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-3 backdrop-blur-sm"
                        >
                          {d.icon === "laptop" ? (
                            <HiDesktopComputer className="mt-0.5 h-6 w-6 shrink-0 text-white" />
                          ) : (
                            <HiDeviceMobile className="mt-0.5 h-6 w-6 shrink-0 text-white" />
                          )}
                          <div className="min-w-0">
                            <p className="break-words font-bold text-white">
                              {d.label}
                            </p>
                            <p className="break-words text-sm text-slate-400">
                              {d.sub}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Lịch sử vị trí
                    </p>
                  </div>
                  <div className="relative h-44 overflow-hidden bg-gradient-to-b from-sky-300 via-cyan-100 to-teal-100">
                    <svg
                      className="absolute bottom-0 left-0 right-0 h-20 text-emerald-800/25"
                      viewBox="0 0 400 80"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path d="M0,80 L60,35 L100,55 L160,20 L220,50 L280,25 L340,60 L400,40 L400,80 Z" fill="currentColor" />
                    </svg>
                    <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 drop-shadow-lg">
                      <HiLocationMarker className="h-12 w-12 text-red-500" />
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {user.locationTitle}
                      </p>
                      <p className="text-sm text-slate-500">
                        {user.locationSubtitle}
                      </p>
                    </div>
                    <HiMap
                      className="h-9 w-9 shrink-0 text-blue-500"
                      aria-hidden
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/superadmin/user-analytics")}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ← Quay lại danh sách
                </button>
              </aside>
            </div>
        </div>
      </div>
    </section>
  );
}
