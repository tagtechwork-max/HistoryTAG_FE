import "./SidebarTagLogo.css";

export default function SidebarTagLogo({ expanded }: { expanded: boolean }) {
  const logo = (
    <img
      className="mx-auto"
      src="/images/logo/logo.png"
      alt="TAG Technology Group"
      width={expanded ? 150 : 32}
      height={expanded ? 40 : 32}
    />
  );

  return expanded ? <span className="sidebar-noel-logo">{logo}</span> : logo;
}
