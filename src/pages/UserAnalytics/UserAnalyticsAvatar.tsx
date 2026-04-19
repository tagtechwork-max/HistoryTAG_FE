import { useMemo, useState } from "react";
import { resolveAvatarSrc } from "../../utils/avatarUrl";

type Props = {
  name: string;
  avatarUrl?: string | null;
  /** Tailwind size classes, e.g. h-10 w-10 or h-28 w-28 */
  className?: string;
  /** Initials text size when no image */
  initialsClassName?: string;
  /** Larger profile card on detail page (rounded-2xl + border) */
  variant?: "table" | "profile";
};

export default function UserAnalyticsAvatar({
  name,
  avatarUrl,
  className = "h-10 w-10",
  initialsClassName = "text-xs",
  variant = "table",
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = useMemo(() => resolveAvatarSrc(avatarUrl), [avatarUrl]);

  const initials = useMemo(() => {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [name]);

  const showImg = Boolean(src) && !imgFailed;

  const shell =
    variant === "profile"
      ? "rounded-2xl border-[3px] border-blue-500 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 shadow-inner"
      : "rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden font-bold ${shell} ${className}`}
    >
      {showImg ? (
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center select-none ${initialsClassName}`}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
