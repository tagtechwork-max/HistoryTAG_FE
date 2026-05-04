import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  TableIcon,
  PlugInIcon,
  PageIcon,
  GroupIcon,
  UserCircleIcon,
  TaskIcon,
  DocsIcon,
  BoxIconLine,
  DollarLineIcon,
  BoltIcon,
  CalenderIcon,
  TimeIcon,
} from "../icons";
import { useSidebar } from "../context/SidebarContext";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

// Super Admin Menu Items
const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    subItems: [
      { name: "Báo cáo tổng quan", path: "/superadmin/home", pro: false },
      { name: "Thống kê triển khai", path: "/superadmin/deployment-dashboard", pro: false },
    ],
  },
  {
    icon: <CalenderIcon />,
    name: "Lịch",
    subItems: [
      { name: "Lịch cá nhân", path: "/superadmin/calendar", pro: false },
      { name: "Lịch phòng kinh doanh", path: "/superadmin/calendar/business", pro: false },
      { name: "Lịch team triển khai", path: "/superadmin/calendar/deployment", pro: false },
      { name: "Lịch team bảo trì", path: "/superadmin/calendar/maintenance", pro: false },
    ],
  },
  {
    name: "Quản lý người dùng",
    icon: <GroupIcon />,
    subItems: [
      { name: "Danh sách người dùng", path: "/superadmin/users", pro: false },
      { name: "Danh sách hoạt động", path: "/superadmin/user-analytics", pro: false },
    ],
  },
  {
    name: "Dữ liệu",
    icon: <DocsIcon />,
    subItems: [
      { name: "Bệnh viện", path: "/superadmin/hospitals", pro: false },
      { name: "Đơn vị HIS", path: "/superadmin/his-systems", pro: false },
      { name: "Cơ sở hành chính công", path: "/superadmin/hcc-facilities", pro: false },
      { name: "Đại lý", path: "/superadmin/agencies", pro: false },
      { name: "Phần cứng", path: "/superadmin/hardware", pro: false },
    ],
  },
  {
    name: "Phòng Kinh doanh",
    icon: <BoxIconLine />,
    subItems: [
      { name: "Hợp đồng kinh doanh", path: "/superadmin/business", pro: false },
      { name: "Hợp đồng bảo trì", path: "/superadmin/maintain-contracts", pro: false },

    ],
  },
  {
    name: "Công việc",
    icon: <TaskIcon />,
    subItems: [
      // { name: "Công việc Triển khai ", path: "/superadmin/implementation-tasks", pro: false },gg
      { name: "Công việc triển khai", path: "/superadmin/implementation-tasks-new", pro: false },
      // { name: "Công việc Dev", path: "/superadmin/dev-tasks", pro: false },
      { name: "Công việc Bảo Trì", path: "/superadmin/maintenance-tasks", pro: false },
    ],
  },
  
  {
    name: "Phòng CSKH",
    icon: <BoxIconLine />,
    subItems: [
      { name: "Chăm sóc khách hàng", path: "/superadmin/hospital-care", pro: false },
      // { name: "Viện có hợp đồng", path: "/superadmin/hospitals-with-contracts", pro: false },
    ],
  },

  {
    name: "Tiện ích",
    icon: <PlugInIcon />,
    subItems: [
      { name: "Bản đồ bệnh viện", path: "/superadmin/utility/map-hospitals", pro: false },
      { name: "Link tài liệu", path: "/superadmin/utility/document-links", pro: false },
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
    path: "/superadmin/log-ot",
  },
];

const SuperAdminSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenSubmenu({ type: "main", index });
            submenuMatched = true;
          }
        });
      }
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `main-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (prevOpenSubmenu && prevOpenSubmenu.index === index) {
        return null;
      }
      return { type: "main", index };
    });
  };

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index)}
              className={`menu-item group ${openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
                } cursor-pointer ${!isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"
                }`}
            >
              <span
                className={`menu-item-icon-size  ${openSubmenu?.index === index
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
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${openSubmenu?.index === index ? "rotate-180 text-brand-500" : ""
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
                  className={`menu-item-icon-size ${isActive(nav.path) ? "menu-item-icon-active" : "menu-item-icon-inactive"
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
                subMenuRefs.current[`main-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.index === index ? `${subMenuHeight[`main-${index}`]}px` : "0px",
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
                                return <PageIcon className="w-4 h-4" />;
                              case "Đơn vị HIS":
                                return <PlugInIcon className="w-4 h-4" />;
                              case "Đại lý":
                                return <DollarLineIcon className="w-4 h-4" />;
                              case "Phần cứng":
                                return <BoltIcon className="w-4 h-4" />;
                              case "Danh sách người dùng":
                                return <UserCircleIcon className="w-4 h-4" />;
                              case "Công việc Triển khai ":
                              case "Công việc triển khai ":
                                return <CalenderIcon className="w-4 h-4" />;
                              default:
                                return <TableIcon className="w-4 h-4" />;
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
      className={`fixed flex flex-col top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 lg:z-30 lg:mt-0
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
        <Link to="/superadmin/home" className="block">
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
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Super Admin"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(navItems)}
            </div>
          </div>
        </nav>
        {isExpanded || isHovered || isMobileOpen}
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;

