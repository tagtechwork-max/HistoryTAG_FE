/**
 * Resolves stored avatar path to a usable <img src>. Full http(s) URLs are unchanged.
 * Relative paths (e.g. /uploads/...) are prefixed with VITE_API_URL when set.
 */
export function resolveAvatarSrc(
  avatarUrl: string | null | undefined
): string | null {
  if (avatarUrl == null) return null;
  const s = String(avatarUrl).trim();
  if (s === "") return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;

  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    ""
  );
  if (s.startsWith("/")) {
    return base ? `${base}${s}` : s;
  }
  return base ? `${base}/${s}` : s;
}
