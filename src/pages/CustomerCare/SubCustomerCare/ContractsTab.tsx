import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  FiPlus, 
  FiEdit2, 
  FiTrash2, 
  FiSearch, 
  FiFilter, 
  FiAlertTriangle,
  FiCheckCircle,
  FiShield,
  FiTool,
  FiRefreshCw,
  FiExternalLink,
  FiCalendar,
  FiDollarSign,
  FiFileText,
  FiUser
} from "react-icons/fi";
import { Contract } from "./GeneralInfor";
import MaintainContractForm, { type WarrantyContractForm } from "../Form/MaintainContractForm";
import { getMaintainContractPicOptions } from "../../../api/maintain.api";
import { searchHospitals } from "../../../api/business.api";
import api from "../../../api/client";
import toast from "react-hot-toast";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";

interface ContractsTabProps {
  contracts?: Contract[];
  onContractsChange?: (contracts: Contract[]) => void;
  hospitalId?: number;
  careId?: number; // ID của CustomerCareHospital - bắt buộc khi tạo contract
}

const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; borderColor?: string }> = {
  SAP_HET_HAN: { label: "Sắp hết hạn", bgColor: "bg-amber-100", textColor: "text-amber-700", borderColor: "border-amber-300" },
  DA_GIA_HAN: { label: "Đã gia hạn", bgColor: "bg-green-100", textColor: "text-green-700", borderColor: "border-green-300" },
  HET_HAN: { label: "Hết hạn", bgColor: "bg-gray-100", textColor: "text-gray-600", borderColor: "border-gray-300" },
  DANG_HOAT_DONG: { label: "Đang hoạt động", bgColor: "bg-blue-100", textColor: "text-blue-700", borderColor: "border-blue-300" },
};

type PicUserOption = {
  id: number;
  label: string;
  subLabel?: string;
  phone?: string | null;
};

type HospitalOption = {
  id: number;
  label: string;
};

export default function ContractsTab({ 
  contracts = [], 
  onContractsChange,
  hospitalId,
  careId 
}: ContractsTabProps) {
  const { ask: askConfirm, dialog: genericConfirmDialog } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [renewingContractId, setRenewingContractId] = useState<number | null>(null); // Lưu ID hợp đồng gốc khi gia hạn
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // State for MaintainContractForm
  const [form, setForm] = useState<WarrantyContractForm>({
    contractCode: "",
    picUserId: undefined,
    hospitalId: hospitalId,
    durationYears: "",
    yearlyPrice: "",
    totalPrice: "",
    paymentStatus: "CHUA_THANH_TOAN",
    paidAmount: "",
    startDate: null,
    endDate: null,
  });
  const [yearlyPriceDisplay, setYearlyPriceDisplay] = useState<string>("");
  const [totalPriceDisplay, setTotalPriceDisplay] = useState<string>("");
  const [paidAmountDisplay, setPaidAmountDisplay] = useState<string>("");
  const [paidAmountError, setPaidAmountError] = useState<string | null>(null);
  const [picOptions, setPicOptions] = useState<PicUserOption[]>([]);
  const [selectedPic, setSelectedPic] = useState<PicUserOption | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<HospitalOption | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load pic options
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const options = await getMaintainContractPicOptions();
        if (alive) setPicOptions(options);
      } catch (e) {
        console.error("Failed to load pic options:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Đọc hospitalId từ URL query params khi component mount hoặc khi URL thay đổi
  useEffect(() => {
    const urlHospitalId = searchParams.get('hospitalId');
    const urlCareId = searchParams.get('careId');
    
    // Nếu có hospitalId trong URL, ưu tiên dùng từ URL
    const targetHospitalId = urlHospitalId ? Number(urlHospitalId) : hospitalId;
    const targetCareId = urlCareId ? Number(urlCareId) : careId;
    
    if (targetHospitalId) {
      setForm((s) => ({ ...s, hospitalId: targetHospitalId }));
      
      // Nếu có careId, lấy thông tin hospital từ customer care detail (không cần gọi API riêng)
      if (targetCareId) {
        (async () => {
          try {
            const { getCustomerCareById } = await import("../../../api/customerCare.api");
            const careDetail = await getCustomerCareById(targetCareId);
            if (careDetail && careDetail.hospitalId === targetHospitalId) {
              setSelectedHospital({
                id: Number(careDetail.hospitalId),
                label: String(careDetail.hospitalName || `Hospital #${targetHospitalId}`)
              });
              return; // Đã có thông tin từ careDetail, không cần gọi API nữa
            }
          } catch (err) {
            console.warn("Could not load hospital from care detail:", err);
          }
          
          // Fallback: Nếu không lấy được từ careDetail, thử gọi API (có thể cần permission)
          try {
            const hospitalRes = await api.get(`/api/v1/admin/hospitals/${targetHospitalId}`);
            const hospital = hospitalRes.data;
            if (hospital) {
              setSelectedHospital({
                id: Number(hospital.id || targetHospitalId),
                label: String(hospital.name || hospital.hospitalName || `Hospital #${targetHospitalId}`)
              });
            }
          } catch (err) {
            console.error("Error loading hospital info from API:", err);
            // Nếu API fail, vẫn set với ID để form có thể submit
            setSelectedHospital({
              id: targetHospitalId,
              label: `Hospital #${targetHospitalId}`
            });
          }
        })();
      } else {
        // Nếu không có careId, thử gọi API (có thể cần permission)
        (async () => {
          try {
            const hospitalRes = await api.get(`/api/v1/admin/hospitals/${targetHospitalId}`);
            const hospital = hospitalRes.data;
            if (hospital) {
              setSelectedHospital({
                id: Number(hospital.id || targetHospitalId),
                label: String(hospital.name || hospital.hospitalName || `Hospital #${targetHospitalId}`)
              });
            }
          } catch (err) {
            console.error("Error loading hospital info:", err);
            // Nếu API fail, vẫn set với ID để form có thể submit
            setSelectedHospital({
              id: targetHospitalId,
              label: `Hospital #${targetHospitalId}`
            });
          }
        })();
      }
    }
  }, [hospitalId, careId, searchParams]);
  
  // Kiểm tra URL query params để tự động mở modal khi có ?action=add
  useEffect(() => {
    const action = searchParams.get('action');
    const urlHospitalId = searchParams.get('hospitalId');
    
    if (action === 'add' && !showContractModal && urlHospitalId) {
      // Chỉ mở modal nếu có hospitalId trong URL
      const targetHospitalId = Number(urlHospitalId);
      const targetCareId = searchParams.get('careId') ? Number(searchParams.get('careId')) : careId;
      
      // Load hospital info và mở modal
      (async () => {
        setEditingContract(null);
        setForm({
          contractCode: "",
          picUserId: undefined,
          hospitalId: targetHospitalId,
          durationYears: "",
          yearlyPrice: "",
          totalPrice: "",
          paymentStatus: "CHUA_THANH_TOAN",
          paidAmount: "",
          startDate: null,
          endDate: null,
        });
        setYearlyPriceDisplay("");
        setPaidAmountDisplay("");
        setPaidAmountError(null);
        setTotalPriceDisplay("");
        setSelectedPic(null);
        setError(null);
        
        // Ưu tiên lấy từ careDetail (không cần permission)
        if (targetCareId) {
          try {
            const { getCustomerCareById } = await import("../../../api/customerCare.api");
            const careDetail = await getCustomerCareById(targetCareId);
            if (careDetail && careDetail.hospitalId === targetHospitalId) {
              const hospitalOption = {
                id: Number(careDetail.hospitalId),
                label: String(careDetail.hospitalName || `Hospital #${targetHospitalId}`)
              };
              setSelectedHospital(hospitalOption);
              setForm((s) => ({ ...s, hospitalId: hospitalOption.id }));
              await new Promise(resolve => setTimeout(resolve, 50));
              setShowContractModal(true);
              return; // Đã có thông tin, không cần gọi API nữa
            }
          } catch (err) {
            console.warn("Could not load hospital from care detail:", err);
          }
        }
        
        // Fallback: Thử gọi API (có thể cần permission)
        try {
          const hospitalRes = await api.get(`/api/v1/admin/hospitals/${targetHospitalId}`);
          const hospital = hospitalRes.data;
          if (hospital) {
            const hospitalOption = {
              id: Number(hospital.id || targetHospitalId),
              label: String(hospital.name || hospital.hospitalName || `Hospital #${targetHospitalId}`)
            };
            setSelectedHospital(hospitalOption);
            setForm((s) => ({ ...s, hospitalId: hospitalOption.id }));
            await new Promise(resolve => setTimeout(resolve, 50));
            setShowContractModal(true);
          } else {
            // Nếu không có data, vẫn set với ID để form có thể submit
            setSelectedHospital({
              id: targetHospitalId,
              label: `Hospital #${targetHospitalId}`
            });
            setShowContractModal(true);
          }
        } catch (err) {
          console.error("Error loading hospital info from API:", err);
          // Nếu API fail, vẫn set với ID để form có thể submit
          setSelectedHospital({
            id: targetHospitalId,
            label: `Hospital #${targetHospitalId}`
          });
          setShowContractModal(true);
        }
      })();
    }
  }, [searchParams, showContractModal, careId]);

  // Filter contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter(contract => {
      const matchesSearch = 
        contract.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contract.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || contract.status === statusFilter;
      const matchesType = typeFilter === "all" || contract.type === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [contracts, searchQuery, statusFilter, typeFilter]);

  // Stats
  const stats = useMemo(() => {
    const active = contracts.filter(c => c.status === "DANG_HOAT_DONG").length;
    const expiringSoon = contracts.filter(c => c.status === "SAP_HET_HAN").length;
    const expired = contracts.filter(c => c.status === "HET_HAN").length;
    const extended = contracts.filter(c => c.status === "DA_GIA_HAN").length;
    const totalValue = contracts.reduce((sum, c) => {
      const value = parseFloat(c.value.replace(/[^\d]/g, "")) || 0;
      return sum + value;
    }, 0);
    
    return { active, expiringSoon, expired, extended, totalValue };
  }, [contracts]);

  const handleAddContract = async () => {
    setEditingContract(null);
    
    // Lấy hospitalId từ URL query params hoặc props
    const urlHospitalId = searchParams.get('hospitalId');
    const urlCareId = searchParams.get('careId');
    const targetHospitalId = urlHospitalId ? Number(urlHospitalId) : hospitalId;
    const targetCareId = urlCareId ? Number(urlCareId) : careId;
    
    // Cập nhật URL với query params nếu chưa có
    if (targetHospitalId && !searchParams.get('hospitalId')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('hospitalId', String(targetHospitalId));
      if (targetCareId) {
        newParams.set('careId', String(targetCareId));
      }
      newParams.set('action', 'add');
      setSearchParams(newParams, { replace: true });
    }
    
    setForm({
      contractCode: "",
      picUserId: undefined,
      hospitalId: targetHospitalId,
      durationYears: "",
      yearlyPrice: "",
      totalPrice: "",
      kioskQuantity: "",
      paymentStatus: "CHUA_THANH_TOAN",
      paidAmount: "",
      startDate: null,
      endDate: null,
    });
    setPaidAmountDisplay("");
    setPaidAmountError(null);
    setYearlyPriceDisplay("");
    setTotalPriceDisplay("");
    setSelectedPic(null);
    setError(null);
    
    // Nếu có hospitalId, tự động load và set selectedHospital TRƯỚC KHI mở modal
    if (targetHospitalId) {
      // Ưu tiên lấy từ careDetail (không cần permission team kinh doanh)
      if (targetCareId) {
        try {
          const { getCustomerCareById } = await import("../../../api/customerCare.api");
          const careDetail = await getCustomerCareById(targetCareId);
          if (careDetail && careDetail.hospitalId === targetHospitalId) {
            const hospitalOption = {
              id: Number(careDetail.hospitalId),
              label: String(careDetail.hospitalName || `Hospital #${targetHospitalId}`)
            };
            setSelectedHospital(hospitalOption);
            setForm((s) => ({ ...s, hospitalId: hospitalOption.id }));
            await new Promise(resolve => setTimeout(resolve, 50));
            setShowContractModal(true);
            return; // Đã có thông tin, không cần gọi API nữa
          }
        } catch (err) {
          console.warn("Could not load hospital from care detail:", err);
        }
      }
      
      // Fallback: Thử gọi API (có thể cần permission team kinh doanh)
      try {
        const hospitalRes = await api.get(`/api/v1/admin/hospitals/${targetHospitalId}`);
        const hospital = hospitalRes.data;
        if (hospital) {
          const hospitalOption = {
            id: Number(hospital.id || targetHospitalId),
            label: String(hospital.name || hospital.hospitalName || `Hospital #${targetHospitalId}`)
          };
          setSelectedHospital(hospitalOption);
          setForm((s) => ({ ...s, hospitalId: hospitalOption.id }));
          await new Promise(resolve => setTimeout(resolve, 50));
          setShowContractModal(true);
        } else {
          // Nếu không có data, vẫn set với ID để form có thể submit
          setSelectedHospital({
            id: targetHospitalId,
            label: `Hospital #${targetHospitalId}`
          });
          setShowContractModal(true);
        }
      } catch (err) {
        console.error("Error loading hospital info from API (may need business team permission):", err);
        // Nếu API fail (404 - có thể do permission), vẫn set với ID để form có thể submit
        setSelectedHospital({
          id: targetHospitalId,
          label: `Hospital #${targetHospitalId}`
        });
        setShowContractModal(true);
      }
    } else {
      setSelectedHospital(null);
      setShowContractModal(true);
    }
  };

  const handleEditContract = async (contract: Contract) => {
    setEditingContract(contract);
    setError(null);
    
    try {
      // Fetch contract details từ API để lấy đầy đủ thông tin
      const { getMaintainContractById } = await import("../../../api/maintain.api");
      const contractDetail = await getMaintainContractById(Number(contract.id));
      
      // Debug: Log format từ API để kiểm tra
      console.log("API startDate raw:", contractDetail.startDate);
      console.log("API endDate raw:", contractDetail.endDate);
      
      // Map dữ liệu từ API vào form
      // Convert datetime strings sang datetime-local format (không bị ảnh hưởng bởi timezone)
      const startDateFormatted = contractDetail.startDate ? toDatetimeLocalInput(contractDetail.startDate) : null;
      const endDateFormatted = contractDetail.endDate ? toDatetimeLocalInput(contractDetail.endDate) : null;
      
      console.log("Formatted startDate:", startDateFormatted);
      console.log("Formatted endDate:", endDateFormatted);
      
      // Parse paymentStatus và paidAmount
      const paymentStatus = (contractDetail as any)?.paymentStatus ? String((contractDetail as any).paymentStatus) : "CHUA_THANH_TOAN";
      const paidAmount = typeof (contractDetail as any).paidAmount === 'number'
        ? (contractDetail as any).paidAmount
        : ((contractDetail as any).paidAmount ? Number((contractDetail as any).paidAmount) : "");

      setForm({
        contractCode: contractDetail.contractCode || contract.code || '',
        picUserId: contractDetail.picUser?.id,
        hospitalId: contractDetail.hospital?.id || hospitalId,
        durationYears: contractDetail.durationYears || '',
        yearlyPrice: contractDetail.yearlyPrice || '',
        totalPrice: contractDetail.totalPrice || '',
        kioskQuantity: contractDetail.kioskQuantity || '',
        paymentStatus: (paymentStatus === "DA_THANH_TOAN" ? "DA_THANH_TOAN" : paymentStatus === "THANH_TOAN_HET" ? "THANH_TOAN_HET" : "CHUA_THANH_TOAN") as "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET",
        paidAmount: (paymentStatus === "DA_THANH_TOAN" || paymentStatus === "THANH_TOAN_HET" ? paidAmount : ""),
        startDate: startDateFormatted,
        endDate: endDateFormatted,
      });
      
      // Set display values cho price
      setYearlyPriceDisplay(contractDetail.yearlyPrice ? formatNumber(contractDetail.yearlyPrice) : '');
      setTotalPriceDisplay(contractDetail.totalPrice ? formatNumber(contractDetail.totalPrice) : '');
      
      // Set display value cho paidAmount
      if ((paymentStatus === "DA_THANH_TOAN" || paymentStatus === "THANH_TOAN_HET") && paidAmount !== '') {
        setPaidAmountDisplay(formatNumber(paidAmount as any));
      } else {
        setPaidAmountDisplay('');
      }
      
      // Set selected hospital
      if (contractDetail.hospital) {
        setSelectedHospital({
          id: contractDetail.hospital.id,
          label: contractDetail.hospital.label || `Hospital #${contractDetail.hospital.id}`
        });
      }
      
      // Set selected PIC
      if (contractDetail.picUser) {
        setSelectedPic({
          id: contractDetail.picUser.id,
          label: contractDetail.picUser.label,
          subLabel: contractDetail.picUser.subLabel,
          phone: contractDetail.picUser.phone
        });
      }
      
      // Mở modal sau khi đã set tất cả dữ liệu
      setShowContractModal(true);
    } catch (err: any) {
      console.error("Error loading contract details:", err);
      setError(err?.response?.data?.message || "Không thể tải thông tin hợp đồng");
      // Vẫn mở modal với dữ liệu từ contract (fallback)
      setForm({
        contractCode: contract.code || '',
        picUserId: undefined,
        hospitalId: hospitalId,
        durationYears: '',
        yearlyPrice: '',
        totalPrice: '',
        kioskQuantity: '',
        paymentStatus: "CHUA_THANH_TOAN",
        paidAmount: "",
        startDate: null,
        endDate: null,
      });
      setPaidAmountDisplay("");
      setPaidAmountError(null);
      setYearlyPriceDisplay('');
      setTotalPriceDisplay('');
      setSelectedHospital(null);
      setSelectedPic(null);
      setShowContractModal(true);
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    const ok = await askConfirm({
      title: "Xóa hợp đồng?",
      message: "Bạn có chắc muốn xóa hợp đồng này? Hành động này không thể hoàn tác.",
      variant: "danger",
      confirmLabel: "Xóa",
    });
    if (!ok) return;

    setLoading(true);
    setError(null);
    
    try {
      const { deleteMaintainContract } = await import("../../../api/maintain.api");
      await deleteMaintainContract(Number(contractId), true);
      
      toast.success("Xóa hợp đồng thành công");
      
      // Refresh contracts list sau khi xóa
      if (onContractsChange && careId) {
        const { getMaintainContracts } = await import("../../../api/maintain.api");
        const contractsRes = await getMaintainContracts({
          careId: careId,
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
        const updatedContracts = contractsData.map((c: any) => ({
          id: String(c.id),
          code: c.contractCode || '',
          type: c.type || "Bảo trì (Maintenance)",
          year: c.startDate ? new Date(c.startDate).getFullYear() : new Date().getFullYear(),
          value: c.totalPrice ? `${Number(c.totalPrice).toLocaleString('vi-VN')}đ` : '0đ',
          status: c.status || "DANG_HOAT_DONG",
          linkedContract: c.linkedContract || undefined,
          startDate: c.startDate ? new Date(c.startDate).toLocaleDateString('vi-VN') : undefined,
          expiryDate: c.endDate ? new Date(c.endDate).toLocaleDateString('vi-VN') : undefined,
          daysLeft: c.daysLeft,
          picUser: c.picUser || null,
          kioskQuantity: c.kioskQuantity || null,
          paidAmount: typeof c.paidAmount === 'number' ? c.paidAmount : (c.paidAmount ? Number(c.paidAmount) : null),
          paymentStatus: c.paymentStatus ? (c.paymentStatus === "THANH_TOAN_HET" ? "THANH_TOAN_HET" : c.paymentStatus === "DA_THANH_TOAN" ? "DA_THANH_TOAN" : "CHUA_THANH_TOAN") : "CHUA_THANH_TOAN",
        }));
        onContractsChange(updatedContracts);
      } else {
        // Fallback: xóa ở frontend nếu không có onContractsChange
        const updatedContracts = contracts.filter(c => c.id !== contractId);
        onContractsChange?.(updatedContracts);
      }
    } catch (err: any) {
      console.error("Error deleting contract:", err);
      const errorMessage = err?.response?.data?.message || err?.response?.data?.data || err?.message || "Xóa hợp đồng thất bại";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRenewContract = async (contract: Contract) => {
    // Không cho gia hạn nếu hợp đồng đã có status "DA_GIA_HAN"
    if (contract.status === "DA_GIA_HAN") {
      toast.error("Hợp đồng này đã được gia hạn rồi");
      return;
    }

    const okRenew = await askConfirm({
      title: "Gia hạn hợp đồng?",
      message: `Bạn có chắc muốn gia hạn hợp đồng ${contract.code}?`,
      confirmLabel: "Tiếp tục",
    });
    if (!okRenew) return;

    try {
      // Mở form tạo hợp đồng mới với thông tin từ hợp đồng cũ
      setEditingContract(null);
      setError(null);
      
      // Fetch contract details từ API để lấy đầy đủ thông tin
      const { getMaintainContractById } = await import("../../../api/maintain.api");
      const contractDetail = await getMaintainContractById(Number(contract.id));
      
      // Set form với thông tin từ hợp đồng cũ, nhưng tạo hợp đồng mới
      // Start date sẽ là end date của hợp đồng cũ
      const startDateFormatted = contractDetail.endDate ? toDatetimeLocalInput(contractDetail.endDate) : null;
      
      setForm({
        contractCode: "", // Mã hợp đồng mới sẽ được người dùng nhập
        picUserId: contractDetail.picUser?.id,
        hospitalId: contractDetail.hospital?.id || hospitalId,
        durationYears: contractDetail.durationYears || '',
        yearlyPrice: contractDetail.yearlyPrice || '',
        totalPrice: contractDetail.totalPrice || '',
        kioskQuantity: contractDetail.kioskQuantity || '',
        paymentStatus: "CHUA_THANH_TOAN",
        paidAmount: "",
        startDate: startDateFormatted,
        endDate: null, // Sẽ được tính tự động dựa trên durationYears
      });
      setPaidAmountDisplay("");
      setPaidAmountError(null);
      
      // Set display values cho price
      setYearlyPriceDisplay(contractDetail.yearlyPrice ? formatNumber(contractDetail.yearlyPrice) : '');
      setTotalPriceDisplay(contractDetail.totalPrice ? formatNumber(contractDetail.totalPrice) : '');
      
      // Set selected hospital
      if (contractDetail.hospital) {
        setSelectedHospital({
          id: contractDetail.hospital.id,
          label: contractDetail.hospital.label || `Hospital #${contractDetail.hospital.id}`
        });
      }
      
      // Set selected PIC
      if (contractDetail.picUser) {
        setSelectedPic({
          id: contractDetail.picUser.id,
          label: contractDetail.picUser.label,
          subLabel: contractDetail.picUser.subLabel,
          phone: contractDetail.picUser.phone
        });
      }
      
      // Lưu ID hợp đồng gốc để link khi tạo hợp đồng mới
      setRenewingContractId(Number(contract.id));
      setEditingContract(null); // Không phải edit, mà là tạo mới
      
      // Mở modal để tạo hợp đồng gia hạn
      setShowContractModal(true);
      
      toast.success("Vui lòng điền thông tin hợp đồng gia hạn mới");
    } catch (err: any) {
      console.error("Error loading contract details for renewal:", err);
      toast.error("Không thể tải thông tin hợp đồng để gia hạn");
    }
  };

  // Helper functions để format số với dấu chấm phân cách hàng nghìn
  function formatNumber(value: number | ''): string {
    if (value === '' || value === null || value === undefined) return '';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function parseFormattedNumber(value: string): number | '' {
    const cleaned = value.replace(/\./g, '').replace(/[^\d]/g, '');
    if (cleaned === '' || cleaned === '0') return '';
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? '' : num;
  }

  // Helper function để convert ISO datetime string sang datetime-local format
  // Backend sử dụng LocalDateTime (không có timezone)
  // Format từ backend: "yyyy-MM-ddTHH:mm:ss" hoặc "yyyy-MM-ddTHH:mm:ss.SSSSSS" (có thể có milliseconds)
  // Format cho datetime-local input: "yyyy-MM-ddTHH:mm"
  // QUAN TRỌNG: Phải extract trực tiếp từ string, KHÔNG dùng Date object để tránh timezone conversion
  function toDatetimeLocalInput(value?: string | null): string {
    if (!value) return "";
    try {
      const raw = String(value).trim();
      if (!raw) return "";

      // Parse format từ backend: yyyy-MM-ddTHH:mm:ss hoặc yyyy-MM-ddTHH:mm:ss.SSSSSS
      // Có thể có timezone suffix (Z hoặc +07:00) nhưng không nên có vì backend dùng LocalDateTime
      // Extract trực tiếp các thành phần mà KHÔNG convert timezone
      // Pattern: yyyy-MM-ddTHH:mm:ss hoặc yyyy-MM-ddTHH:mm:ss.SSSSSS hoặc yyyy-MM-ddTHH:mm
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/);
      if (match) {
        const [, year, month, day, hours, minutes] = match;
        // Trả về format datetime-local: yyyy-MM-ddTHH:mm
        // Giữ nguyên giá trị từ backend (không convert timezone vì LocalDateTime không có timezone)
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      // Nếu không match được, có thể format là "yyyy-MM-dd HH:mm:ss" (có space thay vì T)
      const spaceMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
      if (spaceMatch) {
        const [, year, month, day, hours, minutes] = spaceMatch;
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      // KHÔNG dùng Date object làm fallback vì sẽ bị timezone conversion
      // Nếu không parse được, trả về empty string
      console.warn("Cannot parse datetime format:", raw);
      return "";
    } catch (error) {
      console.error("Error parsing datetime:", error, value);
      return "";
    }
  }

  // Format input giá tiền
  function handlePriceChange(value: string) {
    setYearlyPriceDisplay(value);
    const parsed = parseFormattedNumber(value);
    setForm((s) => ({ ...s, yearlyPrice: parsed }));
  }
  
  function handlePriceBlur() {
    if (form.yearlyPrice !== '' && typeof form.yearlyPrice === 'number') {
      setYearlyPriceDisplay(formatNumber(form.yearlyPrice));
    } else {
      setYearlyPriceDisplay('');
    }
  }
  
  function handlePriceFocus() {
    if (form.yearlyPrice !== '' && typeof form.yearlyPrice === 'number') {
      setYearlyPriceDisplay(formatNumber(form.yearlyPrice));
    } else {
      setYearlyPriceDisplay('');
    }
  }

  // Handler cho totalPrice
  function handleTotalPriceChange(value: string) {
    setTotalPriceDisplay(value);
    const parsed = parseFormattedNumber(value);
    setForm((s) => ({ ...s, totalPrice: parsed }));
  }

  function handleTotalPriceBlur() {
    if (form.totalPrice !== '' && typeof form.totalPrice === 'number') {
      setTotalPriceDisplay(formatNumber(form.totalPrice));
    } else {
      setTotalPriceDisplay('');
    }
  }

  function handleTotalPriceFocus() {
    if (typeof form.totalPrice === "number") {
      setTotalPriceDisplay(formatNumber(form.totalPrice));
    }
  }

  // Handler cho paidAmount tương tự yearlyPrice/totalPrice
  function handlePaidAmountChange(value: string) {
    setPaidAmountDisplay(value);
    const parsed = parseFormattedNumber(value);
    setForm((s) => ({ ...s, paidAmount: parsed }));
    
    // Validation real-time: kiểm tra số tiền thanh toán không vượt quá tổng tiền
    if (typeof parsed === "number" && typeof form.totalPrice === "number" && parsed > form.totalPrice) {
      setPaidAmountError("Số tiền thanh toán không được vượt quá tổng tiền hợp đồng");
    } else {
      setPaidAmountError(null);
    }
  }

  function handlePaidAmountBlur() {
    if (form.paidAmount !== '' && typeof form.paidAmount === 'number') {
      setPaidAmountDisplay(formatNumber(form.paidAmount));
    } else {
      setPaidAmountDisplay('');
    }
  }

  function handlePaidAmountFocus() {
    if (typeof form.paidAmount === "number") {
      setPaidAmountDisplay(formatNumber(form.paidAmount));
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractCode.trim()) {
      setError("Mã hợp đồng không được để trống");
      return;
    }
    if (!form.picUserId) {
      setError("Người phụ trách không được để trống");
      return;
    }
    if (!form.hospitalId) {
      setError("Bệnh viện không được để trống");
      return;
    }
    if (!careId) {
      setError("careId là bắt buộc. Vui lòng đảm bảo bạn đang tạo hợp đồng từ trang chi tiết bệnh viện.");
      return;
    }
    if (!form.durationYears || form.durationYears.trim() === "") {
      setError("Thời hạn hợp đồng không được để trống");
      return;
    }
    if (!form.yearlyPrice || (typeof form.yearlyPrice === "number" && form.yearlyPrice <= 0)) {
      setError("Giá hợp đồng phải lớn hơn 0");
      return;
    }
    if (!form.totalPrice || (typeof form.totalPrice === "number" && form.totalPrice <= 0)) {
      setError("Tổng tiền phải lớn hơn 0");
      return;
    }
    
    // Validate payment status và paid amount
    if ((form.paymentStatus || "CHUA_THANH_TOAN") === "DA_THANH_TOAN") {
      if (!form.paidAmount || (typeof form.paidAmount === "number" && form.paidAmount <= 0)) {
        setError("Khi trạng thái là 'Đã thanh toán', số tiền thanh toán phải lớn hơn 0");
        return;
      }
      // Kiểm tra số tiền thanh toán không được vượt quá tổng tiền
      if (typeof form.paidAmount === "number" && typeof form.totalPrice === "number" && form.paidAmount > form.totalPrice) {
        setError("Số tiền thanh toán không được vượt quá tổng tiền hợp đồng");
        return;
      }
    }

    // Validate và convert prices
    let yearlyPriceNum: number;
    if (typeof form.yearlyPrice === "number") {
      yearlyPriceNum = form.yearlyPrice;
    } else if (typeof form.yearlyPrice === "string") {
      const parsed = parseFormattedNumber(form.yearlyPrice);
      yearlyPriceNum = typeof parsed === "number" ? parsed : 0;
    } else {
      yearlyPriceNum = 0;
    }
    
    let totalPriceNum: number;
    if (typeof form.totalPrice === "number") {
      totalPriceNum = form.totalPrice;
    } else if (typeof form.totalPrice === "string") {
      const parsed = parseFormattedNumber(form.totalPrice);
      totalPriceNum = typeof parsed === "number" ? parsed : 0;
    } else {
      totalPriceNum = 0;
    }
    
    if (isNaN(yearlyPriceNum) || yearlyPriceNum <= 0) {
      setError("Giá hợp đồng phải lớn hơn 0");
      setLoading(false);
      setIsModalLoading(false);
      return;
    }
    if (isNaN(totalPriceNum) || totalPriceNum <= 0) {
      setError("Tổng tiền phải lớn hơn 0");
      setLoading(false);
      setIsModalLoading(false);
      return;
    }

    setLoading(true);
    setIsModalLoading(true);
    setError(null);
    
    try {
      const { createMaintainContract, updateMaintainContract } = await import("../../../api/maintain.api");

      // Convert datetime-local format sang format cho backend (LocalDateTime)
      // Backend dùng LocalDateTime nên không cần timezone, chỉ cần format yyyy-MM-ddTHH:mm:ss
      const formatDateTimeForBackend = (dt: string | null | undefined): string | null => {
        if (!dt) return null;
        // Nếu đã là format yyyy-MM-ddTHH:mm, thêm :00 cho seconds
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) {
          return `${dt}:00`;
        }
        // Nếu đã có seconds, trả về luôn
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dt)) {
          return dt;
        }
        // Fallback: parse và format lại (không convert timezone)
        try {
          // Parse như local time và format lại mà không convert timezone
          const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (match) {
            const [, year, month, day, hours, minutes, seconds = "00"] = match;
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
          }
          return null;
        } catch {
          return null;
        }
      };

      const payload = {
        contractCode: form.contractCode.trim(),
        type: "Bảo trì (Maintenance)" as const,
        picUserId: form.picUserId!,
        hospitalId: form.hospitalId!,
        careId: careId!,
        durationYears: form.durationYears.trim(),
        yearlyPrice: yearlyPriceNum,
        totalPrice: totalPriceNum,
        kioskQuantity: form.kioskQuantity && typeof form.kioskQuantity === "number" ? form.kioskQuantity : (form.kioskQuantity === "" ? null : Number(form.kioskQuantity)),
        paymentStatus: form.paymentStatus || "CHUA_THANH_TOAN",
        paidAmount: form.paymentStatus === "THANH_TOAN_HET"
          ? (typeof form.totalPrice === "number" ? form.totalPrice : null)
          : (form.paymentStatus === "DA_THANH_TOAN" && typeof form.paidAmount === "number") ? form.paidAmount : null,
        startDate: formatDateTimeForBackend(form.startDate),
        endDate: formatDateTimeForBackend(form.endDate),
        linkedContractId: renewingContractId || null, // Link với hợp đồng gốc nếu đang gia hạn
      };

      if (editingContract) {
        await updateMaintainContract(Number(editingContract.id), payload, true);
        toast.success("Cập nhật hợp đồng thành công");
      } else {
        await createMaintainContract(payload, true);
        toast.success("Tạo hợp đồng thành công");
      }
      
      setShowContractModal(false);
      setEditingContract(null);
      setRenewingContractId(null); // Reset renewing contract ID
      // Refresh contracts list
      if (onContractsChange && careId) {
        // Reload contracts from API - filter by careId
        const { getMaintainContracts } = await import("../../../api/maintain.api");
        const contractsRes = await getMaintainContracts({
          careId: careId,
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
        const updatedContracts = contractsData.map((c: any) => ({
          id: String(c.id),
          code: c.contractCode || '',
          type: c.type || "Bảo trì (Maintenance)",
          year: c.startDate ? new Date(c.startDate).getFullYear() : new Date().getFullYear(),
          value: c.totalPrice ? `${Number(c.totalPrice).toLocaleString('vi-VN')}đ` : '0đ',
          status: c.status || "DANG_HOAT_DONG",
          linkedContract: c.linkedContract || undefined,
          startDate: c.startDate ? new Date(c.startDate).toLocaleDateString('vi-VN') : undefined,
          expiryDate: c.endDate ? new Date(c.endDate).toLocaleDateString('vi-VN') : undefined,
          daysLeft: c.daysLeft,
          picUser: c.picUser || null,
          kioskQuantity: c.kioskQuantity || null,
          paidAmount: typeof c.paidAmount === 'number' ? c.paidAmount : (c.paidAmount ? Number(c.paidAmount) : null),
          paymentStatus: c.paymentStatus ? (c.paymentStatus === "THANH_TOAN_HET" ? "THANH_TOAN_HET" : c.paymentStatus === "DA_THANH_TOAN" ? "DA_THANH_TOAN" : "CHUA_THANH_TOAN") : "CHUA_THANH_TOAN",
        }));
        onContractsChange(updatedContracts);
      }
    } catch (e: any) {
      const errorMessage = e?.response?.data?.message || e?.response?.data?.data || e?.message || "Lưu thất bại";
      setError(errorMessage);
      
      // Hiển thị toast error
      if (editingContract) {
        toast.error(`Cập nhật hợp đồng thất bại: ${errorMessage}`);
      } else {
        toast.error(`Tạo hợp đồng thất bại: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
      setIsModalLoading(false);
    }
  };

  const handleCloseContractModal = () => {
    setShowContractModal(false);
    setEditingContract(null);
    setRenewingContractId(null); // Reset renewing contract ID
    setError(null);
    setYearlyPriceDisplay("");
    setTotalPriceDisplay("");
    setPaidAmountDisplay("");
    setPaidAmountError(null);
    
    // Xóa query params khi đóng modal
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('action');
    setSearchParams(newParams, { replace: true });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Đang hoạt động</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.active}</p>
            </div>
            <FiCheckCircle className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Sắp hết hạn</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.expiringSoon}</p>
            </div>
            <FiAlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Đã hết hạn</p>
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{stats.expired}</p>
            </div>
            <FiFileText className="h-8 w-8 text-gray-500" />
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">Đã gia hạn</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.extended}</p>
            </div>
            <FiRefreshCw className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Tổng giá trị</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(stats.totalValue)}
              </p>
            </div>
            {/* <FiDollarSign className="h-8 w-8 text-emerald-500" /> */}
          </div>
        </div>
      </div>

      {/* Header với search và filter */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 flex gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FiSearch className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm theo mã, loại hợp đồng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
            />
          </div>
          
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
              showFilters || statusFilter !== "all" || typeFilter !== "all"
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
            }`}
          >
            <FiFilter className="h-4 w-4" />
            Lọc
          </button>
        </div>

        {/* Add Button */}
        <button
          onClick={handleAddContract}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition shrink-0"
        >
          <FiPlus className="h-4 w-4" />
          Tạo hợp đồng mới
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trạng thái
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Tất cả</option>
                <option value="DANG_HOAT_DONG">Đang hoạt động</option>
                <option value="SAP_HET_HAN">Sắp hết hạn</option>
                <option value="DA_GIA_HAN">Đã gia hạn</option>
                <option value="HET_HAN">Hết hạn</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Loại hợp đồng
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Tất cả</option>
                <option value="Bảo trì (Maintenance)">Bảo trì (Maintenance)</option>
                <option value="Bảo hành (Warranty)">Bảo hành (Warranty)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Contracts Table */}
      <div className="w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700" style={{ maxWidth: '100%' }}>
        <table className="min-w-[1200px] divide-y divide-gray-200 dark:divide-gray-700" style={{ width: 'max-content' }}>
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Mã Hợp Đồng
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Loại Hợp Đồng
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Số kiosk
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Giá Trị
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Thanh toán
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Ngày Ký HD
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Ngày Hết Hạn HD
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Trạng Thái
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Người phụ trách
              </th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Liên Kết
              </th>
              <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-gray-400">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
            {filteredContracts.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center">
                  <FiFileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                      ? "Không tìm thấy hợp đồng nào"
                      : "Chưa có hợp đồng nào"}
                  </p>
                </td>
              </tr>
            ) : (
              filteredContracts.map((contract) => {
                const isExpiringSoon = contract.status === "SAP_HET_HAN";
                const isExtended = contract.status === "DA_GIA_HAN";
  return (
                  <tr
                    key={contract.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${
                      isExpiringSoon ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                    } ${
                      isExtended ? "bg-green-50/50 dark:bg-green-900/10" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          {contract.code}
                        </span>
                        {isExpiringSoon && (
                          <FiAlertTriangle className="h-4 w-4 text-amber-600" title="Sắp hết hạn" />
                        )}
                        {isExtended && (
                          <FiRefreshCw className="h-4 w-4 text-green-600" title="Đã gia hạn" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        {contract.type === "Bảo hành (Warranty)" ? (
                          <FiShield className="h-4 w-4 text-green-500" />
                        ) : (
                          <FiTool className="h-4 w-4 text-blue-500" />
                        )}
                        {contract.type}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      {contract.kioskQuantity !== null && contract.kioskQuantity !== undefined 
                        ? contract.kioskQuantity.toLocaleString('vi-VN')
                        : <span className="text-gray-400">-</span>
                      }
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      {contract.value}
                    </td>
                    <td className="py-3 px-4">
                      {contract.paymentStatus === "THANH_TOAN_HET" ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                             Thanh toán hết
                          </span>
                          {typeof contract.paidAmount === "number" && contract.paidAmount > 0 && (
                            <span className="text-xs text-center text-gray-600">
                              {formatCurrency(contract.paidAmount)}
                            </span>
                          )}
                        </div>
                      ) : contract.paymentStatus === "DA_THANH_TOAN" ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                            Đã thanh toán
                          </span>
                          {typeof contract.paidAmount === "number" && contract.paidAmount > 0 && (
                            <span className="text-xs text-center text-gray-600">
                              {formatCurrency(contract.paidAmount)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                          Chưa thanh toán
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      {contract.startDate ? (
                        <div className="flex items-center gap-1">
                          <FiCalendar className="h-3.5 w-3.5 text-gray-400" />
                          {contract.startDate}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      {contract.expiryDate ? (
                        <div className="flex items-center gap-1">
                          <FiCalendar className="h-3.5 w-3.5 text-gray-400" />
                          {contract.expiryDate}
                          {/* Ẩn phần hiển thị daysLeft nếu hợp đồng đã gia hạn */}
                          {contract.daysLeft !== undefined && contract.status !== "DA_GIA_HAN" && (
                            <span className={`text-xs ml-2 ${
                              contract.daysLeft <= 30 ? "text-red-600" : "text-gray-500"
                            }`}>
                              ({contract.daysLeft > 0 ? `Còn ${contract.daysLeft} ngày` : `Quá ${Math.abs(contract.daysLeft)} ngày`})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          statusConfig[contract.status]?.bgColor
                        } ${statusConfig[contract.status]?.textColor}`}
                      >
                        {contract.status === "DA_GIA_HAN" && (
                          <FiRefreshCw className="h-3 w-3" />
                        )}
                        {statusConfig[contract.status]?.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                      {contract.picUser?.label ? (
                        <div className="flex items-center gap-2">
                          <FiUser className="h-4 w-4 text-gray-400" />
                          <div>
                            <div className="font-medium">{contract.picUser.label}</div>
                            {contract.picUser.subLabel && (
                              <div className="text-xs text-gray-500">{contract.picUser.subLabel}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {contract.linkedContract ? (
                        <div className="flex flex-col gap-0.5">
                          {contract.status === "DA_GIA_HAN" && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              Gia hạn từ
                            </span>
                          )}
                          <button className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
                            <FiExternalLink className="h-3.5 w-3.5" />
                            {contract.linkedContract}
                          </button>
                          
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">
                          {contract.status === "DA_GIA_HAN" ? "Hợp đồng gốc" : "Gốc"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRenewContract(contract)}
                          disabled={contract.status === "DA_GIA_HAN"}
                          className={`p-1.5 rounded transition ${
                            contract.status === "DA_GIA_HAN"
                              ? "text-gray-300 cursor-not-allowed dark:text-gray-600"
                              : "text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                          }`}
                          title={
                            contract.status === "DA_GIA_HAN"
                              ? "Hợp đồng đã được gia hạn"
                              : "Gia hạn hợp đồng"
                          }
                        >
                          <FiRefreshCw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditContract(contract)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition dark:hover:bg-blue-900/20"
                          title="Sửa"
                        >
                          <FiEdit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteContract(contract.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition dark:hover:bg-red-900/20"
                          title="Xóa"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Contract Modal - Using MaintainContractForm */}
      <MaintainContractForm
        open={showContractModal}
        isViewing={false}
        isEditing={!!editingContract}
        isModalLoading={isModalLoading}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onClose={handleCloseContractModal}
        error={error}
        loading={loading}
        canEdit={true}
        selectedHospital={selectedHospital}
        setSelectedHospital={setSelectedHospital}
        selectedPic={selectedPic}
        setSelectedPic={setSelectedPic}
        picOptions={picOptions}
        yearlyPriceDisplay={yearlyPriceDisplay}
        setYearlyPriceDisplay={setYearlyPriceDisplay}
        totalPriceDisplay={totalPriceDisplay}
        setTotalPriceDisplay={setTotalPriceDisplay}
        handlePriceChange={handlePriceChange}
        handlePriceBlur={handlePriceBlur}
        handlePriceFocus={handlePriceFocus}
        handleTotalPriceChange={handleTotalPriceChange}
        handleTotalPriceBlur={handleTotalPriceBlur}
        handleTotalPriceFocus={handleTotalPriceFocus}
        paidAmountDisplay={paidAmountDisplay}
        setPaidAmountDisplay={setPaidAmountDisplay}
        handlePaidAmountChange={handlePaidAmountChange}
        handlePaidAmountBlur={handlePaidAmountBlur}
        handlePaidAmountFocus={handlePaidAmountFocus}
        paidAmountError={paidAmountError}
        careId={careId}
      />
      {genericConfirmDialog}
    </div>
  );
}
