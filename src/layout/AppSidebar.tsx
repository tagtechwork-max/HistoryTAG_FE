import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

// Giả sử các icon này được import từ một thư viện icon
import {
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  PageIcon,
  PlugInIcon,
  TableIcon,
  DocsIcon,
  BoxIconLine,
  TaskIcon,
  TimeIcon,
} from "../icons";
import { UserIcon } from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../contexts/AuthContext";

// Kiểu dữ liệu cho mục điều hướng
type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

// Danh sách mục điều hướng chính
const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    subItems: [
      { name: "Báo cáo tổng quan", path: "/home", pro: false },
      { name: "Thống kê triển khai", path: "/deployment-dashboard", pro: false },
    ],
  },
  {
    icon: <CalenderIcon />,
    name: "Lịch",
    subItems: [
      { name: "Lịch cá nhân", path: "/calendar", pro: false },
      { name: "Lịch phòng kinh doanh", path: "/calendar/business", pro: false },
      { name: "Lịch team triển khai", path: "/calendar/deployment", pro: false },
      { name: "Lịch team bảo trì", path: "/calendar/maintenance", pro: false },
    ],
  },
  // {
  //   name: "Biểu mẫu",
  //   icon: <ListIcon />,
  //   subItems: [{ name: "Thành phần biểu mẫu", path: "/form-elements", pro: false }],
  // },
  {
    name: "Bảng dữ liệu",
    icon: <DocsIcon />,
    subItems: [
      { name: "Bệnh viện", path: "/hospitals", pro: false },
      { name: "Đơn vị HIS", path: "/his-sys", pro: false }
    ],
  },
  {
    name: "Phòng kinh doanh",
    icon: <BoxIconLine />,
    subItems: [
      { name: "Hợp đồng kinh doanh", path: "/admin/business", pro: false },
      { name: "Hợp đồng bảo trì", path: "/admin/maintain-contracts", pro: false },

    ],
  },
  {
    name: "Công việc",
    icon: <TaskIcon />,
    subItems: [
      // { name: "Công việc triển khai", path: "/implementation-tasks", pro: false },
      { name: "Công việc triển khai mới", path: "/implementation-tasks-new", pro: false },
      // { name: "Công việc DEV", path: "/dev-tasks", pro: false },
      { name: "Công việc bảo trì", path: "/maintenance-tasks", pro: false },
    ],
  },
  
  {
    name: "Phòng CSKH",
    icon: <BoxIconLine />,
    subItems: [
      { name: "Chăm sóc khách hàng", path: "/admin/hospital-care", pro: false },
    ],
  },
  {
    name: "Log OT",
    icon: <TimeIcon />,
    path: "/log-ot",
  },
  {
    name: "Phê duyệt OT",
    icon: <TimeIcon />,
    path: "/admin/log-ot-approval",
  },
];

// Danh sách mục điều hướng “Khác”
// const othersItems: NavItem[] = [
//   {
//     icon: <PieChartIcon />,
//     name: "Biểu đồ",
//     subItems: [
//       { name: "Biểu đồ đường", path: "/line-chart", pro: false },
//       { name: "Biểu đồ cột", path: "/bar-chart", pro: false },
//     ],
//   },
//   {
//     icon: <BoxCubeIcon />,
//     name: "Thành phần giao diện",
//     subItems: [
//       { name: "Cảnh báo", path: "/alerts", pro: false },
//       { name: "Ảnh đại diện", path: "/avatars", pro: false },
//       { name: "Huy hiệu", path: "/badge", pro: false },
//       { name: "Nút bấm", path: "/buttons", pro: false },
//       { name: "Hình ảnh", path: "/images", pro: false },
//       { name: "Video", path: "/videos", pro: false },
//     ],
//   },
//   {
//     icon: <PlugInIcon />,
//     name: "Xác thực",
//     subItems: [
//       { name: "Đăng nhập", path: "/signin", pro: false },
//       { name: "Đăng ký", path: "/signup", pro: false },
//     ],
//   },
// ];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Get user info to filter calendar menu
  const getUserInfo = () => {
    try {
      const storedUserRaw = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (storedUserRaw) {
        return JSON.parse(storedUserRaw);
      }
    } catch (e) {
      console.error("Error parsing user info:", e);
    }
    return null;
  };

  const getRoles = () => {
    try {
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (rolesStr) {
        return JSON.parse(rolesStr);
      }
    } catch (e) {
      console.error("Error parsing roles:", e);
    }
    return [];
  };

  const userInfo = getUserInfo();
  const roles = getRoles();
  const isSuperAdmin = roles.some((role: any) => {
    if (typeof role === "string") {
      return role.toUpperCase() === "SUPERADMIN" || role.toUpperCase() === "SUPER_ADMIN";
    }
    if (role && typeof role === "object") {
      const roleName = role.roleName || role.role_name || role.role;
      return typeof roleName === "string" && roleName.toUpperCase() === "SUPERADMIN";
    }
    return false;
  });

  const isAdmin = roles.some((role: any) => {
    if (typeof role === "string") {
      return role.toUpperCase() === "ADMIN";
    }
    if (role && typeof role === "object") {
      const roleName = role.roleName || role.role_name || role.role;
      return typeof roleName === "string" && roleName.toUpperCase() === "ADMIN";
    }
    return false;
  });

  const userTeam = userInfo?.team ? String(userInfo.team).toUpperCase() : null;
  const userDepartment = userInfo?.department ? String(userInfo.department).toUpperCase() : null;

  // activeTeam from AuthContext (JWT) overrides stored user.team when present
  const { activeTeam: authActiveTeam } = useAuth();
  const effectiveTeam = (authActiveTeam || userTeam || "").toString().toUpperCase();
  const isSalesTeam = effectiveTeam === "SALES";

  // Filter calendar menu items based on user role/team/department
  const getCalendarMenuItems = () => {
    // SuperAdmin sees all
    if (isSuperAdmin) {
      return [
        { name: "Lịch cá nhân", path: "/calendar", pro: false },
        { name: "Lịch phòng kinh doanh", path: "/calendar/business", pro: false },
        { name: "Lịch team triển khai", path: "/calendar/deployment", pro: false },
        { name: "Lịch team bảo trì", path: "/calendar/maintenance", pro: false },
      ];
    }

    // Default: only personal calendar
    const items = [{ name: "Lịch cá nhân", path: "/calendar", pro: false }];

    // Add business calendar for SALES team or BUSINESS department
    if (userTeam === "SALES" || userDepartment === "BUSINESS") {
      items.push({ name: "Lịch phòng kinh doanh", path: "/calendar/business", pro: false });
    }

    // Add deployment calendar for DEPLOYMENT team
    if (userTeam === "DEPLOYMENT") {
      items.push({ name: "Lịch team triển khai", path: "/calendar/deployment", pro: false });
    }

    // Add maintenance calendar for MAINTENANCE team
    if (userTeam === "MAINTENANCE") {
      items.push({ name: "Lịch team bảo trì", path: "/calendar/maintenance", pro: false });
    }

    return items;
  };

  // Create filtered nav items
  const filteredNavItems = navItems
    .filter((item) => {
      // Chỉ hiển thị menu "Phòng kinh doanh" cho user thuộc phòng kinh doanh hoặc SuperAdmin
      if (item.name === "Phòng kinh doanh") {
        return isSuperAdmin || userDepartment === "BUSINESS";
      }
      // Chỉ hiển thị menu "Công việc" cho user thuộc IT doanh hoặc SuperAdmin
      if (item.name === "Công việc") {
        return isSuperAdmin || userDepartment === "IT" ;
      }
      // Chỉ hiển thị menu "Phòng CSKH" cho user thuộc phòng kinh doanh hoặc SuperAdmin
      if (item.name === "Phòng CSKH") {
        return isSuperAdmin || userDepartment === "BUSINESS";
      }
      // Show "Phê duyệt OT" only for users who can approve: SuperAdmin always, or Admin with canApproveOt
      if (item.name === "Phê duyệt OT") {
        if (isSuperAdmin) return true;
        if (isAdmin && userInfo?.canApproveOt === true) return true;
        return false;
      }
      return true;
    })
    .map((item) => {
      if (item.name === "Lịch" && item.subItems) {
        return {
          ...item,
          subItems: getCalendarMenuItems(),
        };
      }
      // Ẩn "Thống kê triển khai" cho tài khoản phòng kinh doanh (SALES)
      if (item.name === "Dashboard" && item.subItems && isSalesTeam) {
        return {
          ...item,
          subItems: item.subItems.filter((sub) => sub.path !== "/deployment-dashboard"),
        };
      }
      return item;
    });

  // Kiểm tra xem đường dẫn hiện tại có trùng khớp hay không
  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  // // Tự động mở submenu nếu trùng đường dẫn hiện tại
  // useEffect(() => {
  //   let submenuMatched = false;
  //   ["main", "others"].forEach((menuType) => {
  //     const items = menuType === "main" ? navItems : othersItems;
  //     items.forEach((nav, index) => {
  //       if (nav.subItems) {
  //         nav.subItems.forEach((subItem) => {
  //           if (isActive(subItem.path)) {
  //             setOpenSubmenu({
  //               type: menuType as "main" | "others",
  //               index,
  //             });
  //             submenuMatched = true;
  //           }
  //         });
  //       }
  //     });
  //   });

  //   if (!submenuMatched) {
  //     setOpenSubmenu(null);
  //   }
  // }, [location, isActive]);

  // Tính chiều cao submenu để làm hiệu ứng mở/đóng
  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  // Xử lý bật/tắt submenu
  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  // Hàm render danh sách menu
  const renderMenuItems = (items: NavItem[], menuType: "main" | "others") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
                } cursor-pointer ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
                }`}
            >
              <span
                className={`menu-item-icon-size  ${openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                  }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${openSubmenu?.type === menuType &&
                      openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                    }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                className={`menu-item group ${isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                  }`}
              >
                <span
                  className={`menu-item-icon-size ${isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                    }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-4 h-4 flex items-center justify-center text-gray-400">
                          {(() => {
                            switch (subItem.name) {
                              case "Bệnh viện":
                                return <TableIcon className="w-4 h-4" />;
                              case "Đơn vị HIS":
                                return <PlugInIcon className="w-4 h-4" />;
                              case "Người phụ trách":
                                return <UserIcon className="w-4 h-4" />;
                              default:
                                return <PageIcon className="w-4 h-4" />;
                            }
                          })()}
                        </span>
                        <span>{subItem.name}</span>
                      </div>
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                              } menu-dropdown-badge`}
                          >
                            mới
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                              } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-30 border-r border-gray-200 
        ${isExpanded || isMobileOpen
          ? "w-[290px]"
          : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="py-8 flex justify-center">
        <Link to="/home" className="block">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <img
                className="dark:hidden mx-auto"
                src="/images/logo/logo.png"
                alt="Logo"
                width={150}
                height={40}
              />
              <img
                className="hidden dark:block mx-auto"
                src="/images/logo/logo.png"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <img
              className="mx-auto"
              src="/images/logo/logo.png"
              alt="Logo"
              width={32}
              height={32}
            />
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(filteredNavItems, "main")}
            </div>
            <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  ""
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {/* {renderMenuItems(othersItems, "others")} */}
            </div>
          </div>
        </nav>
        {isExpanded || isHovered || isMobileOpen}
      </div>
    </aside>
  );
};

export default AppSidebar;
