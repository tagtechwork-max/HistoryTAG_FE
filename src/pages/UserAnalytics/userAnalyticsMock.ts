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
