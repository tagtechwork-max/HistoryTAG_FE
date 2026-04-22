import { useEffect, useMemo, useRef, useState } from "react";
import { searchHospitals } from "../../../api/business.api";
import { getAllCustomerCares } from "../../../api/customerCare.api";

// Format date time: HH:mm-dd/MM/yyyy
function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
    if (match) {
      const [, year, month, day, hours, minutes] = match;
      return `${hours}:${minutes}-${day}/${month}/${year}`;
    }
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return "—";
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes}-${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

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

export type WarrantyContractForm = {
  contractCode: string;
  picUserId?: number;
  hospitalId?: number;
  durationYears: string;
  yearlyPrice: number | "";
  totalPrice: number | "";
  startDate?: string | null;
  endDate?: string | null;
  kioskQuantity?: number | "";
  paymentStatus: "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET";
  paidAmount?: number | "";
  paymentDate?: string | null;
};

// Component RemoteSelect cho Pic User
function RemoteSelectPic({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder?: string;
  options: PicUserOption[];
  value: PicUserOption | null;
  onChange: (v: PicUserOption | null) => void;
  disabled?: boolean;
}) {
  const [openBox, setOpenBox] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!q.trim()) return options;
    const searchLower = q.toLowerCase().trim();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(searchLower) ||
      opt.subLabel?.toLowerCase().includes(searchLower) ||
      opt.phone?.includes(q)
    );
  }, [options, q]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpenBox(false);
        setQ("");
      }
    };
    if (openBox) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openBox]);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="relative">
        <div
          ref={inputRef}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm cursor-pointer focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF]"
          onClick={() => {
            if (!disabled) setOpenBox(!openBox);
          }}
        >
          {openBox ? (
            <input
              type="text"
              className="w-full outline-none bg-transparent"
              placeholder={placeholder || "Tìm kiếm..."}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHighlight(-1);
              }}
              onKeyDown={(e) => {
                if (!openBox) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, filteredOptions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (highlight >= 0 && filteredOptions[highlight]) {
                    onChange(filteredOptions[highlight]);
                    setQ(filteredOptions[highlight].label);
                    setOpenBox(false);
                  }
                } else if (e.key === "Escape") {
                  setOpenBox(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              disabled={disabled}
            />
          ) : (
            <div className="flex items-center justify-between">
              <span className={value ? "text-gray-900" : "text-gray-500"}>
                {value ? value.label : placeholder || "Chọn..."}
              </span>
              {!value && (
                <svg className={`w-4 h-4 transition-transform ${openBox ? 'rotate-180' : ''} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          )}
        </div>
        {/* {value && !openBox && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              setQ("");
            }}
            aria-label="Clear"
          >
            ✕
          </button>
        )} */}
        {openBox && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-[110] mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg"
            style={{ maxHeight: "200px", overflowY: "auto" }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
            ) : (
              filteredOptions.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                    idx === highlight ? "bg-gray-100" : ""
                  }`}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt);
                    setOpenBox(false);
                    setQ(""); // Clear q sau khi chọn
                  }}
                >
                  <div className="font-medium text-gray-800">{opt.label}</div>
                  {opt.subLabel && (
                    <div className="text-xs text-gray-500">{opt.subLabel}</div>
                  )}
                  {opt.phone && (
                    <div className="text-xs text-gray-500">{opt.phone}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component RemoteSelect cho Hospital - đơn giản hóa theo RemoteSelect từ implementation-tasks
function RemoteSelectHospital({
  label,
  placeholder,
  fetchOptions,
  value,
  onChange,
  disabled,
}: {
  label: string;
  placeholder?: string;
  fetchOptions: (q: string) => Promise<HospitalOption[]>;
  value: HospitalOption | null;
  onChange: (v: HospitalOption | null) => void;
  disabled?: boolean;
}) {
  const [openBox, setOpenBox] = useState(false);
  const [q, setQ] = useState("");
  const [loadingBox, setLoadingBox] = useState(false);
  const [options, setOptions] = useState<HospitalOption[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Đảm bảo khi value thay đổi và không mở dropdown, input hiển thị đúng
  useEffect(() => {
    if (value && !openBox) {
      // Khi có value và không mở dropdown, đảm bảo openBox là false
      // và input sẽ hiển thị value.label
      setOpenBox(false);
    }
  }, [value]);

  // Chỉ search khi user nhập ít nhất 1 ký tự
  useEffect(() => {
    if (!q.trim() || q.trim().length < 1) {
      setOptions([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoadingBox(true);
      try {
        const res = await fetchOptions(q.trim());
        if (alive) setOptions(res);
      } catch (err) {
        console.error("Error fetching hospitals:", err);
        if (alive) setOptions([]);
      } finally {
        if (alive) setLoadingBox(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, fetchOptions]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpenBox(false);
        if (!value) {
          setQ("");
        }
      }
    };

    if (openBox) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openBox, value]);

  // Auto focus input when openBox becomes true
  useEffect(() => {
    if (openBox && inputRef.current) {
      inputRef.current.focus();
    }
  }, [openBox]);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="relative">
        <div
          className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF]"
        >
          <input
            ref={inputRef}
            type="text"
            className="w-full outline-none bg-transparent"
            placeholder={placeholder || "Nhập để tìm bệnh viện..."}
            value={openBox ? q : value?.label || ""}
            onChange={(e) => {
              setQ(e.target.value);
              setOpenBox(true);
            }}
            onFocus={() => {
              setOpenBox(true);
              if (value) {
                setQ(value.label);
              }
            }}
            onBlur={(e) => {
              // Delay để cho phép click vào option
              setTimeout(() => {
                const activeElement = document.activeElement;
                const dropdown = e.currentTarget.closest('.relative')?.querySelector('.absolute');
                if (dropdown && !dropdown.contains(activeElement) && activeElement !== e.currentTarget) {
                  setOpenBox(false);
                  if (!value) {
                    setQ("");
                  }
                }
              }, 200);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, options.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (highlight >= 0 && options[highlight]) {
                  onChange(options[highlight]);
                  setOpenBox(false);
                  setQ(""); // Clear q sau khi chọn
                }
              } else if (e.key === "Escape") {
                setOpenBox(false);
                setQ(""); // Clear q khi escape
              }
            }}
            disabled={disabled}
            readOnly={!openBox && !!value}
            onClick={() => {
              if (!disabled && !openBox) {
                setOpenBox(true);
                if (value) {
                  setQ(value.label);
                }
              }
            }}
          />
          {!openBox && value && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
        {/* {value && !openBox && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              setQ("");
            }}
            aria-label="Clear"
          >
            ✕
          </button>
        )} */}
        {openBox && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-[110] mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            {loadingBox && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                Đang tìm kiếm...
              </div>
            )}
            {!loadingBox && options.length === 0 && q.trim().length >= 1 && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                Không tìm thấy bệnh viện nào
              </div>
            )}
            {!loadingBox && options.length === 0 && q.trim().length < 1 && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                Nhập tên bệnh viện để tìm kiếm...
              </div>
            )}
            {!loadingBox && options.length > 0 &&
              options.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                    idx === highlight ? "bg-gray-100" : ""
                  }`}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt);
                    setOpenBox(false);
                    setQ(""); // Clear q sau khi chọn
                  }}
                >
                  <div className="font-medium text-gray-800">{opt.label}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

type MaintainContractFormProps = {
  open: boolean;
  isViewing: boolean;
  isEditing: boolean;
  isModalLoading: boolean;
  form: WarrantyContractForm;
  setForm: React.Dispatch<React.SetStateAction<WarrantyContractForm>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  error: string | null;
  loading: boolean;
  canEdit: boolean;
  selectedHospital: HospitalOption | null;
  setSelectedHospital: (v: HospitalOption | null) => void;
  selectedPic: PicUserOption | null;
  setSelectedPic: (v: PicUserOption | null) => void;
  picOptions: PicUserOption[];
  yearlyPriceDisplay: string;
  setYearlyPriceDisplay: (v: string) => void;
  totalPriceDisplay: string;
  setTotalPriceDisplay: (v: string) => void;
  handlePriceChange: (value: string) => void;
  handlePriceBlur: () => void;
  handlePriceFocus: () => void;
  handleTotalPriceChange: (value: string) => void;
  handleTotalPriceBlur: () => void;
  handleTotalPriceFocus: () => void;
  paidAmountDisplay: string;
  setPaidAmountDisplay: (v: string) => void;
  handlePaidAmountChange: (value: string) => void;
  handlePaidAmountBlur: () => void;
  handlePaidAmountFocus: () => void;
  paidAmountError?: string | null;
  careId?: number; // ID của CustomerCareHospital - nếu có thì disable hospital field
};

export default function MaintainContractForm({
  open,
  isViewing,
  isEditing,
  isModalLoading,
  form,
  setForm,
  onSubmit,
  onClose,
  error,
  loading,
  canEdit,
  selectedHospital,
  setSelectedHospital,
  selectedPic,
  setSelectedPic,
  picOptions,
  yearlyPriceDisplay,
  setYearlyPriceDisplay,
  totalPriceDisplay,
  setTotalPriceDisplay,
  handlePriceChange,
  handlePriceBlur,
  handlePriceFocus,
  handleTotalPriceChange,
  handleTotalPriceBlur,
  handleTotalPriceFocus,
  paidAmountDisplay,
  setPaidAmountDisplay,
  handlePaidAmountChange,
  handlePaidAmountBlur,
  handlePaidAmountFocus,
  paidAmountError,
  careId,
}: MaintainContractFormProps) {
  const [isEndDateManuallyEdited, setIsEndDateManuallyEdited] = useState(false);

  const searchHospitalsWrapped = useMemo(
    () => async (term: string) => {
      const t = (term || "").trim();
      const searchLower = t.toLowerCase();

      // Primary: global hospital search API (works for any hospital, not only those in customer care)
      try {
        const list = await searchHospitals(t);
        const mapped = Array.isArray(list)
          ? list.map((h: any) => {
              const id = Number(h.id ?? h.hospitalId);
              const label = String(
                h.label ?? h.name ?? h.hospitalName ?? (Number.isFinite(id) ? String(id) : "")
              ).trim();
              return { id, label };
            })
          : [];
        const valid = mapped.filter((h) => Number.isFinite(h.id) && h.label);
        if (valid.length > 0) {
          return valid.sort((a, b) => a.label.localeCompare(b.label, "vi", { sensitivity: "base" }));
        }
      } catch (e) {
        console.error("searchHospitals failed:", e);
      }

      // Fallback: hospitals referenced on customer care records
      try {
        const customerCaresRes = await getAllCustomerCares({
          page: 0,
          size: 1000,
          sortBy: "createdAt",
          sortDir: "desc",
        });
        const hospitals = new Map<number, { id: number; label: string }>();
        const content = customerCaresRes?.content || customerCaresRes || [];
        content.forEach((care: any) => {
          if (care.hospitalId && care.hospitalName) {
            const hospitalId = Number(care.hospitalId);
            const hospitalName = String(care.hospitalName || "");
            if (t) {
              if (
                !hospitalName.toLowerCase().includes(searchLower) &&
                !(String(care.hospitalCode || "").toLowerCase().includes(searchLower))
              ) {
                return;
              }
            }
            if (!hospitals.has(hospitalId)) {
              hospitals.set(hospitalId, { id: hospitalId, label: hospitalName });
            }
          }
        });
        return Array.from(hospitals.values()).sort((a, b) =>
          a.label.localeCompare(b.label, "vi", { sensitivity: "base" })
        );
      } catch (e) {
        console.error("Error loading hospitals from customer care:", e);
        return [];
      }
    },
    []
  );

  // Parse durationYears để lấy số năm và số tháng
  const parseDuration = (duration: string): { years: number; months: number } => {
    if (!duration || !duration.trim()) return { years: 0, months: 0 };
    
    // Tìm số năm: "1 năm", "2 năm", etc.
    const yearMatch = duration.match(/(\d+)\s*năm/i);
    const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    
    // Tìm số tháng: "6 tháng", "3 tháng", etc.
    const monthMatch = duration.match(/(\d+)\s*tháng/i);
    const months = monthMatch ? parseInt(monthMatch[1], 10) : 0;
    
    return { years, months };
  };

  // Sync selectedHospital khi modal mở
  useEffect(() => {
    if (open && selectedHospital) {
      // Đảm bảo form có hospitalId khi modal mở
      if (form.hospitalId !== selectedHospital.id) {
        setForm((s) => ({ ...s, hospitalId: selectedHospital.id }));
      }
      // Force re-render để đảm bảo RemoteSelectHospital nhận được value mới
    }
  }, [open, selectedHospital, form.hospitalId]);

  // Tự động tính ngày kết thúc khi ngày bắt đầu hoặc thời hạn thay đổi
  useEffect(() => {
    // Chỉ tự động tính nếu người dùng chưa chỉnh sửa endDate thủ công
    if (isEndDateManuallyEdited) return;
    
    if (form.startDate && form.durationYears) {
      const { years, months } = parseDuration(form.durationYears);
      
      if (years > 0 || months > 0) {
        try {
          // Parse startDate từ format "yyyy-MM-ddTHH:mm"
          const match = form.startDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
          if (match) {
            const [, year, month, day, hours, minutes] = match;
            const startDateObj = new Date(
              parseInt(year, 10),
              parseInt(month, 10) - 1,
              parseInt(day, 10),
              parseInt(hours, 10),
              parseInt(minutes, 10)
            );
            
            // Thêm năm và tháng
            const endDateObj = new Date(startDateObj);
            endDateObj.setFullYear(endDateObj.getFullYear() + years);
            endDateObj.setMonth(endDateObj.getMonth() + months);
            
            // Format lại thành "yyyy-MM-ddTHH:mm" cho datetime-local input
            const endYear = String(endDateObj.getFullYear());
            const endMonth = String(endDateObj.getMonth() + 1).padStart(2, "0");
            const endDay = String(endDateObj.getDate()).padStart(2, "0");
            const endHours = String(endDateObj.getHours()).padStart(2, "0");
            const endMinutes = String(endDateObj.getMinutes()).padStart(2, "0");
            
            const calculatedEndDate = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;
            
            setForm((s) => ({ ...s, endDate: calculatedEndDate }));
          }
        } catch (e) {
          console.error("Error calculating end date:", e);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startDate, form.durationYears, isEndDateManuallyEdited]);

  // Reset flag khi modal đóng
  useEffect(() => {
    if (!open) {
      setIsEndDateManuallyEdited(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[1] w-full max-w-4xl rounded-3xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
        <div className="sticky top-0 z-20 bg-white rounded-t-3xl px-8 pt-8 pb-4 border-b border-gray-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold text-gray-900">
              {isEditing ? "Cập nhật hợp đồng bảo trì" : "Tạo hợp đồng bảo trì"}
            </h3>
          </div>
        </div>

        <div
          className="overflow-y-auto px-8 pb-8 [&::-webkit-scrollbar]:hidden mt-6"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isModalLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <svg
                className="mb-4 h-12 w-12 animate-spin text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Đang tải chi tiết...</span>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* LEFT */}
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Mã hợp đồng*
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={form.contractCode}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, contractCode: e.target.value }))
                    }
                    disabled={isViewing || !canEdit}
                    placeholder="VD: HD-BH-001"
                  />
                </div>

                <RemoteSelectHospital
                  key={`hospital-${selectedHospital?.id || 'empty'}-${open ? 'open' : 'closed'}`}
                  label="Bệnh viện*"
                  placeholder="Chọn bệnh viện..."
                  fetchOptions={searchHospitalsWrapped}
                  value={selectedHospital}
                  onChange={(v) => {
                    setSelectedHospital(v);
                    setForm((s) => ({ ...s, hospitalId: v ? v.id : undefined }));
                  }}
                  disabled={isViewing || !canEdit || !!careId}
                />

                <RemoteSelectPic
                  label="Người phụ trách*"
                  placeholder="Chọn người phụ trách..."
                  options={picOptions}
                  value={selectedPic}
                  onChange={(v) => {
                    setSelectedPic(v);
                    setForm((s) => ({ ...s, picUserId: v ? v.id : undefined }));
                  }}
                  disabled={isViewing || !canEdit}
                />

                {/* Thời gian bắt đầu hợp đồng */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Thời gian bắt đầu hợp đồng
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                      value={form.startDate || ""}
                      onChange={(e) => {
                        setForm((s) => ({ ...s, startDate: e.target.value || null }));
                        // Reset flag khi ngày bắt đầu thay đổi để tự động tính lại
                        setIsEndDateManuallyEdited(false);
                      }}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                </div>

                {/* Thời hạn hợp đồng */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Thời hạn hợp đồng*
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={form.durationYears}
                    onChange={(e) => {
                      setForm((s) => ({ ...s, durationYears: e.target.value }));
                      // Reset flag khi thời hạn thay đổi để tự động tính lại
                      setIsEndDateManuallyEdited(false);
                    }}
                    disabled={isViewing || !canEdit}
                    placeholder="Ví dụ: 1 năm 6 tháng, 2 năm 3 tháng..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Nhập thời hạn để tự động tính ngày kết thúc
                  </p>
                </div>

                {/* Ngày kết thúc hợp đồng */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Ngày kết thúc hợp đồng
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                      value={form.endDate || ""}
                      onChange={(e) => {
                        setForm((s) => ({ ...s, endDate: e.target.value || null }));
                        // Đánh dấu là người dùng đã chỉnh sửa thủ công
                        setIsEndDateManuallyEdited(true);
                      }}
                      disabled={isViewing || !canEdit}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Giá hợp đồng (1 năm)*
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={yearlyPriceDisplay || formatNumber(form.yearlyPrice)}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    onBlur={handlePriceBlur}
                    onFocus={handlePriceFocus}
                    disabled={isViewing || !canEdit}
                    placeholder="Nhập số tiền..."
                  />
                  
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Tổng tiền*
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={totalPriceDisplay || formatNumber(form.totalPrice)}
                    onChange={(e) => handleTotalPriceChange(e.target.value)}
                    onBlur={handleTotalPriceBlur}
                    onFocus={handleTotalPriceFocus}
                    disabled={isViewing || !canEdit}
                    placeholder="Nhập tổng tiền..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Trạng thái thanh toán*
                  </label>
                  <select
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={form.paymentStatus || "CHUA_THANH_TOAN"}
                    onChange={(e) => {
                      const next = (e.target.value || "CHUA_THANH_TOAN") as "CHUA_THANH_TOAN" | "DA_THANH_TOAN" | "THANH_TOAN_HET";
                      if (next === "THANH_TOAN_HET") {
                        // Thanh toán hết → tự gán paidAmount = totalPrice
                        const total = typeof form.totalPrice === "number" ? form.totalPrice : 0;
                        setForm((s) => ({
                          ...s,
                          paymentStatus: next,
                          paidAmount: total > 0 ? total : "",
                          paymentDate: s.paymentDate || "",
                        }));
                        setPaidAmountDisplay(total > 0 ? formatNumber(total) : "");
                      } else if (next === "DA_THANH_TOAN") {
                        setForm((s) => ({
                          ...s,
                          paymentStatus: next,
                          paidAmount: s.paidAmount,
                          paymentDate: s.paymentDate || "",
                        }));
                      } else {
                        setForm((s) => ({
                          ...s,
                          paymentStatus: next,
                          paidAmount: "",
                          paymentDate: null,
                        }));
                        setPaidAmountDisplay("");
                      }
                    }}
                    disabled={isViewing || !canEdit}
                  >
                    <option value="CHUA_THANH_TOAN">Chưa thanh toán</option>
                    <option value="DA_THANH_TOAN">Đã thanh toán</option>
                    <option value="THANH_TOAN_HET">Thanh toán hết</option>
                  </select>
                </div>

                {((form.paymentStatus || "CHUA_THANH_TOAN") === "DA_THANH_TOAN" || form.paymentStatus === "THANH_TOAN_HET") && (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        {form.paymentStatus === "THANH_TOAN_HET" ? "Số tiền thanh toán (= Tổng tiền HĐ)" : "Số tiền thanh toán*"}
                      </label>
                      <input
                        required={form.paymentStatus === "DA_THANH_TOAN"}
                        type="text"
                        className={`w-full rounded-xl border-2 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 ${
                          paidAmountError ? "border-red-500" : form.paymentStatus === "THANH_TOAN_HET" ? "border-green-400 bg-green-50" : "border-gray-300"
                        }`}
                        value={paidAmountDisplay ?? (form.paidAmount ? formatNumber(form.paidAmount as any) : '')}
                        onChange={(e) => handlePaidAmountChange(e.target.value)}
                        onBlur={handlePaidAmountBlur}
                        onFocus={handlePaidAmountFocus}
                        placeholder="Nhập số tiền đã thanh toán..."
                        disabled={form.paymentStatus === "THANH_TOAN_HET" || isViewing || !canEdit}
                      />
                      {form.paymentStatus === "THANH_TOAN_HET" ? (
                        <p className="mt-1 text-xs text-green-600"></p>
                      ) : paidAmountError ? (
                        <p className="mt-1 text-xs text-red-500">{paidAmountError}</p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500">Ví dụ: 1.000.000</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">Ngày thanh toán*</label>
                      <input
                        required
                        type="date"
                        className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                        value={form.paymentDate || ""}
                        onChange={(e) => {
                          setForm((s) => ({ ...s, paymentDate: e.target.value || null }));
                        }}
                        disabled={isViewing || !canEdit}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Số lượng kiosk
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-xl border-2 border-gray-300 px-5 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50"
                    value={form.kioskQuantity === "" ? "" : form.kioskQuantity || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((s) => ({
                        ...s,
                        kioskQuantity: value === "" ? "" : (value ? parseInt(value, 10) || "" : "")
                      }));
                    }}
                    disabled={isViewing || !canEdit}
                    placeholder="Nhập số lượng kiosk..."
                  />
                </div>

                {/* Ghi chú auto-tính cho ngày kết thúc (khi chưa sửa tay) */}
                {!isEndDateManuallyEdited && form.startDate && form.durationYears && (
                  <div>
                    <p className="mt-1 text-xs text-gray-500">
                      Ngày kết thúc sẽ được tự động tính từ ngày bắt đầu và thời hạn.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="col-span-1 md:col-span-2 mt-4 flex items-center justify-between border-t border-gray-200 pt-6">
                {error && (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400"
                    onClick={onClose}
                  >
                    Huỷ
                  </button>
                  {canEdit && (
                    <button
                      type="submit"
                      className="rounded-xl border-2 border-blue-500 bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading}
                    >
                      {loading ? "Đang lưu..." : isEditing ? "Cập nhật" : "Tạo mới"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

