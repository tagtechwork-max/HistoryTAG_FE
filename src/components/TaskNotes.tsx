import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-hot-toast";
import { useConfirmDialog } from "../hooks/useConfirmDialog";

const API_ROOT = import.meta.env.VITE_API_URL || "";
// ✅ SockJS cần URL HTTP (không phải ws://), nó sẽ tự động upgrade sang WebSocket
// Nếu VITE_NOTIFICATION_STOMP_URL được set, dùng nó; nếu không, dùng API_ROOT + /ws
const WS_URL = import.meta.env.VITE_NOTIFICATION_STOMP_URL || `${API_ROOT}/ws`;

function authHeaders(extra?: Record<string, string>) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  } as Record<string, string>;
}

function fmt(dt?: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export type NoteDTO = {
  id: number;
  taskId: number;
  authorId: number;
  authorName?: string | null;
  content: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export default function TaskNotes({
  taskId,
  myRole,
  taskType = "implementation", // "implementation" | "maintenance"
}: {
  taskId: number | null | undefined;
  myRole?: string | null;
  taskType?: "implementation" | "maintenance";
}) {
  const [allNotes, setAllNotes] = useState<NoteDTO[]>([]);
  const [myNotes, setMyNotes] = useState<NoteDTO[]>([]);
  const [myNoteText, setMyNoteText] = useState("");
  const [loadingAllNotes, setLoadingAllNotes] = useState(false);
  const [loadingMyNotes, setLoadingMyNotes] = useState(false);
  const [savingMyNote, setSavingMyNote] = useState(false);
  const stompClientRef = useRef<any>(null);
  const subscriptionRef = useRef<any>(null);
  const notesContainerRef = useRef<HTMLDivElement | null>(null);
  const { ask: askConfirm, dialog: deleteNoteConfirmDialog } = useConfirmDialog();

  const currentUserId: number | null = React.useMemo(() => {
    try {
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const id = Number(parsed?.id ?? parsed?.userId);
        if (Number.isFinite(id) && id > 0) return id;
      }
    } catch {
      // ignore
    }
    const fallback = Number(localStorage.getItem("userId") || sessionStorage.getItem("userId") || 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }, []);

  const isAdmin: boolean = React.useMemo(() => {
    try {
      // Check từ localStorage.getItem("roles") - array of strings
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (rolesStr) {
        try {
          const roles = JSON.parse(rolesStr);
          if (Array.isArray(roles)) {
            if (roles.some((r: string) => r === "SUPERADMIN" || r === "ADMIN")) {
              return true;
            }
          }
        } catch {
          // ignore
        }
      }
      
      // Check từ localStorage.getItem("user") - object với roles array
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const roles = parsed?.roles;
        if (Array.isArray(roles)) {
          return roles.some((r: any) => {
            // Handle both string and object formats
            if (typeof r === "string") {
              return r === "SUPERADMIN" || r === "ADMIN";
            }
            // Handle object format: { roleId: number, roleName: string } or { id: number, roleName: string }
            const name = r?.roleName || r?.name || r?.authority;
            return name === "SUPERADMIN" || name === "ADMIN";
          });
        }
      }
    } catch {
      // ignore parsing errors
    }
    return false;
  }, []);

  const isSuperAdmin: boolean = React.useMemo(() => {
    try {
      // Check từ localStorage.getItem("roles") - array of strings
      const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
      if (rolesStr) {
        try {
          const roles = JSON.parse(rolesStr);
          if (Array.isArray(roles)) {
            if (roles.some((r: string) => r === "SUPERADMIN")) {
              return true;
            }
          }
        } catch {
          // ignore
        }
      }
      
      // Check từ localStorage.getItem("user") - object với roles array
      const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const roles = parsed?.roles;
        if (Array.isArray(roles)) {
          return roles.some((r: any) => {
            // Handle both string and object formats
            if (typeof r === "string") {
              return r === "SUPERADMIN";
            }
            // Handle object format: { roleId: number, roleName: string } or { id: number, roleName: string }
            const name = r?.roleName || r?.name || r?.authority;
            return name === "SUPERADMIN";
          });
        }
      }
    } catch {
      // ignore parsing errors
    }
    return false;
  }, []);

  const canAddNote = React.useMemo(() => {
     const role = (myRole || "").toLowerCase();
  // Owner hoặc supporter được thêm ghi chú
  // SUPERADMIN là ngoại lệ: được thêm ghi chú bất kể role
  // ADMIN chỉ được thêm nếu là owner hoặc supporter
  return (
    role === "owner" || 
    role === "supporter" ||
    isSuperAdmin  // SUPERADMIN là ngoại lệ
  );
}, [myRole, isSuperAdmin]);

  // debug: expose key permission values when component renders
  React.useEffect(() => {
    // Debug: log raw data from storage
    const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    // eslint-disable-next-line no-console
    // console.log("TaskNotes Render:", { 
    //   taskId, 
    //   myRole, 
    //   isAdmin, 
    //   isSuperAdmin, 
    //   canAddNote, 
    //   currentUserId,
    //   rolesFromStorage: rolesStr ? JSON.parse(rolesStr) : null,
    //   userRoles: userStr ? JSON.parse(userStr)?.roles : null
    // });
  }, [taskId, myRole, isAdmin, isSuperAdmin, canAddNote, currentUserId]);

  const apiBase = taskType === "maintenance" 
    ? `${API_ROOT}/api/v1/admin/maintenance/tasks`
    : `${API_ROOT}/api/v1/admin/implementation/tasks`;

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!taskId) return;

    const connectWebSocket = async () => {
      // Cleanup existing connection first
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          // ignore
        }
        subscriptionRef.current = null;
      }
      if (stompClientRef.current) {
        try {
          stompClientRef.current.deactivate();
        } catch (e) {
          // ignore
        }
        stompClientRef.current = null;
      }

      try {
        const [stompMod, sockjsMod] = await Promise.all([
          import("@stomp/stompjs"),
          import("sockjs-client")
        ]);

        const StompClient = stompMod.Client;
        const SockJS = sockjsMod.default;

        const token = authHeaders().Authorization?.replace("Bearer ", "") || "";
        // ✅ SECURITY FIX: Do NOT send token in query string (it will appear in logs)
        // Token is sent via STOMP connectHeaders instead
        const client = new StompClient({
          webSocketFactory: () => new SockJS(WS_URL) as any,
          connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
          reconnectDelay: 5000,
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
          onConnect: () => {
            const topic = `/topic/task-notes/${taskType}/${taskId}`;
            const subscription = client.subscribe(topic, (message: any) => {
              try {
                const data = JSON.parse(message.body);
                if (data.type === "new-note" && data.note) {
                  const newNote = data.note as NoteDTO;
                  // Check if note already exists to avoid duplicates
                  setAllNotes((prev) => {
                    if (prev.some((n) => n.id === newNote.id)) return prev;
                    return [...prev, newNote];
                  });
                  // If it's my note, also add to myNotes
                  const userId = currentUserId;
                  if (userId && newNote.authorId === userId) {
                    setMyNotes((prev) => {
                      if (prev.some((n) => n.id === newNote.id)) return prev;
                      return [...prev, newNote];
                    });
                  }
                  // Toast notification disabled - too many notifications if multiple users add notes
                } else if (data.type === "note-deleted" && data.noteId) {
                  const deletedNoteId = Number(data.noteId);
                  setAllNotes((prev) => prev.filter((n) => n.id !== deletedNoteId));
                  setMyNotes((prev) => prev.filter((n) => n.id !== deletedNoteId));
                }
              } catch (err) {
                console.error("Failed to parse WebSocket message:", err);
              }
            });
            subscriptionRef.current = subscription;
            // console.log(`[TaskNotes] Subscribed to ${topic}`);
          },
          onStompError: (frame: any) => {
            console.error("[TaskNotes] STOMP error:", frame);
          },
          onWebSocketClose: () => {
            // console.log("[TaskNotes] WebSocket closed");
            subscriptionRef.current = null;
          }
        });

        client.activate();
        stompClientRef.current = client;
      } catch (err) {
        console.error("[TaskNotes] Failed to connect WebSocket:", err);
      }
    };

    connectWebSocket();

    return () => {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          // ignore
        }
        subscriptionRef.current = null;
      }
      if (stompClientRef.current) {
        try {
          stompClientRef.current.deactivate();
        } catch (e) {
          // ignore
        }
        stompClientRef.current = null;
      }
    };
  }, [taskId, taskType]); // Removed currentUserId from dependencies

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    (async () => {
      setLoadingAllNotes(true);
      try {
        const res = await fetch(`${apiBase}/${taskId}/notes`, { headers: authHeaders(), credentials: "include" });
        if (!res.ok) return;
        const list = await res.json();
        if (alive && Array.isArray(list)) setAllNotes(list);
      } catch (err) {
        console.error("Failed to load all notes", err);
      } finally {
        if (alive) setLoadingAllNotes(false);
      }
    })();
    return () => { alive = false; };
  }, [taskId, apiBase]);

  useEffect(() => {
    if (!taskId) return;
    // allow owners, supporters, and SUPERADMIN to load their "my notes"
    const role = (myRole || "").toLowerCase();
    if (role !== "owner" && role !== "supporter" && !isSuperAdmin) return;
    let alive = true;
    (async () => {
      setLoadingMyNotes(true);
      try {
        const res = await fetch(`${apiBase}/${taskId}/notes/my`, { headers: authHeaders(), credentials: "include" });
        if (!res.ok) return;
        const list = await res.json();
        if (alive && Array.isArray(list)) {
          setMyNotes(list);
          if (list.length > 0) setMyNoteText("");
        }
      } catch (err) {
        console.error("Failed to load my notes", err);
      } finally {
        if (alive) setLoadingMyNotes(false);
      }
    })();
    return () => { alive = false; };
  }, [taskId, myRole]);

  // Auto-scroll to bottom when new note is added
  useEffect(() => {
    if (allNotes.length > 0 && notesContainerRef.current) {
      // Small delay to ensure DOM is updated with new note
      const timeoutId = setTimeout(() => {
        if (notesContainerRef.current) {
          notesContainerRef.current.scrollTo({
            top: notesContainerRef.current.scrollHeight,
            behavior: "smooth"
          });
        }
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [allNotes]);

  const handleSaveMyNote = async () => {
    if (!taskId) return;
    if (!canAddNote) {
      toast.error("Bạn không có quyền thêm ghi chú.");
      return;
    }
    const content = myNoteText.trim();
    if (!content) return toast.error("Nội dung ghi chú không được để trống");
    try {
      setSavingMyNote(true);
      const res = await fetch(`${apiBase}/${taskId}/notes/my`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`POST failed: ${res.status}`);
      const created = await res.json();
      // append safely
      setMyNotes((prev) => {
        try {
          const cid = Number((created as any).id);
          if (Number.isFinite(cid) && prev.some((p) => Number(p.id) === cid)) return prev;
        } catch {}
        return [...prev, created];
      });
      setAllNotes((prev) => {
        try {
          const cid = Number((created as any).id);
          if (Number.isFinite(cid) && prev.some((p) => Number(p.id) === cid)) return prev;
        } catch {}
        return [...prev, created];
      });
      setMyNoteText("");
      toast.success("Đã lưu ghi chú của bạn");
    } catch (err) {
      console.error("save note failed", err);
      toast.error("Lưu ghi chú thất bại, vui lòng thử lại");
    } finally {
      setSavingMyNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number, authorId?: number | string) => {
    if (!noteId || !taskId) return;
    // Phải vừa là admin vừa là tác giả mới được xóa
    const isAuthor = currentUserId && Number(authorId) === currentUserId;
    if (!isAdmin || !isAuthor) {
      toast.error("Bạn không có quyền xóa ghi chú này. Chỉ ADMIN/SUPERADMIN là tác giả của ghi chú mới được phép xóa.");
      return;
    }
    const ok = await askConfirm({
      title: "Xóa ghi chú?",
      message: "Bạn có chắc muốn xóa ghi chú này?",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${apiBase}/${taskId}/notes/${noteId}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      if (res.status === 204 || res.ok) {
        setAllNotes((prev) => prev.filter((n) => n.id !== noteId));
        setMyNotes((prev) => prev.filter((n) => n.id !== noteId));
        toast.success("Đã xóa ghi chú");
        return;
      }
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Lỗi ${res.status}`);
    } catch (err: any) {
      console.error("Lỗi xóa ghi chú:", err);
      toast.error("Xóa thất bại: " + (err.message || "Lỗi không xác định"));
    }
  };

  return (
    <div className="pt-4 border-t border-dashed border-gray-200 dark:border-gray-800 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 font-medium">Ghi chú khác</p>
          {loadingAllNotes && <span className="text-xs text-gray-400">Đang tải...</span>}
        </div>

        {allNotes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Chưa có ghi chú nào.</p>
        ) : (
          <div 
            ref={notesContainerRef}
            className="space-y-2 max-h-48 overflow-y-auto pr-1 [scrollbar-width:none] 
    [-ms-overflow-style:none] 
    [&::-webkit-scrollbar]:hidden">
            {allNotes.map((n) => (
              <div key={n.id} className="relative rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{n.authorName || `User-${n.authorId}`}</span>
                  <span className="text-[11px] text-gray-400">{n.updatedAt ? fmt(n.updatedAt) : n.createdAt ? fmt(n.createdAt) : ""}</span>
                </div>
                <div className="whitespace-pre-wrap break-words">{n.content}</div>
                {isAdmin && currentUserId && Number(n.authorId) === currentUserId && (
                  <button
                    type="button"
                    onClick={() => { void handleDeleteNote(n.id, n.authorId); }}
                    title="Xóa ghi chú"
                    className="absolute right-2 bottom-1 text-xs text-red-600 px-0  rounded dark:bg-gray-800/60"
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canAddNote && (
        <div>
          <textarea
            className="w-full min-h-[80px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-y"
            placeholder="Nhập ghi chú riêng của bạn cho công việc này..."
            value={myNoteText}
            onChange={(e) => setMyNoteText(e.target.value)}
            disabled={savingMyNote}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => { void handleSaveMyNote(); }}
              disabled={savingMyNote || loadingMyNotes}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingMyNote ? "Đang lưu..." : "Lưu ghi chú"}
            </button>
          </div>
        </div>
      )}
      {deleteNoteConfirmDialog}
    </div>
  );
}
