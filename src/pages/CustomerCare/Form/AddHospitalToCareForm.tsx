import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { FiX, FiSave, FiSearch, FiUser, FiCalendar, FiTag, FiAlertTriangle, FiEye } from "react-icons/fi";
import { searchHospitals } from "../../../api/business.api";
import { getCustomerCareUserOptions, createCustomerCare, updateCustomerCare, changeCustomerCareStatus, CustomerCareCreateRequestDTO, CustomerCareUpdateRequestDTO, getCustomerTypes, getActiveCareTasksByHospitalId, CustomerCareResponseDTO } from "../../../api/customerCare.api";

export interface AddHospitalToCareFormData {
  hospitalId: number | null;
  hospitalName: string;
  careType: string;
  status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  assignedUserId: number | null;
  assignedUserName: string;
  targetDate: string;
  nextFollowUpDate: string;
  notes: string;
  customerType?: string; // Enum: VIP, HIGH_VALUE, etc.
  customerTypeLabel?: string; // Display name (for display only, not sent to backend)
}

interface AddHospitalToCareFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AddHospitalToCareFormData) => void;
  editingData?: AddHospitalToCareFormData & { id: number } | null;
}

// Helper function để convert date string sang format cho backend
// Backend dùng LocalDateTime (không có timezone), nên gửi local time string
function convertDateToISO(dateString: string): string {
  if (!dateString) return "";
  // Nếu là date (YYYY-MM-DD), thêm time 00:00:00 (local time, không có timezone)
  if (dateString.length === 10) {
    return `${dateString}T00:00:00`;
  }
  // Nếu đã là datetime-local format (YYYY-MM-DDTHH:mm), thêm seconds
  if (dateString.includes("T")) {
    return dateString.length === 16 ? `${dateString}:00` : dateString;
  }
  return dateString;
}

const careTypes = [
  { value: "CONTRACT_RENEWAL", label: "Gia hạn hợp đồng" },
  { value: "UPSELL", label: "Bán thêm dịch vụ" },
  { value: "COMPLAINT_HANDLING", label: "Xử lý khiếu nại" },
  { value: "TECHNICAL_SUPPORT", label: "Hỗ trợ kỹ thuật" },
  { value: "RELATIONSHIP_CARE", label: "Chăm sóc định kỳ" },
  { value: "PAYMENT_ISSUE", label: "Vấn đề thanh toán" },
  { value: "CONTRACT_EXPIRY", label: "Hợp đồng sắp hết hạn" },
];

const careStatuses = [
  { value: "PENDING", label: "Chờ xử lý", color: "text-gray-600", icon: "⏳" },
  { value: "IN_PROGRESS", label: "Đang xử lý", color: "text-blue-600", icon: "🔄" },
  { value: "COMPLETED", label: "Hoàn thành", color: "text-green-600", icon: "✅" },
  { value: "CANCELLED", label: "Hủy bỏ", color: "text-red-600", icon: "❌" },
];

export default function AddHospitalToCareForm({
  isOpen,
  onClose,
  onSubmit,
  editingData,
}: AddHospitalToCareFormProps) {
  const [formData, setFormData] = useState<AddHospitalToCareFormData>({
    hospitalId: null,
    hospitalName: "",
    careType: "",
    priority: "MEDIUM",
    reason: "",
    assignedUserId: null,
    assignedUserName: "",
    targetDate: "",
    nextFollowUpDate: "",
    notes: "",
    customerType: undefined,
  });

  // Load customer types from API
  const [customerTypes, setCustomerTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingCustomerTypes, setLoadingCustomerTypes] = useState(false);
  
  // Active tasks warning
  const [activeTasks, setActiveTasks] = useState<CustomerCareResponseDTO[]>([]);
  const [loadingActiveTasks, setLoadingActiveTasks] = useState(false);

  // Load editing data when modal opens
  useEffect(() => {
    if (editingData) {
      setFormData({
        hospitalId: editingData.hospitalId,
        hospitalName: editingData.hospitalName,
        careType: editingData.careType,
        status: editingData.status,
        priority: editingData.priority,
        reason: editingData.reason,
        assignedUserId: editingData.assignedUserId,
        assignedUserName: editingData.assignedUserName,
        targetDate: editingData.targetDate, // Đã được format trong HospitalCareList
        nextFollowUpDate: editingData.nextFollowUpDate, // Đã được format trong HospitalCareList
        notes: editingData.notes,
        customerType: editingData.customerType || undefined,
      });
      setHospitalSearch(editingData.hospitalName);
    } else {
      // Reset form when adding new
      setFormData({
        hospitalId: null,
        hospitalName: "",
        careType: "",
        priority: "MEDIUM",
        reason: "",
        assignedUserId: null,
        assignedUserName: "",
        targetDate: "",
        nextFollowUpDate: "",
        notes: "",
        customerType: undefined,
      });
      setHospitalSearch("");
      setUserSearch("");
    }
  }, [editingData, isOpen]);

  const [hospitalSearch, setHospitalSearch] = useState("");
  const [showHospitalDropdown, setShowHospitalDropdown] = useState(false);
  const [hospitals, setHospitals] = useState<Array<{ id: number; label: string; subLabel?: string }>>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [users, setUsers] = useState<Array<{ id: number; label: string; subLabel?: string; phone?: string | null }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hospitalDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  
  // Debounce search hospitals
  useEffect(() => {
    if (!isOpen) return;
    
    const timeoutId = setTimeout(async () => {
      if (hospitalSearch.trim().length >= 2) {
        setLoadingHospitals(true);
        try {
          const results = await searchHospitals(hospitalSearch.trim());
          setHospitals(Array.isArray(results) ? results : []);
        } catch (error) {
          console.error("Error searching hospitals:", error);
          setHospitals([]);
        } finally {
          setLoadingHospitals(false);
        }
      } else {
        setHospitals([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [hospitalSearch, isOpen]);

  // Load users on mount and when user search changes
  useEffect(() => {
    if (!isOpen) return;
    
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const userOptions = await getCustomerCareUserOptions();
        setUsers(userOptions);
      } catch (error) {
        console.error("Error loading users:", error);
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [isOpen]);
  
  // Check active tasks when hospital is selected (only when adding new, not editing)
  useEffect(() => {
    if (!isOpen || editingData || !formData.hospitalId) {
      setActiveTasks([]);
      return;
    }
    
    const checkActiveTasks = async () => {
      setLoadingActiveTasks(true);
      try {
        const tasks = await getActiveCareTasksByHospitalId(formData.hospitalId!);
        setActiveTasks(tasks);
      } catch (error) {
        console.error("Error loading active tasks:", error);
        setActiveTasks([]);
      } finally {
        setLoadingActiveTasks(false);
      }
    };
    
    checkActiveTasks();
  }, [formData.hospitalId, isOpen, editingData]);

  // Load customer types from API
  useEffect(() => {
    if (!isOpen) return;
    
    const loadCustomerTypes = async () => {
      setLoadingCustomerTypes(true);
      try {
        const types = await getCustomerTypes();
        setCustomerTypes(types);
      } catch (error) {
        console.error("Error loading customer types:", error);
        setCustomerTypes([]);
      } finally {
        setLoadingCustomerTypes(false);
      }
    };

    loadCustomerTypes();
  }, [isOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (hospitalDropdownRef.current && !hospitalDropdownRef.current.contains(event.target as Node)) {
        setShowHospitalDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    if (showHospitalDropdown || showUserDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHospitalDropdown, showUserDropdown]);

  const filteredHospitals = hospitals.filter((h) =>
    h.label.toLowerCase().includes(hospitalSearch.toLowerCase()) ||
    (h.subLabel && h.subLabel.toLowerCase().includes(hospitalSearch.toLowerCase()))
  );

  const filteredUsers = users.filter((u) =>
    u.label.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.subLabel && u.subLabel.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.hospitalId) {
      toast.error("Vui lòng chọn bệnh viện");
      return;
    }
    if (!formData.careType) {
      toast.error("Vui lòng chọn loại chăm sóc");
      return;
    }
    if (!formData.reason.trim()) {
      toast.error("Vui lòng nhập lý do cần chăm sóc");
      return;
    }
    if (!formData.targetDate) {
      toast.error("Vui lòng chọn ngày mục tiêu");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingData) {
        // Update existing care
        const updatePayload: CustomerCareUpdateRequestDTO = {
          hospitalId: formData.hospitalId || undefined,
          priority: formData.priority,
          reason: formData.reason || undefined,
          notes: formData.notes || undefined,
          assignedUserId: formData.assignedUserId || undefined,
          targetDate: formData.targetDate ? convertDateToISO(formData.targetDate) : undefined,
          nextFollowUpDate: formData.nextFollowUpDate ? convertDateToISO(formData.nextFollowUpDate) : undefined,
          customerType: formData.customerType || undefined,
        };
        await updateCustomerCare(editingData.id, updatePayload);

        // Nếu status thay đổi, gọi API đổi trạng thái
        if (formData.status && formData.status !== editingData.status) {
          await changeCustomerCareStatus(editingData.id, formData.status);
        }
      } else {
        // Create new care
        const createPayload: CustomerCareCreateRequestDTO = {
          hospitalId: formData.hospitalId!,
          careType: formData.careType,
          priority: formData.priority,
          reason: formData.reason,
          notes: formData.notes || undefined,
          assignedUserId: formData.assignedUserId || undefined,
          targetDate: convertDateToISO(formData.targetDate),
          nextFollowUpDate: formData.nextFollowUpDate ? convertDateToISO(formData.nextFollowUpDate) : undefined,
          customerType: formData.customerType || undefined,
        };
        await createCustomerCare(createPayload);
      }
      
      // Call parent onSubmit callback
      onSubmit(formData);
      
      // Reset form only if not editing
      if (!editingData) {
        setFormData({
          hospitalId: null,
          hospitalName: "",
          careType: "",
          priority: "MEDIUM",
          reason: "",
          assignedUserId: null,
          assignedUserName: "",
          targetDate: "",
          nextFollowUpDate: "",
          notes: "",
          customerType: undefined,
        });
        setHospitalSearch("");
        setUserSearch("");
      }
    } catch (error: any) {
      console.error("Error submitting form:", error);
      const errorMessage = error?.response?.data?.message || error?.message || "Có lỗi xảy ra khi lưu dữ liệu";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form when closing
    setFormData({
      hospitalId: null,
      hospitalName: "",
      careType: "",
      priority: "MEDIUM",
      reason: "",
      assignedUserId: null,
      assignedUserName: "",
      targetDate: "",
      nextFollowUpDate: "",
      notes: "",
      customerType: undefined,
    });
    setHospitalSearch("");
    setUserSearch("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col dark:bg-gray-800">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingData ? "Sửa thông tin chăm sóc" : "Thêm bệnh viện vào danh sách chăm sóc"}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Bệnh viện */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bệnh viện <span className="text-red-500">*</span>
            </label>
            <div className="relative" ref={hospitalDropdownRef}>
              <input
                type="text"
                value={hospitalSearch}
                onChange={(e) => {
                  setHospitalSearch(e.target.value);
                  setShowHospitalDropdown(true);
                }}
                onFocus={() => setShowHospitalDropdown(true)}
                placeholder="Tìm kiếm bệnh viện..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                required
              />
              {formData.hospitalName && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Đã chọn: <span className="font-medium">{formData.hospitalName}</span>
                </div>
              )}
              {showHospitalDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto dark:bg-gray-700 dark:border-gray-600">
                  {loadingHospitals ? (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Đang tìm kiếm...</div>
                  ) : filteredHospitals.length > 0 ? (
                    filteredHospitals.map((hospital) => (
                      <button
                        key={hospital.id}
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            hospitalId: hospital.id,
                            hospitalName: hospital.label,
                          });
                          setHospitalSearch(hospital.label);
                          setShowHospitalDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 transition"
                      >
                        <div className="font-medium text-gray-900 dark:text-white">{hospital.label}</div>
                        {hospital.subLabel && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{hospital.subLabel}</div>
                        )}
                      </button>
                    ))
                  ) : hospitalSearch.trim().length >= 2 ? (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Không tìm thấy bệnh viện</div>
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Nhập ít nhất 2 ký tự để tìm kiếm</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ⚠️ Warning: Active tasks */}
          {!editingData && formData.hospitalId && activeTasks.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <FiAlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                    Cảnh báo: Bệnh viện này đang có {activeTasks.length} task đang xử lý:
                  </h4>
                  <ul className="space-y-1 mb-3">
                    {activeTasks.map((task) => (
                      <li key={task.careId} className="text-sm text-amber-800 dark:text-amber-300">
                        • <span className="font-medium">{careTypes.find(t => t.value === task.careType)?.label || task.careType}</span>
                        {task.reason && <span className="ml-2 text-amber-700 dark:text-amber-400">- {task.reason}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Nếu tạo task mới cùng loại và cùng nội dung, hệ thống sẽ từ chối để tránh trùng lặp.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loại chăm sóc */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Loại chăm sóc <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.careType}
              onChange={(e) => setFormData({ ...formData, careType: e.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">-- Chọn loại chăm sóc --</option>
              {careTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Trạng thái (chỉ hiển thị khi sửa) */}
          {editingData && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trạng thái
              </label>
              <div className="flex flex-wrap gap-3">
                {careStatuses.map((s) => (
                  <label
                    key={s.value}
                    className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      formData.status === s.value
                        ? s.value === "COMPLETED"
                          ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:border-green-600"
                          : s.value === "IN_PROGRESS"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600"
                          : s.value === "CANCELLED"
                          ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-600"
                          : "border-gray-500 bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      value={s.value}
                      checked={formData.status === s.value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as AddHospitalToCareFormData["status"],
                        })
                      }
                      className="sr-only"
                    />
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              {formData.status === "COMPLETED" && formData.status !== editingData.status && (
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  ✓ Case sẽ được đánh dấu hoàn thành và resolved khi lưu.
                </p>
              )}
            </div>
          )}

          {/* Ưu tiên */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ưu tiên <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="priority"
                  value="HIGH"
                  checked={formData.priority === "HIGH"}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">🔴 Cao</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="priority"
                  value="MEDIUM"
                  checked={formData.priority === "MEDIUM"}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">🟡 Trung bình</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="priority"
                  value="LOW"
                  checked={formData.priority === "LOW"}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">🟢 Thấp</span>
              </label>
            </div>
          </div>

          {/* Lý do */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lý do cần chăm sóc <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Mô tả lý do cần thêm bệnh viện này vào danh sách chăm sóc..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              required
            />
            
          </div>

          {/* Người phụ trách */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Người phụ trách
            </label>
            <div className="relative" ref={userDropdownRef}>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
                placeholder="Tìm kiếm người phụ trách..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              />
              {formData.assignedUserName && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span>Đã chọn:</span>
                  <span className="font-medium">{formData.assignedUserName}</span>
                </div>
              )}
              {showUserDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto dark:bg-gray-700 dark:border-gray-600">
                  {loadingUsers ? (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Đang tải...</div>
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            assignedUserId: user.id,
                            assignedUserName: user.label,
                          });
                          setUserSearch(user.label);
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 transition flex items-center gap-2"
                      >
                        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                          {user.label.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{user.label}</div>
                          {user.subLabel && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{user.subLabel}</div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : userSearch.trim().length > 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Không tìm thấy người dùng</div>
                  ) : (
                    <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Nhập để tìm kiếm</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Ngày mục tiêu & Follow up */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FiCalendar className="inline h-4 w-4 mr-1" />
                Ngày mục tiêu <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FiCalendar className="inline h-4 w-4 mr-1" />
                Ngày follow up
              </label>
              <input
                type="datetime-local"
                value={formData.nextFollowUpDate}
                onChange={(e) => setFormData({ ...formData, nextFollowUpDate: e.target.value })}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Customer Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <FiTag className="inline h-4 w-4 mr-1" />
              Loại khách hàng
            </label>
            <select
              value={formData.customerType || ""}
              onChange={(e) => {
                setFormData({ ...formData, customerType: e.target.value || undefined });
              }}
              disabled={loadingCustomerTypes}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Chọn loại khách hàng...</option>
              {customerTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {loadingCustomerTypes && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Đang tải danh sách...</p>
            )}
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ghi chú
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Thông tin bổ sung, context, lưu ý đặc biệt..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSave className="h-4 w-4" />
              {isSubmitting ? "Đang lưu..." : editingData ? "Lưu thay đổi" : "Thêm vào danh sách"}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}

