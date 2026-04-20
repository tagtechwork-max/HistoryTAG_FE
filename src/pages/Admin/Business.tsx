import React, { useState, useEffect } from 'react';
import { searchHardware, searchHospitals, createBusiness, getBusinesses, updateBusiness, deleteBusiness, getBusinessById, getHardwareById, getBusinessPicOptions } from '../../api/business.api';
import { getAllUsers } from '../../api/superadmin.api';
import api from '../../api/client';
import { toast as hotToast } from 'react-hot-toast';
import {
  PlusIcon,
  PencilIcon,
  TrashBinIcon,
  EyeIcon,
  DollarLineIcon,
  UserCircleIcon,
  GroupIcon,
  EnvelopeIcon,
  BoxCubeIcon,
  CalenderIcon,
  TimeIcon,
  BoxIconLine,
  CheckCircleIcon,
  TaskIcon,
} from '../../icons';
import { FiCheckCircle, FiXCircle, FiDownload } from 'react-icons/fi';
import ExcelJS from 'exceljs';
import { motion, AnimatePresence } from 'framer-motion';
import Pagination from '../../components/common/Pagination';
import ComponentCard from '../../components/common/ComponentCard';
import { normalizeBusinessContractName } from '../../utils/businessContract';

type ITUserOption = { id: number; name: string; phone?: string | null };

import { useAuth } from '../../contexts/AuthContext';

const BusinessPage: React.FC = () => {
  // ✅ Use AuthContext hook - Performance optimized với useMemo, reactive với token changes
  const { roles, isAdmin, isSuperAdmin } = useAuth();
  
  // Read stored user (may contain team information)
  const storedUserRaw = localStorage.getItem('user') || sessionStorage.getItem('user');
  let storedUser: Record<string, any> | null = null;
  try {
    storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
  } catch {
    storedUser = null;
  }
  const userTeam = storedUser && storedUser.team ? String(storedUser.team).toUpperCase() : null;
  // Page access: allow if ADMIN/SUPERADMIN or we have a logged-in user (teams can view). This keeps viewing broadly available in admin area.
  const pageAllowed = isAdmin || isSuperAdmin || Boolean(storedUser);
  // Manage rights: only SUPERADMIN or team SALES can create/update/delete
  const canManage = isSuperAdmin || userTeam === 'SALES';

  const [hardwareOptions, setHardwareOptions] = useState<Array<{ id: number; label: string; subLabel?: string }>>([]);
  const [hospitalOptions, setHospitalOptions] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedHardwareId, setSelectedHardwareId] = useState<number | null>(null);
  const [selectedHardwarePrice, setSelectedHardwarePrice] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | ''>('');
  const [unitPriceNet, setUnitPriceNet] = useState<number | ''>('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [selectedHospitalPhone, setSelectedHospitalPhone] = useState<string | null>(null);
  const [businessPicOptionsState, setBusinessPicOptionsState] = useState<Array<{ id: number; label: string; subLabel?: string; phone?: string | null }>>([]);
  const [selectedPicId, setSelectedPicId] = useState<number | null>(null);
  const [picDropdownOpen, setPicDropdownOpen] = useState<boolean>(false);
  const [picSearchInput, setPicSearchInput] = useState<string>('');
  const [hospitalDropdownOpen, setHospitalDropdownOpen] = useState<boolean>(false);
  const [hospitalSearchInput, setHospitalSearchInput] = useState<string>('');
  // commission is the user-facing input (entered as amount in VND)
  const [commission, setCommission] = useState<number | ''>('');
  const [commissionDisplay, setCommissionDisplay] = useState<string>('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [name, setName] = useState<string>('');
  const [statusValue, setStatusValue] = useState<string>('CARING');
  const [startDateValue, setStartDateValue] = useState<string>('');
  const [completionDateValue, setCompletionDateValue] = useState<string>('');
  const [warrantyEnabled, setWarrantyEnabled] = useState<boolean>(false);
  const [warrantyStartDateValue, setWarrantyStartDateValue] = useState<string>('');
  const [warrantyEndDateValue, setWarrantyEndDateValue] = useState<string>('');
  const [warrantyDuration, setWarrantyDuration] = useState<string>('');
  const [isWarrantyEndDateManuallyEdited, setIsWarrantyEndDateManuallyEdited] = useState(false);
  const [originalStatus, setOriginalStatus] = useState<string>('CARING');
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{ payload: Record<string, unknown>; isUpdate: boolean; successMessage?: string } | null>(null);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [pendingCreateSubmit, setPendingCreateSubmit] = useState<{ payload: Record<string, unknown>; isUpdate: boolean; successMessage?: string } | null>(null);
  const [hospitalNameForConfirm, setHospitalNameForConfirm] = useState<string>("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [bankName, setBankName] = useState<string>('');
  const [bankContactPerson, setBankContactPerson] = useState<string>('');
  const [paymentStatusValue, setPaymentStatusValue] = useState<'CHUA_THANH_TOAN' | 'DA_THANH_TOAN' | 'THANH_TOAN_HET'>('CHUA_THANH_TOAN');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paidAmountDisplay, setPaidAmountDisplay] = useState<string>('');
  const [paymentDateValue, setPaymentDateValue] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [attachments, setAttachments] = useState<Array<{ url: string; fileName: string }>>([]);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  type BusinessItem = {
    id: number;
    name?: string;
    hospital?: { id?: number; label?: string } | null;
    hospitalPhone?: string | null;
    hardware?: { label?: string } | null;
    picUser?: { id?: number; label?: string; subLabel?: string } | null;
    quantity?: number | null;
    unitPrice?: number | null;
    unitPriceNet?: number | null;
    totalPrice?: number | null;
    commission?: number | null;
    status?: string | null;
    startDate?: string | null;
    completionDate?: string | null;
    warrantyStartDate?: string | null;
    warrantyEndDate?: string | null;
    createdAt?: string | null;
    bankName?: string | null;
    bankContactPerson?: string | null;
    notes?: string | null;
    attachments?: Array<{ url: string; fileName: string }>;
    implementationCompleted?: boolean | null;
    paymentStatus?: string | null;
    paidAmount?: number | null;
    paymentDate?: string | null;
  };

  function formatDateShort(value?: string | null) {
    if (!value) return '—';
    try {
      const d = new Date(value);
      const dd = d.getDate();
      const mm = d.getMonth() + 1;
      const yyyy = d.getFullYear();
      return `${dd.toString().padStart(2,'0')}/${mm.toString().padStart(2,'0')}/${yyyy}`;
    } catch {
      return '—';
    }
  }
  function formatBusinessId(id?: number | null) {
    if (id == null) return '—';
    // Prefix 'HD' and pad to 2 digits (HD01, HD02, ...)
    const n = Number(id);
    if (Number.isNaN(n)) return String(id);
    return `HD${String(n).padStart(2, '0')}`;
  }

  function formatFilterDateLabel(value?: string | null) {
    if (!value) return '—';
    if (value.includes('T')) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('vi-VN');
    }
    const parts = value.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return value;
  }

  function parseDateForFilter(value?: string | null, isEnd = false) {
    if (!value || value.trim() === '') return null;
    const base = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
    if (Number.isNaN(base.getTime())) return null;
    if (isEnd) {
      base.setHours(23, 59, 59, 999);
    } else {
      base.setHours(0, 0, 0, 0);
    }
    return base;
  }

  function applyLocalDateFilter(source: BusinessItem[]): BusinessItem[] {
    const fromDate = parseDateForFilter(filterStartFrom, false);
    const toDate = parseDateForFilter(filterStartTo, true);
    if (!fromDate && !toDate) return source;
    return source.filter((item) => {
      const candidateRaw = item.startDate ?? item.createdAt ?? null;
      if (!candidateRaw) return false;
      const candidate = new Date(candidateRaw);
      if (Number.isNaN(candidate.getTime())) return false;
      if (fromDate && candidate < fromDate) return false;
      if (toDate && candidate > toDate) return false;
      return true;
    });
  }

  // Ensure items with status 'CARING' (Đang chăm sóc) are shown first.
  // Secondary sort: newer startDate first. Non-dates are treated as 0.
  function sortBusinessItems(list: BusinessItem[]) {
    return list.slice().sort((a, b) => {
      const aCare = (a.status ?? '').toString().toUpperCase() === 'CARING';
      const bCare = (b.status ?? '').toString().toUpperCase() === 'CARING';
      if (aCare && !bCare) return -1;
      if (!aCare && bCare) return 1;
      const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bTime - aTime;
    });
  }

  // Small Info helper (styled like Hospitals page) -------------------------------------------------
  function Info({ label, value, icon }: { label: string; value?: React.ReactNode; icon?: React.ReactNode }) {
    return (
      <div className="flex items-start gap-4">
        <div className="min-w-[150px] flex items-center gap-3">
          {icon && <span className="text-gray-500 text-lg">{icon}</span>}
          <span className="font-semibold text-gray-900">{label}:</span>
        </div>
        <div className="flex-1 text-gray-700 break-words">{value ?? '—'}</div>
      </div>
    );
  }

  // Detail Field Component for CRM-style view (hides empty fields)
  function DetailField({ label, value }: { label: string; value?: React.ReactNode | string | null }) {
    if (!value || value === '—' || (typeof value === 'string' && value.trim() === '')) {
      return null; // Hide empty fields
    }
    return (
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1.5">{label}</div>
        <div className="text-sm text-gray-900">{typeof value === 'string' ? value : value}</div>
      </div>
    );
  }

  const [items, setItems] = useState<BusinessItem[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [filterStartFrom, setFilterStartFrom] = useState<string>('');
  const [filterStartTo, setFilterStartTo] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('ALL');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<BusinessItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const picDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const filteredBusinessPicOptions = React.useMemo(() => {
    const q = picSearchInput.trim().toLowerCase();
    if (!q) return businessPicOptionsState;
    return businessPicOptionsState.filter((opt) => opt.label.toLowerCase().includes(q) || (opt.subLabel ?? '').toLowerCase().includes(q));
  }, [businessPicOptionsState, picSearchInput]);
  const selectedPicOption = React.useMemo(() => {
    if (selectedPicId == null) return null;
    return businessPicOptionsState.find((opt) => opt.id === selectedPicId) ?? null;
  }, [selectedPicId, businessPicOptionsState]);
  const searchFilterTimeoutRef = React.useRef<number | null>(null);
  const [dateFilterOpen, setDateFilterOpen] = useState<boolean>(false);
  const [pendingFilterStart, setPendingFilterStart] = useState<string>('');
  const [pendingFilterEnd, setPendingFilterEnd] = useState<string>('');
  const dateFilterRef = React.useRef<HTMLDivElement | null>(null);
  const hospitalPhoneCacheRef = React.useRef<Map<number, string | null>>(new Map());
  const reloadTimeoutRef = React.useRef<number | null>(null);
  const initialSearchAppliedRef = React.useRef(false);
  const initialStatusAppliedRef = React.useRef(false);
  const initialDateAppliedRef = React.useRef(false);
  const initialPicAppliedRef = React.useRef(false);
  const [filterPicId, setFilterPicId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pendingStartInputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingEndInputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (!dateFilterOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
        setDateFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dateFilterOpen]);


  async function fetchHardwareOptions(q: string) {
    try {
      const list = await searchHardware(q);
      setHardwareOptions(list || []);
    } catch (e) {
      console.error(e);
    }
  }

  function normalizeDateForStart(value?: string | null) {
    if (!value || value.trim() === '') return undefined;
    if (value.length === 10) return `${value}T00:00:00`;
    if (value.length === 16) return `${value}:00`;
    if (value.length >= 19) return value.substring(0, 19);
    return value;
  }

  function normalizeDateForEnd(value?: string | null) {
    if (!value || value.trim() === '') return undefined;
    if (value.length === 10) return `${value}T23:59:59`;
    if (value.length === 16) return `${value}:59`;
    if (value.length >= 19) return value.substring(0, 19);
    return value;
  }

  async function fetchHospitalOptions(q: string) {
    try {
      const list = await searchHospitals(q);
      setHospitalOptions(list || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadList(page = currentPage, size = itemsPerPage) {
    try {
  const usePicFilter = Boolean(filterPicId);
  const effectivePage = page;
  const effectiveSize = size;
  const params: Record<string, unknown> = { page: effectivePage, size: effectiveSize };
      const startFromParam = normalizeDateForStart(filterStartFrom);
      const startToParam = normalizeDateForEnd(filterStartTo);
      if (startFromParam) params.startDateFrom = startFromParam;
      if (startToParam) params.startDateTo = startToParam;
      const trimmedSearch = filterSearch.trim();
      if (trimmedSearch) params.search = trimmedSearch;
      if (filterStatus && filterStatus !== 'ALL') params.status = filterStatus;
      if (filterPaymentStatus && filterPaymentStatus !== 'ALL') params.paymentStatus = filterPaymentStatus;
      if (filterPicId) params.picUserId = filterPicId;
      console.debug('[Business] loadList params', params);
      const res = await getBusinesses(params);
      const content = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
      // ensure numeric fields are numbers
      const normalized = (content as Array<Record<string, unknown>>).map((c) => {
        const unit = c['unitPrice'] ?? c['unit_price'];
        const total = c['totalPrice'] ?? c['total_price'];
        const comm = c['commission'];
        const qty = c['quantity'] ?? c['qty'] ?? c['amount'];
        // accept multiple possible keys for start/completion
        const start = (c['startDate'] ?? c['start_date'] ?? c['start'] ?? c['startDateTime']) as string | undefined | null;
        const completion = (c['completionDate'] ?? c['finishDate'] ?? c['completion_date'] ?? c['finish_date'] ?? c['finishDate']) as string | undefined | null;
        const warrantyStart = (c['warrantyStartDate'] ?? c['warranty_start_date']) as string | undefined | null;
        const warrantyEnd = (c['warrantyEndDate'] ?? c['warranty_end_date']) as string | undefined | null;
        const created = (c['createdAt'] ?? c['created_at']) as string | undefined | null;
        const picRaw = c['picUser'] ?? c['pic_user'] ?? null;
        let picUser: BusinessItem['picUser'] = null;
        if (picRaw && typeof picRaw === 'object') {
          const pr = picRaw as Record<string, unknown>;
          const pid = pr['id'];
          const plabel = pr['label'] ?? pr['name'];
          const psub = pr['subLabel'] ?? pr['sub_label'] ?? pr['email'];
          picUser = {
            id: pid != null ? Number(pid) : undefined,
            label: plabel != null ? String(plabel) : undefined,
            subLabel: psub != null ? String(psub) : undefined,
          };
        }
        return {
          ...c,
          unitPrice: unit != null ? Number(String(unit)) : null,
          unitPriceNet: c['unitPriceNet'] != null ? Number(String(c['unitPriceNet'])) : null,
          totalPrice: total != null ? Number(String(total)) : null,
          commission: comm != null ? Number(String(comm)) : null,
          quantity: qty != null ? Number(String(qty)) : null,
          startDate: start ?? null,
          completionDate: completion ?? null,
          warrantyStartDate: warrantyStart ?? null,
          warrantyEndDate: warrantyEnd ?? null,
          createdAt: created ?? null,
          picUser,
          bankName: c['bankName'] ?? c['bank_name'] ?? null,
          bankContactPerson: c['bankContactPerson'] ?? c['bank_contact_person'] ?? null,
          notes: c['notes'] ?? null,
          attachments: Array.isArray(c['attachments']) ? c['attachments'] : [],
          implementationCompleted: Boolean(c['implementationCompleted']),
          paymentStatus: (c['paymentStatus'] ?? c['payment_status'] ?? null) as string | null,
          paidAmount: c['paidAmount'] != null ? Number(String(c['paidAmount'])) : null,
          paymentDate: (c['paymentDate'] ?? c['payment_date'] ?? null) as string | null,
        } as BusinessItem;
      });
      const locallyFiltered = applyLocalDateFilter(normalized);
      const filteredByPic = filterPicId
        ? locallyFiltered.filter((item) => {
            const rawId = item.picUser?.id;
            const numericId = rawId != null ? Number(rawId) : null;
            return numericId != null && Number.isFinite(numericId) && numericId === filterPicId;
          })
        : locallyFiltered;
      const finalList = sortBusinessItems(filteredByPic);
      setItems(finalList);
      let listForTotals = finalList;
      // fetch phone numbers for each unique hospital in the list (best-effort, cache results)
      try {
        const cache = hospitalPhoneCacheRef.current;
        const hospitalIds = (normalized as BusinessItem[])
          .map((it) => {
            const id = it.hospital?.id;
            if (id == null) return null;
            const numericId = Number(id);
            return Number.isFinite(numericId) ? numericId : null;
          })
          .filter((id): id is number => id != null);

        const uniqueIds = Array.from(new Set(hospitalIds));
        const idsToFetch = uniqueIds.filter((id) => !cache.has(id));

        if (idsToFetch.length) {
          await Promise.all(
            idsToFetch.map(async (hid) => {
              try {
                const r = await api.get(`/api/v1/auth/hospitals/${hid}`);
                const d = r.data || {};
                const phone = d.contactNumber || d.contact_number || d.contactPhone || d.contact_phone || null;
                cache.set(hid, phone ?? null);
              } catch {
                cache.set(hid, null);
              }
            }),
          );
        }

        const withPhones = (normalized as BusinessItem[]).map((it) => {
          const hidRaw = it.hospital?.id;
          const hid = hidRaw != null ? Number(hidRaw) : null;
          const phone = hid != null && Number.isFinite(hid) ? cache.get(hid) ?? null : null;
          return { ...it, hospitalPhone: phone };
        });

        const withPhonesFiltered = applyLocalDateFilter(withPhones);
        const withPhonesPicFiltered = filterPicId
          ? withPhonesFiltered.filter((item) => {
              const rawId = item.picUser?.id;
              const numericId = rawId != null ? Number(rawId) : null;
              return numericId != null && Number.isFinite(numericId) && numericId === filterPicId;
            })
          : withPhonesFiltered;
        const finalWithPhones = sortBusinessItems(withPhonesPicFiltered);
        setItems(finalWithPhones);
        listForTotals = finalWithPhones;
      } catch (e) {
        // ignore phone enrichment failures
        // console.warn('Failed to enrich hospitals with phone', e);
      }
      const fallbackTotal = res?.totalElements ?? (Array.isArray(res) ? res.length : content.length);
      setTotalItems(fallbackTotal);
      setTotalPages(res?.totalPages ?? 1);
      setCurrentPage(res?.number ?? page);
    } catch (e) {
      console.error(e);
    }
  }

  // helper: current datetime in `YYYY-MM-DDTHH:mm` for <input type="datetime-local">
  function nowDateTimeLocal() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  // helper: convert a YYYY-MM-DDTHH:mm (16 chars) to backend form with :00 seconds when needed
  function toLocalDateTimeStr(v?: string | null) {
    return v ? (v.length === 16 ? `${v}:00` : v) : undefined;
  }

  // Parse duration string để lấy số năm và số tháng
  function parseWarrantyDuration(duration: string): { years: number; months: number } {
    if (!duration || !duration.trim()) return { years: 0, months: 0 };
    
    // Tìm số năm: "1 năm", "2 năm", etc.
    const yearMatch = duration.match(/(\d+)\s*năm/i);
    const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    
    // Tìm số tháng: "6 tháng", "3 tháng", etc.
    const monthMatch = duration.match(/(\d+)\s*tháng/i);
    const months = monthMatch ? parseInt(monthMatch[1], 10) : 0;
    
    return { years, months };
  }

  // Helper: Tính ngày kết thúc từ ngày bắt đầu + duration string
  function calculateWarrantyEndDate(startDate: string, duration: string): string {
    if (!startDate || !duration || !duration.trim()) return '';
    
    const { years, months } = parseWarrantyDuration(duration);
    if (years === 0 && months === 0) return '';
    
    try {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) return '';
      
      const end = new Date(start);
      end.setFullYear(start.getFullYear() + years);
      end.setMonth(start.getMonth() + months);
      
      // Format về datetime-local format (YYYY-MM-DDTHH:mm)
      const yyyy = end.getFullYear();
      const mm = String(end.getMonth() + 1).padStart(2, '0');
      const dd = String(end.getDate()).padStart(2, '0');
      const hh = String(start.getHours()).padStart(2, '0');
      const min = String(start.getMinutes()).padStart(2, '0');
      
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    } catch {
      return '';
    }
  }

  // Tự động tính ngày kết thúc khi thay đổi ngày bắt đầu hoặc duration
  useEffect(() => {
    // Chỉ tự động tính nếu người dùng chưa chỉnh sửa endDate thủ công
    if (isWarrantyEndDateManuallyEdited) return;
    
    if (warrantyEnabled && warrantyStartDateValue && warrantyDuration && warrantyDuration.trim()) {
      const calculatedEndDate = calculateWarrantyEndDate(warrantyStartDateValue, warrantyDuration);
      if (calculatedEndDate) {
        setWarrantyEndDateValue(calculatedEndDate);
      }
    }
  }, [warrantyEnabled, warrantyStartDateValue, warrantyDuration, isWarrantyEndDateManuallyEdited]);

  // Reset flag khi modal đóng hoặc warrantyEnabled thay đổi
  useEffect(() => {
    if (!showModal || !warrantyEnabled) {
      setIsWarrantyEndDateManuallyEdited(false);
    }
  }, [showModal, warrantyEnabled]);

  async function loadBusinessPicOptions() {
    try {
      const list = await getBusinessPicOptions();
      const baseOptions = Array.isArray(list)
        ? list.map((item: any) => ({
            id: Number(item?.id ?? 0),
            label: String(item?.label ?? ''),
            subLabel: item?.subLabel ? String(item.subLabel) : undefined,
            phone: item?.phone ? String(item.phone) : null,
          }))
        : [];

      // ✅ Lấy tất cả users và filter SUPERADMIN - CHỈ GỌI KHI USER LÀ SUPERADMIN
      let superAdminOptions: Array<{ id: number; label: string; subLabel?: string }> = [];
      // ✅ Guard: chỉ gọi getAllUsers() nếu user là SUPERADMIN
      if (isSuperAdmin) {
      try {
        const res = await getAllUsers({ page: 0, size: 200 });
        const content = Array.isArray(res?.content)
          ? res.content
          : Array.isArray(res)
          ? res
          : [];
        superAdminOptions = content
          .filter((user: any) => {
            const roles = user?.roles;
            if (!roles) return false;
            const roleArr = Array.isArray(roles) ? roles : [];
            return roleArr.some((r: any) => {
              if (!r) return false;
              if (typeof r === 'string') return r.toUpperCase() === 'SUPERADMIN';
              const roleName = r.roleName ?? r.role_name ?? r.role;
              return typeof roleName === 'string' && roleName.toUpperCase() === 'SUPERADMIN';
            });
          })
          .map((user: any) => ({
            id: Number(user?.id ?? 0),
            label: String(user?.fullname ?? user?.fullName ?? user?.username ?? user?.email ?? `User #${user?.id ?? ''}`),
            subLabel: user?.email ? String(user.email) : undefined,
            phone: user?.phone ? String(user.phone).trim() : null,
          }));
      } catch (err) {
        // ignore if superadmin endpoint not accessible
        // console.warn('Failed to fetch superadmin users for PIC options', err);
        }
      }

      const mergedMap = new Map<number, { id: number; label: string; subLabel?: string; phone?: string | null }>();
      [...baseOptions, ...superAdminOptions].forEach((opt) => {
        if (!opt || !opt.id) return;
        if (!opt.label || !opt.label.trim()) return;
        if (!mergedMap.has(opt.id)) {
          mergedMap.set(opt.id, { ...opt, label: opt.label.trim() });
        }
      });

      const merged = Array.from(mergedMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, 'vi', { sensitivity: 'base' })
      );

      setBusinessPicOptionsState((prev) => {
        if (selectedPicId && !merged.some((opt) => opt.id === selectedPicId)) {
          const existing = prev.find((opt) => opt.id === selectedPicId);
          return existing ? [...merged, existing] : merged;
        }
        return merged;
      });
    } catch (err) {
      console.error('Failed to load business PIC options', err);
      setBusinessPicOptionsState([]);
    }
  }

  React.useEffect(() => {
    fetchHardwareOptions('');
    // KHÔNG load tất cả bệnh viện khi mount - chỉ load khi user search
    // fetchHospitalOptions('');
    loadBusinessPicOptions();
  }, []);
  React.useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        window.clearTimeout(reloadTimeoutRef.current);
      }
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { loadList(currentPage, itemsPerPage); }, [currentPage, itemsPerPage, reloadKey]);

  const scheduleReload = React.useCallback((options?: { resetPage?: boolean; delay?: number }) => {
    const { resetPage = false, delay = 0 } = options || {};
    if (reloadTimeoutRef.current) {
      window.clearTimeout(reloadTimeoutRef.current);
    }
    const execute = () => {
      if (resetPage) setCurrentPage(0);
      setReloadKey((key) => key + 1);
      reloadTimeoutRef.current = null;
    };
    reloadTimeoutRef.current = window.setTimeout(execute, delay > 0 ? delay : 0);
  }, []);

  // Debounce hospital search - chỉ load khi user nhập ít nhất 2 ký tự
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Chỉ search khi có ít nhất 2 ký tự để tránh load quá nhiều dữ liệu
      if (hospitalSearchInput && hospitalSearchInput.trim().length >= 2) {
        fetchHospitalOptions(hospitalSearchInput);
      } else if (hospitalSearchInput && hospitalSearchInput.trim().length === 0) {
        // Nếu xóa hết, clear options
        setHospitalOptions([]);
      } else {
        // Nếu chỉ có 1 ký tự, không load
        setHospitalOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [hospitalSearchInput]);

  React.useEffect(() => {
    if (!initialSearchAppliedRef.current) {
      initialSearchAppliedRef.current = true;
      return;
    }
    if (searchFilterTimeoutRef.current) {
      window.clearTimeout(searchFilterTimeoutRef.current);
    }
    searchFilterTimeoutRef.current = window.setTimeout(() => {
      scheduleReload({ resetPage: true });
    }, 400);
    return () => {
      if (searchFilterTimeoutRef.current) {
        window.clearTimeout(searchFilterTimeoutRef.current);
      }
    };
  }, [filterSearch, scheduleReload]);

  React.useEffect(() => {
    if (!initialStatusAppliedRef.current) {
      initialStatusAppliedRef.current = true;
      return;
    }
    scheduleReload({ resetPage: true });
  }, [filterStatus, scheduleReload]);

  React.useEffect(() => {
    scheduleReload({ resetPage: true });
  }, [filterPaymentStatus, scheduleReload]);

  React.useEffect(() => {
    if (!initialDateAppliedRef.current) {
      initialDateAppliedRef.current = true;
      return;
    }
    scheduleReload({ resetPage: true });
  }, [filterStartFrom, filterStartTo, scheduleReload]);

  React.useEffect(() => {
    if (!initialPicAppliedRef.current) {
      initialPicAppliedRef.current = true;
      return;
    }
    scheduleReload({ resetPage: true });
  }, [filterPicId, scheduleReload]);

  React.useEffect(() => {
    if (!picDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (picDropdownRef.current && !picDropdownRef.current.contains(event.target as Node)) {
        setPicDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [picDropdownOpen]);

  React.useEffect(() => {
    if (!picDropdownOpen) {
      setPicSearchInput('');
    }
  }, [picDropdownOpen]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!hospitalDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.hospital-dropdown-container')) {
        setHospitalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [hospitalDropdownOpen]);

  function applyFilters() {
    scheduleReload({ resetPage: true });
  }

  function clearFilters() {
    setFilterStartFrom('');
    setFilterStartTo('');
    setFilterStatus('ALL');
    setFilterPaymentStatus('ALL');
    setFilterSearch('');
    setFilterPicId(null);
    scheduleReload({ resetPage: true });
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!canManage) return setToast({ message: 'Bạn không có quyền thực hiện thao tác này', type: 'error' });
    
    // Clear previous errors
    const errors: Record<string, string> = {};
    
    // validation
    if (!name || name.trim().length === 0) errors.name = 'Mã hợp đồng là bắt buộc';
    
    // Check duplicate contract code (name) - check in current items first
    if (name && name.trim().length > 0) {
      const trimmedName = name.trim();
      const candidateLower = trimmedName.toLowerCase();
      const candidateNormalized = normalizeBusinessContractName(trimmedName);
      const matchesExistingName = (value?: string | null) => {
        const existingTrimmed = (value ?? '').toString().trim();
        if (!existingTrimmed) return false;
        if (existingTrimmed.toLowerCase() === candidateLower) return true;
        const existingNormalized = normalizeBusinessContractName(existingTrimmed);
        if (existingNormalized && candidateNormalized) {
          return existingNormalized === candidateNormalized;
        }
        return false;
      };

      const duplicate = items.find(item => {
        // Exclude current editing item if in edit mode
        if (editingId && item.id === editingId) return false;
        return matchesExistingName(item.name);
      });
      if (duplicate) {
        errors.name = 'Mã hợp đồng đã được sử dụng';
      }
      
      // If no duplicate found in current items, check via API with search (optimized: only fetch first 100 matches)
      if (!duplicate) {
        try {
          // Use search to find potential duplicates instead of fetching all records
          const searchResults = await getBusinesses({ page: 0, size: 100, search: trimmedName });
          const allItems = Array.isArray(searchResults?.content) ? searchResults.content : (Array.isArray(searchResults) ? searchResults : []);
          const duplicateInAll = allItems.find((item: BusinessItem) => {
            // Exclude current editing item if in edit mode
            if (editingId && item.id === editingId) return false;
            return matchesExistingName(item.name);
          });
          if (duplicateInAll) {
            errors.name = 'Mã hợp đồng đã được sử dụng';
          }
        } catch (err) {
          // If API fails, rely on items check only
          // console.warn('Failed to check duplicate contract code via API', err);
        }
      }
    }
    
    if (!selectedHospitalId) errors.selectedHospitalId = 'Vui lòng chọn bệnh viện';
    // if (!selectedHardwareId) errors.selectedHardwareId = 'Vui lòng chọn phần cứng';
    if (businessPicOptionsState.length > 0 && !selectedPicId) errors.selectedPicId = 'Vui lòng chọn người phụ trách';
    if (!quantity || quantity < 1) errors.quantity = 'Số lượng phải lớn hơn hoặc bằng 1';
    // Validate paid amount khi trạng thái thanh toán là DA_THANH_TOAN
    if (paymentStatusValue === 'DA_THANH_TOAN') {
      if (paidAmount === '' || paidAmount <= 0) {
        errors.paidAmount = 'Khi trạng thái là "Đã thanh toán", số tiền phải lớn hơn 0';
      } else {
        const total = computeTotal();
        if (total > 0 && paidAmount > total) {
          errors.paidAmount = 'Số tiền thanh toán không được vượt quá thành tiền';
        }
      }
    }
    if (paymentStatusValue === 'DA_THANH_TOAN' || paymentStatusValue === 'THANH_TOAN_HET') {
      if (!paymentDateValue || paymentDateValue.trim() === '') {
        errors.paymentDateValue = 'Vui lòng nhập ngày thanh toán';
      }
    }

    // Ensure startDate is set (default to now) so backend always receives a start date
    const finalStart = startDateValue && startDateValue.trim() !== '' ? startDateValue : nowDateTimeLocal();
    // Validate completion date is not earlier than start date
    if (completionDateValue && completionDateValue.trim() !== '') {
      try {
        const st = new Date(finalStart);
        const comp = new Date(completionDateValue);
        if (comp.getTime() < st.getTime()) {
          errors.completionDateValue = 'Ngày hoàn thành không được nhỏ hơn ngày bắt đầu';
        }
      } catch {
        // ignore parse errors, backend will validate further
      }
    }

    // Optional warranty block validation
    if (warrantyEnabled) {
      if (!warrantyStartDateValue || warrantyStartDateValue.trim() === '') {
        errors.warrantyStartDateValue = 'Vui lòng nhập ngày bắt đầu bảo hành';
      }
      // Chỉ require ngày kết thúc nếu không có duration
      if (!warrantyEndDateValue || warrantyEndDateValue.trim() === '') {
        if (!warrantyDuration || !warrantyDuration.trim()) {
          errors.warrantyEndDateValue = 'Vui lòng nhập ngày hết hạn bảo hành hoặc thời hạn bảo hành';
        }
      }
      if (warrantyStartDateValue && warrantyEndDateValue) {
        try {
          const wStart = new Date(warrantyStartDateValue);
          const wEnd = new Date(warrantyEndDateValue);
          if (wEnd.getTime() < wStart.getTime()) {
            errors.warrantyEndDateValue = 'Ngày hết hạn bảo hành phải sau ngày bắt đầu bảo hành';
          }
        } catch {
          // ignore parse errors, backend will validate further
        }
      }
    }

    // If there are validation errors, set them and stop
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Clear errors if validation passes
    setFieldErrors({});

    const finalUnitPrice = unitPrice !== '' ? Number(unitPrice) : (selectedHardwarePrice ?? null);
    const payload: Record<string, unknown> = {
      name,
      hospitalId: selectedHospitalId,
      hardwareId: selectedHardwareId,
      quantity,
      status: statusValue,
      startDate: toLocalDateTimeStr(finalStart),
      completionDate: toLocalDateTimeStr(completionDateValue),
      // some backends use 'finishDate' instead of 'completionDate' — include both to be safe
      finishDate: toLocalDateTimeStr(completionDateValue),
      warrantyEndDate: warrantyEnabled && warrantyEndDateValue && warrantyEndDateValue.trim() !== '' ? toLocalDateTimeStr(warrantyEndDateValue) : null,
      hasWarranty: warrantyEnabled, // Gửi flag để backend biết có tự động tạo MaintainContract
      picUserId: selectedPicId ?? null,
      bankName: bankName?.trim() || null,
      bankContactPerson: bankContactPerson?.trim() || null,
      unitPrice: finalUnitPrice,
      unitPriceNet: unitPriceNet !== '' ? Number(unitPriceNet) : null,
      paymentStatus: paymentStatusValue,
      paidAmount:
        paymentStatusValue === 'THANH_TOAN_HET'
          ? (finalUnitPrice != null && quantity ? finalUnitPrice * (typeof quantity === 'number' ? quantity : 0) : null)
          : (paymentStatusValue === 'DA_THANH_TOAN' && typeof paidAmount === 'number' ? paidAmount : null),
      paymentDate:
        (paymentStatusValue === 'DA_THANH_TOAN' || paymentStatusValue === 'THANH_TOAN_HET')
          ? toLocalDateTimeStr(paymentDateValue ? `${paymentDateValue}T00:00` : null)
          : null,
      notes: notes?.trim() || null,
      attachmentUrls: attachments.map(a => a.url),
    };
    // Optional warranty start date (only send when enabled)
    if (warrantyEnabled && warrantyStartDateValue && warrantyStartDateValue.trim() !== '') {
      payload.warrantyStartDate = toLocalDateTimeStr(warrantyStartDateValue);
    }

    // commission is entered directly as amount
    if (commission !== '') {
      const commissionValue = Number(commission);
      // console.log('Submitting commission:', commission, 'As number:', commissionValue);
      payload.commission = commissionValue;
    }

    const isUpdate = Boolean(editingId);
    
    // Check nếu đang tạo mới (không phải edit) và bệnh viện đã có hợp đồng
    // Optimized: Only fetch first page to check if hospital has any existing business
    if (!isUpdate && selectedHospitalId) {
      try {
        // Fetch only first page (10 items) to check if hospital has existing business
        const existingBusinesses = await getBusinesses({ page: 0, size: 10 });
        const allItems = Array.isArray(existingBusinesses?.content) ? existingBusinesses.content : (Array.isArray(existingBusinesses) ? existingBusinesses : []);
        const hasExisting = allItems.some((item: BusinessItem) => {
          return item.hospital?.id === selectedHospitalId;
        });
        
        if (hasExisting) {
          // Tìm tên bệnh viện từ các nguồn
          let hospitalName = "bệnh viện này";
          if (selectedHospitalId) {
            // Tìm trong hospitalOptions trước (nhanh nhất)
            const hospitalOpt = hospitalOptions.find(h => h.id === selectedHospitalId);
            if (hospitalOpt?.label) {
              hospitalName = hospitalOpt.label;
            } else {
              // Tìm trong items
              const existingItem = items.find(h => h.hospital?.id === selectedHospitalId);
              if (existingItem?.hospital?.label) {
                hospitalName = existingItem.hospital.label;
              } else {
                // Tìm trong existingBusinesses
                const existingBusiness = allItems.find((item: BusinessItem) => item.hospital?.id === selectedHospitalId);
                if (existingBusiness?.hospital?.label) {
                  hospitalName = existingBusiness.hospital.label;
                }
              }
            }
          }
          setHospitalNameForConfirm(hospitalName);
          setPendingCreateSubmit({ payload, isUpdate: false, successMessage: undefined });
          setConfirmCreateOpen(true);
          return;
        }
      } catch (e) {
        // console.warn("Failed to check existing business contracts, proceeding anyway", e);
      }
    }
    
    const requireConfirm = statusValue === 'CONTRACTED' && originalStatus !== 'CONTRACTED';
    if (requireConfirm && !statusConfirmOpen) {
      setPendingSubmit({ payload, isUpdate, successMessage: 'Chuyển trạng thái thành công' });
      setStatusConfirmOpen(true);
      return;
    }

    await submitBusiness(payload, isUpdate, requireConfirm ? 'Chuyển trạng thái thành công' : undefined);
  }

  async function submitBusiness(
    payload: Record<string, unknown>,
    isUpdate: boolean,
    successMessage?: string,
  ) {
    setPendingSubmit(null);
    setStatusConfirmOpen(false);
    setSaving(true);
    try {
      if (isUpdate) {
        if (!editingId) throw new Error('Không xác định được ID để cập nhật');
        await updateBusiness(editingId, payload, canManage);
      } else {
        await createBusiness(payload, canManage);
      }
      setToast({ message: successMessage ?? (isUpdate ? 'Cập nhật thành công' : 'Tạo thành công'), type: 'success' });
      setName('');
      setSelectedHardwareId(null);
      setSelectedHardwarePrice(null);
      setUnitPrice('');
      setUnitPriceNet('');
      setQuantity(1);
      setStatusValue('CARING');
      setOriginalStatus('CARING');
      setCommission('');
      setCommissionDisplay('');
      setSelectedHospitalId(null);
      setSelectedHospitalPhone(null);
      setSelectedPicId(null);
      setHospitalSearchInput('');
      setCompletionDateValue('');
      setWarrantyEnabled(false);
      setWarrantyStartDateValue('');
      setWarrantyEndDateValue('');
      setWarrantyDuration('');
      setStartDateValue(nowDateTimeLocal());
      setBankName('');
      setBankContactPerson('');
      setNotes('');
      setAttachments([]);
      setEditingId(null);
      setShowModal(false);
      // reload the first page so the new item is visible
      setCurrentPage(0);
      await loadList(0, itemsPerPage);
      await loadBusinessPicOptions();
    } catch (err: any) {
      console.error('Error saving business:', err);
      console.error('Error response:', err?.response);
      console.error('Error response data:', err?.response?.data);
      
      // Lấy message lỗi từ API response - thử nhiều cách
      let errorMessage = 'Lỗi khi lưu dữ liệu';
      
      if (err?.response?.data) {
        const data = err.response.data;
        // Thử các trường có thể chứa message
        errorMessage = data.message 
          || data.data 
          || data.error 
          || (typeof data === 'string' ? data : JSON.stringify(data));
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      // Log để debug
      console.log('Extracted error message:', errorMessage);
      
      // Hiển thị toast notification ở góc phải trên để không bị che bởi modal
      // Sử dụng hotToast.error với position top-right và z-index cao
      hotToast.error(errorMessage, {
        duration: 6000,
        position: 'top-right',
        style: {
          background: '#fee2e2',
          color: '#991b1b',
          padding: '16px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          maxWidth: '600px',
          zIndex: 100004, // Cao hơn modal (z-[110] = 110) và Toaster default
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        },
        className: 'business-error-toast',
      });
      
      // Giữ lại toast cũ để tương thích (nếu có UI hiển thị toast cũ)
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function computeTotal() {
    const price = unitPrice !== '' ? Number(unitPrice) : (selectedHardwarePrice ?? 0);
    if (price === 0) return 0;
    return price * (Number(quantity) || 0);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      // Fetch ALL items matching current filters (no pagination)
      const params: Record<string, unknown> = { page: 0, size: 99999 };
      const trimmedSearch = filterSearch.trim();
      if (trimmedSearch) params.search = trimmedSearch;
      if (filterStatus && filterStatus !== 'ALL') params.status = filterStatus;
      if (filterPaymentStatus && filterPaymentStatus !== 'ALL') params.paymentStatus = filterPaymentStatus;
      if (filterPicId) params.picUserId = filterPicId;
      const startFromParam = normalizeDateForStart(filterStartFrom);
      const startToParam = normalizeDateForEnd(filterStartTo);
      if (startFromParam) params.startDateFrom = startFromParam;
      if (startToParam) params.startDateTo = startToParam;

      const res = await getBusinesses(params as any);
      const content = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
      // Normalize
      const allItems = (content as Array<Record<string, unknown>>).map((c) => {
        const unit = c['unitPrice'] ?? c['unit_price'];
        const total = c['totalPrice'] ?? c['total_price'];
        const comm = c['commission'];
        const qty = c['quantity'] ?? c['qty'] ?? c['amount'];
        const start = (c['startDate'] ?? c['start_date']) as string | undefined | null;
        const completion = (c['completionDate'] ?? c['finishDate'] ?? c['completion_date']) as string | undefined | null;
        const warrantyEnd = (c['warrantyEndDate'] ?? c['warranty_end_date']) as string | undefined | null;
        const picRaw = c['picUser'] ?? c['pic_user'] ?? null;
        let picLabel = '';
        if (picRaw && typeof picRaw === 'object') {
          const pr = picRaw as Record<string, unknown>;
          picLabel = String(pr['label'] ?? pr['name'] ?? '');
        }
        return {
          name: c['name'] as string ?? '',
          hospitalLabel: ((c['hospital'] as any)?.label ?? (c['hospital'] as any)?.name ?? '') as string,
          picLabel,
          hardwareLabel: ((c['hardware'] as any)?.label ?? (c['hardware'] as any)?.name ?? '') as string,
          quantity: qty != null ? Number(String(qty)) : null,
          unitPrice: unit != null ? Number(String(unit)) : null,
          unitPriceNet: c['unitPriceNet'] != null ? Number(String(c['unitPriceNet'])) : null,
          totalPrice: total != null ? Number(String(total)) : null,
          commission: comm != null ? Number(String(comm)) : null,
          status: (c['status'] ?? '') as string,
          startDate: start ?? null,
          completionDate: completion ?? null,
          warrantyEndDate: warrantyEnd ?? null,
          bankName: (c['bankName'] ?? c['bank_name'] ?? '') as string,
          bankContactPerson: (c['bankContactPerson'] ?? c['bank_contact_person'] ?? '') as string,
          paymentStatus: (c['paymentStatus'] ?? c['payment_status'] ?? 'CHUA_THANH_TOAN') as string,
          paidAmount: c['paidAmount'] != null ? Number(String(c['paidAmount'])) : null,
          paymentDate: (c['paymentDate'] ?? c['payment_date'] ?? null) as string | null,
          implementationCompleted: Boolean(c['implementationCompleted']),
        };
      });

      if (allItems.length === 0) {
        hotToast.error('Không có dữ liệu để xuất');
        setExporting(false);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Kinh doanh');
      const colCount = 15;

      // ── Title row ──
      const titleRow = worksheet.addRow(Array(colCount).fill(''));
      titleRow.height = 32;
      worksheet.mergeCells(1, 1, 1, colCount);
      const titleCell = titleRow.getCell(1);
      titleCell.value = 'BÁO CÁO KINH DOANH';
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1A237E' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };

      // ── Filter info row ──
      const filterParts: string[] = [];
      if (trimmedSearch) filterParts.push(`Tìm kiếm: "${trimmedSearch}"`);
      if (filterPicId) {
        const picName = businessPicOptionsState.find(p => p.id === filterPicId)?.label || String(filterPicId);
        filterParts.push(`Người phụ trách: ${picName}`);
      }
      if (filterStartFrom || filterStartTo) filterParts.push(`Thời gian: ${formatFilterDateLabel(filterStartFrom)} - ${formatFilterDateLabel(filterStartTo)}`);
      if (filterStatus && filterStatus !== 'ALL') {
        filterParts.push(`Trạng thái: ${statusLabel(filterStatus)}`);
      }
      if (filterPaymentStatus && filterPaymentStatus !== 'ALL') {
        const payLabel = filterPaymentStatus === 'THANH_TOAN_HET' ? 'Thanh toán hết' : filterPaymentStatus === 'DA_THANH_TOAN' ? 'Đã thanh toán' : 'Chưa thanh toán';
        filterParts.push(`Thanh toán: ${payLabel}`);
      }
      if (filterParts.length > 0) {
        const filterRow = worksheet.addRow(Array(colCount).fill(''));
        worksheet.mergeCells(worksheet.rowCount, 1, worksheet.rowCount, colCount);
        const fc = filterRow.getCell(1);
        fc.value = `Bộ lọc: ${filterParts.join(' | ')}`;
        fc.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        fc.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      // Spacer
      worksheet.addRow([]);

      // ── Header row ──
      const headers = [
        'STT', 'Bệnh viện', 'Mã hợp đồng', 'Người phụ trách', 'Phần cứng',
        'SL', 'Thanh toán', 'Trạng thái', 'Đơn giá', 'Thành tiền',
        'Đã thanh toán', 'Còn lại', 'Hoa hồng', 'Đơn vị tài trợ', 'Bảo hành đến',
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 28;
      for (let col = 1; col <= colCount; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      }

      // Column widths
      const widths = [6, 35, 18, 22, 20, 8, 18, 16, 18, 18, 18, 18, 18, 22, 16];
      widths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

      // ── Data rows ──
      allItems.forEach((item, index) => {
        const totalPrice = item.totalPrice ?? 0;
        const paid = typeof item.paidAmount === 'number' ? item.paidAmount : 0;
        const remaining = totalPrice - paid;

        const payLabel = item.paymentStatus === 'THANH_TOAN_HET'
          ? 'Thanh toán hết'
          : item.paymentStatus === 'DA_THANH_TOAN'
            ? 'Đã thanh toán'
            : 'Chưa thanh toán';

        const sLabel = statusLabel(item.status);

        const row = worksheet.addRow([
          index + 1,
          item.hospitalLabel,
          item.name,
          item.picLabel,
          item.hardwareLabel,
          item.quantity ?? '',
          payLabel,
          sLabel,
          item.unitPrice ?? 0,
          totalPrice,
          paid,
          remaining,
          item.commission ?? 0,
          item.bankName,
          item.warrantyEndDate ? formatDateShort(item.warrantyEndDate) : '',
        ]);
        row.height = 22;

        for (let col = 1; col <= colCount; col++) {
          const cell = row.getCell(col);
          cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 6 ? 'center' : 'left', wrapText: col === 2 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          };
          if (index % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
          }
        }

        // Number format for currency columns (9=Đơn giá, 10=Thành tiền, 11=Đã TT, 12=Còn lại, 13=Hoa hồng)
        for (const colIdx of [9, 10, 11, 12, 13]) {
          row.getCell(colIdx).numFmt = '#,##0';
          row.getCell(colIdx).alignment = { vertical: 'middle', horizontal: 'right' };
        }

        // Color coding for status
        const statusCell = row.getCell(8);
        if (item.status === 'CONTRACTED') {
          statusCell.font = { color: { argb: 'FF16A34A' }, bold: true };
        } else if (item.status === 'CANCELLED') {
          statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
          statusCell.font = { color: { argb: 'FF2563EB' } };
        }

        // Color coding for payment status
        const payCell = row.getCell(7);
        if (item.paymentStatus === 'THANH_TOAN_HET') {
          payCell.font = { color: { argb: 'FF059669' }, bold: true };
        } else if (item.paymentStatus === 'DA_THANH_TOAN') {
          payCell.font = { color: { argb: 'FF16A34A' } };
        } else {
          payCell.font = { color: { argb: 'FF9CA3AF' } };
        }
      });

      // ── Summary row ──
      worksheet.addRow([]);
      const summaryRow = worksheet.addRow([
        '', '', '', '', '', '',
        '', `Tổng: ${allItems.length} hợp đồng`,
        '',
        allItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
        allItems.reduce((s, i) => s + (typeof i.paidAmount === 'number' ? i.paidAmount : 0), 0),
        allItems.reduce((s, i) => s + ((i.totalPrice ?? 0) - (typeof i.paidAmount === 'number' ? i.paidAmount : 0)), 0),
        allItems.reduce((s, i) => s + (i.commission ?? 0), 0),
        '', '',
      ]);
      summaryRow.height = 26;
      for (let col = 1; col <= colCount; col++) {
        const cell = summaryRow.getCell(col);
        cell.font = { bold: true, size: 11 };
        cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      for (const colIdx of [9, 10, 11, 12, 13]) {
        summaryRow.getCell(colIdx).numFmt = '#,##0';
        summaryRow.getCell(colIdx).alignment = { vertical: 'middle', horizontal: 'right' };
      }
      summaryRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' };

      // ── Generate & download ──
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      a.download = `kinh_doanh_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      hotToast.success(`Xuất Excel thành công (${allItems.length} hợp đồng)`);
    } catch (e: any) {
      console.error('Export Excel error:', e);
      hotToast.error(e?.message || 'Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  }

  // Helper functions để format số với dấu chấm phân cách hàng nghìn
  function formatNumber(value: number | ''): string {
    if (value === '' || value === null || value === undefined) return '';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function parseFormattedNumber(value: string): number | '' {
    // Loại bỏ dấu chấm phân cách hàng nghìn (chỉ giữ lại số)
    // Ví dụ: "1.000.000" -> "1000000", "7.000.000.000" -> "7000000000"
    const cleaned = value.replace(/\./g, '').replace(/[^\d]/g, '');
    if (cleaned === '' || cleaned === '0') return '';
    // Sử dụng parseInt thay vì parseFloat để tránh mất độ chính xác với số nguyên lớn
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? '' : num;
  }

  // Helper function to clear field error when user changes value
  function clearFieldError(fieldName: string) {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  }

  // Upload multiple files (Word/Excel)
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const allowedExtensions = ['.doc', '.docx', '.xls', '.xlsx'];
    const maxSize = 50 * 1024 * 1024; // 50MB per file
    
    // Validate all files first
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        setToast({ message: `File "${file.name}": Chỉ hỗ trợ Word (.doc, .docx) hoặc Excel (.xls, .xlsx)`, type: 'error' });
        event.target.value = '';
        return;
      }

      if (file.size > maxSize) {
        setToast({ message: `File "${file.name}": Kích thước vượt quá 50MB`, type: 'error' });
        event.target.value = '';
        return;
      }
    }

    setUploadingFile(true);
    try {
      const API_ROOT = import.meta.env.VITE_API_URL || '';
      const token =
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        localStorage.getItem('token');

      const newAttachments: Array<{ url: string; fileName: string }> = [];

      // Upload files one by one
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_ROOT}/api/v1/admin/business/upload-attachment`, {
          method: 'POST',
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : undefined,
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Upload file "${file.name}" thất bại: ${response.status}`);
        }

        const data = await response.json();
        newAttachments.push({
          url: data.url,
          fileName: data.fileName || file.name,
        });
      }

      // Add new files to existing attachments
      setAttachments(prev => [...prev, ...newAttachments]);
      setToast({ message: `Upload thành công ${newAttachments.length} file`, type: 'success' });
    } catch (err: unknown) {
      console.error('Upload file error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Lỗi upload file';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setUploadingFile(false);
      event.target.value = ''; // Reset input
    }
  }
  
  // Remove attachment
  function handleRemoveAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  // when status is changed in the modal, handle auto-complete for CONTRACTED
  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setStatusValue(newStatus);
    if (newStatus === 'CONTRACTED') {
      const now = nowDateTimeLocal();
      setCompletionDateValue(now);
    }
  }

  async function confirmStatusTransition() {
    const submission = pendingSubmit;
    setStatusConfirmOpen(false);
    if (!submission) {
      setPendingSubmit(null);
      return;
    }
    setPendingSubmit(null);
    await submitBusiness(submission.payload, submission.isUpdate, submission.successMessage);
  }

  function cancelStatusTransition() {
    setPendingSubmit(null);
    setStatusConfirmOpen(false);
  }

  async function confirmCreate() {
    const submission = pendingCreateSubmit;
    setConfirmCreateOpen(false);
    if (!submission) {
      setPendingCreateSubmit(null);
      setHospitalNameForConfirm("");
      return;
    }
    setPendingCreateSubmit(null);
    const hospitalName = hospitalNameForConfirm;
    setHospitalNameForConfirm("");
    
    const requireConfirm = statusValue === 'CONTRACTED' && originalStatus !== 'CONTRACTED';
    if (requireConfirm && !statusConfirmOpen) {
      setPendingSubmit({ ...submission });
      setStatusConfirmOpen(true);
      return;
    }
    
    await submitBusiness(submission.payload, submission.isUpdate, submission.successMessage);
  }

  function cancelCreate() {
    setConfirmCreateOpen(false);
    setPendingCreateSubmit(null);
    setHospitalNameForConfirm("");
  }

  function statusLabel(status?: string | null) {
    if (!status) return '—';
    switch (status.toUpperCase()) {
      case 'CARING': return 'Đang chăm sóc';
      case 'CONTRACTED': return 'Ký hợp đồng';
      case 'CANCELLED': return 'Hủy';
      default: return status;
    }
  }

  function renderStatusBadge(status?: string | null) {
    const s = status ? status.toUpperCase() : '';
    let cls = 'bg-gray-100 text-gray-800';
    if (s === 'CARING') cls = 'bg-yellow-100 text-yellow-800';
    if (s === 'CONTRACTED') cls = 'bg-green-100 text-green-800';
    if (s === 'CANCELLED') cls = 'bg-red-100 text-red-800';
    return <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${cls}`}>{statusLabel(status)}</span>;
  }

  // Kiểm tra trạng thái bảo hành dựa trên warrantyEndDate
  function getWarrantyStatus(warrantyEndDate?: string | null): 'expired' | 'expiring-soon' | null {
    if (!warrantyEndDate) return null;
    try {
      const endDate = new Date(warrantyEndDate);
      if (isNaN(endDate.getTime())) return null;
      
      // Normalize về đầu ngày (00:00:00) để so sánh chính xác theo ngày
      endDate.setHours(0, 0, 0, 0);
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      oneMonthFromNow.setHours(0, 0, 0, 0);
      
      // Hết hạn: đã đến hoặc quá ngày hết hạn (cùng ngày hoặc quá ngày)
      if (endDate <= now) {
        return 'expired';
      }
      
      // Sắp hết hạn: trong vòng 1 tháng tới (còn <= 30 ngày)
      if (endDate <= oneMonthFromNow) {
        return 'expiring-soon';
      }
      
      return null;
    } catch {
      return null;
    }
  }

  // Render badge trạng thái bảo hành
  function renderWarrantyStatusBadge(warrantyEndDate?: string | null) {
    const status = getWarrantyStatus(warrantyEndDate);
    if (!status) return null;
    
    if (status === 'expired') {
      return (
        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
          Hết hạn bảo hành
        </span>
      );
    }
    
    if (status === 'expiring-soon') {
      return (
        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
          Sắp hết hạn bảo hành
        </span>
      );
    }
    
    return null;
  }

  // formatting helpers removed (unused) to satisfy strict TypeScript noUnusedLocals

  async function openEditModal(id: number) {
    try {
      const res = await getBusinessById(id);
      setEditingId(id);
      setName(res.name ?? '');
      setSelectedHospitalId(res.hospital?.id ?? null);
      // Set hospital search input to the selected hospital label
      setHospitalSearchInput(res.hospital?.label ?? '');
      setHospitalDropdownOpen(false);
      setSelectedPicId(res.picUser?.id ?? null);
      setPicDropdownOpen(false);
      setPicSearchInput('');
      if (res.picUser?.id != null) {
        setBusinessPicOptionsState((prev) => {
          const exists = prev.some((opt) => opt.id === res.picUser?.id);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: res.picUser.id,
              label: res.picUser.label ?? res.picUser.fullname ?? res.picUser.email ?? `User #${res.picUser.id}`,
              subLabel: res.picUser.subLabel ?? res.picUser.email ?? undefined,
            },
          ];
        });
      }
      // support older API that may use finishDate as the key
      const remoteCompletion = (res.completionDate ?? ((res as unknown as Record<string, unknown>).finishDate as string | undefined)) as string | undefined | null;
      if (res.hospital?.id) {
        // use the auth/hospitals endpoint (works for non-superadmin roles too)
        api.get(`/api/v1/auth/hospitals/${res.hospital.id}`).then(r => {
          const d = r.data || {};
          const phone = d.contactNumber || d.contact_number || d.contactPhone || d.contact_phone || null;
          setSelectedHospitalPhone(phone);
        }).catch(() => setSelectedHospitalPhone(null));
      } else setSelectedHospitalPhone(null);
      const remoteStatus = (res.status as string | undefined) ?? 'CARING';
      setStatusValue(remoteStatus);
      setOriginalStatus(remoteStatus);
      setSelectedHardwareId(res.hardware?.id ?? null);
      const remoteStart = (res.startDate ?? (res as unknown as Record<string, unknown>)['start_date'] ?? (res as unknown as Record<string, unknown>)['startDateTime']) as string | undefined | null;
      setStartDateValue(remoteStart ? (remoteStart.length === 16 ? remoteStart : remoteStart.substring(0, 16)) : '');
      setCompletionDateValue(remoteCompletion ? (remoteCompletion.length === 16 ? remoteCompletion : remoteCompletion.substring(0, 16)) : '');
      const remoteWarrantyStart = ((res as Record<string, unknown>)['warrantyStartDate'] as string | undefined | null)
        ?? ((res as Record<string, unknown>)['warranty_start_date'] as string | undefined | null);
      const remoteWarrantyEnd = (res.warrantyEndDate ?? (res as Record<string, unknown>)['warranty_end_date']) as string | undefined | null;
      const normalizedWarrantyStart = remoteWarrantyStart ? (remoteWarrantyStart.length === 16 ? remoteWarrantyStart : remoteWarrantyStart.substring(0, 16)) : '';
      const normalizedWarrantyEnd = remoteWarrantyEnd ? (remoteWarrantyEnd.length === 16 ? remoteWarrantyEnd : remoteWarrantyEnd.substring(0, 16)) : '';
      setWarrantyEnabled(Boolean(normalizedWarrantyStart || normalizedWarrantyEnd));
      setWarrantyStartDateValue(normalizedWarrantyStart);
      setWarrantyEndDateValue(normalizedWarrantyEnd);
      // Reset flag khi load dữ liệu edit (ngày kết thúc từ server không phải chỉnh sửa thủ công)
      setIsWarrantyEndDateManuallyEdited(false);
      // Reset duration khi load data (người dùng có thể nhập lại nếu muốn)
      setWarrantyDuration('');
      // Load commission directly as amount
      if (res.commission != null) {
        setCommission(Number(res.commission));
        setCommissionDisplay(formatNumber(Number(res.commission)));
      } else {
        setCommission('');
      setCommissionDisplay('');
      }
      setQuantity(res.quantity != null ? Number(String(res.quantity)) : 1);
      // Load unitPrice từ response (có thể khác với giá mặc định từ phần cứng)
      if (res.unitPrice != null) {
        setUnitPrice(Number(res.unitPrice));
      } else {
        setUnitPrice('');
      }
      // Load unitPriceNet từ response
      if (res.unitPriceNet != null) {
        setUnitPriceNet(Number(res.unitPriceNet));
      } else {
        setUnitPriceNet('');
      }
      // fetch price từ phần cứng để hiển thị giá mặc định
      if (res.hardware?.id) {
        try {
          const hw = await getHardwareById(res.hardware.id);
          setSelectedHardwarePrice(hw && hw.price != null ? Number(hw.price) : null);
        } catch {
          setSelectedHardwarePrice(null);
        }
      } else setSelectedHardwarePrice(null);
      setBankName(res.bankName ?? '');
      setBankContactPerson(res.bankContactPerson ?? '');
      // Load payment status
      const remotePaymentStatus = (res.paymentStatus ?? (res as any).payment_status ?? 'CHUA_THANH_TOAN') as 'CHUA_THANH_TOAN' | 'DA_THANH_TOAN' | 'THANH_TOAN_HET';
      setPaymentStatusValue(remotePaymentStatus);
      if (res.paidAmount != null) {
        setPaidAmount(Number(res.paidAmount));
        setPaidAmountDisplay(formatNumber(Number(res.paidAmount)));
      } else {
        setPaidAmount('');
        setPaidAmountDisplay('');
      }
      const paymentDateRaw = (res as any).paymentDate ?? (res as any).payment_date ?? null;
      if (paymentDateRaw && typeof paymentDateRaw === 'string') {
        setPaymentDateValue(paymentDateRaw.slice(0, 10));
      } else {
        setPaymentDateValue('');
      }
      setNotes(res.notes ?? '');
      setAttachments(Array.isArray(res.attachments) ? res.attachments : []);
      setFieldErrors({});
      setPendingSubmit(null);
      setStatusConfirmOpen(false);
      setShowModal(true);
    } catch (e) { console.error(e); setToast({ message: 'Không thể load mục để sửa', type: 'error' }); }
  }

  function handleDelete(id: number) {
    setPendingDeleteId(id);
    setConfirmDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const idToDelete = pendingDeleteId;
    setConfirmDeleteOpen(false);
    setPendingDeleteId(null);
    setDeletingId(idToDelete);
    try {
      await deleteBusiness(idToDelete, canManage);
      setToast({ message: 'Đã xóa', type: 'success' });
      await loadList();
    } catch (e) { console.error(e); setToast({ message: 'Xóa thất bại', type: 'error' }); }
    finally { setDeletingId(null); }
  }

  function cancelDelete() {
    setConfirmDeleteOpen(false);
    setPendingDeleteId(null);
  }

  // auto dismiss toasts
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function openView(item: BusinessItem) { setViewItem(item); }
  function closeView() { setViewItem(null); }

  // Component Filter Person In Charge với search và scroll
  function FilterPersonInChargeSelect({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: ITUserOption[];
  }) {
    const [openBox, setOpenBox] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlight, setHighlight] = useState(-1);
    const inputRef = React.useRef<HTMLDivElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    const filteredOptions = React.useMemo(() => {
      if (!searchQuery.trim()) return options;
      const q = searchQuery.toLowerCase().trim();
      return options.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.phone?.includes(q)
      );
    }, [options, searchQuery]);

    const displayOptions = filteredOptions.slice(0, 7);
    const hasMore = filteredOptions.length > 7;
    const selectedUser = options.find((u) => String(u.id) === value);

    React.useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          setOpenBox(false);
          setSearchQuery("");
        }
      };
      if (openBox) {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [openBox]);

    return (
      <div className="relative min-w-[200px]">
        <div
          ref={inputRef}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm cursor-pointer focus-within:ring-1 focus-within:ring-[#4693FF] focus-within:border-[#4693FF]"
          onClick={() => {
            setOpenBox(!openBox);
          }}
        >
          {openBox ? (
            <input
              type="text"
              className="w-full outline-none bg-transparent"
              placeholder="Tìm kiếm người phụ trách..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlight(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, displayOptions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (highlight >= 0 && displayOptions[highlight]) {
                    onChange(String(displayOptions[highlight].id));
                    setOpenBox(false);
                    setSearchQuery("");
                  }
                } else if (e.key === "Escape") {
                  setOpenBox(false);
                  setSearchQuery("");
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <div className="flex items-center justify-between">
              <span className={value ? "text-gray-900" : "text-gray-500"}>
                {selectedUser ? selectedUser.name : "Tất cả người phụ trách"}
              </span>
              <svg className={`w-4 h-4 transition-transform ${openBox ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
        {openBox && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg"
            style={{ maxHeight: "200px", overflowY: "auto" }}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Không có kết quả</div>
            ) : (
              <>
                {/* Option "Tất cả" */}
                <div
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
                    !value ? "bg-blue-50" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("");
                    setOpenBox(false);
                    setSearchQuery("");
                  }}
                >
                  <div className="font-medium text-gray-800">Tất cả người phụ trách</div>
                </div>
                {displayOptions.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                      idx === highlight ? "bg-gray-100" : ""
                    } ${String(opt.id) === value ? "bg-blue-50" : ""}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(String(opt.id));
                      setOpenBox(false);
                      setSearchQuery("");
                    }}
                  >
                    <div className="font-medium text-gray-800">{opt.name}</div>
                    {opt.phone && (
                      <div className="text-xs text-gray-500">
                        {opt.phone}
                      </div>
                    )}
                  </div>
                ))}
                {hasMore && (
                  <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                    Và {filteredOptions.length - 7} kết quả khác... (cuộn để xem)
                  </div>
                )}
                {filteredOptions.length > 7 &&
                  filteredOptions.slice(7).map((opt, idx) => (
                    <div
                      key={opt.id}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${
                        idx + 7 === highlight ? "bg-gray-100" : ""
                      } ${String(opt.id) === value ? "bg-blue-50" : ""}`}
                      onMouseEnter={() => setHighlight(idx + 7)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onChange(String(opt.id));
                        setOpenBox(false);
                        setSearchQuery("");
                      }}
                    >
                      <div className="font-medium text-gray-800">{opt.name}</div>
                      {opt.phone && (
                        <div className="text-xs text-gray-500">
                          {opt.phone}
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className=" relative">
      {/* Toasts */}
      {toast && (
        <div className="fixed top-6 right-6 z-50">
          <div
            className={`flex min-w-[220px] items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg bg-white ${
              toast.type === 'success' ? 'border-green-200' : 'border-red-200'
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                toast.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {toast.type === 'success' ? <FiCheckCircle size={20} /> : <FiXCircle size={20} />}
            </span>
            <span className="text-sm font-medium text-gray-900">{toast.message}</span>
          </div>
        </div>
      )}

      {statusConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelStatusTransition();
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-blue-800">Xác nhận chuyển trạng thái</h3>
            <p className="mt-3 text-sm text-red-600">
              Bạn có muốn chuyển trạng thái sang ký hợp đồng và chuyển sang phòng triển khai không?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelStatusTransition}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmStatusTransition}
                className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Create Modal */}
      <AnimatePresence>
        {confirmCreateOpen && pendingCreateSubmit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="absolute inset-0 bg-black/50" onClick={cancelCreate} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative z-[111] w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-orange-100">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      Xác nhận tạo hợp đồng mới
                    </h3>
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-sm text-orange-700">
                        Bệnh viện <span className="font-bold">"{hospitalNameForConfirm}"</span> đã có hợp đồng kinh doanh. Bạn có muốn tạo thêm hợp đồng mới không?
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={cancelCreate}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={confirmCreate}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 transition"
                  >
                    Tạo mới
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {confirmDeleteOpen && pendingDeleteId !== null && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="absolute inset-0 bg-black/50" onClick={cancelDelete} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative z-[111] w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-red-100">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      Xác nhận xóa hợp đồng kinh doanh
                    </h3>
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        Bạn có chắc chắn muốn xóa hợp đồng kinh doanh này? Hành động này không thể hoàn tác.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={cancelDelete}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition"
                    disabled={deletingId !== null}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deletingId !== null}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingId !== null ? "Đang xóa..." : "Xóa"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Page background simplified to white (no animated gradient) */}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-extrabold mb-0">Quản lý Kinh doanh</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setName('');
              setOriginalStatus('CARING');
              setSelectedHardwareId(null);
              setSelectedHardwarePrice(null);
              setUnitPrice('');
              setUnitPriceNet('');
              setSelectedHospitalId(null);
              setSelectedHospitalPhone(null);
              setSelectedPicId(null);
              setPicDropdownOpen(false);
              setPicSearchInput('');
              setQuantity(1);
              setStatusValue('CARING');
              setStartDateValue(nowDateTimeLocal());
              setCompletionDateValue('');
              setWarrantyEnabled(false);
              setWarrantyStartDateValue('');
              setWarrantyEndDateValue('');
              setWarrantyDuration('');
              setCommission('');
        setCommissionDisplay('');
              setFieldErrors({});
              setPendingSubmit(null);
              setStatusConfirmOpen(false);
              setHospitalSearchInput('');
              setHospitalDropdownOpen(false);
              setBankName('');
              setBankContactPerson('');
              setPaymentStatusValue('CHUA_THANH_TOAN');
              setPaidAmount('');
              setPaidAmountDisplay('');
              setPaymentDateValue('');
              setNotes('');
              setAttachments([]);
              setShowModal(true);
            }}
            className="rounded-xl border px-6 py-3 text-sm font-medium text-white transition-all flex items-center gap-2 border-blue-500 bg-blue-500 hover:bg-blue-600 hover:shadow-md"
          >
            <PlusIcon style={{ width: 18, height: 18, fill: 'white' }} />
            <span>Thêm mới</span>
          </button>
        )}
      </div>
      <ComponentCard title="Tìm kiếm & Lọc">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Tìm theo mã hợp đồng / bệnh viện"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm min-w-[240px] focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
            />
            <div className="relative" ref={dateFilterRef}>
              <button
                type="button"
                onClick={() => {
                  setPendingFilterStart(filterStartFrom);
                  setPendingFilterEnd(filterStartTo);
                  setDateFilterOpen((prev) => !prev);
                }}
                className="rounded-full border border-gray-200 px-4 py-2.5 text-sm shadow-sm hover:bg-gray-50 transition flex items-center gap-2"
              >
                <span>📅</span>
                <span>Lọc theo thời gian</span>
              </button>
              {dateFilterOpen && (
                <div className="absolute z-40 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Bắt đầu từ</label>
                    <input
                      type="date"
                      value={pendingFilterStart}
                      onChange={(e) => setPendingFilterStart(e.target.value)}
                      ref={pendingStartInputRef}
                      onFocus={(e) => {
                        if (typeof e.currentTarget.showPicker === 'function') {
                          e.currentTarget.showPicker();
                        }
                      }}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === 'function') {
                          e.currentTarget.showPicker();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Đến</label>
                    <input
                      type="date"
                      value={pendingFilterEnd}
                      onChange={(e) => setPendingFilterEnd(e.target.value)}
                      ref={pendingEndInputRef}
                      onFocus={(e) => {
                        if (typeof e.currentTarget.showPicker === 'function') {
                          e.currentTarget.showPicker();
                        }
                      }}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === 'function') {
                          e.currentTarget.showPicker();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFilterStart('');
                        setPendingFilterEnd('');
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Xóa chọn
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDateFilterOpen(false)}
                        className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFilterOpen(false);
                          setFilterStartFrom(pendingFilterStart);
                          setFilterStartTo(pendingFilterEnd);
                        }}
                        className="px-3 py-1.5 text-sm rounded-full bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Lọc
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Người phụ trách</span>
              <FilterPersonInChargeSelect
                value={filterPicId ? String(filterPicId) : ''}
                onChange={(v) => setFilterPicId(v ? Number(v) : null)}
                options={businessPicOptionsState.map(opt => ({
                  id: opt.id,
                  name: opt.label,
                  phone: (opt as any).phone || null,
                }))}
              />
            </div>
          </div>
          <div className="flex mt-4 flex-wrap items-center gap-3 mt-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Trạng thái HĐ</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition min-w-[150px]"
              >
                <option value="ALL">— Tất cả —</option>
                <option value="CARING">Đang chăm sóc</option>
                <option value="CONTRACTED">Ký hợp đồng</option>
                <option value="CANCELLED">Hủy</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Thanh toán</span>
              <select
                value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition min-w-[150px]"
              >
                <option value="ALL">— Tất cả —</option>
                <option value="CHUA_THANH_TOAN">Chưa thanh toán</option>
                <option value="DA_THANH_TOAN">Đã thanh toán</option>
                <option value="THANH_TOAN_HET">Thanh toán hết</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                <span>Xóa</span>
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <span>Đang xuất...</span>
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    <span>Xuất Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 text-sm font-semibold text-gray-700">
          Tổng hợp đồng:
          <span className="ml-1 text-blue-800">{totalItems}</span>
        </div>
        {(filterStartFrom || filterStartTo) && (
          <div className="mt-2 text-xs text-gray-500">
            Đang lọc từ{' '}
            <span className="font-semibold text-blue-600">
              {formatFilterDateLabel(filterStartFrom)}
            </span>{' '}
            đến{' '}
            <span className="font-semibold text-blue-600">
              {formatFilterDateLabel(filterStartTo)}
            </span>
          </div>
        )}
      </ComponentCard>
      {!pageAllowed ? (
        <div className="text-red-600">Bạn không có quyền truy cập trang này.</div>
      ) : (
        <div className="mt-10.5">
          {/* Inline form kept for legacy but hidden on modal-enabled UI - keep for fallback */}
          <form onSubmit={handleSubmit} className="hidden space-y-3 mb-6 bg-white/60 p-4 rounded shadow-sm">
            <div>
              <label className="block text-sm font-medium mb-1">Mã hợp đồng</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phần cứng</label>
              <select value={selectedHardwareId ?? ''} onChange={(e) => {
                const v = e.target.value; setSelectedHardwareId(v ? Number(v) : null);
                const found = hardwareOptions.find(h => String(h.id) === v);
                if (found) {
                  // fetch hardware detail to read price (base-aware)
                  getHardwareById(found.id).then(r => {
                    const price = r && r.price != null ? Number(r.price) : null;
                    setSelectedHardwarePrice(price);
                    if (price != null) {
                      setUnitPrice(price);
                    }
                  }).catch(() => {
                    setSelectedHardwarePrice(null);
                    setUnitPrice('');
                  });
                } else {
                  setSelectedHardwarePrice(null);
                  setUnitPrice('');
                }
              }} className="w-full rounded border px-3 py-2">
                <option value="">— Chọn phần cứng —</option>
                {hardwareOptions.map(h => <option key={h.id} value={h.id}>{h.label} {h.subLabel ? `— ${h.subLabel}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Số lượng Kiosk</label>
              <input
                type="number"
                min={1}
                value={quantity === '' ? '' : quantity}
                onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
                className="w-40 rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Đơn giá (Gross)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice === '' ? '' : unitPrice}
                onChange={(e) => {
                  const val = e.target.value;
                  setUnitPrice(val === '' ? '' : Number(val));
                }}
                placeholder={selectedHardwarePrice != null ? `Giá mặc định: ${selectedHardwarePrice.toLocaleString()} ₫` : 'Nhập đơn giá'}
                className="w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Đơn giá (NET)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPriceNet === '' ? '' : unitPriceNet}
                onChange={(e) => {
                  const val = e.target.value;
                  setUnitPriceNet(val === '' ? '' : Number(val));
                }}
                placeholder="Nhập đơn giá (NET)"
                className="w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tổng tiền</label>
              <div className="p-2 font-semibold">{computeTotal().toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="ml-auto text-sm text-gray-600 flex items-center gap-2">
                <DollarLineIcon style={{ width: 16, height: 16 }} />
                <span className="font-medium">{computeTotal() > 0 ? computeTotal().toLocaleString() + ' ₫' : '—'}</span>
              </div>
            </div>
          </form>

          {/* Create/Edit modal */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) { setShowModal(false); setFieldErrors({}); } }}>
              <div className="absolute inset-0 bg-black/50" />
              <div className="relative bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[95vh] flex flex-col">
                {/* Header - Fixed */}
                <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-gray-200">
                  <h3 className="text-lg sm:text-xl font-semibold">{editingId ? 'Cập nhật Kinh doanh' : 'Thêm Kinh doanh'}</h3>
                </div>
                {/* Form Content - Scrollable */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
                  <form id="business-form" onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Mã hợp đồng</label>
                      <input 
                        value={name} 
                        onChange={(e) => {
                          setName(e.target.value);
                          clearFieldError('name');
                        }} 
                        className={`w-full rounded border px-3 py-2 ${fieldErrors.name ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.name && <div className="mt-1 text-sm text-red-600">{fieldErrors.name}</div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phần cứng</label>
                      <select 
                        value={selectedHardwareId ?? ''} 
                        onChange={(e) => {
                          const v = e.target.value; 
                          setSelectedHardwareId(v ? Number(v) : null);
                          clearFieldError('selectedHardwareId');
                          const found = hardwareOptions.find(h => String(h.id) === v);
                          if (found) {
                            getHardwareById(found.id).then(r => {
                              const price = r && r.price != null ? Number(r.price) : null;
                              setSelectedHardwarePrice(price);
                              // Tự động điền giá vào input đơn giá khi chọn phần cứng
                              if (price != null) {
                                setUnitPrice(price);
                              }
                            }).catch(() => {
                              setSelectedHardwarePrice(null);
                              setUnitPrice('');
                            });
                          } else {
                            setSelectedHardwarePrice(null);
                            setUnitPrice('');
                          }
                        }} 
                        className={`w-full rounded border px-3 py-2 ${fieldErrors.selectedHardwareId ? 'border-red-500' : ''}`}
                      >
                        <option value="">— Chọn phần cứng —</option>
                        {hardwareOptions.map(h => <option key={h.id} value={h.id}>{h.label} {h.subLabel ? `— ${h.subLabel}` : ''}</option>)}
                      </select>
                      {fieldErrors.selectedHardwareId && <div className="mt-1 text-sm text-red-600">{fieldErrors.selectedHardwareId}</div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Người phụ trách</label>
                      <div className="relative" ref={picDropdownRef}>
                        <input
                          type="text"
                          value={picDropdownOpen ? picSearchInput : (selectedPicOption?.label ?? '')}
                          placeholder="Tìm người phụ trách..."
                          onFocus={() => {
                            setPicDropdownOpen(true);
                            setPicSearchInput('');
                          }}
                          onChange={(e) => {
                            setPicDropdownOpen(true);
                            setPicSearchInput(e.target.value);
                            clearFieldError('selectedPicId');
                          }}
                          className={`w-full rounded border px-3 py-2 ${fieldErrors.selectedPicId ? 'border-red-500' : ''}`}
                        />
                        {selectedPicOption && !picDropdownOpen && (
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                            onClick={() => {
                              setSelectedPicId(null);
                              setPicSearchInput('');
                              clearFieldError('selectedPicId');
                            }}
                            aria-label="Clear PIC"
                          >
                            ✕
                          </button>
                        )}
                        {picDropdownOpen && (
                          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-auto">
                            {filteredBusinessPicOptions.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-gray-500">Không tìm thấy người phù hợp</div>
                            ) : (
                              filteredBusinessPicOptions.map((opt) => {
                                const isSelected = opt.id === selectedPicId;
                                return (
                                  <div
                                    key={opt.id}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-blue-100' : ''}`}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setSelectedPicId(opt.id);
                                      setPicDropdownOpen(false);
                                      setPicSearchInput('');
                                      clearFieldError('selectedPicId');
                                    }}
                                  >
                                    <div className="font-medium text-gray-800">{opt.label}</div>
                                    {(opt as any).phone && (
                                      <div className="text-xs text-gray-500">
                                        {(opt as any).phone}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                      {fieldErrors.selectedPicId && <div className="mt-1 text-sm text-red-600">{fieldErrors.selectedPicId}</div>}
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium mb-1">Bệnh viện</label>
                      <div className="relative hospital-dropdown-container">
                        <input
                          type="text"
                          value={hospitalSearchInput}
                          onChange={(e) => {
                            setHospitalSearchInput(e.target.value);
                            setHospitalDropdownOpen(true);
                            clearFieldError('selectedHospitalId');
                          }}
                          onFocus={() => {
                            setHospitalDropdownOpen(true);
                            // Không load tất cả khi focus - chỉ load khi user nhập ít nhất 2 ký tự
                            // if (!hospitalSearchInput) {
                            //   fetchHospitalOptions('');
                            // }
                          }}
                          placeholder="Tìm kiếm bệnh viện..."
                          className={`w-full rounded border px-3 py-2 ${fieldErrors.selectedHospitalId ? 'border-red-500' : ''}`}
                        />
                        {hospitalDropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
                            {hospitalOptions.length === 0 ? (
                              <div className="px-4 py-2 text-sm text-gray-500">
                                {hospitalSearchInput.trim().length < 2 ? "Nhập ít nhất 2 ký tự để tìm kiếm" : "Không tìm thấy bệnh viện"}
                              </div>
                            ) : (
                              <div className="max-h-[200px] overflow-y-auto">
                                {hospitalOptions.map((hospital) => (
                                  <div
                                    key={hospital.id}
                                    onClick={() => {
                                      setSelectedHospitalId(hospital.id);
                                      setHospitalSearchInput(hospital.label);
                                      setHospitalDropdownOpen(false);
                                      clearFieldError('selectedHospitalId');
                                      api.get(`/api/v1/auth/hospitals/${hospital.id}`).then(r => {
                                        const d = r.data || {};
                                        const phone = d.contactNumber || d.contact_number || d.contactPhone || d.contact_phone || null;
                                        setSelectedHospitalPhone(phone);
                                      }).catch(() => setSelectedHospitalPhone(null));
                                    }}
                                    className={`px-4 py-2 cursor-pointer hover:bg-blue-50 ${
                                      selectedHospitalId === hospital.id ? 'bg-blue-100' : ''
                                    }`}
                                  >
                                    <div className="text-sm text-gray-900">{hospital.label}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {fieldErrors.selectedHospitalId && <div className="mt-1 text-sm text-red-600">{fieldErrors.selectedHospitalId}</div>}
                      {selectedHospitalPhone && !fieldErrors.selectedHospitalId && <div className="mt-1 text-sm text-gray-700">Số điện thoại bệnh viện: <span className="font-medium">{selectedHospitalPhone}</span></div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Trạng thái</label>
                      <select value={statusValue} onChange={handleStatusChange} className="w-full rounded border px-3 py-2">
                        <option value="CARING">Đang chăm sóc</option>
                        <option value="CONTRACTED">Ký hợp đồng</option>
                        <option value="CANCELLED">Hủy</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Số lượng Kiosk</label>
                      <input
                        type="number"
                        min={1}
                        value={quantity === '' ? '' : quantity}
                        onChange={(e) => {
                          setQuantity(e.target.value ? Number(e.target.value) : '');
                          clearFieldError('quantity');
                        }}
                        className={`w-full rounded border px-3 py-2 ${fieldErrors.quantity ? 'border-red-500' : ''}`}
                      />
                      {fieldErrors.quantity && <div className="mt-1 text-sm text-red-600">{fieldErrors.quantity}</div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Hoa hồng của viện</label>
                      {canManage ? (
                        <input 
                          type="text" 
                          value={commissionDisplay || formatNumber(commission)} 
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            // Parse giá trị số từ input (loại bỏ dấu chấm và ký tự không phải số)
                            const parsed = parseFormattedNumber(inputValue);
                            // Lưu giá trị số
                            setCommission(parsed);
                            // Format lại ngay lập tức với dấu chấm phân cách hàng nghìn
                            if (parsed !== '') {
                              const formatted = formatNumber(parsed);
                              setCommissionDisplay(formatted);
                            } else {
                              setCommissionDisplay('');
                            }
                            clearFieldError('commission');
                          }}
                          onBlur={() => {
                            // Đảm bảo format đúng khi blur
                            if (commission !== '') {
                              setCommissionDisplay(formatNumber(commission));
                            } else {
                              setCommissionDisplay('');
                            }
                          }}
                          onFocus={() => {
                            // Khi focus, hiển thị giá trị đã format
                            if (commission !== '') {
                              setCommissionDisplay(formatNumber(commission));
                            } else {
                              setCommissionDisplay('');
                            }
                          }}
                          className="w-full rounded border px-3 py-2" 
                          placeholder="Nhập số tiền hoa hồng "
                        />
                      ) : (
                        <div className="p-2 text-gray-700">{commission !== '' ? formatNumber(commission) + ' ₫' : '—'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Đơn vị tài trợ</label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        placeholder="Nhập đơn vị tài trợ"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Liên hệ đơn vị tài trợ</label>
                      <input
                        type="text"
                        value={bankContactPerson}
                        onChange={(e) => setBankContactPerson(e.target.value)}
                        className="w-full rounded border px-3 py-2"
                        placeholder="Nhập người liên hệ"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Đơn giá (Gross)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={formatNumber(unitPrice)}
                          onChange={(e) => {
                            const parsed = parseFormattedNumber(e.target.value);
                            setUnitPrice(parsed);
                            clearFieldError('unitPrice');
                          }}
                          onBlur={(e) => {
                            // Format lại khi blur
                            const parsed = parseFormattedNumber(e.target.value);
                            setUnitPrice(parsed);
                          }}
                          placeholder={selectedHardwarePrice != null ? `Giá mặc định: ${formatNumber(selectedHardwarePrice)} ₫` : 'Nhập đơn giá (Gross)'}
                          className=" w-full flex-1 rounded border px-3 py-2"
                        />
                         
                      </div>
                      {fieldErrors.unitPrice && <div className="mt-1 text-sm text-red-600">{fieldErrors.unitPrice}</div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Đơn giá (NET)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={formatNumber(unitPriceNet)}
                          onChange={(e) => {
                            const parsed = parseFormattedNumber(e.target.value);
                            setUnitPriceNet(parsed);
                            clearFieldError('unitPriceNet');
                          }}
                          onBlur={(e) => {
                            // Format lại khi blur
                            const parsed = parseFormattedNumber(e.target.value);
                            setUnitPriceNet(parsed);
                          }}
                          placeholder="Nhập đơn giá (NET)"
                          className=" w-full flex-1 rounded border px-3 py-2"
                        />
                      </div>
                      {fieldErrors.unitPriceNet && <div className="mt-1 text-sm text-red-600">{fieldErrors.unitPriceNet}</div>}
                    </div>

                    {/* Trạng thái thanh toán */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Trạng thái thanh toán</label>
                      <select
                        value={paymentStatusValue}
                        onChange={(e) => {
                          const next = e.target.value as 'CHUA_THANH_TOAN' | 'DA_THANH_TOAN' | 'THANH_TOAN_HET';
                          setPaymentStatusValue(next);
                          if (next === 'THANH_TOAN_HET') {
                            // Auto-fill paidAmount = totalPrice (unitPrice * quantity)
                            const total = computeTotal();
                            setPaidAmount(total > 0 ? total : '');
                            setPaidAmountDisplay(total > 0 ? formatNumber(total) : '');
                          } else if (next === 'DA_THANH_TOAN') {
                            // Keep current paidAmount or reset
                            if (paidAmount === '') {
                              setPaidAmountDisplay('');
                            }
                          } else {
                            setPaidAmount('');
                            setPaidAmountDisplay('');
                            setPaymentDateValue('');
                          }
                        }}
                        className="w-full rounded border px-3 py-2"
                      >
                        <option value="CHUA_THANH_TOAN">Chưa thanh toán</option>
                        <option value="DA_THANH_TOAN">Đã thanh toán</option>
                        <option value="THANH_TOAN_HET">Thanh toán hết</option>
                      </select>
                    </div>

                    {/* Số tiền thanh toán - chỉ hiện khi DA_THANH_TOAN hoặc THANH_TOAN_HET */}
                    {(paymentStatusValue === 'DA_THANH_TOAN' || paymentStatusValue === 'THANH_TOAN_HET') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            {paymentStatusValue === 'THANH_TOAN_HET' ? 'Số tiền thanh toán (= Thành tiền)' : 'Số tiền thanh toán*'}
                          </label>
                          <input
                            type="text"
                            required={paymentStatusValue === 'DA_THANH_TOAN'}
                            disabled={paymentStatusValue === 'THANH_TOAN_HET'}
                            value={paidAmountDisplay || (paidAmount !== '' ? formatNumber(paidAmount) : '')}
                            onChange={(e) => {
                              const parsed = parseFormattedNumber(e.target.value);
                              setPaidAmount(parsed);
                              if (parsed !== '') {
                                setPaidAmountDisplay(formatNumber(parsed));
                              } else {
                                setPaidAmountDisplay('');
                              }
                              clearFieldError('paidAmount');
                            }}
                            onBlur={() => {
                              if (paidAmount !== '') {
                                setPaidAmountDisplay(formatNumber(paidAmount));
                              } else {
                                setPaidAmountDisplay('');
                              }
                            }}
                            onFocus={() => {
                              if (paidAmount !== '') {
                                setPaidAmountDisplay(formatNumber(paidAmount));
                              }
                            }}
                            placeholder="Nhập số tiền đã thanh toán"
                            className={`w-full rounded border px-3 py-2 ${
                              fieldErrors.paidAmount ? 'border-red-500' : paymentStatusValue === 'THANH_TOAN_HET' ? 'border-green-400 bg-green-50' : ''
                            }`}
                          />
                          {fieldErrors.paidAmount && <div className="mt-1 text-sm text-red-600">{fieldErrors.paidAmount}</div>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Ngày thanh toán*</label>
                          <input
                            type="date"
                            required
                            value={paymentDateValue}
                            onChange={(e) => {
                              setPaymentDateValue(e.target.value);
                              clearFieldError('paymentDateValue');
                            }}
                            className={`w-full rounded border px-3 py-2 ${
                              fieldErrors.paymentDateValue ? 'border-red-500' : ''
                            }`}
                          />
                          {fieldErrors.paymentDateValue && <div className="mt-1 text-sm text-red-600">{fieldErrors.paymentDateValue}</div>}
                        </div>
                      </>
                    )}

                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Ngày bắt đầu</label>
                        <input
                          type="datetime-local"
                          value={startDateValue}
                          onChange={(e) => setStartDateValue(e.target.value)}
                          className="w-full rounded border px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Ngày ký hợp đồng</label>
                        <input 
                          type="datetime-local" 
                          value={completionDateValue} 
                          onChange={(e) => {
                            setCompletionDateValue(e.target.value);
                            clearFieldError('completionDateValue');
                          }} 
                          min={startDateValue || undefined} 
                          className={`w-full rounded border px-3 py-2 ${fieldErrors.completionDateValue ? 'border-red-500' : ''}`}
                        />
                        {fieldErrors.completionDateValue && <div className="mt-1 text-sm text-red-600">{fieldErrors.completionDateValue}</div>}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">Ghi chú</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded border px-3 py-2 min-h-[100px] resize-y"
                        placeholder="Nhập ghi chú (nếu có)"
                        rows={4}
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">File đính kèm (Word/Excel)</label>
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept=".doc,.docx,.xls,.xlsx"
                          multiple
                          onChange={handleFileUpload}
                          disabled={uploadingFile || saving}
                          className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        {uploadingFile && (
                          <div className="text-sm text-gray-600">Đang upload file...</div>
                        )}
                        {attachments.length > 0 && (
                          <div className="space-y-2">
                            {attachments.map((attachment, index) => (
                              <div key={index} className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 text-sm text-gray-700 truncate" title={attachment.fileName}>
                                  {attachment.fileName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => window.open(attachment.url, '_blank')}
                                  className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                  title="Mở file trong tab mới"
                                >
                                  Mở
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttachment(index)}
                                  className="text-sm text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
                                  title="Xóa file"
                                  disabled={uploadingFile || saving}
                                >
                                  Xóa
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-500">Hỗ trợ nhiều file Word (.doc, .docx) hoặc Excel (.xls, .xlsx), mỗi file tối đa 50MB</p>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={warrantyEnabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setWarrantyEnabled(checked);
                            if (!checked) {
                              setWarrantyStartDateValue('');
                              setWarrantyEndDateValue('');
                              setWarrantyDuration('');
                              clearFieldError('warrantyStartDateValue');
                              clearFieldError('warrantyEndDateValue');
                            }
                          }}
                        />
                        <span>Bảo hành</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">Chỉ bật khi hợp đồng có bảo hành riêng.</p>
                    </div>

                    {warrantyEnabled && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">Ngày bắt đầu bảo hành</label>
                          <input
                            type="datetime-local"
                            value={warrantyStartDateValue}
                            onChange={(e) => {
                              setWarrantyStartDateValue(e.target.value);
                              clearFieldError('warrantyStartDateValue');
                              // Reset flag khi ngày bắt đầu thay đổi để tự động tính lại
                              setIsWarrantyEndDateManuallyEdited(false);
                            }}
                            className={`w-full rounded border px-3 py-2 ${fieldErrors.warrantyStartDateValue ? 'border-red-500' : ''}`}
                          />
                          {fieldErrors.warrantyStartDateValue && <div className="mt-1 text-sm text-red-600">{fieldErrors.warrantyStartDateValue}</div>}
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-1">Thời hạn bảo hành</label>
                          <input
                            type="text"
                            value={warrantyDuration}
                            onChange={(e) => {
                              setWarrantyDuration(e.target.value);
                              clearFieldError('warrantyEndDateValue');
                              // Reset flag khi thời hạn thay đổi để tự động tính lại
                              setIsWarrantyEndDateManuallyEdited(false);
                            }}
                            placeholder="Ví dụ: 1 năm 6 tháng ..."
                            className="w-50% rounded border px-3 py-2"
                          />
                          <p className="text-xs text-gray-500 mt-1">Nhập thời hạn để tự động tính ngày kết thúc</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Ngày hết hạn bảo hành</label>
                          <input
                            type="datetime-local"
                            value={warrantyEndDateValue}
                            onChange={(e) => {
                              setWarrantyEndDateValue(e.target.value);
                              clearFieldError('warrantyEndDateValue');
                              // Đánh dấu là người dùng đã chỉnh sửa thủ công
                              setIsWarrantyEndDateManuallyEdited(true);
                            }}
                            min={warrantyStartDateValue || undefined}
                            className={`w-full rounded border px-3 py-2 ${fieldErrors.warrantyEndDateValue ? 'border-red-500' : ''}`}
                          />
                          {fieldErrors.warrantyEndDateValue && <div className="mt-1 text-sm text-red-600">{fieldErrors.warrantyEndDateValue}</div>}
                          {!isWarrantyEndDateManuallyEdited && warrantyStartDateValue && warrantyDuration && warrantyDuration.trim() && (
                            <p className="mt-1 text-xs text-gray-500">Tự động tính từ ngày bắt đầu và thời hạn</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </form>
                </div>
                {/* Footer - Fixed */}
                <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
                    <div className="text-sm text-gray-600">Thành tiền: <span className="font-semibold">{computeTotal() > 0 ? computeTotal().toLocaleString() + ' ₫' : '—'}</span></div>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button" 
                        onClick={() => { 
                          if (!saving) { 
                            const wasEditing = Boolean(editingId);
                            setShowModal(false); 
                            setEditingId(null); 
                            setFieldErrors({});
                            // Reset flag khi đóng modal
                            setIsWarrantyEndDateManuallyEdited(false);
                            // Clear attachments when canceling create mode (not edit mode)
                            // In edit mode, attachments are loaded from server, so we reload them when reopening
                            if (!wasEditing) {
                              setAttachments([]);
                            }
                          } 
                        }} 
                        className="px-4 py-2 border rounded hover:bg-gray-50 transition"
                      >
                        Hủy
                      </button>
                      <button type="submit" form="business-form" disabled={saving} className={`px-4 py-2 rounded text-white transition ${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{saving ? 'Đang lưu...' : (editingId ? 'Cập nhật' : 'Lưu')}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                  Danh sách Kinh doanh
                </h3>
              </div>
              <div className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">STT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Bệnh viện</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Đơn giá</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Thành tiền</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Còn lại</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Ngày thanh toán</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Mã hợp đồng</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Người phụ trách</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Phần cứng</th>
                        <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">SL</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Thanh toán</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Trạng thái</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Bảo hành</th>
                        <th className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)]">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">
                            <div className="flex flex-col items-center">
                              <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <span className="text-sm">Không có dữ liệu</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        items.map((it, index) => {
                          const stt = currentPage * itemsPerPage + index + 1;
                          return (
                            <tr
                              key={it.id}
                              className="group transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
                              onMouseEnter={() => setHoveredId(it.id)}
                              onMouseLeave={() => setHoveredId(null)}
                            >
                              {/* STT */}
                              <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                                {stt}
                              </td>
                              {/* Bệnh viện */}
                              <td className="min-w-[180px] px-4 py-3">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {it.hospital?.label ?? '—'}
                                </div>
                                {it.hospitalPhone && (
                                  <div className="text-xs text-gray-500 mt-0.5">{it.hospitalPhone}</div>
                                )}
                              </td>
                              {/* Đơn giá */}
                              <td className="whitespace-nowrap px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300">
                                {it.unitPrice != null ? it.unitPrice.toLocaleString('vi-VN') + ' ₫' : '—'}
                              </td>
                              {/* Thành tiền */}
                              <td className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                                {it.totalPrice != null ? it.totalPrice.toLocaleString('vi-VN') + ' ₫' : '—'}
                              </td>
                              {/* Còn lại */}
                              <td className="whitespace-nowrap px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300">
                                {(() => {
                                  const total = it.totalPrice ?? 0;
                                  const paid = (typeof it.paidAmount === 'number' ? it.paidAmount : 0);
                                  const remaining = total - paid;
                                  if (total === 0 && paid === 0) return '—';
                                  return (
                                    <span className={remaining <= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                      {remaining <= 0 ? '0 ₫' : remaining.toLocaleString('vi-VN') + ' ₫'}
                                    </span>
                                  );
                                })()}
                              </td>
                              {/* Ngày thanh toán */}
                              <td className="whitespace-nowrap px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300">
                                {it.paymentDate ? formatDateShort(it.paymentDate) : '—'}
                              </td>
                              {/* Mã hợp đồng */}
                              <td className="whitespace-nowrap px-4 py-3">
                                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                  {it.name ?? '—'}
                                </span>
                              </td>
                              {/* Người phụ trách */}
                              <td className="whitespace-nowrap px-4 py-3 min-w-[140px]">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  <div className="font-medium">{it.picUser?.label ?? '—'}</div>
                                  {it.picUser?.subLabel && (
                                    <div className="text-xs text-gray-500">{it.picUser.subLabel}</div>
                                  )}
                                </div>
                              </td>
                              {/* Phần cứng */}
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {it.hardware?.label ?? '—'}
                              </td>
                              {/* SL */}
                              <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                                {it.quantity ?? '—'}
                              </td>
                              {/* Thanh toán */}
                              <td className="whitespace-nowrap px-4 py-3">
                                {it.paymentStatus === 'THANH_TOAN_HET' ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                                      Thanh toán hết
                                    </span>
                                    {typeof it.paidAmount === 'number' && (
                                      <span className="text-xs text-center text-gray-600">
                                        {it.paidAmount.toLocaleString('vi-VN')} ₫
                                      </span>
                                    )}
                                  </div>
                                ) : it.paymentStatus === 'DA_THANH_TOAN' ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                                      Đã thanh toán
                                    </span>
                                    {typeof it.paidAmount === 'number' && (
                                      <span className="text-xs text-center text-gray-600">
                                        {it.paidAmount.toLocaleString('vi-VN')} ₫
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                                    Chưa thanh toán
                                  </span>
                                )}
                              </td>
                              {/* Trạng thái */}
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  {renderStatusBadge(it.status)}
                                  {it.implementationCompleted && (it.status ?? '').toUpperCase() === 'CONTRACTED' && (
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                                      Đã nghiệm thu
                                    </span>
                                  )}
                                </div>
                              </td>
                              
                              {/* Bảo hành */}
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  {it.warrantyEndDate ? (
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{formatDateShort(it.warrantyEndDate)}</span>
                                  ) : (
                                    <span className="text-sm text-gray-400">—</span>
                                  )}
                                  {renderWarrantyStatusBadge(it.warrantyEndDate)}
                                </div>
                              </td>
                              {/* Thao tác (sticky right so no horizontal scroll needed) */}
                              <td className="sticky right-0 z-10 whitespace-nowrap border-l border-gray-200 bg-white px-4 py-3 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.3)] dark:group-hover:bg-gray-800/50">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    title="Xem chi tiết"
                                    onClick={() => openView(it)}
                                    className="rounded-lg p-1.5 text-gray-500 transition hover:bg-blue-100 hover:text-blue-600"
                                  >
                                    <EyeIcon style={{ width: 18, height: 18 }} />
                                  </button>
                                  {canManage && (
                                    <button
                                      title="Sửa"
                                      onClick={() => openEditModal(it.id)}
                                      className="rounded-lg p-1.5 text-gray-500 transition hover:bg-yellow-100 hover:text-orange-600"
                                    >
                                      <PencilIcon style={{ width: 18, height: 18 }} />
                                    </button>
                                  )}
                                  {canManage && !(it.status === 'CONTRACTED' && !isSuperAdmin) && (
                                    <button
                                      title="Xóa"
                                      onClick={() => { if (it.status === 'CONTRACTED' && !isSuperAdmin) { setToast({ message: 'Không thể xóa dự án đã ký hợp đồng', type: 'error' }); return; } handleDelete(it.id); }}
                                      disabled={deletingId === it.id}
                                      className={`rounded-lg p-1.5 transition ${deletingId === it.id ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:bg-red-100 hover:text-red-600'}`}
                                    >
                                      <TrashBinIcon style={{ width: 18, height: 18 }} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(p) => setCurrentPage(p)}
                  onItemsPerPageChange={(s) => { setItemsPerPage(s); setCurrentPage(0); }}
                  showItemsPerPage={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Detail modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && closeView()}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[95vh] flex flex-col">
            {/* Header - Fixed */}
            <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-gray-200">
              <h3 className="text-lg sm:text-xl font-semibold">Chi tiết hợp đồng kinh doanh {formatBusinessId(viewItem.id)}</h3>
            </div>
            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              <div className="space-y-5">
                {/* General Info Section */}
                <div>
                  <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Thông tin chung</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DetailField label="Mã hợp đồng" value={viewItem.name} />
                    <DetailField label="Bệnh viện" value={viewItem.hospital?.label} />
                    {viewItem.hospitalPhone && <DetailField label="Điện thoại" value={viewItem.hospitalPhone} />}
                    {viewItem.hardware?.label && <DetailField label="Phần cứng" value={viewItem.hardware.label} />}
                    <DetailField 
                      label="Người phụ trách" 
                      value={viewItem.picUser?.label ? (
                        <div>
                          <div className="font-medium text-gray-900">{viewItem.picUser.label}</div>
                          {viewItem.picUser.subLabel && (
                            <div className="text-sm text-gray-500 mt-0.5">{viewItem.picUser.subLabel}</div>
                          )}
                        </div>
                      ) : null}
                    />
                    <DetailField 
                      label="Trạng thái" 
                      value={viewItem.status ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          viewItem.status === 'CONTRACTED' ? 'bg-green-100 text-green-800' :
                          viewItem.status === 'CARING' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {statusLabel(viewItem.status)}
                        </span>
                      ) : null}
                    />
                    {viewItem.bankName && <DetailField label="Đơn vị tài trợ" value={viewItem.bankName} />}
                    {viewItem.bankContactPerson && <DetailField label="Liên hệ đơn vị tài trợ" value={viewItem.bankContactPerson} />}
                  </div>
                </div>
                <hr className="my-3 border-gray-200" />

                {/* Financials Section */}
                <div>
                  <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Thông tin tài chính</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {viewItem.quantity != null && (
                      <DetailField label="Số lượng Kiosk" value={<span className="font-semibold text-gray-900">{viewItem.quantity}</span>} />
                    )}
                    {viewItem.unitPrice != null && (
                      <DetailField 
                        label="Đơn giá (Gross)" 
                        value={<span className="font-semibold text-gray-900">{viewItem.unitPrice.toLocaleString()} VND</span>} 
                      />
                    )}
                    {viewItem.unitPriceNet != null && (
                      <DetailField 
                        label="Đơn giá (NET)" 
                        value={<span className="font-semibold text-gray-900">{viewItem.unitPriceNet.toLocaleString()} VND</span>} 
                      />
                    )}
                    {viewItem.totalPrice != null && (
                      <DetailField 
                        label="Thành tiền" 
                        value={<span className="font-semibold text-lg text-gray-900">{viewItem.totalPrice.toLocaleString()} VND</span>} 
                      />
                    )}
                    {viewItem.commission != null && (
                      <DetailField 
                        label="Hoa hồng của viện" 
                        value={
                          <div>
                            <span className="font-semibold text-gray-900">{Math.round(Number(viewItem.commission)).toLocaleString()} VND</span>
                          </div>
                        } 
                      />
                    )}
                    <DetailField 
                      label="Trạng thái thanh toán" 
                      value={
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          viewItem.paymentStatus === 'THANH_TOAN_HET' ? 'bg-emerald-100 text-emerald-800' :
                          viewItem.paymentStatus === 'DA_THANH_TOAN' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {viewItem.paymentStatus === 'THANH_TOAN_HET' ? 'Thanh toán hết' :
                           viewItem.paymentStatus === 'DA_THANH_TOAN' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                        </span>
                      }
                    />
                    {typeof viewItem.paidAmount === 'number' && viewItem.paidAmount > 0 && (
                      <DetailField 
                        label="Đã thanh toán" 
                        value={<span className="font-semibold text-gray-900">{viewItem.paidAmount.toLocaleString('vi-VN')} ₫</span>}
                      />
                    )}
                    {viewItem.paymentDate && (
                      <DetailField
                        label="Ngày thanh toán"
                        value={<span className="font-semibold text-gray-900">{formatDateShort(viewItem.paymentDate)}</span>}
                      />
                    )}
                    {(() => {
                      const total = viewItem.totalPrice ?? 0;
                      const paid = typeof viewItem.paidAmount === 'number' ? viewItem.paidAmount : 0;
                      const remaining = total - paid;
                      return (
                        <DetailField 
                          label="Còn lại" 
                          value={
                            <span className={`font-semibold ${remaining <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {remaining <= 0 ? '0 ₫' : remaining.toLocaleString('vi-VN') + ' ₫'}
                            </span>
                          }
                        />
                      );
                    })()}
                  </div>
                </div>
                <hr className="my-3 border-gray-200" />

                {/* Timeline Section */}
                <div>
                  <h4 className="text-xs font-semibold text-black uppercase tracking-wider mb-3">Timeline</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {viewItem.startDate && <DetailField label="Ngày bắt đầu" value={formatDateShort(viewItem.startDate)} />}
                    {viewItem.completionDate && <DetailField label="Ngày ký hợp đồng" value={formatDateShort(viewItem.completionDate)} />}
                    {viewItem.warrantyStartDate && <DetailField label="Ngày bắt đầu bảo hành" value={formatDateShort(viewItem.warrantyStartDate)} />}
                    {viewItem.warrantyEndDate && <DetailField label="Ngày hết hạn bảo hành" value={formatDateShort(viewItem.warrantyEndDate)} />}
                  </div>
                </div>
              </div>

              {/* Notes Section - Full Width */}
              {viewItem.notes && (
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Ghi chú</h4>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{viewItem.notes}</div>
                  </div>
                </div>
              )}

              {/* Attachments Section - Full Width */}
              {viewItem.attachments && viewItem.attachments.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      File đính kèm ({viewItem.attachments.length})
                    </h4>
                    <div className="space-y-2">
                      {viewItem.attachments.map((attachment, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                          <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate" title={attachment.fileName}>
                              {attachment.fileName || `File ${index + 1}`}
                            </div>
                            <div className="text-xs text-gray-500">Word/Excel</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => window.open(attachment.url, '_blank')}
                            className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors whitespace-nowrap"
                          >
                            Mở file
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = attachment.url;
                              link.download = attachment.fileName || `attachment-${index + 1}`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors whitespace-nowrap"
                          >
                            Tải xuống
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Footer - Fixed */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div className="flex justify-end">
                <button onClick={closeView} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessPage;

// View modal (rendered by parent when viewItem is set) -- keep outside main component tree

