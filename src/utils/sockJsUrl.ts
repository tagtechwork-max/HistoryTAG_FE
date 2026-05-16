/**
 * Browser WebSocket / SockJS reject URLs that contain a fragment (#...).
 * Strip fragments from build-time env URLs.
 */
export function stripUrlFragmentForWebSocket(url: string): string {
  if (!url || typeof url !== "string") return "/ws";
  const i = url.indexOf("#");
  return i >= 0 ? url.slice(0, i).trimEnd() : url;
}
