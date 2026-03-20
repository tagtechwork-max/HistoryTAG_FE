import { useState, useMemo } from "react";
import { FiPlus, FiPhoneCall, FiSend, FiUser, FiMail, FiFileText, FiEdit2, FiTrash2, FiCalendar, FiX, FiMessageCircle } from "react-icons/fi";
import { FaViber } from "react-icons/fa";
import AddCareActivityForm, { CareActivityFormData } from "../Form/AddCareActivityForm";

/** Get current logged-in user display name from storage (same pattern as rest of app). */
function getCurrentUserDisplayName(): string {
  try {
    const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!raw) return "Người dùng";
    const parsed = JSON.parse(raw) as {
      fullname?: string | null;
      fullName?: string | null;
      username?: string | null;
      name?: string | null;
      email?: string | null;
    };
    const name =
      parsed.fullname ??
      parsed.fullName ??
      parsed.name ??
      parsed.username ??
      parsed.email;
    return typeof name === "string" && name.trim() ? name.trim() : "Người dùng";
  } catch {
    return "Người dùng";
  }
}

export interface CareActivity {
  id: number;
  date: string;
  timeAgo: string;
  type: "call" | "email" | "visit" | "note" | "zalo" | "viber" | "cong_van";
  title: string;
  description: string;
  outcome?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  nextAction?: string;
  nextFollowUpDate?: string;
  /** User who created this activity (display name or username). Shown at bottom of each entry. */
  createdBy?: string | null;
  createdByName?: string | null;
}

/** Optional meta passed when adding an activity so parent can set createdByName on the new item. */
export type CareActivityAddMeta = { createdByName: string };

interface CareHistoryTabProps {
  careHistory: CareActivity[];
  hospitalName: string;
  /** When adding, we pass (data, { createdByName: currentUser }). Parent should set createdByName on the new activity. */
  onAddActivity: (data: CareActivityFormData, meta?: CareActivityAddMeta) => void;
  onUpdateActivity?: (id: number, data: CareActivityFormData) => void;
  onDeleteActivity?: (id: number) => void;
}

export default function CareHistoryTab({ 
  careHistory, 
  hospitalName, 
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity 
}: CareHistoryTabProps) {
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<CareActivity | null>(null);
  const [dateFilter, setDateFilter] = useState<string>("");

  // Filter activities by date
  const filteredCareHistory = useMemo(() => {
    if (!dateFilter) return careHistory;
    
    const filterDate = new Date(dateFilter);
    filterDate.setHours(0, 0, 0, 0);
    
    return careHistory.filter(activity => {
      // Parse date from activity.date (format: "09:00, 18/09/2025" or ISO string)
      let activityDate: Date;
      try {
        if (activity.date.includes(",")) {
          // Format: "09:00, 18/09/2025"
          const datePart = activity.date.split(",")[1]?.trim();
          if (datePart) {
            const [day, month, year] = datePart.split("/");
            activityDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            activityDate = new Date(activity.date);
          }
        } else {
          activityDate = new Date(activity.date);
        }
        activityDate.setHours(0, 0, 0, 0);
        
        return activityDate.getTime() === filterDate.getTime();
      } catch {
        return false;
      }
    });
  }, [careHistory, dateFilter]);

  const handleSubmitActivity = (data: CareActivityFormData) => {
    if (editingActivity) {
      onUpdateActivity?.(editingActivity.id, data);
      setEditingActivity(null);
    } else {
      const createdByName = getCurrentUserDisplayName();
      onAddActivity(data, { createdByName });
    }
    setShowAddActivityModal(false);
  };

  const handleEditActivity = (activity: CareActivity) => {
    setEditingActivity(activity);
    setShowAddActivityModal(true);
  };

  const handleDeleteActivity = (id: number) => {
    if (confirm("Bạn có chắc chắn muốn xóa hoạt động này?")) {
      onDeleteActivity?.(id);
    }
  };

  const handleCloseModal = () => {
    setShowAddActivityModal(false);
    setEditingActivity(null);
  };

  const handleClearDateFilter = () => {
    setDateFilter("");
  };

  return (
    <div className="space-y-4">
      {/* Header with Filter and Add Button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Lịch sử chăm sóc khách hàng
        </h3>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Date Filter */}
          <div className="relative flex-1 sm:flex-initial">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FiCalendar className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full sm:w-auto pl-10 pr-8 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              placeholder="Lọc theo ngày"
            />
            {dateFilter && (
              <button
                onClick={handleClearDateFilter}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Xóa bộ lọc"
              >
                <FiX className="h-4 w-4" />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowAddActivityModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition shrink-0"
          >
            <FiPlus className="h-4 w-4" />
            Thêm hoạt động
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {filteredCareHistory.length === 0 ? (
          <div className="py-12 text-center">
            <FiCalendar className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {dateFilter 
                ? "Không có hoạt động nào trong ngày đã chọn"
                : "Chưa có hoạt động nào"}
            </p>
            {dateFilter && (
              <button
                onClick={handleClearDateFilter}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* Vertical Line - đặt ở container cha, chiều cao đủ lớn để không bị cắt khi scroll */}
            <div className="absolute left-5 top-0 w-0.5 bg-blue-200 dark:bg-blue-800 pointer-events-none z-0" 
                 style={{ height: filteredCareHistory.length > 6 ? '600px' : `${filteredCareHistory.length * 120}px` }}></div>
            
            <div className={`relative ${filteredCareHistory.length > 6 ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
              <div className="space-y-6">
              {filteredCareHistory.map((item, index) => (
            <div key={item.id} className="relative flex gap-4">
              {/* Icon */}
              <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                index === 0 
                  ? "bg-blue-500 border-blue-500 text-white" 
                  : "bg-white border-gray-300 text-gray-500 dark:bg-gray-800"
              }`}>
                {item.type === "call" ? (
                  <FiPhoneCall className="h-4 w-4" />
                ) : item.type === "email" ? (
                  <FiSend className="h-4 w-4" />
                ) : item.type === "visit" ? (
                  <FiUser className="h-4 w-4" />
                ) : item.type === "zalo" ? (
                  <FiMessageCircle className="h-4 w-4" />
                ) : item.type === "viber" ? (
                  <FaViber className="h-4 w-4" />
                ) : item.type === "cong_van" ? (
                  <FiFileText className="h-4 w-4" />
                ) : (
                  <FiFileText className="h-4 w-4" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      index === 0 
                        ? "bg-green-100 text-green-700" 
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}>
                      {item.timeAgo}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">- {(() => {
                      // Format date để hiển thị đẹp nếu là ISO format
                      if (item.date.includes("T")) {
                        try {
                          const [datePart, timePart] = item.date.split('T');
                          if (datePart && timePart) {
                            const [year, month, day] = datePart.split('-');
                            const [hours, minutes] = timePart.split(':');
                            return `${hours}:${minutes}, ${day}/${month}/${year}`;
                          }
                        } catch {}
                      }
                      return item.date;
                    })()}</span>
                    {item.outcome && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.outcome === "POSITIVE" ? "bg-green-100 text-green-700" :
                        item.outcome === "NEGATIVE" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {item.outcome === "POSITIVE" ? "Tích cực" :
                         item.outcome === "NEGATIVE" ? "Tiêu cực" : "Trung lập"}
                      </span>
                    )}
                  </div>
                  {(onUpdateActivity || onDeleteActivity) && (
                    <div className="flex items-center gap-1">
                      {onUpdateActivity && (
                        <button
                          onClick={() => handleEditActivity(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition dark:hover:bg-blue-900/20"
                          title="Sửa"
                        >
                          <FiEdit2 className="h-4 w-4" />
                        </button>
                      )}
                      {onDeleteActivity && (
                        <button
                          onClick={() => handleDeleteActivity(item.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition dark:hover:bg-red-900/20"
                          title="Xóa"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  {item.type === "call" && <FiPhoneCall className="h-4 w-4 inline-block mr-1.5 text-blue-600" />}
                  {item.type === "email" && <FiMail className="h-4 w-4 inline-block mr-1.5 text-purple-600" />}
                  {item.type === "visit" && <FiUser className="h-4 w-4 inline-block mr-1.5 text-green-600" />}
                  {item.type === "note" && <FiFileText className="h-4 w-4 inline-block mr-1.5 text-gray-600" />}
                  {item.type === "zalo" && <FiMessageCircle className="h-4 w-4 inline-block mr-1.5 text-indigo-600" />}
                  {item.type === "viber" && <FaViber className="h-4 w-4 inline-block mr-1.5" style={{ color: "#7360F2" }} />}
                  {item.type === "cong_van" && <FiFileText className="h-4 w-4 inline-block mr-1.5 text-orange-600" />}
                  {item.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {item.description}
                </p>
                {item.nextAction && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Hành động tiếp theo:</strong> {item.nextAction}
                    {item.nextFollowUpDate && (
                      <span className="ml-2">
                        (Follow up: {new Date(item.nextFollowUpDate).toLocaleString("vi-VN")})
                      </span>
                    )}
                  </div>
                )}
                {(item.createdByName ?? item.createdBy) ? (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    Người thêm: <span className="font-medium text-gray-600 dark:text-gray-300">{item.createdByName ?? item.createdBy}</span>
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    Người thêm: <span className="italic text-gray-400 dark:text-gray-500">Chưa cập nhật</span>
                  </div>
                )}
              </div>
            </div>
              ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Activity Modal */}
      <AddCareActivityForm
        isOpen={showAddActivityModal}
        onClose={handleCloseModal}
        onSubmit={handleSubmitActivity}
        hospitalName={hospitalName}
        editingActivity={editingActivity}
      />
    </div>
  );
}

