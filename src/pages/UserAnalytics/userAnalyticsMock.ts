export type EngagementStatus = "high" | "view_only" | "low" | "inactive";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  status: EngagementStatus;
  activeDays: number;
  logins: number;
  score: number;
  avatarUrl?: string;
};

export const STATUS_META: Record<
  EngagementStatus,
  { label: string; className: string; barClass: string }
> = {
  high: {
    label: "TƯƠNG TÁC CAO",
    className:
      "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15",
    barClass: "bg-blue-600",
  },
  view_only: {
    label: "CHỈ XEM",
    className:
      "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15",
    barClass: "bg-blue-500",
  },
  low: {
    label: "TẦN SUẤT THẤP",
    className:
      "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
    barClass: "bg-amber-400",
  },
  inactive: {
    label: "KHÔNG HOẠT ĐỘNG",
    className: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15",
    barClass: "bg-red-500",
  },
};

export const MOCK_USERS: UserRow[] = [
  {
    id: "1",
    name: "Lê Hoàng Nam",
    email: "nam.lh@editorial.vn",
    department: "Kỹ thuật",
    status: "high",
    activeDays: 28,
    logins: 142,
    score: 98.2,
  },
  {
    id: "2",
    name: "Phan Minh Anh",
    email: "anh.pm@editorial.vn",
    department: "Thiết kế",
    status: "view_only",
    activeDays: 15,
    logins: 45,
    score: 64.5,
  },
  {
    id: "3",
    name: "Trần Quốc Bảo",
    email: "bao.tq@editorial.vn",
    department: "Vận hành",
    status: "low",
    activeDays: 4,
    logins: 12,
    score: 32.1,
  },
  {
    id: "4",
    name: "Ngô Phương Linh",
    email: "linh.np@editorial.vn",
    department: "Truyền thông",
    status: "inactive",
    activeDays: 0,
    logins: 0,
    score: 5.0,
  },
];

export type ActivityItem = {
  id: string;
  title: string;
  tag: string;
  tagClass: string;
  timeLabel: string;
  description: string;
  iconTone: "emerald" | "blue" | "teal" | "red";
};

export type UserDetailExtras = {
  roleTitle: string;
  joinDateLabel: string;
  engagementLabel: string;
  totalActions: string;
  loginFrequencyLabel: string;
  topModule: string;
  modules: { name: string; percent: number }[];
  activities: ActivityItem[];
  devices: { icon: "laptop" | "phone"; label: string; sub: string }[];
  locationTitle: string;
  locationSubtitle: string;
};

function extrasForListUser(u: UserRow): UserDetailExtras {
  const top =
    u.status === "high"
      ? "Trung tâm Điều phối"
      : u.status === "view_only"
        ? "Báo cáo & Thống kê"
        : u.status === "low"
          ? "Hồ sơ bệnh viện"
          : "—";
  const richDevices =
    u.status === "high"
      ? [
          {
            icon: "laptop" as const,
            label: 'MacBook Pro 16"',
            sub: "macOS Sonoma 14.2",
          },
          {
            icon: "phone" as const,
            label: "iPhone 15 Pro",
            sub: "iOS 17.1",
          },
        ]
      : [
          {
            icon: "laptop" as const,
            label: "Windows PC",
            sub: "Chrome — Việt Nam",
          },
        ];
  const richLocation =
    u.status === "high"
      ? {
          locationTitle: "Trung tâm Chính",
          locationSubtitle: "New York, NY (Trụ sở)",
        }
      : {
          locationTitle: "Văn phòng",
          locationSubtitle: `${u.department} — Việt Nam`,
        };

  return {
    roleTitle:
      u.status === "high"
        ? `Trưởng nhóm ${u.department}`
        : `Nhân viên ${u.department}`,
    joinDateLabel: u.status === "high" ? "12 thg 10, 2021" : "01 thg 1, 2023",
    engagementLabel:
      u.status === "high"
        ? "Hạng Ưu tú"
        : u.status === "view_only"
          ? "Theo dõi"
          : u.status === "low"
            ? "Hạng Tiêu chuẩn"
            : "Không hoạt động",
    totalActions:
      u.status === "high"
        ? "14,282"
        : (u.logins * 42).toLocaleString("vi-VN"),
    loginFrequencyLabel:
      u.status === "high" ? "24/tháng" : `${Math.max(0, Math.round(u.logins / 6))}/tháng`,
    topModule: u.status === "high" ? "Trung tâm Điều phối" : top,
    modules:
      u.status === "high"
        ? [
            { name: "Trung tâm điều phối nội dung", percent: 84 },
            { name: "Kiểm tra & Tuân thủ", percent: 62 },
            { name: "Cấp quyền người dùng", percent: 28 },
          ]
        : [
            {
              name: "Trung tâm điều phối nội dung",
              percent: Math.round(Math.min(95, u.score)),
            },
            {
              name: "Kiểm tra & Tuân thủ",
              percent: Math.round(Math.min(80, u.score * 0.7)),
            },
            {
              name: "Cấp quyền người dùng",
              percent: Math.round(Math.min(50, u.score * 0.35)),
            },
          ],
    activities:
      u.status === "high"
        ? [
            {
              id: "a1",
              title: "Tạo mới hồ sơ",
              tag: "TẠO MỚI",
              tagClass: "bg-emerald-100 text-emerald-800",
              timeLabel: "10 phút trước",
              description:
                "Đã khởi tạo hồ sơ nhân sự mới cho phòng ban Thiết kế.",
              iconTone: "emerald",
            },
            {
              id: "a2",
              title: "Chỉnh sửa chính sách",
              tag: "SỬA ĐỔI",
              tagClass: "bg-blue-100 text-blue-800",
              timeLabel: "2 giờ trước",
              description:
                "Cập nhật các quy tắc bảo mật dữ liệu cho các tài liệu lưu trữ nội bộ.",
              iconTone: "blue",
            },
            {
              id: "a3",
              title: "Thêm người dùng vào nhóm",
              tag: "THÊM",
              tagClass: "bg-teal-100 text-teal-800",
              timeLabel: "5 giờ trước",
              description:
                "Đã cấp quyền truy cập nhóm 'Biên tập viên Cao cấp' cho nhân viên mới.",
              iconTone: "teal",
            },
            {
              id: "a4",
              title: "Xóa tệp tạm",
              tag: "XÓA",
              tagClass: "bg-red-100 text-red-800",
              timeLabel: "Hôm qua",
              description:
                "Dọn dẹp bộ nhớ hệ thống bằng cách xóa các bản nháp không còn sử dụng.",
              iconTone: "red",
            },
          ]
        : [
            {
              id: "x1",
              title: "Đăng nhập hệ thống",
              tag: "TRUY CẬP",
              tagClass: "bg-slate-100 text-slate-700",
              timeLabel: "Hôm nay",
              description: `Phiên làm việc từ ${u.email}.`,
              iconTone: "blue",
            },
            {
              id: "x2",
              title: "Cập nhật hồ sơ",
              tag: "SỬA ĐỔI",
              tagClass: "bg-blue-100 text-blue-800",
              timeLabel: "2 ngày trước",
              description: "Cập nhật thông tin liên hệ và phòng ban.",
              iconTone: "emerald",
            },
          ],
    devices: richDevices,
    ...richLocation,
  };
}

export function getUserDetail(userId: string | undefined): (UserRow & UserDetailExtras) | null {
  if (!userId) return null;
  const base = MOCK_USERS.find((u) => u.id === userId);
  if (!base) return null;
  return { ...base, ...extrasForListUser(base) };
}
