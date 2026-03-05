import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import { CareActivityFormData, convertActivityFormDataToDTO, convertActivityFormDataToUpdateDTO } from "./Form/AddCareActivityForm";
import { addCustomerCareActivity, getCustomerCareById, getAllCustomerCareActivities, updateCustomerCareActivity, deleteCustomerCareActivity, CustomerCareResponseDTO } from "../../api/customerCare.api";
import api from "../../api/client";

// Helper function để tính toán thời gian tương đối từ LocalDateTime string
function calculateTimeAgo(dateString: string | undefined | null): string {
  if (!dateString) return "Vừa xong";
  
  try {
    // Parse LocalDateTime string từ Backend (format: "2026-01-14T10:30:00")
    // Parse như local time, không dùng new Date() vì nó sẽ parse như UTC
    const [datePart, timePart] = dateString.split('T');
    if (!datePart || !timePart) return "Vừa xong";
    
    const [year, month, day] = datePart.split('-').map(Number);
    const timeParts = timePart.split(':');
    const hours = Number(timeParts[0] || 0);
    const minutes = Number(timeParts[1] || 0);
    const seconds = Number(timeParts[2] || 0);
    
    // Tạo Date object từ local time components
    const activityDate = new Date(year, month - 1, day, hours, minutes, seconds);
    const now = new Date();
    
    const diffMs = now.getTime() - activityDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return "Vừa xong";
    } else if (diffMins < 60) {
      return `${diffMins} phút trước`;
    } else if (diffHours < 24) {
      return `${diffHours} giờ trước`;
    } else if (diffDays < 7) {
      return `${diffDays} ngày trước`;
    } else {
      // Format ngày tháng đầy đủ: dd/mm/yyyy
      return activityDate.toLocaleDateString("vi-VN");
    }
  } catch (error) {
    console.error("Error calculating time ago:", error);
    return "Vừa xong";
  }
}
import { 
  FiUser, 
  FiPhone, 
  FiMapPin, 
  FiMail, 
  FiAlertTriangle, 
  FiArrowLeft,
  FiRefreshCw,
  FiSettings,
  FiFileText
} from "react-icons/fi";
import CareHistoryTab, { CareActivity } from "./SubCustomerCare/CareHistoryTab";
import GeneralInfor, { Contract, Ticket } from "./SubCustomerCare/GeneralInfor";
import ContractsTab from "./SubCustomerCare/ContractsTab";
import TicketsTab from "./SubCustomerCare/TicketsTab";
import ContactsTab, { Contact } from "./SubCustomerCare/ContactsTab";

// ===================== MOCK DATA =====================
// Types are now imported from SubCustomerCare components


interface HospitalDetail {
  id: number;
  name: string;
  code: string;
  address: string;
  contacts: Contact[];
  servicePack: string;
  revenue: string;
  yearsOfService: number;
  kioskCount: number;
  status: "DANG_BAO_HANH" | "SAP_HET_HAN" | "HET_HAN" | "DA_hop_dong";
  expiryDate: string;
  daysLeft: number;
  contracts: Contract[];
  tickets: Ticket[];
  careHistory: CareActivity[];
  timeline: {
    warranty: { year: number; completed: boolean };
    maintenance: { year: number; completed: boolean };
    renewal: { year: number; completed: boolean };
  };
  dashboardStats: {
    hospitalsExpiringSoon: number;
    renewalProgress: number;
  };
}

// Mock data theo đúng ảnh
const hospitalDetail: HospitalDetail = {
  id: 1,
  name: "Bệnh Viện Đa Khoa Tâm Anh",
  code: "TA-HCM-2024",
  address: "2B, Phổ Quang, P. 2, Q. Tân Bình, TP.HCM",
  contacts: [
    { id: 1, name: "Dương Minh (IT)", role: "IT Manager", roleType: "it", phone: "0901234567", email: "duong.minh@hospital.vn" },
    { id: 2, name: "Trần Thu (Kế toán)", role: "Accountant", roleType: "accountant", phone: "0901234568", email: "tran.thu@hospital.vn" },
    { id: 3, name: "Lê Hồng (Điều dưỡng trưởng)", role: "Head Nurse", roleType: "nurse", phone: "0901234569", email: "le.hong@hospital.vn" }
  ],
  servicePack: "Tiềm năng bán thêm",
  revenue: "2.4 tỷ VNĐ",
  yearsOfService: 5,
  kioskCount: 24,
  status: "DANG_BAO_HANH",
  expiryDate: "15/10/2025",
  daysLeft: 29,
  contracts: [
    {
      id: "1",
      code: "HD-2025-001",
      type: "Bảo trì (Maintenance)",
      year: 2025,
      value: "450.000.000đ",
      status: "SAP_HET_HAN",
      linkedContract: "HD-2024-002",
      expiryDate: "15/10/2025",
      daysLeft: 29
    },
    {
      id: "2", 
      code: "HD-2024-002",
      type: "Bảo trì (Maintenance)",
      year: 2024,
      value: "420.000.000đ",
      status: "DANG_HOAT_DONG",
      linkedContract: "HD-2025-001",
      expiryDate: "20/12/2025",
      daysLeft: 95
    },
    {
      id: "3",
      code: "HD-2025-001",
      type: "Bảo hành (Warranty)",
      year: 2025,
      value: "Đã (Kèm máy)",
      status: "HET_HAN",
      expiryDate: "01/09/2025",
      daysLeft: -15
    },
    {
      id: "4",
      code: "HD-2025-003",
      type: "Bảo trì (Maintenance)",
      year: 2025,
      value: "480.000.000đ",
      status: "DA_GIA_HAN",
      linkedContract: "HD-2024-002",
      expiryDate: "20/12/2026",
      daysLeft: 460
    }
  ],
  tickets: [
    {
      id: "#TK-8821",
      issue: "Kiosk #04 mất kết nối máy in",
      priority: "Cao",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 giờ trước
      timeElapsed: "2h",
      pic: "Nguyễn Văn A",
      status: "DANG_XU_LY"
    },
    {
      id: "#TK-8810",
      issue: "Màn hình cảm ứng bị đơ",
      priority: "Trung bình",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 ngày trước
      timeElapsed: "5 ngày",
      pic: "Trần Thị B",
      status: "DANG_XU_LY"
    },
    {
      id: "#TK-8805",
      issue: "Cần cập nhật phần mềm mới",
      priority: "Thấp",
      createdAt: new Date().toISOString(),
      pic: "Lê Văn C",
      status: "CHUA_XU_LY"
    }
  ],
  careHistory: [
    {
      id: 1,
      date: "09:00, 18/09/2025",
      timeAgo: "Vừa xong",
      type: "call",
      title: "Gọi điện chăm sóc định kỳ",
      description: "Khách hàng yêu cầu báo giá nâng cấp thêm 5 Kiosk mới cho khu vực tầng 4. Nhân viên kinh doanh đã ghi nhận.",
      outcome: "POSITIVE",
      nextAction: "Gửi báo giá chi tiết",
      nextFollowUpDate: "2025-01-20T09:00:00"
    },
    {
      id: 2,
      date: "09:30, 17/09/2025",
      timeAgo: "Hôm qua",
      type: "email",
      title: "Gửi email nhắc gia hạn",
      description: "Đã gửi thư mời gia hạn kèm bảng giá ưu đãi năm 2025. Chờ phản hồi từ phòng tài toán.",
      outcome: "NEUTRAL",
      nextAction: "Theo dõi phản hồi",
      nextFollowUpDate: "2025-01-22T14:00:00"
    }
  ],
  timeline: {
    warranty: { year: 2023, completed: true },
    maintenance: { year: 2024, completed: true },
    renewal: { year: 2025, completed: false }
  },
  dashboardStats: {
    hospitalsExpiringSoon: 3,
    renewalProgress: 70
  }
};

// ===================== HELPER FUNCTIONS =====================
const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; borderColor?: string }> = {
  SAP_HET_HAN: { label: "Sắp hết hạn", bgColor: "bg-amber-100", textColor: "text-amber-700", borderColor: "border-amber-300" },
  DA_hop_dong: { label: "Đã gia hạn", bgColor: "bg-green-100", textColor: "text-green-700", borderColor: "border-green-300" },
  HET_HAN: { label: "Hết hạn", bgColor: "bg-gray-100", textColor: "text-gray-600", borderColor: "border-gray-300" },
  DANG_HOAT_DONG: { label: "Đang hoạt động", bgColor: "bg-blue-100", textColor: "text-blue-700", borderColor: "border-blue-300" },
  DANG_BAO_HANH: { label: "Đang bảo hành", bgColor: "bg-green-100", textColor: "text-green-700", borderColor: "border-green-300" },
  DANG_XU_LY: { label: "Đang xử lý", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  HOAN_THANH: { label: "Hoàn thành", bgColor: "bg-green-100", textColor: "text-green-700" }
};

const priorityConfig: Record<string, { bgColor: string; textColor: string }> = {
  "Cao": { bgColor: "bg-red-100", textColor: "text-red-700" },
  "Trung bình": { bgColor: "bg-amber-100", textColor: "text-amber-700" },
  "Thấp": { bgColor: "bg-green-100", textColor: "text-green-700" }
};

const getRoleIcon = (roleType: Contact["roleType"]) => {
  switch (roleType) {
    case "it": return <FiSettings className="h-4 w-4 text-blue-500" />;
    case "accountant": return <FiFileText className="h-4 w-4 text-gray-500" />;
    case "nurse": return <FiUser className="h-4 w-4 text-gray-500" />;
    default: return <FiUser className="h-4 w-4 text-gray-500" />;
  }
};

// ===================== TABS CONFIG =====================
type TabKey = "lich_su_cham_soc" | "thong_tin_chung" | "hop_dong" | "ticket" | "thong_tin_lien_lac";

interface Tab {
  key: TabKey;
  label: string;
}

const tabs: Tab[] = [
  { key: "lich_su_cham_soc", label: "Lịch sử chăm sóc" },
  { key: "thong_tin_chung", label: "Thông tin chung" },
  { key: "hop_dong", label: "Hợp đồng" },
  { key: "ticket", label: "Ticket (Sự cố)" },
  { key: "thong_tin_lien_lac", label: "Thông tin liên lạc" }
];

// ===================== COMPONENT =====================
interface FromListState {
  fromList?: {
    page?: number;
    search?: string;
    tab?: string;
    size?: number;
    priority?: string;
    customerType?: string;
    pic?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  basePath?: string;
}

export default function HospitalDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const listState = location.state as FromListState | null;
  const [activeTab, setActiveTab] = useState<TabKey>("thong_tin_chung");
  const contractRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  
  // State cho data từ API
  const [hospital, setHospital] = useState<HospitalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [careHistory, setCareHistory] = useState<CareActivity[]>([]);

  // Fetch hospital data từ API
  useEffect(() => {
    if (!id) {
      setError("Không tìm thấy ID bệnh viện");
      setLoading(false);
      return;
    }

    const loadHospitalData = async () => {
      setLoading(true);
      setError(null);
      try {
        const careId = Number(id);
        const careDetail: CustomerCareResponseDTO = await getCustomerCareById(careId);
        
        // Load activities
        let activities: CareActivity[] = [];
        try {
          const activitiesData = await getAllCustomerCareActivities(careId);
          activities = activitiesData.map((act: any) => {
            const activityDate = act.activityDate || act.date;
            // Format date để hiển thị đẹp: "HH:mm, dd/mm/yyyy"
            let formattedDate = "";
            try {
              if (activityDate) {
                const [datePart, timePart] = activityDate.split('T');
                if (datePart && timePart) {
                  const [year, month, day] = datePart.split('-');
                  const [hours, minutes] = timePart.split(':');
                  formattedDate = `${hours}:${minutes}, ${day}/${month}/${year}`;
                } else {
                  formattedDate = activityDate;
                }
              }
            } catch {
              formattedDate = activityDate || "";
            }
            
            return {
              id: act.activityId || act.id,
              date: activityDate || formattedDate, // Lưu original date từ API (format: "YYYY-MM-DDTHH:mm:ss") để form có thể parse đúng
              timeAgo: calculateTimeAgo(activityDate), // Tính toán thời gian tương đối
              type: (act.activityType?.toLowerCase() || "note") as "call" | "email" | "visit" | "note" | "zalo" | "cong_van",
              title: act.title || "",
              description: act.description || "",
              outcome: act.outcome || undefined,
              nextAction: act.nextAction || undefined,
              nextFollowUpDate: act.nextFollowUpDate || undefined,
            };
          });
        } catch (err) {
          console.error("Error loading activities:", err);
          activities = [];
        }

        // Fetch hospital details from API
        let hospitalInfo: any = null;
        try {
          const hospitalRes = await api.get(`/api/v1/admin/hospitals/${careDetail.hospitalId}`);
          hospitalInfo = hospitalRes.data;
        } catch (err) {
          console.warn("Could not fetch hospital details:", err);
        }

        // Fetch contacts from API
        let contacts: Contact[] = [];
        try {
          const { getHospitalContacts } = await import("../../api/hospitalContact.api");
          const contactsData = await getHospitalContacts(careDetail.hospitalId);
          contacts = contactsData.map((item: any) => ({
            id: item.id,
            name: item.name,
            role: item.role,
            roleType: item.roleType as Contact["roleType"],
            phone: item.phone || undefined,
            email: item.email || undefined
          }));
        } catch (err) {
          console.error("Could not fetch contacts:", err);
        }

        // Fetch tickets from API
        let tickets: Ticket[] = [];
        try {
          const { getHospitalTickets } = await import("../../api/ticket.api");
          const ticketsData = await getHospitalTickets(careDetail.hospitalId);
          tickets = ticketsData.map((item: any) => ({
            id: item.ticketCode || `#TK-${item.id}`,
            issue: item.issue,
            priority: item.priority,
            status: item.status,
            ticketType: item.ticketType || "MAINTENANCE", // Default to MAINTENANCE if not provided
            pic: item.pic || '',
            createdAt: item.createdAt || undefined,
            timeElapsed: item.status === "HOAN_THANH" ? undefined : undefined // Will be calculated in component
          }));
        } catch (err) {
          console.error("Could not fetch tickets:", err);
        }

        // Fetch contracts from API - filter by careId để chỉ lấy contracts của customer care này
        let contracts: Contract[] = [];
        let contractsData: any[] = []; // Khai báo ở scope ngoài để có thể dùng sau
        try {
          const { getMaintainContracts } = await import("../../api/maintain.api");
          const contractsRes = await getMaintainContracts({
            careId: careId, // Filter theo careId - chỉ lấy contracts của customer care này
            page: 0,
            size: 1000, // Lấy tất cả contracts
          });
          
          // Handle paginated response
          contractsData = Array.isArray(contractsRes?.content) 
            ? contractsRes.content 
            : Array.isArray(contractsRes?.data?.content)
            ? contractsRes.data.content
            : Array.isArray(contractsRes?.data)
            ? contractsRes.data
            : Array.isArray(contractsRes)
            ? contractsRes
            : [];
          
          console.log("Fetched contracts data:", contractsData);
          
          // Helper function để format date từ LocalDateTime string
          const formatDate = (dateStr: string | null | undefined): string | undefined => {
            if (!dateStr) return undefined;
            try {
              // Parse format từ backend: yyyy-MM-ddTHH:mm:ss hoặc yyyy-MM-ddTHH:mm:ss.SSSSSS
              const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/);
              if (match) {
                const [, year, month, day] = match;
                // Format: dd/mm/yyyy
                return `${day}/${month}/${year}`;
              }
              // Fallback: thử parse bằng Date
              const date = new Date(dateStr);
              if (!Number.isNaN(date.getTime())) {
                return date.toLocaleDateString('vi-VN');
              }
              return undefined;
            } catch {
              return undefined;
            }
          };
          
          contracts = contractsData.map((c: any) => ({
            picUser: c.picUser || null,
            id: String(c.id),
            code: c.contractCode || '',
            type: c.type || "Bảo trì (Maintenance)",
            year: c.startDate ? new Date(c.startDate).getFullYear() : new Date().getFullYear(),
            value: c.totalPrice ? `${Number(c.totalPrice).toLocaleString('vi-VN')}đ` : '0đ',
            status: c.status || "DANG_HOAT_DONG",
            linkedContract: c.linkedContract || undefined,
            startDate: formatDate(c.startDate),
            expiryDate: formatDate(c.endDate) || '',
            daysLeft: c.daysLeft || undefined,
            kioskQuantity: c.kioskQuantity || null,
            paidAmount: typeof c.paidAmount === 'number' ? c.paidAmount : (c.paidAmount ? Number(c.paidAmount) : null),
            paymentStatus: c.paymentStatus ? (c.paymentStatus === "THANH_TOAN_HET" ? "THANH_TOAN_HET" : c.paymentStatus === "DA_THANH_TOAN" ? "DA_THANH_TOAN" : "CHUA_THANH_TOAN") : "CHUA_THANH_TOAN",
          }));
          
          console.log("Mapped contracts:", contracts);
        } catch (err) {
          console.error("Could not fetch contracts:", err);
        }

        // Calculate timeline from contracts
        const timeline = {
          warranty: { year: new Date().getFullYear() - 2, completed: true },
          maintenance: { year: new Date().getFullYear() - 1, completed: true },
          renewal: { year: new Date().getFullYear(), completed: contracts.some(c => c.status === "DA_GIA_HAN") }
        };

        // Calculate years of service from contracts
        const yearsOfService = contracts.length > 0 
          ? new Date().getFullYear() - Math.min(...contracts.map(c => c.year))
          : 0;

        // Tính tổng giá trị hợp đồng (doanh thu)
        const totalContractValue = contractsData.reduce((sum: number, c: any) => {
          const price = Number(c.totalPrice) || 0;
          return sum + price;
        }, 0);
        const revenue = totalContractValue > 0 
          ? `${totalContractValue.toLocaleString('vi-VN')} VNĐ`
          : 'Chưa có dữ liệu';

        // Lấy loại khách hàng từ customerType
        const servicePack = careDetail.customerTypeLabel || 'Chưa phân loại';

        // Format expiry date
        const latestContract = contracts
          .filter(c => c.expiryDate)
          .sort((a, b) => {
            const dateA = new Date(a.expiryDate!.split('/').reverse().join('-'));
            const dateB = new Date(b.expiryDate!.split('/').reverse().join('-'));
            return dateB.getTime() - dateA.getTime();
          })[0];

        const expiryDate = latestContract?.expiryDate || 
          (careDetail.latestContract?.endDate 
            ? new Date(careDetail.latestContract.endDate).toLocaleDateString('vi-VN')
            : '');

        const daysLeft = latestContract?.daysLeft || 
          careDetail.latestContract?.daysUntilExpiry || 
          0;

        // Determine status from contracts
        // Ưu tiên kiểm tra daysLeft trước để đảm bảo chính xác
        let status: "DANG_BAO_HANH" | "SAP_HET_HAN" | "HET_HAN" | "DA_hop_dong" = "DANG_BAO_HANH";
        if (latestContract) {
          // Nếu daysLeft < 0, luôn là HET_HAN (quá hạn) bất kể status từ API
          if (daysLeft < 0) {
            status = "HET_HAN";
          } else if (latestContract.status === "HET_HAN") {
            status = "HET_HAN";
          } else if (latestContract.status === "SAP_HET_HAN") {
            // Chỉ là SAP_HET_HAN nếu daysLeft > 0 và <= 30
            if (daysLeft > 0 && daysLeft <= 30) {
              status = "SAP_HET_HAN";
            } else if (daysLeft < 0) {
              status = "HET_HAN";
            } else {
              status = "DANG_BAO_HANH";
            }
          } else if (latestContract.status === "DA_GIA_HAN") {
            status = "DA_hop_dong";
          } else if (latestContract.status === "DANG_HOAT_DONG") {
            status = "DANG_BAO_HANH";
          }
        }

        // Convert API response sang HospitalDetail format
        const hospitalData: HospitalDetail = {
          id: careDetail.hospitalId,
          name: careDetail.hospitalName || hospitalInfo?.name || `Hospital #${careDetail.hospitalId}`,
          code: careDetail.hospitalCode || hospitalInfo?.code || `HOSP-${careDetail.hospitalId}`,
          address: careDetail.address || hospitalInfo?.address || hospitalInfo?.location || 'Chưa có địa chỉ',
          contacts: contacts, // Contacts loaded from API
          servicePack: servicePack,
          revenue: revenue,
          yearsOfService: yearsOfService,
          kioskCount: careDetail.kioskCount || hospitalInfo?.kioskCount || 0,
          status: status,
          expiryDate: expiryDate,
          daysLeft: daysLeft,
          contracts: contracts,
          tickets: tickets, // Tickets loaded from API
          careHistory: activities,
          timeline: timeline,
          dashboardStats: {
            hospitalsExpiringSoon: 0, // TODO: Calculate from data
            renewalProgress: 0 // TODO: Calculate from data
          }
        };

        setHospital(hospitalData);
        // Contacts will be loaded by ContactsTab component from API
        setCareHistory(activities);
      } catch (err: any) {
        console.error("Error loading hospital detail:", err);
        setError(err?.response?.data?.message || err?.message || "Không thể tải thông tin bệnh viện");
        setHospital(null);
      } finally {
        setLoading(false);
      }
    };

    loadHospitalData();
  }, [id]);

  // Tính toán hợp đồng có ngày hết hạn gần nhất từ các hợp đồng đang Active
  const activeContracts = useMemo(() => {
    if (!hospital) return [];
    return hospital.contracts.filter(
      contract => contract.status === "DANG_HOAT_DONG" || contract.status === "SAP_HET_HAN"
    );
  }, [hospital]);

  const nextExpiringContract = useMemo(() => {
    if (activeContracts.length === 0) return null;
    
    // Sắp xếp theo daysLeft tăng dần (số ngày còn lại ít nhất = sắp hết hạn nhất)
    const sorted = [...activeContracts].sort((a, b) => {
      const daysA = a.daysLeft ?? Infinity;
      const daysB = b.daysLeft ?? Infinity;
      return daysA - daysB;
    });
    
    return sorted[0];
  }, [activeContracts]);

  const activeContractsCount = activeContracts.length;

  // Tính tổng số kiosk từ các hợp đồng bảo trì
  const totalKioskFromMaintenanceContracts = useMemo(() => {
    if (!hospital?.contracts || hospital.contracts.length === 0) return 0;
    return hospital.contracts
      .filter((c: Contract) => c.type === "Bảo trì (Maintenance)")
      .reduce((sum: number, c: Contract) => {
        const kioskQty = c.kioskQuantity || 0;
        return sum + kioskQty;
      }, 0);
  }, [hospital?.contracts]);

  // Scroll đến hợp đồng sắp hết hạn khi click nút "Gia hạn Hợp đồng"
  const handleRenewContract = () => {
    if (!nextExpiringContract) return;
    
    // Chuyển sang tab hợp đồng nếu chưa ở đó
    if (activeTab !== "thong_tin_chung") {
      setActiveTab("thong_tin_chung");
      // Đợi tab chuyển xong rồi mới scroll
      setTimeout(() => {
        scrollToContract(nextExpiringContract.id);
      }, 100);
    } else {
      scrollToContract(nextExpiringContract.id);
    }
  };

  const scrollToContract = (contractId: string) => {
    const rowElement = contractRowRefs.current[contractId];
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight effect
      rowElement.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
      setTimeout(() => {
        rowElement.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
      }, 2000);
    }
  };

  const handleBack = () => {
    const from = listState?.fromList;
    const basePath = listState?.basePath ?? (location.pathname.startsWith("/superadmin") ? "/superadmin" : "/admin");
    if (from) {
      const params = new URLSearchParams();
      if (from.page != null) params.set("page", String(from.page));
      if (from.search) params.set("search", from.search);
      if (from.tab) params.set("tab", from.tab);
      if (from.size != null) params.set("size", String(from.size));
      if (from.priority) params.set("priority", from.priority);
      if (from.customerType) params.set("customerType", from.customerType);
      if (from.pic) params.set("pic", from.pic);
      if (from.dateFrom) params.set("dateFrom", from.dateFrom);
      if (from.dateTo) params.set("dateTo", from.dateTo);
      const qs = params.toString();
      navigate(`${basePath}/hospital-care${qs ? `?${qs}` : ""}`);
    } else {
      navigate(-1);
    }
  };

  // Memoize callbacks để tránh infinite loop
  const handleTicketsChange = useCallback((updatedTickets: Ticket[]) => {
    setHospital(prev => prev ? { 
      ...prev, 
      tickets: updatedTickets
    } : null);
  }, []);

  const handleContractsChange = useCallback(() => {
    // Reload contracts từ API
    if (!id) return;
    const careId = Number(id);
    const reloadContracts = async () => {
      try {
        const contractsData = await api.get(`/api/v1/admin/customer-care/${careId}/maintain-contracts`);
        // ... (giữ nguyên logic reload contracts)
      } catch (err) {
        console.error("Could not reload contracts:", err);
      }
    };
    reloadContracts();
  }, [id]);

  const handleSubmitActivity = async (data: CareActivityFormData) => {
    if (!id) {
      alert("Không tìm thấy care ID");
      return;
    }

    const careId = Number(id);
    try {
      // Convert form data sang Backend DTO format
      const payload = convertActivityFormDataToDTO(data);
      await addCustomerCareActivity(careId, payload);
      
      // Reload activities từ API
      const activitiesData = await getAllCustomerCareActivities(careId);
      const activities: CareActivity[] = activitiesData.map((act: any) => {
        const activityDate = act.activityDate || act.date;
        // Format date để hiển thị đẹp: "HH:mm, dd/mm/yyyy"
        let formattedDate = "";
        try {
          if (activityDate) {
            const [datePart, timePart] = activityDate.split('T');
            if (datePart && timePart) {
              const [year, month, day] = datePart.split('-');
              const [hours, minutes] = timePart.split(':');
              formattedDate = `${hours}:${minutes}, ${day}/${month}/${year}`;
            } else {
              formattedDate = activityDate;
            }
          }
        } catch {
          formattedDate = activityDate || "";
        }
        
        return {
          id: act.activityId || act.id,
          date: formattedDate || activityDate,
          timeAgo: calculateTimeAgo(activityDate), // Tính toán thời gian tương đối
          type: (act.activityType?.toLowerCase() || "note") as "call" | "email" | "visit" | "note",
          title: act.title || "",
          description: act.description || "",
          outcome: act.outcome || undefined,
          nextAction: act.nextAction || undefined,
          nextFollowUpDate: act.nextFollowUpDate || undefined,
        };
      });
      
      setCareHistory(activities);
      // Update hospital state if exists
      setHospital(prev => prev ? { ...prev, careHistory: activities } : null);
    } catch (error: any) {
      console.error("Error submitting activity:", error);
      alert(error?.response?.data?.message || error?.message || "Có lỗi xảy ra khi thêm hoạt động");
    }
  };

  const handleUpdateActivity = async (activityId: number, data: CareActivityFormData) => {
    if (!id) {
      alert("Không tìm thấy care ID");
      return;
    }

    const careId = Number(id);
    try {
      // Convert form data sang Backend DTO format (không có activityDate)
      const payload = convertActivityFormDataToUpdateDTO(data);
      await updateCustomerCareActivity(careId, activityId, payload);
      
      // Reload activities từ API
      const activitiesData = await getAllCustomerCareActivities(careId);
      const activities: CareActivity[] = activitiesData.map((act: any) => {
        const activityDate = act.activityDate || act.date;
        // Format date để hiển thị đẹp: "HH:mm, dd/mm/yyyy"
        let formattedDate = "";
        try {
          if (activityDate) {
            const [datePart, timePart] = activityDate.split('T');
            if (datePart && timePart) {
              const [year, month, day] = datePart.split('-');
              const [hours, minutes] = timePart.split(':');
              formattedDate = `${hours}:${minutes}, ${day}/${month}/${year}`;
            } else {
              formattedDate = activityDate;
            }
          }
        } catch {
          formattedDate = activityDate || "";
        }
        
        return {
          id: act.activityId || act.id,
          date: activityDate || formattedDate, // Lưu original date từ API
          timeAgo: calculateTimeAgo(activityDate), // Tính toán thời gian tương đối
          type: (act.activityType?.toLowerCase() || "note") as "call" | "email" | "visit" | "note",
          title: act.title || "",
          description: act.description || "",
          outcome: act.outcome || undefined,
          nextAction: act.nextAction || undefined,
          nextFollowUpDate: act.nextFollowUpDate || undefined,
        };
      });
      
      setCareHistory(activities);
      setHospital(prev => prev ? { ...prev, careHistory: activities } : null);
    } catch (error: any) {
      console.error("Error updating activity:", error);
      alert(error?.response?.data?.message || error?.message || "Có lỗi xảy ra khi cập nhật hoạt động");
    }
  };

  const handleDeleteActivity = async (activityId: number) => {
    if (!id) {
      alert("Không tìm thấy care ID");
      return;
    }

    if (!confirm("Bạn có chắc chắn muốn xóa hoạt động này?")) {
      return;
    }

    const careId = Number(id);
    try {
      await deleteCustomerCareActivity(careId, activityId);
      
      // Reload activities từ API
      const activitiesData = await getAllCustomerCareActivities(careId);
      const activities: CareActivity[] = activitiesData.map((act: any) => {
        const activityDate = act.activityDate || act.date;
        // Format date để hiển thị đẹp: "HH:mm, dd/mm/yyyy"
        let formattedDate = "";
        try {
          if (activityDate) {
            const [datePart, timePart] = activityDate.split('T');
            if (datePart && timePart) {
              const [year, month, day] = datePart.split('-');
              const [hours, minutes] = timePart.split(':');
              formattedDate = `${hours}:${minutes}, ${day}/${month}/${year}`;
            } else {
              formattedDate = activityDate;
            }
          }
        } catch {
          formattedDate = activityDate || "";
        }
        
        return {
          id: act.activityId || act.id,
          date: activityDate || formattedDate, // Lưu original date từ API
          timeAgo: calculateTimeAgo(activityDate), // Tính toán thời gian tương đối
          type: (act.activityType?.toLowerCase() || "note") as "call" | "email" | "visit" | "note",
          title: act.title || "",
          description: act.description || "",
          outcome: act.outcome || undefined,
          nextAction: act.nextAction || undefined,
          nextFollowUpDate: act.nextFollowUpDate || undefined,
        };
      });
      
      setCareHistory(activities);
      setHospital(prev => prev ? { ...prev, careHistory: activities } : null);
    } catch (error: any) {
      console.error("Error deleting activity:", error);
      alert(error?.response?.data?.message || error?.message || "Có lỗi xảy ra khi xóa hoạt động");
    }
  };

  // Show loading state
  if (loading) {
    return (
      <>
        <PageMeta title="Đang tải..." description="Chi tiết bệnh viện chăm sóc khách hàng" />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Đang tải thông tin bệnh viện...</p>
          </div>
        </div>
      </>
    );
  }

  // Show error state
  if (error || !hospital) {
    return (
      <>
        <PageMeta title="Lỗi" description="Chi tiết bệnh viện chăm sóc khách hàng" />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 dark:text-red-400 mb-4">{error || "Không tìm thấy thông tin bệnh viện"}</p>
            <button
              onClick={handleBack}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              Quay lại
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta title={`Chi tiết ${hospital.name}`} description="Chi tiết bệnh viện chăm sóc khách hàng" />
      
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
        {/* ========== FULL WIDTH TOP HEADER ========== */}
        <div className="px-4 lg:px-6 py-4">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="mb-3 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <FiArrowLeft className="h-4 w-4" />
            <span>Quay lại danh sách</span>
          </button>
          
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left: Name & Badge */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white text-xl font-bold">
                  H
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{hospital.name}</h1>
                    {nextExpiringContract && nextExpiringContract.daysLeft !== undefined && (
                      <>
                        {nextExpiringContract.daysLeft < 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-300">
                            <FiAlertTriangle className="h-3 w-3" />
                            QUÁ HẠN ({Math.abs(nextExpiringContract.daysLeft)} NGÀY)
                          </span>
                        ) : nextExpiringContract.daysLeft <= 30 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-300">
                            <FiAlertTriangle className="h-3 w-3" />
                            SẮP HẾT HẠN ({nextExpiringContract.daysLeft} NGÀY)
                          </span>
                        ) : null}
                      </>
                    )}
                    {activeContractsCount > 1 && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-300">
                        {activeContractsCount} Hợp đồng đang chạy
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Mã khách hàng: {hospital.code}</p>
                </div>
              </div>

              {/* Right: Quick Stats + Action Button */}
              <div className="flex flex-wrap items-center gap-6">
                {/* Số Kiosk KD */}
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">Số Kiosk KD</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{hospital.kioskCount} Thiết bị</p>
                </div>

                {/* Số Kiosk BT */}
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">Số Kiosk BT</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{totalKioskFromMaintenanceContracts} Thiết bị</p>
                </div>

                {/* Trạng thái */}
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">Trạng thái</p>
                  {nextExpiringContract ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[nextExpiringContract.status]?.bgColor} ${statusConfig[nextExpiringContract.status]?.textColor}`}>
                      {statusConfig[nextExpiringContract.status]?.label}
                    </span>
                  ) : (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[hospital.status]?.bgColor} ${statusConfig[hospital.status]?.textColor}`}>
                      {statusConfig[hospital.status]?.label}
                    </span>
                  )}
                </div>

                {/* Ngày đáo hạn gần nhất */}
                <div className="text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    {nextExpiringContract ? "Hết hạn tiếp theo" : "Ngày hết hạn"}
                  </p>
                  {nextExpiringContract ? (
                    <p className={`text-lg font-bold ${
                      nextExpiringContract.daysLeft && nextExpiringContract.daysLeft <= 30 
                        ? "text-red-600" 
                        : "text-amber-600"
                    }`}>
                      {nextExpiringContract.expiryDate || hospital.expiryDate}
                    </p>
                  ) : (
                    <p className="text-lg font-bold text-gray-600">{hospital.expiryDate}</p>
                  )}
                </div>

                {/* Action Button - Đẩy sang phải */}
                <button 
                  onClick={handleRenewContract}
                  className="ml-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition shrink-0"
                >
                  <FiRefreshCw className="h-4 w-4" />
                  Gia hạn 
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========== TWO COLUMN LAYOUT ========== */}
        <div className="px-4 pb-6 lg:px-6 overflow-x-hidden">
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* ========== LEFT SIDEBAR (30%) ========== */}
            <div className="w-full lg:w-[20%] space-y-3">
              
              {/* Profile Card */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* Top Banner with Gradient */}
                <div className="h-32 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                
                {/* Content Area */}
                <div className="relative px-4 pb-4">
                  {/* Logo - Overlapping Banner and Content */}
                  <div className="flex justify-center -mt-12 mb-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-blue-600 text-2xl font-bold shadow-md">
                      H
                    </div>
                  </div>

                  {/* Title */}
                  <h2 className="text-center text-base font-bold text-gray-900 mb-3">Hồ sơ Bệnh viện</h2>

                  {/* Address */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Địa chỉ</p>
                    <p className="flex items-start gap-1.5 text-sm text-gray-700 leading-relaxed">
                      <FiMapPin className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                      <span>{hospital.address}</span>
                    </p>
                  </div>
                  <hr className="my-4 border-gray-200 dark:border-gray-700" />

                  {/* Key Contacts */}
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Nhân sự phụ trách (Key Contact)
                    </h3>
                    <div className="space-y-3">
                      {hospital.contacts.map((contact) => (
                        <div key={contact.id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition dark:bg-gray-700/50 dark:hover:bg-gray-700">
                          <div className="flex items-center gap-2 mb-2">
                          <div className="shrink-0">{getRoleIcon(contact.roleType)}</div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{contact.role}</div>
                            </div>
                          </div>
                          {contact.phone && (
                            <a 
                              href={`tel:${contact.phone}`}
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline mb-1 dark:text-blue-400"
                            >
                              <FiPhone className="h-3.5 w-3.5" />
                              {contact.phone}
                            </a>
                          )}
                          {contact.email && (
                            <a 
                              href={`mailto:${contact.email}`}
                              className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 hover:underline dark:text-purple-400"
                            >
                              <FiMail className="h-3.5 w-3.5" />
                              {contact.email}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <hr className="my-4 border-gray-200 dark:border-gray-700" />
                  {/* Service Pack */}
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Loại khách hàng
                    </h3>
                    <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-600">
                      {hospital.servicePack}
                    </span>
                  </div>

                  {/* Revenue Stats */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Doanh thu</p>
                      <p className="text-base font-bold text-emerald-500">{hospital.revenue}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Thâm niên</p>
                      <p className="text-base font-bold text-gray-900">{hospital.yearsOfService} năm</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dashboard CSKH Widget */}
              
            </div>

            {/* ========== RIGHT MAIN CONTENT (70%) ========== */}
            <div className="w-full lg:w-[80%] overflow-x-hidden max-w-full">
              
              {/* Navigation Tabs Card */}
              <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-x-hidden max-w-full">
                {/* Tab Headers */}
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <nav className="flex overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`shrink-0 px-5 py-3.5 text-sm font-medium transition border-b-2 ${
                          activeTab === tab.key
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="p-5 overflow-x-hidden max-w-full">
                  {activeTab === "thong_tin_chung" && (
                    <GeneralInfor
                      contracts={hospital.contracts}
                      tickets={hospital.tickets}
                      timeline={hospital.timeline}
                      nextExpiringContractId={nextExpiringContract?.id}
                      contractRowRefs={contractRowRefs}
                      careHistory={hospital.careHistory}
                    />
                  )}


                  {activeTab === "lich_su_cham_soc" && (
                    <CareHistoryTab
                      careHistory={careHistory}
                      hospitalName={hospital.name}
                      onAddActivity={handleSubmitActivity}
                      onUpdateActivity={handleUpdateActivity}
                      onDeleteActivity={handleDeleteActivity}
                    />
                  )}

                  {activeTab === "hop_dong" && (
                    <ContractsTab
                      contracts={hospital.contracts}
                      onContractsChange={async (updatedContracts) => {
                        // Fetch lại contracts từ API để có dữ liệu đầy đủ (totalPrice là number)
                        try {
                          const { getMaintainContracts } = await import("../../api/maintain.api");
                          const contractsRes = await getMaintainContracts({
                            careId: Number(id),
                            page: 0,
                            size: 1000,
                          });
                          
                          const contractsData = Array.isArray(contractsRes?.content) 
                            ? contractsRes.content 
                            : Array.isArray(contractsRes?.data?.content)
                            ? contractsRes.data.content
                            : Array.isArray(contractsRes?.data) 
                            ? contractsRes.data 
                            : Array.isArray(contractsRes)
                            ? contractsRes
                            : [];
                          
                          // Helper function để format date từ LocalDateTime string
                          const formatDate = (dateStr: string | null | undefined): string | undefined => {
                            if (!dateStr) return undefined;
                            try {
                              const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/);
                              if (match) {
                                const [, year, month, day] = match;
                                return `${day}/${month}/${year}`;
                              }
                              const date = new Date(dateStr);
                              if (!Number.isNaN(date.getTime())) {
                                return date.toLocaleDateString('vi-VN');
                              }
                              return undefined;
                            } catch {
                              return undefined;
                            }
                          };
                          
                          // Tính lại revenue từ contractsData (có totalPrice là number)
                          const totalContractValue = contractsData.reduce((sum: number, c: any) => {
                            const price = Number(c.totalPrice) || 0;
                            return sum + price;
                          }, 0);
                          
                          const revenue = totalContractValue > 0 
                            ? `${totalContractValue.toLocaleString('vi-VN')} VNĐ`
                            : 'Chưa có dữ liệu';
                          
                          // Tính lại yearsOfService từ contractsData (dùng startDate từ API)
                          const contractYears = contractsData
                            .map((c: any) => c.startDate ? new Date(c.startDate).getFullYear() : new Date().getFullYear())
                            .filter((year: number) => !isNaN(year));
                          
                          const yearsOfService = contractYears.length > 0 
                            ? new Date().getFullYear() - Math.min(...contractYears)
                            : 0;
                          
                          // Tính lại latestContract và expiryDate từ contractsData
                          const latestContractData = contractsData
                            .filter((c: any) => c.endDate)
                            .sort((a: any, b: any) => {
                              const dateA = new Date(a.endDate);
                              const dateB = new Date(b.endDate);
                              return dateB.getTime() - dateA.getTime();
                            })[0];
                          
                          const expiryDate = latestContractData 
                            ? formatDate(latestContractData.endDate) || ''
                            : '';
                          
                          const daysLeft = latestContractData?.daysLeft || 0;
                          
                          // Determine status from latestContract
                          let status: "DANG_BAO_HANH" | "SAP_HET_HAN" | "HET_HAN" | "DA_hop_dong" = "DANG_BAO_HANH";
                          if (latestContractData) {
                            if (latestContractData.status === "HET_HAN") status = "HET_HAN";
                            else if (latestContractData.status === "SAP_HET_HAN") status = "SAP_HET_HAN";
                            else if (latestContractData.status === "DA_GIA_HAN") status = "DA_hop_dong";
                            else if (latestContractData.status === "DANG_HOAT_DONG") status = "DANG_BAO_HANH";
                          }
                          
                          // Update hospital với contracts mới và các giá trị đã tính lại
                          setHospital(prev => prev ? { 
                            ...prev, 
                            contracts: updatedContracts,
                            revenue: revenue,
                            yearsOfService: yearsOfService,
                            status: status,
                            expiryDate: expiryDate,
                            daysLeft: daysLeft
                          } : null);
                        } catch (err) {
                          console.error("Error refreshing hospital data:", err);
                          // Fallback: tính từ updatedContracts nếu fetch fail
                          const totalContractValue = updatedContracts.reduce((sum: number, c: Contract) => {
                            const valueStr = c.value.replace(/[^\d]/g, '');
                            const price = Number(valueStr) || 0;
                            return sum + price;
                          }, 0);
                          
                          const revenue = totalContractValue > 0 
                            ? `${totalContractValue.toLocaleString('vi-VN')} VNĐ`
                            : 'Chưa có dữ liệu';
                          
                          const yearsOfService = updatedContracts.length > 0 
                            ? new Date().getFullYear() - Math.min(...updatedContracts.map(c => c.year))
                            : 0;
                          
                          // Tính lại status và expiryDate từ updatedContracts
                          const latestContract = updatedContracts
                            .filter(c => c.expiryDate)
                            .sort((a, b) => {
                              const dateA = new Date(a.expiryDate!.split('/').reverse().join('-'));
                              const dateB = new Date(b.expiryDate!.split('/').reverse().join('-'));
                              return dateB.getTime() - dateA.getTime();
                            })[0];
                          
                          const expiryDate = latestContract?.expiryDate || '';
                          const daysLeft = latestContract?.daysLeft || 0;
                          
                          let status: "DANG_BAO_HANH" | "SAP_HET_HAN" | "HET_HAN" | "DA_hop_dong" = "DANG_BAO_HANH";
                          if (latestContract) {
                            if (latestContract.status === "HET_HAN") status = "HET_HAN";
                            else if (latestContract.status === "SAP_HET_HAN") status = "SAP_HET_HAN";
                            else if (latestContract.status === "DA_GIA_HAN") status = "DA_hop_dong";
                            else if (latestContract.status === "DANG_HOAT_DONG") status = "DANG_BAO_HANH";
                          }
                          
                          setHospital(prev => prev ? { 
                            ...prev, 
                            contracts: updatedContracts,
                            revenue: revenue,
                            yearsOfService: yearsOfService,
                            status: status,
                            expiryDate: expiryDate,
                            daysLeft: daysLeft
                          } : null);
                        }
                      }}
                      hospitalId={hospital.id}
                      careId={Number(id)} // careId từ URL params
                    />
                  )}

                  {activeTab === "ticket" && (
                    <TicketsTab
                      tickets={hospital.tickets}
                      onTicketsChange={handleTicketsChange}
                      hospitalId={hospital.id} // Vẫn cần hospitalId để tạo/sửa/xóa tickets
                      useTicketsProp={true} // Dùng tickets prop từ parent, không load từ API
                    />
                  )}

                  {activeTab === "thong_tin_lien_lac" && (
                    <ContactsTab
                      hospitalId={hospital?.id}
                      canManage={false} // TODO: Check user permission
                      onContactsChange={(updatedContacts) => {
                        // Update hospital.contacts when contacts change
                        setHospital(prev => prev ? { 
                          ...prev, 
                          contacts: updatedContacts
                        } : null);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
