/** Upgrade legacy Cloudinary URLs without rewriting arbitrary HTTP hosts. */
export function normalizeSecureUrl<T extends string | null | undefined>(url: T): T {
  if (typeof url !== 'string') return url;
  return url.replace(
    /^http:\/\/res\.cloudinary\.com\//i,
    'https://res.cloudinary.com/'
  ) as T;
}
