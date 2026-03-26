/**
 * Preserve hospital list pagination (?page=…) when navigating list → detail → list
 * (breadcrumb "Bệnh viện" must not drop the query string).
 */
export const IMPL_TASKS_LIST_SEARCH_KEY = "implTasksListSearch" as const;

export type ImplTasksLocationState = {
  [IMPL_TASKS_LIST_SEARCH_KEY]?: string;
};

export function parseListSearchFromState(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const v = (state as ImplTasksLocationState)[IMPL_TASKS_LIST_SEARCH_KEY];
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v;
}

/** React Router `to` for the implementation tasks list route */
export function implTasksListTo(basePath: string, listSearchFromState: string | undefined) {
  const raw = listSearchFromState?.trim() ?? "";
  const search = raw.startsWith("?") ? raw.slice(1) : raw;
  if (search) return { pathname: basePath, search };
  return { pathname: basePath };
}
