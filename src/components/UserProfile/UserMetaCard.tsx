import { useEffect, useMemo, useState } from "react";
import { getUserAccount, type UserResponseDTO } from "../../api/auth.api";

const fallbackAvatar = "/images/user/owner.jpg";

export default function UserMetaCard() {
  const [user, setUser] = useState<UserResponseDTO | null>(null);

  const userId = useMemo(() => {
    const stored = localStorage.getItem("userId") || sessionStorage.getItem("userId");
    return stored ? Number(stored) : undefined;
  }, []);


  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      const me = await getUserAccount(userId);
      setUser(me);
    };
    fetchData();

    // ✅ Lắng nghe sự kiện userUpdated để cập nhật avatar mới
    const handleUserUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ avatar?: string }>;
      if (customEvent.detail?.avatar) {
        setUser((prev) =>
          prev ? { ...prev, avatar: customEvent.detail.avatar } : { avatar: customEvent.detail.avatar } as any
        );
      }
    };

    window.addEventListener("userUpdated", handleUserUpdated);
    return () => window.removeEventListener("userUpdated", handleUserUpdated);
  }, [userId]);




  // === BẢNG DỊCH TIẾNG VIỆT ===
  const departmentMap: Record<string, string> = {
    IT: "Bộ phận kỹ thuật",
    ACCOUNTING: "Bộ phận kế toán",
  };

  const teamMap: Record<string, string> = {
    DEV: "Lập trình viên",
    DEPLOYMENT: "Triển khai",
    MAINTENANCE: "Bảo hành, bảo trì",
    SALES: "Kinh doanh",
    CUSTOMER_SERVICE: "Chăm sóc khách hàng",
  };

  const teamLabelShort: Record<string, string> = {
    DEV: "Phát triển",
    DEPLOYMENT: "Triển khai",
    MAINTENANCE: "Bảo trì",
    SALES: "Kinh doanh",
    CUSTOMER_SERVICE: "CSKH",
  };
  const getTeamLabel = (teamId: string) => teamLabelShort[teamId] || teamMap[teamId] || teamId;
  const isLeaderRole = (r: string | undefined) => r != null && String(r).toUpperCase() === "LEADER";

  const name = user?.fullname && user.fullname !== "Chưa cập nhật"
    ? user.fullname
    : user?.username ?? "Chưa cập nhật";

  // Đội chính: primaryTeam > team mà user là Leader > team cũ (user.team)
  const mainTeamId =
    user?.primaryTeam ??
    (user?.availableTeams && user?.teamRoles
      ? user.availableTeams.find((t) => user.teamRoles![t] === "LEADER") ?? null
      : null) ??
    user?.team ??
    null;

  const departmentVi =
    user?.department && departmentMap[user.department]
      ? departmentMap[user.department]
      : "Chưa cập nhật phòng ban";

  const teamsRaw = (user?.availableTeams && user.availableTeams.length > 0)
    ? user.availableTeams
    : (user?.team ? [user.team] : []);
  // Đội chính: ưu tiên primaryTeam từ API, không theo thứ tự "đội trên đầu" trong form vai trò
  const primaryTeamId =
    (user?.primaryTeam && teamsRaw.includes(user.primaryTeam) ? user.primaryTeam : null) ??
    (user?.teamRoles ? teamsRaw.find((t) => (user.teamRoles![t] != null && String(user.teamRoles![t]).toUpperCase() === "LEADER")) ?? null : null);
  const teams = primaryTeamId
    ? [primaryTeamId, ...teamsRaw.filter((t) => t !== primaryTeamId)]
    : teamsRaw;

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
          {/* Ảnh đại diện */}
          <div className="w-20 h-20 overflow-hidden border border-gray-200 rounded-full dark:border-gray-800">
            <img
              key={user?.avatar}
              src={user?.avatar || fallbackAvatar}
              alt={name}
              className="object-cover w-full h-full"
              onError={(e) => (e.currentTarget.src = fallbackAvatar)}
            />


          </div>

          {/* Thông tin */}
          <div className="order-3 xl:order-2">
            <h4 className="mb-1 text-lg font-semibold text-center text-gray-800 dark:text-white/90 xl:text-left">
              {name}
            </h4>

            <div className="flex flex-col items-center gap-2 text-center xl:flex-row xl:flex-wrap xl:items-center xl:gap-3 xl:text-left">
              <p className="text-sm text-gray-500 dark:text-gray-400">{departmentVi}</p>
              <div className="hidden h-3.5 w-px bg-gray-300 dark:bg-gray-700 xl:block"></div>
              {/* Team — giống view Chi tiết người dùng: tag từng đội + (Trưởng đội/Thành viên), đội chính có sao */}
              {teams.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-start">
                  {teams.map((teamId) => {
                    const role = user?.teamRoles?.[teamId] ?? "MEMBER";
                    const isLeader = isLeaderRole(role);
                    const isPrimary = primaryTeamId != null && teamId === primaryTeamId;
                    return (
                      <span
                        key={teamId}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                          isPrimary
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
                            : "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                        }`}
                      >
                        {getTeamLabel(teamId)}
                        {isPrimary && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold" title="Đội chính">★</span>
                        )}
                        <span className={isLeader ? "text-orange-600 dark:text-orange-400 font-semibold" : "text-gray-500 dark:text-gray-400"}>
                          ({isLeader ? "Trưởng đội" : "Thành viên"})
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Chưa cập nhật team</p>
              )}
              <div className="hidden h-3.5 w-px bg-gray-300 dark:bg-gray-700 xl:block"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Công Ty Cổ Phần Giải Pháp Công Nghệ TAG Việt Nam
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
