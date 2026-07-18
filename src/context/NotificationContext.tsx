import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  getNotifications as apiGetNotifications,
  getUnreadCount as apiGetUnreadCount,
  markAsRead as apiMarkAsRead,
} from "../api/notification.api";
import {
  AUTH_TOKEN_REFRESHED_EVENT,
  getAuthToken,
  getStoredAccessToken,
  isTokenExpired,
  tryRefreshAccessToken,
} from "../api/client";
import { stripUrlFragmentForWebSocket } from "../utils/sockJsUrl";

type Notification = any;

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  // the latest realtime notification (transient) for UI to show an in-app toast
  liveNotification?: Notification | null;
  loadNotifications: (limit?: number) => Promise<void>;
  loadUnread: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  clearNotifications: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const useNotification = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [authToken, setAuthToken] = useState<string | null>(getAuthToken());
  const [authEventVersion, setAuthEventVersion] = useState(0);
  const MAX_NOTIFICATIONS = 200;

  const esRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastNotificationsLoadAtRef = useRef(0);
  const lastUnreadLoadAtRef = useRef(0);

  const clampList = (list: Notification[]) => {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_NOTIFICATIONS);
  };

  const upsertNotification = (incoming: Notification): boolean => {
    if (!incoming) return false;
    let inserted = false;
    setNotifications((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const filtered = safePrev.filter((n) => !n || n.id !== incoming.id);
      inserted = filtered.length === safePrev.length;
      const next = [incoming, ...filtered];
      return clampList(next);
    });
    return inserted;
  };

  const loadNotifications = async (limit = 50) => {
    const now = Date.now();
    if (now - lastNotificationsLoadAtRef.current < 1500) return;
    lastNotificationsLoadAtRef.current = now;

    const currentPath = window.location.pathname;
    const isAuthPage =
      currentPath === "/signin" ||
      currentPath === "/signup" ||
      currentPath === "/forgot-password" ||
      currentPath === "/reset-password";

    if (isAuthPage) {
      return;
    }

    try {
      const safeLimit = Math.min(limit, MAX_NOTIFICATIONS);
      const list = await apiGetNotifications(safeLimit);
      // console.debug("[NotificationContext] loadNotifications got:", Array.isArray(list) ? list.length : typeof list);
      setNotifications(clampList(list || []));
    } catch (error: any) {
      // ✅ Ignore silent errors (401 khi chưa login)
      if (error?.silent) return;
      // ignore other errors
    }
  };

  const loadUnread = async () => {
    const now = Date.now();
    if (now - lastUnreadLoadAtRef.current < 1500) return;
    lastUnreadLoadAtRef.current = now;

    const currentPath = window.location.pathname;
    const isAuthPage =
      currentPath === "/signin" ||
      currentPath === "/signup" ||
      currentPath === "/forgot-password" ||
      currentPath === "/reset-password";

    if (isAuthPage) {
      return;
    }

    try {
      const c = await apiGetUnreadCount();
      // console.debug("[NotificationContext] loadUnread got:", c);
      setUnreadCount(c || 0);
    } catch (error: any) {
      // ✅ Ignore silent errors (401 khi chưa login)
      if (error?.silent) return;
      // ignore other errors
    }
  };

  const markAsRead = async (id: number) => {
    const currentPath = window.location.pathname;
    const isAuthPage =
      currentPath === "/signin" ||
      currentPath === "/signup" ||
      currentPath === "/forgot-password" ||
      currentPath === "/reset-password";

    if (isAuthPage) {
      // Vẫn update UI optimistically ngay cả khi không có token
      setNotifications((prev) => {
        const nxt = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        return nxt;
      });
      setUnreadCount((c) => Math.max(0, c - 1));
      return;
    }

    try {
      await apiMarkAsRead(id);
    } catch (error: any) {
      // ✅ Ignore silent errors (401 khi chưa login)
      if (error?.silent) {
        // Vẫn update UI optimistically
        setNotifications((prev) => {
          const nxt = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
          return nxt;
        });
        setUnreadCount((c) => Math.max(0, c - 1));
        return;
      }
      // ignore other server errors but still update UI optimistically
    }
    setNotifications((prev) => {
      const nxt = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      // console.debug("[NotificationContext] markAsRead updated notifications (id):", id);
      return nxt;
    });
    setUnreadCount((c) => {
      const newC = Math.max(0, c - 1);
      // console.debug("[NotificationContext] markAsRead unreadCount:", c, "->", newC);
      return newC;
    });
  };

  const clearNotifications = () => {
    // console.debug("[NotificationContext] clearNotifications called");
    setNotifications([]);
    setUnreadCount(0);
    setLiveNotification(null);
  };

  // Monitor token changes (login / logout / refresh)
  useEffect(() => {
    const syncToken = () => {
      const currentToken = getAuthToken() || getStoredAccessToken();
      setAuthToken((prev) => (prev === currentToken ? prev : currentToken));
    };

    syncToken();
    const checkTokenChange = setInterval(syncToken, 2000);
    const onTokenRefreshed = () => {
      syncToken();
      setAuthEventVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);

    return () => {
      clearInterval(checkTokenChange);
      window.removeEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);
    };
  }, []);

  // transient in-app notification state and native browser notification helper
  const [liveNotification, setLiveNotification] = useState<Notification | null>(null);
  const showTransientNotification = (n: Notification) => {
    try {
      setLiveNotification(n);
      // clear after 6s
      window.setTimeout(() => setLiveNotification(null), 6000);
    } catch {
      // ignore
    }

    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(n.title || "Thông báo", {
            body: n.message || n.title || "Bạn có thông báo mới",
            icon: n.actorAvatar || undefined,
          });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then((perm) => {
            if (perm === "granted") {
              new Notification(n.title || "Thông báo", {
                body: n.message || n.title || "Bạn có thông báo mới",
                icon: n.actorAvatar || undefined,
              });
            }
          }).catch(() => {});
        }
      }
    } catch {
      // ignore notification errors
    }
  };

  useEffect(() => {
    // console.log("[NotificationContext] useEffect started");
    
    const currentPath = window.location.pathname;
    const isAuthPage = currentPath === '/signin' || 
                      currentPath === '/signup' || 
                      currentPath === '/forgot-password' || 
                      currentPath === '/reset-password';
    
    // Chỉ dừng trên trang auth. Không dùng getAuthToken() ở đây — JWT hết hạn vẫn còn trong storage
    // thì getAuthToken() = null nhưng axios interceptor vẫn refresh và gọi API được (giống trang "Tất cả thông báo").
    if (isAuthPage) {
      clearNotifications();
      return;
    }
    
    // Bearer cho STOMP/SSE (có thể hết hạn): kết nối WS có thể fail tới khi refresh; HTTP list/unread vẫn chạy qua api client.
    const currentToken = getAuthToken() || getStoredAccessToken();
    
    // ✅ Request browser notification permission when user is logged in
    // This will show a popup asking for permission to show notifications
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          // Request permission in background (non-blocking)
          // User will see a browser popup asking for notification permission
          Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              console.log("[NotificationContext] Browser notification permission granted");
            } else if (permission === "denied") {
              console.log("[NotificationContext] Browser notification permission denied");
            }
          }).catch((err) => {
            console.debug("[NotificationContext] Failed to request notification permission:", err);
          });
        }
      }
    } catch (err) {
      console.debug("[NotificationContext] Error checking notification support:", err);
    }
    
    // ✅ Chỉ gọi API khi có token VÀ không ở trang auth
    // Defer so login navigation and dashboard first paint do not compete with notifications.
    const initialLoadTimer = window.setTimeout(() => {
      loadUnread();
      loadNotifications(20);
    }, 1200);

    // choose connection strategy: STOMP (preferred) -> SSE -> WebSocket -> polling
    const stompUrlRaw = import.meta.env.VITE_NOTIFICATION_STOMP_URL as string | undefined;
    const stompUrl = stompUrlRaw
      ? stripUrlFragmentForWebSocket(stompUrlRaw)
      : undefined;
    const stompDest = (import.meta.env.VITE_NOTIFICATION_STOMP_DEST as string | undefined) || "/user/queue/notifications";
    const sseUrl = import.meta.env.VITE_NOTIFICATION_SSE_URL as string | undefined;
    const wsUrl = import.meta.env.VITE_NOTIFICATION_WS_URL as string | undefined;

    // console.log("[NotificationContext] STOMP env", { stompUrl, stompDest, hasToken: !!currentToken });

    let reconnectAttempts = 0;
    let stompClientInstance: any = null;

    const attemptReconnect = () => {
      reconnectAttempts += 1;
      const wait = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempts, 6)));
      window.setTimeout(() => {
        if (esRef.current || wsRef.current || stompClientInstance) return;
        if (sseUrl) trySSE();
        if (wsUrl) tryWS();
        if (stompUrl) tryStomp();
      }, wait);
    };

    const trySSE = () => {
      if (!sseUrl) return false;
      try {
        const url = currentToken ? `${sseUrl}${sseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(currentToken)}` : sseUrl;
        const es = new EventSource(url as string);
        esRef.current = es;

        es.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            handlePayload(payload as any);
          } catch {
            // ignore
          }
        };

        es.onerror = () => {
          try { es.close(); } catch { /* ignore */ }
          esRef.current = null;
          attemptReconnect();
        };

        return true;
      } catch {
        return false;
      }
    };

    const tryWS = () => {
      if (!wsUrl) return false;
      try {
        // ✅ SECURITY FIX: Native WebSocket doesn't support custom headers
        // For native WebSocket, we should use cookie-based auth or STOMP instead
        // This fallback is kept for compatibility but should prefer STOMP
        const url = wsUrl;
        const ws = new WebSocket(url as string);
        wsRef.current = ws;

        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            handlePayload(payload as any);
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          attemptReconnect();
        };
        ws.onerror = () => {
          try { ws.close(); } catch { /* ignore */ }
          wsRef.current = null;
          attemptReconnect();
        };

        return true;
      } catch {
        return false;
      }
    };

    const tryStomp = async () => {
      // console.log("[NotificationContext] tryStomp called, stompUrl:", stompUrl);
      if (!stompUrl) {
          // console.log("[NotificationContext] No stompUrl, skipping STOMP");
          return false;
      }
      try {
        // Polyfill global for sockjs-client
        if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
          (window as any).global = window;
        }
        
        // console.log("[NotificationContext] Starting STOMP dynamic import...");
        // Dynamic import STOMP and SockJS
        let stompMod, sockjsMod;
        try {
          [stompMod, sockjsMod] = await Promise.all([
            import("@stomp/stompjs"),
            import("sockjs-client"),
          ]);
          // console.log("[NotificationContext] STOMP modules loaded successfully");
        } catch (importErr) {
          // console.error("[NotificationContext] Failed to import STOMP modules:", importErr);
          return false;
        }
        
        const StompClientClass = stompMod.Client;
        const SockJSClass = sockjsMod.default;
        // console.log("[NotificationContext] Creating STOMP client...");

        // ✅ SECURITY FIX: Do NOT send token in query string (it will appear in logs)
        // Token is sent via STOMP connectHeaders instead
        // Backend will read from Authorization header during STOMP CONNECT frame
        let client;
        try {
          client = new StompClientClass({
            webSocketFactory: () => {
              // console.log("[NotificationContext] Creating SockJS connection to:", stompUrl);
              return new SockJSClass(stompUrl as string);
            },
            connectHeaders: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
            reconnectDelay: 5000,
            debug: (_str) => {
                  // console.debug("[NotificationContext] STOMP debug:", _str);
              },
          });
        } catch (clientErr) {
            // console.error("[NotificationContext] Failed to create STOMP client:", clientErr);
          return false;
        }

        client.onConnect = () => {
          // console.log("[NotificationContext] STOMP connected successfully!");
          try {
            client.subscribe(stompDest, (msg: any) => {
              // console.log("[NotificationContext] Received STOMP message:", msg);
              if (msg.body) {
                try {
                  const parsed = JSON.parse(msg.body);
                  // Create a plain object to avoid any STOMP Frame prototype issues
                  const payload = JSON.parse(JSON.stringify(parsed));
                  // console.log("[NotificationContext] Parsed payload (plain object):", payload);
                  // console.log("[NotificationContext] payload.type direct access:", payload.type);
                  handlePayload(payload);
                } catch (parseErr) {
                  // console.error("[NotificationContext] Failed to parse message:", parseErr, "Raw body:", msg.body);
                }
              } else {
                    // console.warn("[NotificationContext] Message has no body:", msg);
              }
            });
            // console.log("[NotificationContext] Subscribed to:", stompDest);
          } catch (subErr) {
            // console.error("[NotificationContext] Failed to subscribe:", subErr);
          }
        };

        client.onStompError = (_frame: any) => {
          //  console.error("[NotificationContext] STOMP error:", frame);
          stompClientInstance = null;
          attemptReconnect();
        };

        client.onWebSocketClose = () => {
          // console.log("[NotificationContext] STOMP closed");
          stompClientInstance = null;
          attemptReconnect();
        };

        stompClientInstance = client;
        // console.log("[NotificationContext] Activating STOMP client...");
        client.activate();
        return true;
      } catch (err) {
        // console.error("[NotificationContext] STOMP init failed:", err);
        return false;
      }
    };

    const handlePayload = (rawPayload: any) => {
      // console.log("[NotificationContext] handlePayload processing:", rawPayload);
      if (!rawPayload) return;

      // If rawPayload is a JSON string, parse it first
      let payloadObj: any = rawPayload;
      if (typeof rawPayload === "string") {
        try {
          payloadObj = JSON.parse(rawPayload);
        } catch (e) {
          // console.warn("[NotificationContext] rawPayload is string but failed to parse:", e);
        }
      }

      // console.debug("[NotificationContext] payload keys:", payloadObj && typeof payloadObj === "object" ? Object.keys(payloadObj) : null);
      // Recursive helper to try parsing JSON strings
      const tryParseIfString = (v: any) => {
        if (typeof v !== "string") return v;
        const s = v.trim();
        if (!(s.startsWith("{") || s.startsWith("["))) return v;
        try {
          return JSON.parse(v);
        } catch (e) {
          try {
            // sometimes backslashes are double-escaped, try replace
            const cleaned = v.replace(/\\"/g, '\"');
            return JSON.parse(cleaned);
          } catch (e2) {
            // console.warn("[NotificationContext] tryParseIfString failed:", e2);
            return v;
          }
        }
      };

      // Normalize: try parse payloadObj.data if it's a string
      let finalData: any = payloadObj;
      try {
        if (payloadObj && payloadObj.data !== undefined && payloadObj.data !== null) {
          const parsed = tryParseIfString(payloadObj.data);
          if (parsed && typeof parsed === "object") finalData = parsed;
        }
      } catch (e) {
        // console.warn("[NotificationContext] error normalizing payload.data:", e);
      }

      // If finalData still contains a data string, try parse recursively
      if (finalData && finalData.data && typeof finalData.data === "string") {
        finalData.data = tryParseIfString(finalData.data);
      }

      // Detect type robustly
      let detectedType: any = undefined;
      if (payloadObj && typeof payloadObj === "object") {
        if (typeof payloadObj.type !== "undefined") detectedType = payloadObj.type;
      }
      if (!detectedType && finalData && typeof finalData === "object" && typeof finalData.type !== "undefined") detectedType = finalData.type;
      if (!detectedType && payloadObj && typeof payloadObj === "object") {
        const keys = Object.keys(payloadObj || {});
        const k = keys.find((x) => x && x.trim && x.trim().toLowerCase() === "type");
        if (k) detectedType = payloadObj[k];
      }
      if (!detectedType && finalData && typeof finalData === "object") {
        const keys = Object.keys(finalData || {});
        const k = keys.find((x) => x && x.trim && x.trim().toLowerCase() === "type");
        if (k) detectedType = finalData[k];
      }

      // console.log("[NotificationContext] Detected Type:", detectedType, "finalData keys:", finalData && typeof finalData === "object" ? Object.keys(finalData) : null);

      const looksLikeNotification = (obj: any) => {
        if (!obj || typeof obj !== "object") return false;
        return !!(obj.id || obj.title || obj.message || obj.link || obj.actorName || obj.actorAvatar);
      };

      const isNotification = detectedType === "notification" || looksLikeNotification(finalData) || looksLikeNotification(payloadObj);

      if (isNotification) {
        const notificationContent = (finalData && (finalData.title || finalData.message)) ? finalData : payloadObj;
        upsertNotification(notificationContent);
        try { showTransientNotification(notificationContent); } catch {}
        // console.log("[NotificationContext] Realtime notification received and applied");
        setUnreadCount((c) => {
          const newCount = c + 1;
          // console.log("[NotificationContext] Badge count:", c, "->", newCount);
          return newCount;
        });
        return;
      }

      if (detectedType === "unread-count") {
        const count = (finalData && (finalData.count ?? finalData)) || 0;
        setUnreadCount(Number(count) || 0);
        return;
      }

      if (detectedType === "refresh") {
        loadNotifications(MAX_NOTIFICATIONS);
        loadUnread();
        return;
      }

      if (payloadObj && payloadObj.id) {
        if (upsertNotification(payloadObj)) {
          try { showTransientNotification(payloadObj); } catch {}
          setUnreadCount((c) => c + 1);
        }
        return;
      }

      // console.warn("[NotificationContext] Unknown payload structure after normalization:", payloadObj);
    };

    // prefer STOMP -> SSE -> WS -> polling
    let connected = false;
    let pollInterval: number | null = null;
    let setupTimer: number | null = null;

    const setupConnections = async () => {
      // console.log("[NotificationContext] setupConnections started");
      if (stompUrl) {
        // console.log("[NotificationContext] Attempting STOMP connection...");
        connected = await tryStomp();
        // console.log("[NotificationContext] STOMP connection result:", connected);
      } else {
        // console.log("[NotificationContext] No stompUrl, skipping STOMP");
      }
      if (!connected && sseUrl) {
        // console.log("[NotificationContext] Attempting SSE connection...");
        connected = trySSE();
      }
      if (!connected && wsUrl) {
        // console.log("[NotificationContext] Attempting WS connection...");
        connected = tryWS();
      }

      if (!connected) {
        // console.log("[NotificationContext] No realtime connection, falling back to polling");
        loadUnread();
        
        // ✅ Polling với guard để không poll khi token expired hoặc ở auth page
        pollInterval = window.setInterval(() => {
          const currentPath = window.location.pathname;
          const isAuthPage = currentPath === '/signin' || 
                            currentPath === '/signup' || 
                            currentPath === '/forgot-password' || 
                            currentPath === '/reset-password';
          
          if (isAuthPage) {
            if (pollInterval) {
              window.clearInterval(pollInterval);
              pollInterval = null;
            }
            return;
          }
          
          const stored = getStoredAccessToken();
          if (stored && isTokenExpired(stored)) {
            void tryRefreshAccessToken().then((refreshed) => {
              if (refreshed) {
                loadUnread();
              }
            });
            return;
          }

          loadUnread();
        }, 10000);
      } else {
        // console.log("[NotificationContext] Realtime connection established!");
      }
    };

    setupTimer = window.setTimeout(() => {
      void setupConnections();
    }, 1500);

    return () => {
      window.clearTimeout(initialLoadTimer);
      if (setupTimer) window.clearTimeout(setupTimer);
      if (esRef.current) {
        try { esRef.current.close(); } catch { /* ignore */ }
        esRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      if (stompClientInstance) {
        try { stompClientInstance.deactivate(); } catch { /* ignore */ }
        stompClientInstance = null;
      }
      if (pollInterval) window.clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, authEventVersion]); // Re-run when auth changes or login navigation completes

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    liveNotification,
    loadNotifications,
    loadUnread,
    markAsRead,
    clearNotifications,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export default NotificationContext;
