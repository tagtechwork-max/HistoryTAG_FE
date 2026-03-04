/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Link } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { getSummaryReport, type SuperAdminSummaryDTO, HardwareAPI, getAllImplementationTasks, getAllDevTasks, getAllMaintenanceTasks, getAllUsers, UserResponseDTO, ImplementationTaskResponseDTO, DevTaskResponseDTO, MaintenanceTaskResponseDTO } from "../../api/superadmin.api";
import { getBusinesses } from "../../api/business.api";
import api, { getAuthToken } from "../../api/client";
import toast from "react-hot-toast";
import Pagination from "../../components/common/Pagination";
import TetCelebration from "../../components/common/TetCelebration";
import FlowerFall from "../../components/common/FlowerFall";
import CSKHReport from "../../components/reports/CSKHReport";


// ExcelJS is heavy; import dynamically inside export functions to reduce initial bundle size

// C1: Max page size for dashboard APIs (no more size:10000 - server-side filter + pagination)
const PAGE_SIZE = 500;

function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon?: React.ReactNode; color?: string }) {
  let display: React.ReactNode = value;
  if (typeof value === 'string' && value.endsWith(' ₫')) {
    const num = value.slice(0, -2);
    display = <span className="whitespace-nowrap"><span>{num}</span><span className="ml-1">&nbsp;₫</span></span>;
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-md border border-gray-100 h-28">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-white ${color ?? 'bg-slate-400'}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <div className="text-xs text-gray-500">{title}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-2xl font-extrabold text-gray-900 whitespace-nowrap" title={typeof value === 'number' ? value.toLocaleString() : String(value)}>
            {display}
          </div>
        </div>
      </div>
    </div>
  );
}

type ApexFormatterOpts = { w?: { globals?: { series?: number[] } }; seriesIndex?: number } | undefined;
export default function SuperAdminHome() {
  const [summary, setSummary] = useState<SuperAdminSummaryDTO | null>(null);
  const [businessFrom, setBusinessFrom] = useState<string>('');
  const [businessTo, setBusinessTo] = useState<string>('');
  const [businessStatus, setBusinessStatus] = useState<string>(''); // Filter by status
  const [businessLoading, setBusinessLoading] = useState(false);
  const [totalExpected, setTotalExpected] = useState<number | null>(null);
  const [totalActual, setTotalActual] = useState<number | null>(null);
  const [totalCommission, setTotalCommission] = useState<number | null>(null);
  const [conversionRate, setConversionRate] = useState<number | null>(null);
  type BusinessItem = { totalPrice: number; commission: number; status: string; date: Date | null };
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([]);
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'year'>('day');
  const [aggLabels, setAggLabels] = useState<string[]>([]);
  const [aggExpected, setAggExpected] = useState<number[]>([]);
  const [aggActual, setAggActual] = useState<number[]>([]);
  const [aggCommission, setAggCommission] = useState<number[]>([]);
  const [hwGroupBy, setHwGroupBy] = useState<'hardware' | 'type' | 'supplier'>('hardware');
  const [hwTopN, setHwTopN] = useState<number>(8);
  const [hwRows, setHwRows] = useState<Array<{ key: string; label: string; revenue: number; quantity: number; taskCount: number; impl: number; dev: number; maint: number; image?: string }>>([]);
  const [hwLoading, setHwLoading] = useState(false);
  // Employee Performance report states
  const API_ROOT = import.meta.env.VITE_API_URL || "";
  type EmployeePerf = {
    userId?: number | null;
    fullName?: string | null;
    team?: string | null;
    department?: string | null;
    totalAssigned?: number;
    totalInProgress?: number;
    totalCompleted?: number;
    totalLate?: number;
    totalReceived?: number;
    totalTransferred?: number;
    avgProcessingHours?: number;
  };
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState<number | ''>('');
  const [reportTeam, setReportTeam] = useState<string>('ALL');
  const [reportDepartment, setReportDepartment] = useState<string>('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<EmployeePerf[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // load users ONCE on mount → extract departments, teams, and cache for reuse
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uResp = await getAllUsers({ page: 0, size: PAGE_SIZE });
        const uList = Array.isArray(uResp) ? (uResp as UserResponseDTO[]) : (uResp as any)?.content ?? [];
        if (!mounted) return;
        // departments (for employee perf filter)
        const deps = Array.from(new Set(uList.map((u: any) => (u?.department ?? null)).filter(Boolean))).sort();
        setDepartments(deps as string[]);
        // teams (for team dropdown)
        const teams = Array.from(new Set(uList.map((u) => u.team).filter(Boolean))).sort() as string[];
        setAvailableTeams(teams);
        // cache for reuse in loadTeamProfile
        setAllUsersCache(uList as UserResponseDTO[]);
      } catch (err) {
        // console.warn('Failed to load users on mount', err);
        if (mounted) {
          setAvailableTeams([]);
          setAllUsersCache([]);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);
  // Background: fetch hospital transfer map once on mount (non-blocking, with sessionStorage cache)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const hResp = await api.get('/api/v1/auth/hospitals', { params: { page: 0, size: PAGE_SIZE } });
        const hData = hResp.data;
        const hList: any[] = Array.isArray(hData) ? hData : hData?.content ?? [];
        const tMap = new Map<string, { transferred: boolean; transferredAt: string | null }>();
        hList.forEach((h: any) => {
          const name = String(h?.name ?? '').trim();
          if (name) tMap.set(name, {
            transferred: Boolean(h?.transferredToMaintenance),
            transferredAt: h?.transferredAt ?? null,
          });
        });
        if (mounted) {
          setHospitalTransferMap(tMap);
          // Persist to sessionStorage for instant load next time
          try { sessionStorage.setItem('hospitalTransferMap', JSON.stringify(Array.from(tMap.entries()))); } catch { /* ignore */ }
        }
      } catch (err) {
        console.warn('Background hospital transfer map load failed', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Team profile states (changed from hospital to team)
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);
  const [profileUsers, setProfileUsers] = useState<UserResponseDTO[]>([]);
  const [allUsersCache, setAllUsersCache] = useState<UserResponseDTO[]>([]);
  const [profileImplTasks, setProfileImplTasks] = useState<ImplementationTaskResponseDTO[]>([]);
  const [profileDevTasks, setProfileDevTasks] = useState<DevTaskResponseDTO[]>([]);
  const [profileMaintTasks, setProfileMaintTasks] = useState<MaintenanceTaskResponseDTO[]>([]);
  const [profileBusinesses, setProfileBusinesses] = useState<Array<Record<string, unknown>>>([]);
  const [hardwareMap, setHardwareMap] = useState<Record<string, string>>({});
  const [profileQuarter, setProfileQuarter] = useState<'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('all');
  const [profileYear, setProfileYear] = useState<string>('');
  const [profileDateFrom, setProfileDateFrom] = useState<string>(''); // Date range filter from
  const [profileDateTo, setProfileDateTo] = useState<string>(''); // Date range filter to
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_exportChoice, _setExportChoice] = useState<'users' | 'impl' | 'dev' | 'maint' | 'businesses' | 'all' | 'all_single'>('users');
  const [viewMode, setViewMode] = useState<'detail' | 'comparison'>('detail');
  const [compareYear, setCompareYear] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  // per-table status filters
  const [implStatusFilter, setImplStatusFilter] = useState<string>('all');
  const [devStatusFilter, setDevStatusFilter] = useState<string>('all');
  const [maintStatusFilter, setMaintStatusFilter] = useState<string>('all');
  // Profile status filter (for "Báo cáo chi tiết theo từng viện")
  const [profileStatusFilter, setProfileStatusFilter] = useState<string>('all');
  const [profilePicFilter, setProfilePicFilter] = useState<string>('all');
  const [profileTransferFilter, setProfileTransferFilter] = useState<string>('all');
  // Map: hospitalName → { transferred, transferredAt } (from Hospital entity, fetched lazily on mount)
  const [hospitalTransferMap, setHospitalTransferMap] = useState<Map<string, { transferred: boolean; transferredAt: string | null }>>(() => {
    // Restore from sessionStorage for instant display
    try {
      const cached = sessionStorage.getItem('hospitalTransferMap');
      if (cached) {
        const parsed = JSON.parse(cached) as [string, { transferred: boolean; transferredAt: string | null }][];
        return new Map(parsed);
      }
    } catch { /* ignore */ }
    return new Map();
  });
  // Helper: check if a hospital is transferred to maintenance as of a given end date
  const isHospitalTransferred = useCallback((hName: string, endDate?: string | null): boolean => {
    const entry = hospitalTransferMap.get(hName);
    if (!entry) return false;
    if (!entry.transferred) return false;
    // If no endDate filter, just return current transferred status
    if (!endDate) return true;
    // If hospital has no transferredAt recorded (legacy), assume transferred
    if (!entry.transferredAt) return true;
    // Check: transferredAt <= endDate
    const transferDate = new Date(entry.transferredAt);
    const filterEnd = new Date(endDate);
    if (Number.isNaN(transferDate.getTime())) return true;
    if (Number.isNaN(filterEnd.getTime())) return true;
    // Set filterEnd to end of day for fair comparison
    filterEnd.setHours(23, 59, 59, 999);
    return transferDate <= filterEnd;
  }, [hospitalTransferMap]);

  const normalizedSelectedTeam = selectedTeam.trim().toUpperCase();
  const isSalesSelected = normalizedSelectedTeam === 'SALES' || normalizedSelectedTeam === 'KINH DOANH';
  
  // Team select pagination states
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');
  const [teamPage, setTeamPage] = useState<number>(0);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState<boolean>(false);
  const teamsPerPage = 5;
  const teamDropdownRef = useRef<HTMLDivElement | null>(null);

  // Validate profilePicFilter when profileUsers changes
  // Temporarily disabled to debug infinite loop
  // useEffect(() => {
  //   if (profilePicFilter === 'all' || profileUsers.length === 0) return;
  //   const exists = profileUsers.some((u) => u.id != null && String(u.id) === profilePicFilter);
  //   if (!exists) {
  //     setProfilePicFilter('all');
  //   }
  //   // Only depend on profileUsers, not profilePicFilter to avoid loop
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [profileUsers]);
  // Pagination for detail view
  const [detailCurrentPage, setDetailCurrentPage] = useState<number>(0);
  const [detailItemsPerPage, setDetailItemsPerPage] = useState<number>(5);
  const [detailTotalItems, setDetailTotalItems] = useState<number>(0);
  const [detailTotalPages, setDetailTotalPages] = useState<number>(1);
  // Pagination for implementation and maintenance tables
  const [implCurrentPage, setImplCurrentPage] = useState<number>(0);
  const [implItemsPerPage, setImplItemsPerPage] = useState<number>(5);
  const [maintCurrentPage, setMaintCurrentPage] = useState<number>(0);
  const [maintItemsPerPage, setMaintItemsPerPage] = useState<number>(5);
  // Collapsible groups (hospital names)
  const [collapsedHospitals, setCollapsedHospitals] = useState<Set<string>>(new Set());
  const resetTeamFilters = useCallback(() => {
    setProfileQuarter('all');
    setProfileYear('');
    setProfileDateFrom('');
    setProfileDateTo('');
    setProfileStatusFilter('all');
    setProfilePicFilter('all');
    setProfileTransferFilter('all');
    setDetailCurrentPage(0);
  }, []);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await getSummaryReport();
        if (mounted) setSummary(res);
      } catch (err: unknown) {
        console.error("Failed to load summary:", err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg || "Không thể tải báo cáo");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const fetchEmployeePerformance = async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('year', String(reportYear));
      if (reportMonth !== '') params.append('month', String(reportMonth));
      if (reportTeam && reportTeam !== 'ALL') params.append('team', reportTeam);
      if (reportDepartment) params.append('department', reportDepartment);

      const url = `${API_ROOT}/api/v1/superadmin/reports/employee-performance?${params.toString()}`;
      const token = getAuthToken();
      const res = await fetch(url, { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined, credentials: 'include' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setReportData(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('fetchEmployeePerformance failed', err);
      toast.error((err as Error)?.message ?? 'Lấy báo cáo thất bại');
      setReportData([]);
    } finally {
      setReportLoading(false);
    }
  };


  const exportEmployeePerformanceExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.append('year', String(reportYear));
      if (reportMonth !== '') params.append('month', String(reportMonth));
      if (reportTeam && reportTeam !== 'ALL') params.append('team', reportTeam);
      if (reportDepartment) params.append('department', reportDepartment);
      const url = `${API_ROOT}/api/v1/superadmin/reports/employee-performance/export?${params.toString()}`;
      const token = getAuthToken();
      const res = await fetch(url, { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined, credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed ${res.status}`);
      const blob = await res.blob();
      const aUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = aUrl;
      const monthPart = reportMonth !== '' ? `-${String(reportMonth).padStart(2, '0')}` : '';
      a.download = `employee_performance_${reportYear}${monthPart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(aUrl);
    } catch (err: unknown) {
      console.error('exportEmployeePerformanceExcel failed', err);
      toast.error((err as Error)?.message ?? 'Xuất file thất bại');
    }
  };

  // load business report (fetch all pages when total > PAGE_SIZE so totals are correct)
  const loadBusinessReport = useCallback(async (from?: string, to?: string, status?: string) => {
    setBusinessLoading(true);
    try {
      const toParam = (v?: string | null) => v ? (v.length === 16 ? `${v}:00` : v) : undefined;
      const params: Record<string, unknown> = { size: PAGE_SIZE };
      if (from) params.startDateFrom = toParam(from);
      if (to) params.startDateTo = toParam(to);
      if (status && status.trim() !== '') params.status = status.trim();

      let allContent: unknown[] = [];
      let page = 0;
      const maxPages = 50; // safety: cap at 50 pages (e.g. 25k items)
      while (page < maxPages) {
        const res = await getBusinesses({ page, ...params });
        const content = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
        allContent = allContent.concat(content);
        const totalElements = (res as { totalElements?: number })?.totalElements ?? allContent.length;
        if (content.length < PAGE_SIZE || allContent.length >= totalElements) break;
        page += 1;
      }

      const itemsRaw = (allContent as Array<Record<string, unknown>>).map((c) => {
        const rawDate = c['startDate'] ?? c['completionDate'] ?? null;
        const parsedDate = rawDate ? new Date(String(rawDate)) : null;
        return {
          totalPrice: c['totalPrice'] != null ? Number(String(c['totalPrice'])) : 0,
          commission: c['commission'] != null ? Number(String(c['commission'])) : 0,
          status: (c['status'] as string) ?? '',
          date: parsedDate,
        } as BusinessItem;
      });

      const totalExp = itemsRaw.reduce((acc, it) => acc + (it.totalPrice ?? 0), 0);
      const contracted = itemsRaw.filter((it) => (it.status ?? '').toString().toUpperCase() === 'CONTRACTED');
      const totalAct = contracted.reduce((acc, it) => acc + (it.totalPrice ?? 0), 0);
      const totalComm = contracted.reduce((acc, it) => acc + (it.commission ?? 0), 0);
      const totalCount = itemsRaw.length;
      const contractedCount = contracted.length;
      const conv = totalCount > 0 ? (contractedCount / totalCount) * 100 : null;

      setTotalExpected(totalExp);
      setTotalActual(totalAct);
      setTotalCommission(totalComm);
      setConversionRate(conv != null ? Math.round(conv * 100) / 100 : null);
      // keep raw items for aggregation/charting
      setBusinessItems(itemsRaw);
    } catch (err: unknown) {
      console.error('Failed to load business report', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || 'Không thể tải báo cáo kinh doanh');
      setTotalExpected(null);
      setTotalActual(null);
      setTotalCommission(null);
      setConversionRate(null);
    } finally {
      setBusinessLoading(false);
    }
  }, []);

  // load on mount (deferred by 2s to reduce initial connection contention)
  useEffect(() => {
    const timer = setTimeout(() => { void loadBusinessReport(); }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // aggregate when items or grouping change
  useEffect(() => {
    if (!businessItems || businessItems.length === 0) {
      setAggLabels([]);
      setAggExpected([]);
      setAggActual([]);
      setAggCommission([]);
      return;
    }

    const map = new Map<string, { expected: number; actual: number; commission: number }>();
    businessItems.forEach((it) => {
      if (!it.date) return;
      const d = it.date;
      const key = groupBy === 'year'
        ? String(d.getFullYear())
        : groupBy === 'month'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { expected: 0, actual: 0, commission: 0 });
      const entry = map.get(key)!;
      entry.expected += it.totalPrice ?? 0;
      if ((it.status ?? '').toString().toUpperCase() === 'CONTRACTED') {
        entry.actual += it.totalPrice ?? 0;
        entry.commission += it.commission ?? 0;
      }
    });

    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (groupBy === 'year') {
      const years = keys.map((k) => Number(k));
      const minY = Math.min(...years);
      const maxY = Math.max(...years);
      const labels: string[] = [];
      const expected: number[] = [];
      const actual: number[] = [];
      const commission: number[] = [];
      for (let y = minY; y <= maxY; y++) {
        const k = String(y);
        const e = map.get(k);
        labels.push(k);
        expected.push(e ? e.expected : 0);
        actual.push(e ? e.actual : 0);
        commission.push(e ? e.commission : 0);
      }
      setAggLabels(labels);
      setAggExpected(expected);
      setAggActual(actual);
      setAggCommission(commission);
      return;
    }
    if (groupBy === 'day') {
      // keys are in YYYY-MM-DD format; build contiguous date range
      const minKey = keys[0];
      const maxKey = keys[keys.length - 1];
      const minDate = new Date(minKey);
      const maxDate = new Date(maxKey);
      const labels: string[] = [];
      const expected: number[] = [];
      const actual: number[] = [];
      const commission: number[] = [];
      for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const k = `${y}-${m}-${dd}`;
        const e = map.get(k);
        // display label as DD-MM-YYYY to match screenshot
        labels.push(`${dd}-${m}-${y}`);
        expected.push(e ? e.expected : 0);
        actual.push(e ? e.actual : 0);
        commission.push(e ? e.commission : 0);
      }
      setAggLabels(labels);
      setAggExpected(expected);
      setAggActual(actual);
      setAggCommission(commission);
      return;
    }

    // month grouping: keep YYYY-MM keys but display as MM-YYYY for readability
    const labels: string[] = [];
    const expected: number[] = [];
    const actual: number[] = [];
    const commission: number[] = [];
    keys.forEach((k) => {
      const e = map.get(k)!;
      // k is YYYY-MM; convert to MM-YYYY label
      const parts = k.split('-');
      const label = parts.length >= 2 ? `${parts[1]}-${parts[0]}` : k;
      labels.push(label);
      expected.push(e.expected);
      actual.push(e.actual);
      commission.push(e.commission);
    });
    setAggLabels(labels);
    setAggExpected(expected);
    setAggActual(actual);
    setAggCommission(commission);
  }, [businessItems, groupBy]);

  // load hardware report for dashboard widget
  const loadHardwareReport = useCallback(async () => {
    setHwLoading(true);
    try {
      const hwResp = await HardwareAPI.getAllHardware({ size: PAGE_SIZE });
      const hardwareList = Array.isArray(hwResp) ? (hwResp as unknown[]) : ((hwResp as unknown) as { content?: unknown[] })?.content || [];

      const busResp = await getBusinesses({ size: PAGE_SIZE });
      const businessList = Array.isArray(busResp) ? (busResp as unknown[]) : ((busResp as unknown) as { content?: unknown[] })?.content || [];

      const implResp = await getAllImplementationTasks({ size: PAGE_SIZE });
      const implList = Array.isArray(implResp) ? (implResp as unknown[]) : ((implResp as unknown) as { content?: unknown[] })?.content || [];
      const devResp = await getAllDevTasks({ size: PAGE_SIZE });
      const devList = Array.isArray(devResp) ? (devResp as unknown[]) : ((devResp as unknown) as { content?: unknown[] })?.content || [];
      const maintResp = await getAllMaintenanceTasks({ size: PAGE_SIZE });
      const maintList = Array.isArray(maintResp) ? (maintResp as unknown[]) : ((maintResp as unknown) as { content?: unknown[] })?.content || [];

      const hwById: Record<string, Record<string, unknown>> = {};
      hardwareList.forEach((hRaw) => {
        const h = hRaw as Record<string, unknown> | undefined;
        if (!h) return;
        const id = h['id'];
        const name = h['name'];
        if (id != null) hwById[String(id)] = h;
        if (name != null) hwById[`name:${String(name)}`] = h;
      });

  const map = new Map<string, { label: string; revenue: number; quantity: number; taskCount: number; impl: number; dev: number; maint: number }>();

      function ensure(key: string, label: string) {
        let v = map.get(key);
        if (!v) {
          v = { label, revenue: 0, quantity: 0, taskCount: 0, impl: 0, dev: 0, maint: 0 };
          map.set(key, v);
        }
        return v;
      }

      // businesses -> revenue & quantity (only CONTRACTED considered for revenue)
      (businessList as unknown[]).forEach((bRaw) => {
        const b = bRaw as Record<string, unknown> | undefined;
        try {
          if (!b) return;
          const status = String(b['status'] ?? '').toUpperCase();
          const hwId = (b['hardware'] && (b['hardware'] as any)['id']) ?? b['hardwareId'] ?? null;
          const hwName = (b['hardware'] && ((b['hardware'] as any)['label'] ?? (b['hardware'] as any)['name'])) ?? b['hardwareName'] ?? null;
          const hwMeta = hwId != null ? hwById[String(hwId)] : (hwName ? hwById[`name:${String(hwName)}`] : undefined);
          let key = 'unknown';
          let label = '-';
            if (hwGroupBy === 'hardware') {
            if (hwId) { key = `hw:${String(hwId)}`; label = String((hwMeta && hwMeta['name']) ?? hwName ?? String(hwId)); }
            else if (hwName) { key = `hwname:${String(hwName)}`; label = String(hwName); }
          } else if (hwGroupBy === 'type') {
            const t = String((hwMeta && hwMeta['type']) ?? '—'); key = `type:${t}`; label = t;
          } else {
            const s = String((hwMeta && hwMeta['supplier']) ?? '—'); key = `sup:${s}`; label = s;
          }
          const row = ensure(key, label);
          if (status === 'CONTRACTED') {
            const total = b['totalPrice'] != null ? Number(b['totalPrice']) : (b['unitPrice'] != null && b['quantity'] != null ? Number(b['unitPrice']) * Number(b['quantity']) : 0);
            row.revenue += Number(total || 0);
            row.quantity += Number(b['quantity'] ?? 0);
          }
        } catch {
          // ignore
        }
      });

      const addTasks = (list: unknown[], kind: 'impl' | 'dev' | 'maint') => {
        list.forEach((tRaw) => {
          const t = tRaw as Record<string, unknown> | undefined;
          try {
            if (!t) return;
            const tHwObj = (t['hardware'] as Record<string, unknown> | undefined) ?? undefined;
            const hwId = t['hardwareId'] ?? (tHwObj && tHwObj['id'] != null ? tHwObj['id'] : null);
            const hwName = t['hardwareName'] ?? (tHwObj ? (tHwObj['name'] ?? tHwObj['label']) : (t['hardware'] ?? null));
            const hwMeta = hwId != null ? hwById[String(hwId)] : (hwName ? hwById[`name:${String(hwName)}`] : undefined);
            let key = 'unknown';
            let label = '-';
            if (hwGroupBy === 'hardware') {
              if (hwId) { key = `hw:${String(hwId)}`; label = String((hwMeta && hwMeta['name']) ?? hwName ?? String(hwId)); }
              else if (hwName) { key = `hwname:${String(hwName)}`; label = String(hwName); }
            } else if (hwGroupBy === 'type') {
              const tval = String((hwMeta && hwMeta['type']) ?? '—'); key = `type:${tval}`; label = tval;
            } else {
              const sval = String((hwMeta && hwMeta['supplier']) ?? '—'); key = `sup:${sval}`; label = sval;
            }
            const row = ensure(key, label);
            row.taskCount += 1;
            if (kind === 'impl') row.impl += 1;
            if (kind === 'dev') row.dev += 1;
            if (kind === 'maint') row.maint += 1;
            row.quantity += Number(t['quantity'] ?? 0);
          } catch {
            // ignore
          }
        });
      };

      addTasks(implList, 'impl');
      addTasks(devList, 'dev');
      addTasks(maintList, 'maint');

      const out = Array.from(map.entries()).map(([k, v]) => {
        let image = '';
        try {
          if (k.startsWith('hw:')) {
            const id = k.slice(3);
            const meta = hwById[String(id)];
            if (meta) image = String(meta['image'] ?? meta['imageUrl'] ?? meta['thumbnail'] ?? '');
          } else if (k.startsWith('hwname:')) {
            const name = k.slice(7);
            const meta = hwById[`name:${name}`];
            if (meta) image = String(meta['image'] ?? meta['imageUrl'] ?? meta['thumbnail'] ?? '');
          }
        } catch {
          // ignore
        }
        return { key: k, label: v.label, revenue: v.revenue, quantity: v.quantity, taskCount: v.taskCount, impl: v.impl, dev: v.dev, maint: v.maint, image };
      });
      out.sort((a, b) => b.revenue - a.revenue);
      setHwRows(out.slice(0, hwTopN));
    } catch (e: unknown) {
      console.error('Failed to load hardware report', e);
    } finally {
      setHwLoading(false);
    }
  }, [hwGroupBy, hwTopN]);

  // Defer hardware report: mount-time load delayed by 4s to free up browser connections for more critical data.
  // Subsequent changes to groupBy/topN trigger immediately.
  const hwMountedRef = useRef(false);
  useEffect(() => {
    if (!hwMountedRef.current) {
      // First mount: delay to avoid hogging browser connection pool (max 6 per domain)
      hwMountedRef.current = true;
      const timer = setTimeout(() => { void loadHardwareReport(); }, 4000);
      return () => clearTimeout(timer);
    }
    // Subsequent changes: load immediately
    void loadHardwareReport();
  }, [hwGroupBy, hwTopN]);

  // Load available teams
  // ← getAllUsers mount effect MERGED into the single effect above (line ~89) to avoid duplicate API call

  useEffect(() => {
    // Reset filters when switching teams to avoid showing stale data
    setProfileStatusFilter('all');
    setProfilePicFilter('all');
    setDetailCurrentPage(0);
  }, [selectedTeam]);

  // Close team dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        teamDropdownRef.current &&
        !teamDropdownRef.current.contains(event.target as Node)
      ) {
        setTeamDropdownOpen(false);
      }
    }
    if (teamDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [teamDropdownOpen]);

  useEffect(() => {
    if (!teamDropdownOpen) {
      setTeamSearchQuery("");
      setTeamPage(0);
    }
  }, [teamDropdownOpen]);

  useEffect(() => {
    setTeamPage(0);
  }, [teamSearchQuery]);

  // Filter and paginate teams
  const filteredTeams = useMemo(() => {
    const q = teamSearchQuery.trim().toLowerCase();
    if (!q) return availableTeams;
    return availableTeams.filter(team => {
      const teamName = translateTeamName(team).toLowerCase();
      return teamName.includes(q) || team.toLowerCase().includes(q);
    });
  }, [availableTeams, teamSearchQuery]);

  const paginatedTeams = useMemo(() => {
    const itemsToShow = (teamPage + 1) * teamsPerPage;
    return filteredTeams.slice(0, itemsToShow);
  }, [filteredTeams, teamPage]);

  const hasMoreTeams = useMemo(() => {
    const itemsToShow = (teamPage + 1) * teamsPerPage;
    return itemsToShow < filteredTeams.length;
  }, [filteredTeams.length, teamPage]);

  // Load team profile (load all tasks for selected team, grouped by hospital)
  const loadTeamProfile = async (teamName?: string) => {
    const teamValue = (teamName ?? selectedTeam ?? '').trim();
    if (!teamValue) {
      toast.error('Vui lòng chọn team');
      return;
    }
    const team = teamValue;
    setProfileLoading(true);
    try {
      let allUsers: UserResponseDTO[] = [];
      const normalizedTeam = team.toUpperCase();
      const isSalesLikeTeam = normalizedTeam === 'SALES' || normalizedTeam === 'KINH DOANH';
      const isDeploymentTeam = normalizedTeam.includes('DEPLOY');
      const isMaintenanceTeam = normalizedTeam.includes('MAINT');
      const needsITSupport = isDeploymentTeam || isMaintenanceTeam;

      const isSuperAdminUser = (u: UserResponseDTO) => {
        const roles = (u as any)?.roles;
        if (!roles) return false;
        const list = Array.isArray(roles) ? roles : [roles];
        return list.some((r) => {
          if (!r) return false;
          if (typeof r === 'string') return r.toUpperCase().includes('SUPERADMIN');
          const roleName = (r as any)?.roleName ?? (r as any)?.role_name ?? (r as any)?.role;
          return typeof roleName === 'string' && roleName.toUpperCase().includes('SUPERADMIN');
        });
      };

      const isITDepartmentUser = (u: UserResponseDTO) => {
        const dept = ((u as any)?.department ?? '').toString().toUpperCase();
        return dept.includes('IT');
      };

      try {
        // Reuse cached users loaded for team dropdown to avoid refetching 10k users on every click.
        if (allUsersCache.length > 0) {
          allUsers = allUsersCache;
        } else {
          const uResp = await getAllUsers({ page: 0, size: PAGE_SIZE });
          const uList = Array.isArray(uResp) ? (uResp as UserResponseDTO[]) : (uResp as any)?.content ?? [];
          allUsers = uList as UserResponseDTO[];
          setAllUsersCache(allUsers);
        }

        const teamUsers = allUsers.filter((u) => {
          const userTeam = (u.team ?? '').toString().toUpperCase();
          return userTeam === normalizedTeam;
        });
        const extraUsers: UserResponseDTO[] = [];
        if (needsITSupport) {
          extraUsers.push(...allUsers.filter((u) => isITDepartmentUser(u) || isSuperAdminUser(u)));
        }
        if (isSalesLikeTeam) {
          extraUsers.push(...allUsers.filter((u) => isSuperAdminUser(u)));
        }
        const userMap = new Map<number | string, UserResponseDTO>();
        [...teamUsers, ...extraUsers].forEach((u) => {
          if (!u) return;
          const key = u.id ?? `user-${u.username ?? u.fullname ?? Math.random()}`;
          if (!userMap.has(key)) userMap.set(key, u);
        });
        setProfileUsers(Array.from(userMap.values()));
      } catch (err) {
        // console.warn('load users for team failed', err);
        setProfileUsers([]);
      }

      const combinedUsers = (() => {
        // ✅ Check cả team chính (u.team) VÀ availableTeams (mảng multi-team)
        // Nếu user thuộc team qua availableTeams thì cũng phải được include
        const baseUsers = (allUsers as UserResponseDTO[]).filter((u) => {
          // Check primary team
          if ((u.team ?? '').toString().toUpperCase() === normalizedTeam) return true;
          if ((u.primaryTeam ?? '').toString().toUpperCase() === normalizedTeam) return true;
          // Check availableTeams array (multi-team support)
          if (Array.isArray(u.availableTeams)) {
            return u.availableTeams.some(t => (t ?? '').toString().toUpperCase() === normalizedTeam);
          }
          return false;
        });
        const extraUsers: UserResponseDTO[] = [];
        if (needsITSupport) {
          extraUsers.push(
            ...(allUsers as UserResponseDTO[]).filter((u) => isITDepartmentUser(u) || isSuperAdminUser(u))
          );
        }
        if (isSalesLikeTeam) {
          extraUsers.push(...(allUsers as UserResponseDTO[]).filter((u) => isSuperAdminUser(u)));
        }
        const userMap = new Map<number | string, UserResponseDTO>();
        [...baseUsers, ...extraUsers].forEach((u) => {
          if (!u) return;
          const key = u.id ?? `user-${u.username ?? u.fullname ?? Math.random()}`;
          if (!userMap.has(key)) userMap.set(key, u);
        });
        return Array.from(userMap.values());
      })();

      const teamUserIds = combinedUsers
        .map((u) => u.id)
        .filter((id): id is number => id != null);
      const teamUserIdsSet = new Set(teamUserIds);

      const taskMatchesTeam = (task: Record<string, unknown>) => {
        const candidateTeamKeys = ['team', 'teamType', 'teamName', 'department', 'ownerTeam'];
        for (const key of candidateTeamKeys) {
          const raw = task[key as keyof typeof task];
          if (raw) {
            const value = String(raw).toUpperCase();
            if (value === normalizedTeam) return true;
            if (needsITSupport && value.includes('IT')) return true;
          }
        }
        const candidateIds = [
          task['picDeploymentId'],
          task['picId'],
          task['picUserId'],
          (task as any)?.picUser?.id,
          (task as any)?.assigneeId,
        ]
          .map((id) => (id != null ? Number(id) : null))
          .filter((id): id is number => Number.isFinite(id));
        
        // ✅ Also check picDeploymentIds (array) - tasks can have multiple PICs
        const picIdsArray = (task as any)?.picDeploymentIds;
        if (Array.isArray(picIdsArray)) {
          picIdsArray.forEach((id: any) => {
            if (id != null) {
              const numId = Number(id);
              if (Number.isFinite(numId) && !candidateIds.includes(numId)) {
                candidateIds.push(numId);
              }
            }
          });
        }
        
        if (candidateIds.length === 0) return false;
        return candidateIds.some((id) => teamUserIdsSet.has(id));
      };

      // tasks - use server-side filtering (including team filter to reduce N+1 backend overhead)
      const filterParams: any = {
        page: 0,
        size: PAGE_SIZE,
        sortBy: 'startDate',
        sortDir: 'desc',
        team: team, // Server-side team filter
      };
      // Add date range filter if set (convert to ISO format for backend)
      if (profileDateFrom) {
        filterParams.startDateFrom = `${profileDateFrom}T00:00:00`;
      }
      if (profileDateTo) {
        filterParams.startDateTo = `${profileDateTo}T23:59:59`;
      }
      // Add quarter/year filter if date range not set
      if (!profileDateFrom && !profileDateTo) {
        if (profileQuarter && profileQuarter !== 'all') filterParams.quarter = profileQuarter;
        if (profileYear) filterParams.year = profileYear;
      }
      // Add status filter if set
      if (profileStatusFilter && profileStatusFilter !== 'all') {
        filterParams.status = profileStatusFilter;
      }

      // ═══ Run ALL remaining API calls in PARALLEL for speed ═══
      const parallelPromises: Promise<any>[] = [];
      const isDevOnlyTeam = normalizedTeam.includes('DEV') || normalizedTeam.includes('PHÁT TRIỂN') || normalizedTeam.includes('PHATTRIEN');
      const isMaintOnlyTeam = normalizedTeam.includes('MAINT') || normalizedTeam.includes('BẢO TRÌ') || normalizedTeam.includes('BAOTRI');
      const isImplOnlyTeam = normalizedTeam.includes('DEPLOY') || normalizedTeam.includes('TRIỂN KHAI') || normalizedTeam.includes('TRIENKHAI');
      const isStrictSingleTeam = isDevOnlyTeam || isMaintOnlyTeam || isImplOnlyTeam;

      // Promise 0: Implementation tasks
      const implPromise = !isSalesLikeTeam && (!isStrictSingleTeam || isImplOnlyTeam)
        ? getAllImplementationTasks(filterParams).catch((err: any) => { console.warn('impl load', err); return null; })
        : Promise.resolve(null);
      parallelPromises.push(implPromise);

      // Promise 1: Dev tasks
      const devPromise = !isSalesLikeTeam && (!isStrictSingleTeam || isDevOnlyTeam)
        ? getAllDevTasks({ page: 0, size: PAGE_SIZE }).catch((err: any) => { console.warn('dev load', err); return null; })
        : Promise.resolve(null);
      parallelPromises.push(devPromise);

      // Promise 2: Maintenance tasks
      const maintPromise = !isSalesLikeTeam && (!isStrictSingleTeam || isMaintOnlyTeam)
        ? getAllMaintenanceTasks({ page: 0, size: PAGE_SIZE }).catch((err: any) => { console.warn('maint load', err); return null; })
        : Promise.resolve(null);
      parallelPromises.push(maintPromise);

      // Promise 3: Businesses
      const bizPromise = isSalesLikeTeam
        ? getBusinesses({ page: 0, size: PAGE_SIZE } as any).catch((err: any) => { console.warn('business load', err); return null; })
        : Promise.resolve(null);
      parallelPromises.push(bizPromise);

      // Promise 4: Hardware
      const hwPromise = HardwareAPI.getAllHardware({ size: PAGE_SIZE } as any).catch((err: any) => { console.warn('hardware load', err); return null; });
      parallelPromises.push(hwPromise);

      // Hospital transfer map is now pre-fetched on mount (background effect) → no need to fetch here

      // Await all in parallel
      const [implResult, devResult, maintResult, bizResult, hwResult] = await Promise.all(parallelPromises);

      // Process implementation tasks
      if (!isSalesLikeTeam && implResult != null) {
        const implList = Array.isArray(implResult) ? (implResult as ImplementationTaskResponseDTO[]) : (implResult as any)?.content ?? [];
        const filteredImpl = (implList as ImplementationTaskResponseDTO[]).filter((t) => taskMatchesTeam(t as any));
        setProfileImplTasks(filteredImpl);
      } else {
        setProfileImplTasks([]);
      }

      // Process dev tasks
      if (!isSalesLikeTeam && devResult != null) {
        const devList = Array.isArray(devResult) ? (devResult as DevTaskResponseDTO[]) : (devResult as any)?.content ?? [];
        const filtered = (devList as DevTaskResponseDTO[]).filter((t) => taskMatchesTeam(t as any));
        setProfileDevTasks(filtered);
      } else {
        setProfileDevTasks([]);
      }

      // Process maintenance tasks
      if (!isSalesLikeTeam && maintResult != null) {
        const mList = Array.isArray(maintResult) ? (maintResult as MaintenanceTaskResponseDTO[]) : (maintResult as any)?.content ?? [];
        const filtered = (mList as MaintenanceTaskResponseDTO[]).filter((t) => taskMatchesTeam(t as any));
        setProfileMaintTasks(filtered);
      } else {
        setProfileMaintTasks([]);
      }

      // Process businesses
      if (bizResult != null) {
        const bList = Array.isArray(bizResult) ? (bizResult as Array<Record<string, unknown>>) : (bizResult as any)?.content ?? [];
        const filteredBusinesses = isSalesLikeTeam
          ? bList
          : bList.filter((item) => {
              const ownerId =
                (item as any)?.picUserId ??
                (item as any)?.picUser?.id ??
                (item as any)?.picId ??
                (item as any)?.ownerId ??
                null;
              const ownerTeam =
                (item as any)?.team ??
                (item as any)?.teamName ??
                (item as any)?.department ??
                (item as any)?.picUser?.team ??
                null;
              const teamMatch = ownerTeam && String(ownerTeam).toUpperCase() === normalizedTeam;
              const idMatch = ownerId != null && teamUserIds.includes(Number(ownerId));
              return teamMatch || idMatch;
            });
        setProfileBusinesses(filteredBusinesses);
        if (isSalesLikeTeam && filteredBusinesses.length) {
          setProfileUsers((prev) => {
            const map = new Map<(number | string), UserResponseDTO>();
            prev.forEach((u) => {
              const key = u.id ?? `user-${u.fullname ?? u.username ?? Math.random()}`;
              map.set(key, u);
            });
            filteredBusinesses.forEach((item) => {
              const pic = (item as any)?.picUser;
              if (!pic) return;
              const picId = pic.id != null ? Number(pic.id) : null;
              const key = picId ?? `biz-${pic.label ?? pic.name ?? Math.random()}`;
              if (map.has(key)) return;
              map.set(key, {
                id: picId ?? undefined,
                fullname: pic.label ?? pic.name ?? pic.fullName ?? pic.fullname ?? undefined,
                email: pic.subLabel ?? pic.email ?? undefined,
                team: 'SALES',
              } as UserResponseDTO);
            });
            return Array.from(map.values());
          });
        }
      } else {
        setProfileBusinesses([]);
      }

      // Process hardware
      if (hwResult != null) {
        const hwList = Array.isArray(hwResult) ? (hwResult as any[]) : (hwResult as any)?.content ?? [];
        const map: Record<string, string> = {};
        hwList.forEach((h: any) => { map[String(h.id)] = (h.name ?? h.hardwareName ?? h.label ?? String(h.id)); });
        setHardwareMap(map);
      } else {
        setHardwareMap({});
      }

      // Hospital transfer map is pre-fetched on mount (background) → already in state

    } catch (err) {
      console.error('loadTeamProfile failed', err);
      setHasLoadedProfile(false);
    } finally {
      setProfileLoading(false);
      setHasLoadedProfile(true);
    }
  };

  // Helper function to translate team names
  const translateTeamName = (team: string): string => {
    const teamUpper = team.toUpperCase();
    if (teamUpper === 'DEPLOYMENT' || teamUpper.includes('TRIỂN KHAI') || teamUpper.includes('TRIENKHAI')) return 'Triển khai';
    if (teamUpper === 'DEV' || teamUpper === 'DEVELOPMENT' || teamUpper.includes('PHÁT TRIỂN') || teamUpper.includes('PHATTRIEN')) return 'Phát triển';
    if (teamUpper === 'MAINTENANCE' || teamUpper.includes('BẢO TRÌ') || teamUpper.includes('BAOTRI')) return 'Bảo trì';
    if (teamUpper === 'SALES' || teamUpper.includes('KINH DOANH') || teamUpper.includes('KINHDOANH')) return 'Kinh doanh';
    if (teamUpper === 'CUSTOMER_SERVICE' || teamUpper.includes('CHĂM SÓC KHÁCH HÀNG') || teamUpper.includes('CHAMSOCKHACHHANG')) return 'CSKH';
    return team; // Return original if no match
  };

  const translateDepartment = (dept: string): string => {
    const d = dept.toUpperCase();
    if (d === 'IT') return 'IT';
    if (d === 'ACCOUNTING') return 'Kế toán';
    if (d === 'BUSINESS') return 'Kinh doanh';
    return dept;
  };

    const translateStatus = (s?: string | null): string => {
      if (!s) return '—';
      const m: Record<string, string> = {
        'TRANSFERRED': 'Đã chuyển giao',
        'PENDING_TRANSFER': 'Chờ chuyển giao',
        'WAITING_FOR_DEV': 'Chờ phát triển',
        'NOT_STARTED': 'Chưa bắt đầu',
        'IN_PROCESS': 'Đang xử lý',
        'IN_PROGRESS': 'Đang xử lý',
        'COMPLETED': 'Hoàn thành',
        'DONE': 'Hoàn thành',
        'CANCELLED': 'Đã huỷ',
        'APPROVED': 'Đã duyệt',
        'REJECTED': 'Từ chối',
        'TRANSFERRED_TO_CUSTOMER': 'Đã chuyển giao',
        'WAITING_FOR_DEPLOY': 'Chờ triển khai',
        'ACCEPTED': 'Đã chấp nhận',
        'RECEIVED': 'Đã tiếp nhận',
        'CONTRACTED': 'Đã chốt hợp đồng',
        'CARING': 'Đang chăm sóc',
        'PENDING': 'Đang chờ',
        'IN_REVIEW': 'Đang xét duyệt',
        'READY': 'Sẵn sàng',
        'APPROVING': 'Đang duyệt',
        'ON_HOLD': 'Tạm dừng',
        'ARCHIVED': 'Đã lưu trữ',
        'ISSUE': 'Gặp sự cố',
        'FAILED': 'Gặp sự cố',
        'ERROR': 'Gặp sự cố',
      };
      const key = String(s).toUpperCase();
      return m[key] ?? String(s).replace(/_/g, ' ');
    };

  const donutOptions: ApexOptions = {
    labels: ["Người dùng", "Bệnh viện", "HIS", "Phần cứng", "Đại lý"],
    legend: { position: 'bottom' },
    chart: { toolbar: { show: false } },
    plotOptions: { pie: { donut: { size: '64%' } } },
    dataLabels: {
      enabled: true,
      formatter: (val: number, opts?: ApexFormatterOpts) => {
        const w = opts?.w;
        const series = w?.globals?.series ?? [];
        const idx = opts?.seriesIndex ?? 0;
        const value = series?.[idx] ?? val ?? 0;
        const total = (series.reduce((a: number, b: number) => a + b, 0) as number) || 1;
        const pct = Math.round((value / total) * 100);
        return `${pct}%`;
      },
      style: { fontSize: '12px', colors: ['#fff'] },
    },
    tooltip: {
      y: {
        formatter: (val: number, opts?: ApexFormatterOpts) => {
          const w = opts?.w;
          const series = w?.globals?.series ?? [];
          const idx = opts?.seriesIndex ?? 0;
          const value = series?.[idx] ?? val ?? 0;
          const total = (series.reduce((a: number, b: number) => a + b, 0) as number) || 1;
          const pct = Math.round((value / total) * 100);
          return `${value} (${pct}%)`;
        }
      }
    },
    colors: ["#465fff", "#10b981", "#f59e0b", "#ef4444", "#6366f1"],
  };

  // Helper: check if a date string falls into selected quarter/year
  const inSelectedQuarter = (dateStr?: string | null) => {
    if (profileQuarter === 'all' && !profileYear) return true;
    if (!dateStr) return false;
    const d = new Date(String(dateStr));
    if (Number.isNaN(d.getTime())) return false;
    if (profileYear && String(d.getFullYear()) !== profileYear) return false;
    if (profileQuarter === 'all') return true;
    const month = d.getMonth(); // 0..11
    const q = Math.floor(month / 3) + 1;
    return `Q${q}` === profileQuarter;
  };

  const getSupplementRequest = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return '—';
    const parts: string[] = [];
    const candidates = ['additionalRequest','additionalRequests','maintenanceNotes','extraRequests','supplementaryRequest','supplementaryRequests','notes','requestDetails','request'];
    candidates.forEach(k => {
      const v = obj[k as keyof typeof obj];
      if (v != null && String(v).trim() !== '') parts.push(String(v).trim());
    });
    if (parts.length === 0) return '—';
    return parts.join(' | ');
  };

  const hasCustomTeamFilter =
    profileQuarter !== 'all' ||
    (profileYear ?? '') !== '' ||
    Boolean(profileDateFrom) ||
    Boolean(profileDateTo) ||
    profileStatusFilter !== 'all' ||
    profilePicFilter !== 'all';

  const matchesProfilePicFilter = (task: Record<string, unknown>) => {
    if (!profilePicFilter || profilePicFilter === 'all') return true;
    const targetId = profilePicFilter;
    const candidateIds = [
      task['picDeploymentId'],
      task['picId'],
      task['picUserId'],
      (task as any)?.picUser?.id,
      (task as any)?.picDeployment?.id,
    ].filter((id) => id != null);
    if (candidateIds.some((id) => String(id) === targetId)) return true;
    const candidateName = String(
      task['picDeploymentName'] ??
        task['picName'] ??
        task['picUserName'] ??
        (task as any)?.picUser?.label ??
        ''
    )
      .trim()
      .toLowerCase();
    if (!candidateName) return false;
    const selectedUser = profileUsers.find((u) => u.id != null && String(u.id) === targetId);
    const selectedName = String(selectedUser?.fullname ?? selectedUser?.username ?? '')
      .trim()
      .toLowerCase();
    if (!selectedName) return false;
    return candidateName === selectedName;
  };

  // Derived (filtered) arrays according to quarter/year selection
  const displayedImplTasks = useMemo(() => 
    profileImplTasks.filter((t) =>
      inSelectedQuarter((t as any).startDate ?? (t as any).completionDate ?? (t as any).createdDate ?? null)
    ), [profileImplTasks, profileQuarter, profileYear]);
  const displayedDevTasks = useMemo(() =>
    profileDevTasks.filter((t) =>
      inSelectedQuarter((t as any).startDate ?? (t as any).endDate ?? (t as any).createdDate ?? null)
    ), [profileDevTasks, profileQuarter, profileYear]);
  const displayedMaintTasks = useMemo(() =>
    profileMaintTasks.filter((t) =>
      inSelectedQuarter((t as any).startDate ?? (t as any).endDate ?? (t as any).createdDate ?? null)
    ), [profileMaintTasks, profileQuarter, profileYear]);
  // Helper to check if a date falls within the selected date range
  const matchesDateRange = (dateStr?: string | null): boolean => {
    // If date range is set, use it (priority over quarter/year)
    if (profileDateFrom || profileDateTo) {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return false;
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      
      if (profileDateFrom) {
        const fromDate = new Date(profileDateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (dateOnly < fromDate) return false;
      }
      if (profileDateTo) {
        const toDate = new Date(profileDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (dateOnly > toDate) return false;
      }
      return true;
    }
    
    // Fallback to quarter/year filter if date range not set
    return inSelectedQuarter(dateStr);
  };

  const displayedBusinesses = useMemo(() => 
    profileBusinesses.filter((b) => {
      const dateCandidate =
        (b as any).startDate ??
        (b as any).completionDate ??
        (b as any).createdAt ??
        (b as any).created_at ??
        null;
      return matchesDateRange(dateCandidate);
    }), [profileBusinesses, profileQuarter, profileYear, profileDateFrom, profileDateTo]);
  const salesFilteredBusinesses = useMemo(() => {
    if (!isSalesSelected) return [];
    let list = displayedBusinesses.slice();
    if (profileStatusFilter !== 'all') {
      const target = profileStatusFilter.toUpperCase();
      list = list.filter((b) => String((b as any).status ?? '').toUpperCase() === target);
    }
    list = list.filter((b) => matchesProfilePicFilter(b as Record<string, unknown>));
    return list;
  }, [isSalesSelected, displayedBusinesses, profileStatusFilter, profilePicFilter, profileUsers]);

  // compute available status options (from data) and apply per-table status filters
  const implStatusOptions = Array.from(new Set(displayedImplTasks.map(t => String((t as any).status ?? '').toUpperCase()).filter(s => s && s !== ''))).sort();
  const devStatusOptions = Array.from(new Set(displayedDevTasks.map(t => String((t as any).status ?? '').toUpperCase()).filter(s => s && s !== ''))).sort();
  const maintStatusOptions = Array.from(new Set(displayedMaintTasks.map(t => String((t as any).status ?? '').toUpperCase()).filter(s => s && s !== ''))).sort();

  const filteredImplTasks = (implStatusFilter === 'all'
    ? displayedImplTasks
    : displayedImplTasks.filter(t => String((t as any).status ?? '').toUpperCase() === implStatusFilter)
  ).filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

  const filteredDevTasks = (devStatusFilter === 'all'
    ? displayedDevTasks
    : displayedDevTasks.filter(t => String((t as any).status ?? '').toUpperCase() === devStatusFilter)
  ).filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

  const filteredMaintTasks = (maintStatusFilter === 'all'
    ? displayedMaintTasks
    : displayedMaintTasks.filter(t => String((t as any).status ?? '').toUpperCase() === maintStatusFilter)
  ).filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

  // Paginated tasks for implementation and maintenance tables
  const paginatedImplTasks = useMemo(() => {
    const startIndex = implCurrentPage * implItemsPerPage;
    const endIndex = startIndex + implItemsPerPage;
    return filteredImplTasks.slice(startIndex, endIndex);
  }, [filteredImplTasks, implCurrentPage, implItemsPerPage]);

  // Group maintenance tasks by hospital and paginate by groups (no splitting)
  const paginatedMaintTasks = useMemo(() => {
    // Group tasks by hospital
    const grouped = new Map<string, typeof filteredMaintTasks>();
    filteredMaintTasks.forEach(task => {
      const hospitalName = (task as any).hospitalName || 'Không xác định';
      if (!grouped.has(hospitalName)) {
        grouped.set(hospitalName, []);
      }
      grouped.get(hospitalName)!.push(task);
    });

    const sortedGroups = Array.from(grouped.entries()).map(([hospitalName, tasks]) => ({
      hospitalName,
      tasks: tasks.sort((a, b) => {
        const dateA = (a as any).startDate ? new Date((a as any).startDate).getTime() : 0;
        const dateB = (b as any).startDate ? new Date((b as any).startDate).getTime() : 0;
        return dateB - dateA;
      })
    }));

    // Apply pagination by hospital groups - ensure no group is split across pages
    let currentTaskIndex = 0;
    const startIndex = maintCurrentPage * maintItemsPerPage;
    const endIndex = startIndex + maintItemsPerPage;

    const paginatedTasks: typeof filteredMaintTasks = [];

    for (const group of sortedGroups) {
      const groupStartIndex = currentTaskIndex;
      const groupEndIndex = currentTaskIndex + group.tasks.length;

      // Skip groups that are completely before the current page
      if (groupEndIndex <= startIndex) {
        currentTaskIndex = groupEndIndex;
        continue;
      }

      // Skip groups that are completely after the current page
      if (groupStartIndex >= endIndex) {
        break;
      }

      // If group starts before current page but extends into it, skip it
      // (it should have been displayed on previous page)
      if (groupStartIndex < startIndex && groupEndIndex > startIndex) {
        currentTaskIndex = groupEndIndex;
        continue;
      }

      // Group starts within current page - include it fully (even if it extends beyond endIndex)
      // This ensures no group is split across pages
      if (groupStartIndex >= startIndex) {
        paginatedTasks.push(...group.tasks);

        // If this group extends beyond the page, stop here
        // The next page will start with the next group
        if (groupEndIndex > endIndex) {
          break;
        }
      }

      currentTaskIndex = groupEndIndex;

      // Stop if we've passed the end of current page
      if (currentTaskIndex >= endIndex) {
        break;
      }
    }

    return paginatedTasks;
  }, [filteredMaintTasks, maintCurrentPage, maintItemsPerPage]);

  const implTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredImplTasks.length / implItemsPerPage));
  }, [filteredImplTasks.length, implItemsPerPage]);

  const maintTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredMaintTasks.length / maintItemsPerPage));
  }, [filteredMaintTasks.length, maintItemsPerPage]);

  // Prepare data for comparison charts
  const prepareComparisonData = useCallback(() => {
      const allTasks = [
        ...profileImplTasks.map(t => ({ ...t, type: 'impl' as const, hospitalName: t.hospitalName, receivedDate: (t as any).receivedDate ?? (t as any).startDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name })),
        ...profileDevTasks.map(t => ({ ...t, type: 'dev' as const, hospitalName: (t as any).hospitalName, receivedDate: (t as any).receivedDate ?? (t as any).startDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name })),
        ...profileMaintTasks.map(t => ({ ...t, type: 'maint' as const, hospitalName: (t as any).hospitalName, receivedDate: (t as any).receivedDate ?? (t as any).startDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name })),
        ...profileBusinesses.map(t => ({
          ...t,
          type: 'business' as const,
          hospitalName: (t as any).hospital?.label ?? (t as any).hospitalName ?? (t as any).hospital ?? 'Hợp đồng',
          receivedDate: (t as any).startDate ?? (t as any).createdAt ?? (t as any).created_at,
          completionDate: (t as any).completionDate ?? (t as any).updatedAt ?? (t as any).updated_at,
          status: (t as any).status,
          name: (t as any).name ?? (t as any).projectName ?? 'Hợp đồng',
        })),
      ];

    const currentYear = profileYear || String(new Date().getFullYear());
    const compareYearValue = compareYear || String(Number(currentYear) - 1);

    const getTimeKey = (dateStr: string | null | undefined, range: 'monthly' | 'quarterly' | 'yearly') => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      const year = d.getFullYear();
      if (range === 'yearly') return String(year);
      if (range === 'quarterly') {
        const quarter = Math.floor(d.getMonth() / 3) + 1;
        return `${year}-Q${quarter}`;
      }
      const month = d.getMonth() + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    };

    const currentData: Record<string, { total: number; completed: number }> = {};
    const compareData: Record<string, { total: number; completed: number }> = {};

    allTasks.forEach(task => {
      const key = getTimeKey(task.receivedDate, timeRange);
      if (!key) return;
      
      const isCurrentYear = key.startsWith(currentYear);
      const isCompareYear = key.startsWith(compareYearValue);
      
      if (isCurrentYear) {
        if (!currentData[key]) currentData[key] = { total: 0, completed: 0 };
        currentData[key].total++;
        if (String(task.status).toUpperCase() === 'COMPLETED') currentData[key].completed++;
      }
      
      if (isCompareYear) {
        if (!compareData[key]) compareData[key] = { total: 0, completed: 0 };
        compareData[key].total++;
        if (String(task.status).toUpperCase() === 'COMPLETED') compareData[key].completed++;
      }
    });

    // Generate labels based on timeRange
    let labels: string[] = [];
    if (timeRange === 'yearly') {
      labels = [currentYear, compareYearValue];
    } else if (timeRange === 'quarterly') {
      labels = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => `${currentYear}-${q}`);
      if (compareYear) {
        labels = labels.concat(['Q1', 'Q2', 'Q3', 'Q4'].map(q => `${compareYearValue}-${q}`));
      }
    } else {
      labels = Array.from({ length: 12 }, (_, i) => `${currentYear}-${String(i + 1).padStart(2, '0')}`);
      if (compareYear) {
        labels = labels.concat(Array.from({ length: 12 }, (_, i) => `${compareYearValue}-${String(i + 1).padStart(2, '0')}`));
      }
    }

    const currentSeries = labels.map(l => currentData[l]?.total || 0);
    const compareSeries = labels.map(l => compareData[l]?.total || 0);
    const currentCompletedSeries = labels.map(l => currentData[l]?.completed || 0);
    const compareCompletedSeries = labels.map(l => compareData[l]?.completed || 0);

    return { labels, currentSeries, compareSeries, currentCompletedSeries, compareCompletedSeries };
  }, [profileImplTasks, profileDevTasks, profileMaintTasks, profileYear, compareYear, timeRange]);

  const comparisonData = prepareComparisonData();

  // Group tasks by hospital for visual table view
  // Use startDate for filtering and display
  const tasksByHospital = useMemo(() => {
    if (isSalesSelected) {
      return [];
    }
    // Helper to check if startDate matches date range filter
    const matchesDateRangeFilter = (startDate?: string | null) => {
      // Priority: Date range > Quarter/Year
      // If date range is set, use it
      if (profileDateFrom || profileDateTo) {
        if (!startDate) return false;
        const d = new Date(startDate);
        if (Number.isNaN(d.getTime())) return false;
        const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        
        if (profileDateFrom) {
          const fromDate = new Date(profileDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (taskDate < fromDate) return false;
        }
        if (profileDateTo) {
          const toDate = new Date(profileDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (taskDate > toDate) return false;
        }
        return true;
      }
      
      // Fallback to quarter/year filter if date range not set
      // If both quarter and year are "all" or empty, show all tasks
      if (profileQuarter === 'all' && (!profileYear || profileYear === '')) return true;
      
      // If no date available, only show if filter is "all"
      if (!startDate) {
        return profileQuarter === 'all' && (!profileYear || profileYear === '');
      }
      
      const d = new Date(startDate);
      if (Number.isNaN(d.getTime())) {
        // Invalid date, only show if filter is "all"
        return profileQuarter === 'all' && (!profileYear || profileYear === '');
      }
      
      // Check year filter
      if (profileYear && profileYear !== '' && String(d.getFullYear()) !== profileYear) return false;
      
      // Check quarter filter
      if (profileQuarter === 'all') return true;
      const month = d.getMonth(); // 0..11
      const q = Math.floor(month / 3) + 1;
      return `Q${q}` === profileQuarter;
    };

    // Get all tasks (before status filter) and filter by startDate
    const allImplTasks = profileImplTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });
    const allDevTasks = profileDevTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });
    const allMaintTasks = profileMaintTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });

    // Helper to normalize status to canonical statuses
    const normalizeStatusToCanonical = (status?: string | null): string | null => {
      if (!status) return null;
      const s = String(status).trim().toUpperCase();
      // Map variants to canonical statuses
      if (s === 'RECEIVED' || s === 'NOT_STARTED' || s === 'PENDING') return 'RECEIVED';
      if (s === 'IN_PROCESS' || s === 'IN_PROGRESS' || s === 'API_TESTING' || s === 'INTEGRATING' || s === 'WAITING_FOR_DEV' || s === 'WAITING_FOR_DEPLOY') return 'IN_PROCESS';
      if (s === 'COMPLETED' || s === 'DONE' || s === 'FINISHED' || s === 'ACCEPTED' || s === 'TRANSFERRED' || s === 'PENDING_TRANSFER' || s === 'TRANSFERRED_TO_CUSTOMER') return 'COMPLETED';
      if (s === 'ISSUE' || s === 'FAILED' || s === 'ERROR') return 'ISSUE';
      // Return as-is if already canonical
      if (s === 'RECEIVED' || s === 'IN_PROCESS' || s === 'COMPLETED' || s === 'ISSUE') return s;
      return s; // Return original for unmatched statuses
    };
    
    // Apply status filter (use profileStatusFilter if set, otherwise use individual filters)
    const statusFilter = profileStatusFilter !== 'all' ? profileStatusFilter : null;
    const implTasksFiltered = statusFilter 
      ? allImplTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (implStatusFilter === 'all' ? allImplTasks : allImplTasks.filter(t => String((t as any).status ?? '').toUpperCase() === implStatusFilter));
    const devTasksFiltered = statusFilter
      ? allDevTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (devStatusFilter === 'all' ? allDevTasks : allDevTasks.filter(t => String((t as any).status ?? '').toUpperCase() === devStatusFilter));
    const maintTasksFiltered = statusFilter
      ? allMaintTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (maintStatusFilter === 'all' ? allMaintTasks : allMaintTasks.filter(t => String((t as any).status ?? '').toUpperCase() === maintStatusFilter));

    const implTasksPicFiltered = implTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
    const devTasksPicFiltered = devTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
    const maintTasksPicFiltered = maintTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

    // Filter tasks by team type - only show tasks matching the selected team
    const normalizedTeam = normalizedSelectedTeam;
    const isDeploymentTeam = normalizedTeam.includes('DEPLOY') || normalizedTeam.includes('TRIỂN KHAI') || normalizedTeam.includes('TRIENKHAI');
    const isMaintenanceTeam = normalizedTeam.includes('MAINT') || normalizedTeam.includes('BẢO TRÌ') || normalizedTeam.includes('BAOTRI');
    const isDevTeam = normalizedTeam.includes('DEV') || normalizedTeam.includes('PHÁT TRIỂN') || normalizedTeam.includes('PHATTRIEN');

    type TaskWithType = {
      type: 'Triển khai' | 'Bảo trì' | 'Phát triển';
      hospitalName: string | null | undefined;
      startDate: string | null | undefined;
      completionDate: string | null | undefined;
      status: string | null | undefined;
      name: string;
      picName: string;
      [key: string]: unknown;
    };
    const allTasks: TaskWithType[] = [];
    if (isDeploymentTeam) {
      allTasks.push(...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    if (isMaintenanceTeam) {
      allTasks.push(...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    if (isDevTeam) {
      allTasks.push(...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    // If no specific team type detected, show all tasks
    if (!isDeploymentTeam && !isMaintenanceTeam && !isDevTeam) {
      allTasks.push(
        ...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
        ...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
        ...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' }))
      );
    }

    const grouped = new Map<string, TaskWithType[]>();
    allTasks.forEach(task => {
      const hospitalName = task.hospitalName || 'Không xác định';
      if (!grouped.has(hospitalName)) {
        grouped.set(hospitalName, []);
      }
      grouped.get(hospitalName)!.push(task);
    });

    const sortedGroups = Array.from(grouped.entries()).map(([hospitalName, tasks]) => ({
      hospitalName,
      tasks: tasks.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      })
    }));

    // Compute effective end date for transfer filter (date range > quarter/year > no filter)
    let transferFilterEndDate: string | null = null;
    if (profileDateTo) {
      transferFilterEndDate = profileDateTo;
    } else if (profileYear) {
      const qEnd: Record<string, string> = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };
      transferFilterEndDate = profileQuarter !== 'all' && qEnd[profileQuarter]
        ? `${profileYear}${qEnd[profileQuarter]}`
        : `${profileYear}-12-31`;
    }

    // Apply transfer-to-maintenance filter at hospital group level
    const transferFiltered = profileTransferFilter === 'all' ? sortedGroups : sortedGroups.filter(group => {
      const hName = group.hospitalName;
      // Check hospital-level flag (with date awareness), fallback to task-level
      const isTransferred = hospitalTransferMap.has(hName)
        ? isHospitalTransferred(hName, transferFilterEndDate)
        : group.tasks.some(t => Boolean((t as any).transferredToMaintenance));
      return profileTransferFilter === 'transferred' ? isTransferred : !isTransferred;
    });
    
    // Apply pagination by hospital groups - ensure no group is split across pages
    // Count tasks across all groups to determine pagination
    let currentTaskIndex = 0;
    const startIndex = detailCurrentPage * detailItemsPerPage;
    const endIndex = startIndex + detailItemsPerPage;
    
    type GroupedTask = {
      hospitalName: string;
      tasks: TaskWithType[];
    };
    const paginatedGroups: GroupedTask[] = [];
    
    for (const group of transferFiltered) {
      const groupStartIndex = currentTaskIndex;
      const groupEndIndex = currentTaskIndex + group.tasks.length;
      
      // Skip groups that are completely before the current page
      if (groupEndIndex <= startIndex) {
        currentTaskIndex = groupEndIndex;
        continue;
      }
      
      // Skip groups that are completely after the current page
      if (groupStartIndex >= endIndex) {
        break;
      }
      
      // If group starts before current page but extends into it, skip it
      // (it should have been displayed on previous page)
      if (groupStartIndex < startIndex && groupEndIndex > startIndex) {
        currentTaskIndex = groupEndIndex;
        continue;
      }
      
      // Group starts within current page - include it fully (even if it extends beyond endIndex)
      // This ensures no group is split across pages
      if (groupStartIndex >= startIndex) {
        paginatedGroups.push({
          hospitalName: group.hospitalName,
          tasks: group.tasks
        });
        
        // If this group extends beyond the page, stop here
        // The next page will start with the next group
        if (groupEndIndex > endIndex) {
          break;
        }
      }
      
      currentTaskIndex = groupEndIndex;
      
      // Stop if we've passed the end of current page
      if (currentTaskIndex >= endIndex) {
        break;
      }
    }
    
    return paginatedGroups;
  }, [profileImplTasks, profileDevTasks, profileMaintTasks, profileQuarter, profileYear, profileDateFrom, profileDateTo, implStatusFilter, devStatusFilter, maintStatusFilter, profileStatusFilter, detailCurrentPage, detailItemsPerPage, profilePicFilter, profileUsers, isSalesSelected, displayedBusinesses, salesFilteredBusinesses, normalizedSelectedTeam, profileTransferFilter, hospitalTransferMap, isHospitalTransferred]);

  // Calculate total items BEFORE pagination (same logic as tasksByHospital but without pagination)
  const detailTotalItemsComputed = useMemo(() => {
    if (isSalesSelected) {
      return salesFilteredBusinesses.length;
    } else {
      // Use the same filtering logic as tasksByHospital but calculate total without pagination
      const matchesDateRangeFilter = (startDate?: string | null) => {
        if (profileDateFrom || profileDateTo) {
          if (!startDate) return false;
          const d = new Date(startDate);
          if (Number.isNaN(d.getTime())) return false;
          const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          if (profileDateFrom) {
            const fromDate = new Date(profileDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (taskDate < fromDate) return false;
          }
          if (profileDateTo) {
            const toDate = new Date(profileDateTo);
            toDate.setHours(23, 59, 59, 999);
            if (taskDate > toDate) return false;
          }
          return true;
        }
        if (profileQuarter === 'all' && (!profileYear || profileYear === '')) return true;
        if (!startDate) {
          return profileQuarter === 'all' && (!profileYear || profileYear === '');
        }
        const d = new Date(startDate);
        if (Number.isNaN(d.getTime())) {
          return profileQuarter === 'all' && (!profileYear || profileYear === '');
        }
        if (profileYear && profileYear !== '' && String(d.getFullYear()) !== profileYear) return false;
        if (profileQuarter === 'all') return true;
        const month = d.getMonth();
        const q = Math.floor(month / 3) + 1;
        return `Q${q}` === profileQuarter;
      };

      const allImplTasks = profileImplTasks.filter(t => {
        const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
        return matchesDateRangeFilter(startDate);
      });
      const allDevTasks = profileDevTasks.filter(t => {
        const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
        return matchesDateRangeFilter(startDate);
      });
      const allMaintTasks = profileMaintTasks.filter(t => {
        const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
        return matchesDateRangeFilter(startDate);
      });

      const normalizeStatusToCanonical = (status?: string | null): string | null => {
        if (!status) return null;
        const s = String(status).trim().toUpperCase();
        if (s === 'RECEIVED' || s === 'NOT_STARTED' || s === 'PENDING') return 'RECEIVED';
        if (s === 'IN_PROCESS' || s === 'IN_PROGRESS' || s === 'API_TESTING' || s === 'INTEGRATING' || s === 'WAITING_FOR_DEV' || s === 'WAITING_FOR_DEPLOY') return 'IN_PROCESS';
        if (s === 'COMPLETED' || s === 'DONE' || s === 'FINISHED' || s === 'ACCEPTED' || s === 'TRANSFERRED' || s === 'PENDING_TRANSFER' || s === 'TRANSFERRED_TO_CUSTOMER') return 'COMPLETED';
        if (s === 'ISSUE' || s === 'FAILED' || s === 'ERROR') return 'ISSUE';
        if (s === 'RECEIVED' || s === 'IN_PROCESS' || s === 'COMPLETED' || s === 'ISSUE') return s;
        return s;
      };
      
      const statusFilter = profileStatusFilter !== 'all' ? profileStatusFilter : null;
      const implTasksFiltered = statusFilter 
        ? allImplTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
        : (implStatusFilter === 'all' ? allImplTasks : allImplTasks.filter(t => String((t as any).status ?? '').toUpperCase() === implStatusFilter));
      const devTasksFiltered = statusFilter
        ? allDevTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
        : (devStatusFilter === 'all' ? allDevTasks : allDevTasks.filter(t => String((t as any).status ?? '').toUpperCase() === devStatusFilter));
      const maintTasksFiltered = statusFilter
        ? allMaintTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
        : (maintStatusFilter === 'all' ? allMaintTasks : allMaintTasks.filter(t => String((t as any).status ?? '').toUpperCase() === maintStatusFilter));

      const implTasksPicFiltered = implTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
      const devTasksPicFiltered = devTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
      const maintTasksPicFiltered = maintTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

      const normalizedTeam = normalizedSelectedTeam;
      const isDeploymentTeam = normalizedTeam.includes('DEPLOY') || normalizedTeam.includes('TRIỂN KHAI') || normalizedTeam.includes('TRIENKHAI');
      const isMaintenanceTeam = normalizedTeam.includes('MAINT') || normalizedTeam.includes('BẢO TRÌ') || normalizedTeam.includes('BAOTRI');
      const isDevTeam = normalizedTeam.includes('DEV') || normalizedTeam.includes('PHÁT TRIỂN') || normalizedTeam.includes('PHATTRIEN');

      type TaskWithType = {
        type: 'Triển khai' | 'Bảo trì' | 'Phát triển';
        hospitalName: string | null | undefined;
        startDate: string | null | undefined;
        completionDate: string | null | undefined;
        status: string | null | undefined;
        name: string;
        picName: string;
        [key: string]: unknown;
      };
      const allTasks: TaskWithType[] = [];
      if (isDeploymentTeam) {
        allTasks.push(...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
      }
      if (isMaintenanceTeam) {
        allTasks.push(...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
      }
      if (isDevTeam) {
        allTasks.push(...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
      }
      if (!isDeploymentTeam && !isMaintenanceTeam && !isDevTeam) {
        allTasks.push(
          ...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
          ...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
          ...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' }))
        );
      }

      // Apply transfer-to-maintenance filter (with date awareness)
      if (profileTransferFilter !== 'all') {
        // Compute effective end date for transfer filter
        let tEndDate: string | null = null;
        if (profileDateTo) {
          tEndDate = profileDateTo;
        } else if (profileYear) {
          const qEnd: Record<string, string> = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };
          tEndDate = profileQuarter !== 'all' && qEnd[profileQuarter]
            ? `${profileYear}${qEnd[profileQuarter]}`
            : `${profileYear}-12-31`;
        }
        const localTransferMap = new Map<string, boolean>();
        allTasks.forEach(task => {
          const hName = task.hospitalName || 'Không xác định';
          if (!localTransferMap.has(hName)) {
            const fromEntity = hospitalTransferMap.has(hName) ? isHospitalTransferred(hName, tEndDate) : null;
            localTransferMap.set(hName, fromEntity ?? Boolean((task as any).transferredToMaintenance));
          } else if (Boolean((task as any).transferredToMaintenance) && !localTransferMap.get(hName)) {
            if (!hospitalTransferMap.has(hName)) localTransferMap.set(hName, true);
          }
        });
        const wantTransferred = profileTransferFilter === 'transferred';
        const filtered = allTasks.filter(task => {
          const hName = task.hospitalName || 'Không xác định';
          return (localTransferMap.get(hName) ?? false) === wantTransferred;
        });
        return filtered.length;
      }
      
      return allTasks.length;
    }
  }, [isSalesSelected, salesFilteredBusinesses, profileImplTasks, profileDevTasks, profileMaintTasks, profileQuarter, profileYear, profileDateFrom, profileDateTo, implStatusFilter, devStatusFilter, maintStatusFilter, profileStatusFilter, profilePicFilter, profileUsers, normalizedSelectedTeam, profileTransferFilter, hospitalTransferMap, isHospitalTransferred]);

  // All tasks by hospital (without pagination) - used for Excel export
  // Same filtering logic as tasksByHospital but returns all groups without pagination
  const allTasksByHospital = useMemo(() => {
    if (isSalesSelected) {
      return [];
    }
    // Same logic as tasksByHospital but without pagination
    const matchesDateRangeFilter = (startDate?: string | null) => {
      if (profileDateFrom || profileDateTo) {
        if (!startDate) return false;
        const d = new Date(startDate);
        if (Number.isNaN(d.getTime())) return false;
        const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (profileDateFrom) {
          const fromDate = new Date(profileDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (taskDate < fromDate) return false;
        }
        if (profileDateTo) {
          const toDate = new Date(profileDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (taskDate > toDate) return false;
        }
        return true;
      }
      if (profileQuarter === 'all' && (!profileYear || profileYear === '')) return true;
      if (!startDate) {
        return profileQuarter === 'all' && (!profileYear || profileYear === '');
      }
      const d = new Date(startDate);
      if (Number.isNaN(d.getTime())) {
        return profileQuarter === 'all' && (!profileYear || profileYear === '');
      }
      if (profileYear && profileYear !== '' && String(d.getFullYear()) !== profileYear) return false;
      if (profileQuarter === 'all') return true;
      const month = d.getMonth();
      const q = Math.floor(month / 3) + 1;
      return `Q${q}` === profileQuarter;
    };

    const allImplTasks = profileImplTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });
    const allDevTasks = profileDevTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });
    const allMaintTasks = profileMaintTasks.filter(t => {
      const startDate = (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate;
      return matchesDateRangeFilter(startDate);
    });

    const normalizeStatusToCanonical = (status?: string | null): string | null => {
      if (!status) return null;
      const s = String(status).trim().toUpperCase();
      if (s === 'RECEIVED' || s === 'NOT_STARTED' || s === 'PENDING') return 'RECEIVED';
      if (s === 'IN_PROCESS' || s === 'IN_PROGRESS' || s === 'API_TESTING' || s === 'INTEGRATING' || s === 'WAITING_FOR_DEV' || s === 'WAITING_FOR_DEPLOY') return 'IN_PROCESS';
      if (s === 'COMPLETED' || s === 'DONE' || s === 'FINISHED' || s === 'ACCEPTED' || s === 'TRANSFERRED' || s === 'PENDING_TRANSFER' || s === 'TRANSFERRED_TO_CUSTOMER') return 'COMPLETED';
      if (s === 'ISSUE' || s === 'FAILED' || s === 'ERROR') return 'ISSUE';
      if (s === 'RECEIVED' || s === 'IN_PROCESS' || s === 'COMPLETED' || s === 'ISSUE') return s;
      return s;
    };
    
    const statusFilter = profileStatusFilter !== 'all' ? profileStatusFilter : null;
    const implTasksFiltered = statusFilter 
      ? allImplTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (implStatusFilter === 'all' ? allImplTasks : allImplTasks.filter(t => String((t as any).status ?? '').toUpperCase() === implStatusFilter));
    const devTasksFiltered = statusFilter
      ? allDevTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (devStatusFilter === 'all' ? allDevTasks : allDevTasks.filter(t => String((t as any).status ?? '').toUpperCase() === devStatusFilter));
    const maintTasksFiltered = statusFilter
      ? allMaintTasks.filter(t => normalizeStatusToCanonical((t as any).status) === statusFilter)
      : (maintStatusFilter === 'all' ? allMaintTasks : allMaintTasks.filter(t => String((t as any).status ?? '').toUpperCase() === maintStatusFilter));

    const implTasksPicFiltered = implTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
    const devTasksPicFiltered = devTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));
    const maintTasksPicFiltered = maintTasksFiltered.filter((t) => matchesProfilePicFilter(t as unknown as Record<string, unknown>));

    const normalizedTeam = normalizedSelectedTeam;
    const isDeploymentTeam = normalizedTeam.includes('DEPLOY') || normalizedTeam.includes('TRIỂN KHAI') || normalizedTeam.includes('TRIENKHAI');
    const isMaintenanceTeam = normalizedTeam.includes('MAINT') || normalizedTeam.includes('BẢO TRÌ') || normalizedTeam.includes('BAOTRI');
    const isDevTeam = normalizedTeam.includes('DEV') || normalizedTeam.includes('PHÁT TRIỂN') || normalizedTeam.includes('PHATTRIEN');

    type TaskWithType = {
      type: 'Triển khai' | 'Bảo trì' | 'Phát triển';
      hospitalName: string | null | undefined;
      startDate: string | null | undefined;
      completionDate: string | null | undefined;
      status: string | null | undefined;
      name: string;
      picName: string;
      [key: string]: unknown;
    };
    const allTasks: TaskWithType[] = [];
    if (isDeploymentTeam) {
      allTasks.push(...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    if (isMaintenanceTeam) {
      allTasks.push(...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    if (isDevTeam) {
      allTasks.push(...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })));
    }
    if (!isDeploymentTeam && !isMaintenanceTeam && !isDevTeam) {
      allTasks.push(
        ...implTasksPicFiltered.map(t => ({ ...t, type: 'Triển khai' as const, hospitalName: t.hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: t.completionDate ?? (t as any).finishDate, status: t.status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
        ...devTasksPicFiltered.map(t => ({ ...t, type: 'Phát triển' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' })),
        ...maintTasksPicFiltered.map(t => ({ ...t, type: 'Bảo trì' as const, hospitalName: (t as any).hospitalName, startDate: (t as any).startDate ?? (t as any).receivedDate ?? (t as any).createdDate, completionDate: (t as any).completionDate ?? (t as any).endDate, status: (t as any).status, name: t.name, picName: (t as any).picDeploymentName ?? (t as any).picName ?? '—' }))
      );
    }

    const grouped = new Map<string, TaskWithType[]>();
    allTasks.forEach(task => {
      const hospitalName = task.hospitalName || 'Không xác định';
      if (!grouped.has(hospitalName)) {
        grouped.set(hospitalName, []);
      }
      grouped.get(hospitalName)!.push(task);
    });

    const sortedGroups = Array.from(grouped.entries()).map(([hospitalName, tasks]) => ({
      hospitalName,
      tasks: tasks.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      })
    }));

    // Apply transfer-to-maintenance filter at hospital group level (with date awareness)
    if (profileTransferFilter !== 'all') {
      let tEndDate: string | null = null;
      if (profileDateTo) {
        tEndDate = profileDateTo;
      } else if (profileYear) {
        const qEnd: Record<string, string> = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };
        tEndDate = profileQuarter !== 'all' && qEnd[profileQuarter]
          ? `${profileYear}${qEnd[profileQuarter]}`
          : `${profileYear}-12-31`;
      }
      return sortedGroups.filter(group => {
        const hName = group.hospitalName;
        const isTransferred = hospitalTransferMap.has(hName)
          ? isHospitalTransferred(hName, tEndDate)
          : group.tasks.some(t => Boolean((t as any).transferredToMaintenance));
        return profileTransferFilter === 'transferred' ? isTransferred : !isTransferred;
      });
    }
    return sortedGroups;
  }, [profileImplTasks, profileDevTasks, profileMaintTasks, profileQuarter, profileYear, profileDateFrom, profileDateTo, implStatusFilter, devStatusFilter, maintStatusFilter, profileStatusFilter, profilePicFilter, profileUsers, isSalesSelected, normalizedSelectedTeam, profileTransferFilter, hospitalTransferMap, isHospitalTransferred]);

  // Update pagination totals when computed value changes
  useEffect(() => {
    setDetailTotalItems(detailTotalItemsComputed);
    setDetailTotalPages(Math.max(1, Math.ceil(Math.max(detailTotalItemsComputed, 1) / detailItemsPerPage)));
  }, [detailTotalItemsComputed, detailItemsPerPage]);

  const salesPaginatedBusinesses = useMemo(() => {
    if (!isSalesSelected) return [];
    const startIndex = detailCurrentPage * detailItemsPerPage;
    const endIndex = startIndex + detailItemsPerPage;
    return salesFilteredBusinesses.slice(startIndex, endIndex);
  }, [isSalesSelected, salesFilteredBusinesses, detailCurrentPage, detailItemsPerPage]);

  // Aggregations for implementation and maintenance (kept minimal per current UI needs)

  // CSV export helpers
  const escapeCsvCell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };

  const downloadCsv = (filename: string, headers: string[], rows: Array<string[]>) => {
    try {
      const lines: string[] = [];
      lines.push(headers.map((h) => escapeCsvCell(h)).join(','));
      rows.forEach((r) => lines.push(r.map((c) => escapeCsvCell(c)).join(',')));
      const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('downloadCsv failed', err);
      toast.error('Xuất CSV thất bại');
    }
  };

  // Helper function to convert Vietnamese team name to safe filename
  const teamNameToFilename = (team: string): string => {
    const translated = translateTeamName(team);
    // Convert Vietnamese to ASCII-safe format
    const mapping: Record<string, string> = {
      'Triển khai': 'Trien_khai',
      'Phát triển': 'Phat_trien',
      'Bảo trì': 'Bao_tri',
      'Kinh doanh': 'Kinh_doanh',
      'CSKH': 'Cham_soc_khach_hang',
    };
    return mapping[translated] || translated.replace(/[^a-z0-9\-_]/gi, '_').replace(/\s+/g, '_');
  };

  const makeFilename = (base: string) => {
    const team = selectedTeam || '';
    const safeTeam = team ? teamNameToFilename(team) : 'all_teams';
    const q = profileQuarter ?? 'all';
    const y = profileYear ?? '';
    const parts = [base, safeTeam || null, q !== 'all' ? q : null, y || null].filter(Boolean);
    return parts.join('_') + '.csv';
  };

  const exportUsersCsv = () => {
    const headers = ['ID','Họ và tên','Username','Email','SĐT','Phòng/Team'];
    const rows = profileUsers.map(u => [String(u.id ?? ''), String(u.fullname ?? ''), String(u.username ?? ''), String(u.email ?? ''), String(u.phone ?? ''), String((u as any).department ?? (u as any).team ?? '')]);
    downloadCsv(makeFilename('users'), headers, rows);
  };

  const exportImplCsv = () => {
    const headers = ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày hoàn thành','Phần cứng','Số lượng'];
  const rows = filteredImplTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).completionDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? '')]);
    downloadCsv(makeFilename('impl_tasks'), headers, rows);
  };

  const exportDevCsv = () => {
    const headers = ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Phần cứng','Số lượng'];
    const rows = filteredDevTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).endDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? '')]);
    downloadCsv(makeFilename('dev_tasks'), headers, rows);
  };

  const exportMaintCsv = () => {
    const headers = ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Phần cứng','Số lượng','Yêu cầu bổ sung'];
    const rows = filteredMaintTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).endDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? ''), getSupplementRequest(t as unknown as Record<string, unknown>)]);
    downloadCsv(makeFilename('maint_tasks'), headers, rows);
  };

  const exportBusinessesCsv = () => {
    const headers = ['ID','Tên dự án','Doanh thu','Hoa hồng của viện','Trạng thái','Ngày'];
    const rows = displayedBusinesses.map(b => [String(b['id'] ?? ''), String(b['name'] ?? b['projectName'] ?? ''), String(Number(b['totalPrice'] ?? b['unitPrice'] ?? 0)), String(Number(b['commission'] ?? 0)), translateStatus(String(b['status'] ?? '')), String(b['startDate'] ?? b['completionDate'] ?? '')]);
    downloadCsv(makeFilename('businesses'), headers, rows);
  };

  // Reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _exportAllCsv = () => {
    exportUsersCsv();
    exportImplCsv();
    exportDevCsv();
    exportMaintCsv();
    exportBusinessesCsv();
  };

  // Reserved for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _exportAllSingleCsv = () => {
    try {
      const sections: Array<{ title: string; headers: string[]; rows: Array<string[]> }> = [];
      sections.push({ title: 'Người dùng', headers: ['ID','Họ và tên','Username','Email','SĐT','Phòng/Team'], rows: profileUsers.map(u => [String(u.id ?? ''), String(u.fullname ?? ''), String(u.username ?? ''), String(u.email ?? ''), String(u.phone ?? ''), String((u as any).department ?? (u as any).team ?? '')]) });
  sections.push({ title: 'Triển khai', headers: ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày hoàn thành','Phần cứng','Số lượng'], rows: filteredImplTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).completionDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? '')]) });
  sections.push({ title: 'Phát triển', headers: ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Phần cứng','Số lượng'], rows: filteredDevTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).endDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? '')]) });
  sections.push({ title: 'Bảo trì', headers: ['ID','Tên','PIC','Trạng thái','Ngày bắt đầu','Ngày kết thúc','Phần cứng','Số lượng','Yêu cầu bổ sung'], rows: filteredMaintTasks.map(t => [String(t.id ?? ''), String(t.name ?? ''), String((t as any).picDeploymentName ?? ''), translateStatus(String(t.status ?? '')), String((t as any).startDate ?? ''), String((t as any).endDate ?? ''), hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? ''), String(t.quantity ?? ''), getSupplementRequest(t as unknown as Record<string, unknown>)]) });
      sections.push({ title: 'Hợp đồng', headers: ['ID','Tên dự án','Doanh thu','Hoa hồng của viện','Trạng thái','Ngày'], rows: displayedBusinesses.map(b => [String(b['id'] ?? ''), String(b['name'] ?? b['projectName'] ?? ''), String(Number(b['totalPrice'] ?? b['unitPrice'] ?? 0)), String(Number(b['commission'] ?? 0)), translateStatus(String(b['status'] ?? '')), String(b['startDate'] ?? b['completionDate'] ?? '')]) });

      const lines: string[] = [];
      sections.forEach((s, idx) => {
        // section title
        lines.push(escapeCsvCell(`== ${s.title} ==`));
        // headers
        lines.push(s.headers.map(h => escapeCsvCell(h)).join(','));
        // rows
        s.rows.forEach(r => lines.push(r.map(c => escapeCsvCell(c)).join(',')));
        if (idx < sections.length - 1) lines.push('');
      });
      const csv = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeFilename('all_tables');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('exportAllSingleCsv failed', err);
      toast.error('Xuất file thất bại');
    }
  };

  // Export detail report to Excel with grouping by hospital (similar to web UI)
  const exportDetailExcel = async () => {
    try {
      if (!hasLoadedProfile) {
        toast.error('Vui lòng tải hồ sơ trước');
        return;
      }
      
      // Check if there's data to export
      if (isSalesSelected) {
        if (salesFilteredBusinesses.length === 0) {
          toast.error('Không có dữ liệu để xuất');
          return;
        }
      } else {
        if (tasksByHospital.length === 0) {
          toast.error('Không có dữ liệu để xuất');
          return;
        }
      }

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo chi tiết');

      // Determine report title based on selected team
      const reportTitle = selectedTeam 
        ? `Báo cáo công việc ${translateTeamName(selectedTeam).toLowerCase()}`
        : 'Báo cáo công việc';

      // Add title row
      const titleRow = worksheet.addRow([reportTitle]);
      titleRow.height = 30;
      titleRow.font = { bold: true, size: 14 };
      titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
      // Merge title across columns - 8 columns for SALES (with Doanh thu), 7 for others
      worksheet.mergeCells(1, 1, 1, isSalesSelected ? 8 : 7);

      // Set column headers - use "Mã hợp đồng" for SALES team, otherwise "Nội dung công việc"
      // SALES team has 8 columns (including Doanh thu), others have 7
      const headers = isSalesSelected
        ? ['Tên bệnh viện', 'Mã hợp đồng', 'Ngày bắt đầu', 'Người phụ trách', 'Trạng thái', 'Ngày hoàn thành', 'Số ngày thực hiện', 'Doanh thu']
        : ['Tên bệnh viện', 'Nội dung công việc', 'Ngày bắt đầu', 'Người phụ trách', 'Trạng thái', 'Ngày hoàn thành', 'Thời gian thực hiện'];
      const headerRow = worksheet.addRow(headers);
      
      // Style header row with yellow background
      headerRow.font = { bold: true, size: 11 };
      headerRow.height = 25;
      
      // Style header cells - 8 columns for SALES, 7 for others
      const headerColCount = isSalesSelected ? 8 : 7;
      for (let col = 1; col <= headerColCount; col++) {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
        type: 'pattern',
        pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' } // Yellow background
      };
        cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      }
      
      // Clear any style from cells beyond used columns
      const headerClearFromCol = isSalesSelected ? 9 : 8;
      for (let col = headerClearFromCol; col <= 20; col++) {
        const cell = headerRow.getCell(col);
        cell.value = null;
        cell.style = {};
      }

      // Set column widths
      worksheet.getColumn(1).width = 25; // Tên bệnh viện
      worksheet.getColumn(2).width = 40; // Nội dung công việc / Mã hợp đồng
      worksheet.getColumn(3).width = 15; // Ngày bắt đầu
      worksheet.getColumn(4).width = 20; // Người phụ trách
      worksheet.getColumn(5).width = 18; // Trạng thái
      worksheet.getColumn(6).width = 18; // Ngày hoàn thành
      worksheet.getColumn(7).width = 22; // Số ngày thực hiện (tăng width để hiển thị "X ngày Y giờ")
      if (isSalesSelected) {
        worksheet.getColumn(8).width = 20; // Doanh thu
      }
      
      // Remove column definitions beyond used columns to prevent extra columns
      const removeFromCol = isSalesSelected ? 9 : 8;
      for (let colNum = removeFromCol; colNum <= 20; colNum++) {
        const col = worksheet.getColumn(colNum);
        if (col) {
          col.width = undefined;
        }
      }

      // Add data rows with grouping
      let currentRow = 3; // Start after title and header rows
      
      // Handle SALES team differently - export businesses
      if (isSalesSelected) {
        // Get all businesses (not paginated)
        const allBusinesses = salesFilteredBusinesses;
        
        // Group businesses by hospital
        const businessGroups = new Map<string, typeof allBusinesses>();
        allBusinesses.forEach((biz) => {
          const hospitalName = (biz as any)?.hospital?.label ?? (biz as any)?.hospitalName ?? (biz as any)?.hospital ?? 'Không xác định';
          if (!businessGroups.has(hospitalName)) {
            businessGroups.set(hospitalName, []);
          }
          businessGroups.get(hospitalName)!.push(biz);
        });
        
        // Add business rows grouped by hospital
        for (const [hospitalName, businesses] of businessGroups.entries()) {
          let isFirstBusiness = true;
          
          for (const biz of businesses) {
            const bizRow = worksheet.addRow([
              isFirstBusiness ? hospitalName : '', // Hospital name only in first row
              (biz as any)?.name ?? (biz as any)?.projectName ?? '—',
              (biz as any)?.startDate ? new Date((biz as any).startDate).toLocaleDateString('vi-VN') : '—',
              (biz as any)?.picUser?.label ?? (biz as any)?.picName ?? '—',
              translateStatus(String((biz as any)?.status ?? '')),
              (biz as any)?.completionDate ? new Date((biz as any).completionDate).toLocaleDateString('vi-VN') : '—',
              (() => {
                // ✅ Tính chi tiết đến giờ: "X ngày Y giờ" hoặc "Y giờ" (nếu < 1 ngày)
                const startDate = (biz as any)?.startDate;
                if (!startDate) return '—';
                const start = new Date(startDate);
                const endDate = (biz as any)?.completionDate ? new Date((biz as any).completionDate) : new Date();
                if (Number.isNaN(start.getTime()) || Number.isNaN(endDate.getTime())) return '—';
                
                // ✅ Tính diff time (milliseconds) - giữ nguyên timestamp để tính chính xác đến giờ
                const diffTime = endDate.getTime() - start.getTime();
                
                // ✅ Kiểm tra số âm (completionDate < startDate → lỗi data)
                if (diffTime < 0) return '—';
                
                // ✅ Tính số ngày và số giờ
                const totalHours = Math.floor(diffTime / (1000 * 60 * 60));
                const days = Math.floor(totalHours / 24);
                const hours = totalHours % 24;
                
                // ✅ Format: "X ngày Y giờ" hoặc "Y giờ" (nếu < 1 ngày)
                if (days > 0) {
                  return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
                } else {
                  return hours > 0 ? `${hours} giờ` : '< 1 giờ';
                }
              })(),
              // Doanh thu column (only for SALES)
              new Intl.NumberFormat('vi-VN').format(Number((biz as any)?.totalPrice ?? (biz as any)?.unitPrice ?? 0)) + ' ₫'
            ]);
            
            // Style columns with borders - 8 columns for SALES, 7 for others
            const dataColCount = 8; // SALES always has 8 columns
            for (let col = 1; col <= dataColCount; col++) {
              const cell = bizRow.getCell(col);
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            }
            
            // Clear any style from cells beyond column H (for SALES) or G (for others)
            const bizClearFromCol = 9; // Start clearing from column I
            for (let col = bizClearFromCol; col <= 20; col++) {
              const cell = bizRow.getCell(col);
              if (cell) {
                cell.value = null;
                cell.style = {};
              }
            }
            
            // Alignment for columns
            bizRow.height = 25;
            bizRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
            bizRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            bizRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
            bizRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };
            bizRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
            bizRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
            bizRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
            bizRow.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }; // Doanh thu - right aligned
            
            isFirstBusiness = false;
            currentRow++;
          }
        }
      } else {
      // Use allTasksByHospital (already filtered, just not paginated) instead of re-filtering
      // This ensures export uses the exact same filters as the displayed data
      const allGroups = allTasksByHospital;

      // Add hospital groups - hospital name in first column, tasks below with empty first column
      for (const group of allGroups) {
        let isFirstTask = true;

        // Add task rows
        for (const task of group.tasks) {
          const taskRow = worksheet.addRow([
            isFirstTask ? group.hospitalName : '', // Hospital name only in first row of group
            `${task.name || '—'}\n${task.type}`, // Task name with type
            task.startDate ? new Date(task.startDate).toLocaleDateString('vi-VN') : '—',
            task.picName ?? '—',
            translateStatus(String(task.status)),
            task.completionDate ? new Date(task.completionDate).toLocaleDateString('vi-VN') : '—',
            (() => {
              const startDate = task.startDate;
              if (!startDate) return '—';
              const start = new Date(startDate);
              const endDate = task.completionDate ? new Date(task.completionDate) : new Date();
              if (Number.isNaN(start.getTime()) || Number.isNaN(endDate.getTime())) return '—';
              const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
              const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              const diffTime = endDateOnly.getTime() - startDateOnly.getTime();
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              return diffDays >= 0 ? `${diffDays} ngày` : '—';
            })()
          ]);

          // Style only columns A-G (1-7) with borders
          for (let col = 1; col <= 7; col++) {
            const cell = taskRow.getCell(col);
            cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          }
          
          // Clear any style from cells beyond column G
          for (let col = 8; col <= 20; col++) {
            const cell = taskRow.getCell(col);
            cell.value = null;
            cell.style = {};
          }

          // Alignment for columns A-G only
          taskRow.height = 25;
          
          // Left align hospital name and task name
          taskRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
          taskRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          taskRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
          taskRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' };
          taskRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
          taskRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
          taskRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
          
          isFirstTask = false;
          currentRow++;
        }
      }
      }

      // Freeze header row (row 2, after title)
      worksheet.views = [{ state: 'frozen', ySplit: 2 }];
      
      // Remove any cells beyond used columns in all rows to prevent extra columns with styles
      const lastRow = worksheet.rowCount;
      const clearFromCol = isSalesSelected ? 9 : 8; // Clear from column I for SALES, H for others
      if (lastRow > 0) {
        for (let rowNum = 1; rowNum <= lastRow; rowNum++) {
          const row = worksheet.getRow(rowNum);
          // Clear cells from unused columns onwards
          for (let colNum = clearFromCol; colNum <= 20; colNum++) {
            const cell = row.getCell(colNum);
            if (cell) {
              cell.value = null;
              cell.style = {};
            }
          }
        }
      }

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeFilename('bao_cao_chi_tiet').replace('.csv', '.xlsx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      toast.success('Xuất file Excel thành công');
    } catch (err) {
      console.error('exportDetailExcel failed', err);
      toast.error('Xuất file Excel thất bại');
    }
  };

  return (
    <>
      <PageMeta title="Quản lý công việc | TAGTECH" description="" />
      {/* <FlowerFall /> */}

      {/* <TetCelebration /> */}

      <div className="space-y-6">
        <header className="relative overflow-hidden rounded-2xl p-6 text-white shadow-md">
          {/* animated gradient background */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(270deg,#7c3aed,#06b6d4,#f97316,#8b5cf6)',
              backgroundSize: '600% 600%',
              filter: 'saturate(1.1) contrast(1.02)',
              animation: 'bgShift 12s ease infinite',
              opacity: 0.95,
            }}
          />
          <style>{`@keyframes bgShift { 0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%} }`}</style>

          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Bảng điều khiển Super Admin</h1>
              <p className="mt-1 text-sm opacity-90">Tổng quan hệ thống & truy cập nhanh các phần quản trị</p>
            </div>
            {/* Filtered users by Team / Department */}
         
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          <main className="col-span-12 xl:col-span-8 space-y-6">
            
            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-blue-800">Quản lý nhanh</h2>
              <p className="text-sm text-gray-500 mt-1">Các hành động thường dùng được gom lại để bạn thao tác nhanh.</p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link to="/superadmin/users" className="flex items-center gap-4 rounded-lg border p-4 hover:shadow-md">
                  <div className="h-12 w-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg">👥</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Người dùng</div>
                    <div className="text-xs text-gray-500">Quản lý người dùng</div>
                  </div>
                </Link>

                <Link to="/superadmin/hospitals" className="flex items-center gap-4 rounded-lg border p-4 hover:shadow-md">
                  <div className="h-12 w-12 rounded-lg bg-green-50 text-green-600 flex items-center justify-center text-lg">🏥</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Bệnh viện</div>
                    <div className="text-xs text-gray-500">Quản lý bệnh viện</div>
                  </div>
                </Link>

                <Link to="/superadmin/his-systems" className="flex items-center gap-4 rounded-lg border p-4 hover:shadow-md">
                  <div className="h-12 w-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-lg">💼</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Hệ thống HIS</div>
                    <div className="text-xs text-gray-500">Quản lý hệ thống HIS</div>
                  </div>
                </Link>

                <Link to="/superadmin/agencies" className="flex items-center gap-4 rounded-lg border p-4 hover:shadow-md">
                  <div className="h-12 w-12 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center text-lg">🏢</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Đại lý</div>
                    <div className="text-xs text-gray-500">Quản lý đại lý</div>
                  </div>
                </Link>

                <Link to="/superadmin/hardware" className="flex items-center gap-4 rounded-lg border p-4 hover:shadow-md">
                  <div className="h-12 w-12 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center text-lg">💻</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Phần cứng</div>
                    <div className="text-xs text-gray-500">Quản lý phần cứng</div>
                  </div>
                </Link>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">Thống kê tổng quan</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <StatCard title="Người dùng" value={summary ? summary.totalUsers : '--'} icon={<span>👥</span>} color="bg-indigo-500" />
                  <StatCard title="Bệnh viện" value={summary ? summary.totalHospitals : '--'} icon={<span>🏥</span>} color="bg-emerald-500" />
                  <StatCard title="Hệ thống HIS" value={summary ? summary.totalHisSystems : '--'} icon={<span>💼</span>} color="bg-purple-500" />
                  <StatCard title="Phần cứng" value={summary ? summary.totalHardware : '--'} icon={<span>💻</span>} color="bg-teal-500" />
                  <StatCard title="Đại lý" value={summary ? summary.totalAgencies : '--'} icon={<span>🏢</span>} color="bg-orange-500" />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">Sơ đồ phân bố</h3>
                <div className="mt-3 flex justify-center">
                  <Chart
                    options={donutOptions}
                    series={summary ? [summary.totalUsers, summary.totalHospitals, summary.totalHisSystems, summary.totalHardware, summary.totalAgencies] : [0,0,0,0,0]}
                    type="donut"
                    width={260}
                  />
                </div>
              </div>
            </section>
            {/* Báo cáo Kinh doanh removed from here and inserted below full-width */}
          </main>

          <aside className="col-span-12 xl:col-span-4 space-y-6">
            <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Thống kê nhanh</h3>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">Tổng đại lý</div>
                  <div className="text-sm font-semibold text-gray-900">{summary ? summary.totalAgencies : '--'}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">Hệ thống HIS</div>
                  <div className="text-sm font-semibold text-gray-900">{summary ? summary.totalHisSystems : '--'}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">Xem báo cáo</h3>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={() => document.getElementById('section-business-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-base">📈</span>
                  Báo cáo Kinh doanh
                </button>
                <button
                  onClick={() => document.getElementById('section-cskh-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-base">💚</span>
                  Báo cáo CSKH
                </button>
                <button
                  onClick={() => document.getElementById('section-employee-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-base">👤</span>
                  Báo cáo Hiệu suất NV
                </button>
                <button
                  onClick={() => document.getElementById('section-team-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 text-base">👥</span>
                  Báo cáo theo Team
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Full-width Business Report placed below the grid */}
        <section id="section-business-report" className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 w-full">
          <div className="max-w-full">
            <h2 className="text-lg font-semibold text-blue-800">Báo cáo Kinh doanh</h2>
            <p className="text-sm text-gray-500 mt-1">Doanh thu & hoa hồng theo dự án. Lọc theo khoảng thời gian.</p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Từ ngày</label>
                  <input value={businessFrom} onChange={(e) => setBusinessFrom(e.target.value)} type="datetime-local" className="mt-1 w-64 rounded-md border px-3 py-2 text-sm bg-white" />
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Đến ngày</label>
                  <input value={businessTo} onChange={(e) => setBusinessTo(e.target.value)} type="datetime-local" className="mt-1 w-64 rounded-md border px-3 py-2 text-sm bg-white" />
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Trạng thái</label>
                  <select value={businessStatus} onChange={(e) => setBusinessStatus(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm bg-white w-40">
                    <option value="">Tất cả</option>
                    <option value="CARING">Đang chăm sóc</option>
                    <option value="CONTRACTED">Đã ký hợp đồng</option>
                    <option value="CANCELLED">Đã hủy</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Gộp theo</label>
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'day' | 'month' | 'year')} className="mt-1 rounded-md border px-3 py-2 text-sm bg-white w-40">
                    <option value="day">Theo ngày</option>
                    <option value="month">Theo tháng</option>
                    <option value="year">Theo năm</option>
                  </select>
                </div>
              </div>

              <div className="mt-2 sm:mt-0 flex items-center gap-2">
                <button onClick={() => void loadBusinessReport(businessFrom, businessTo, businessStatus)} disabled={businessLoading} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700">Áp dụng</button>
                <button onClick={() => { setBusinessFrom(''); setBusinessTo(''); setBusinessStatus(''); void loadBusinessReport(); }} disabled={businessLoading} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Xóa</button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
              <StatCard title="Tổng doanh thu dự kiến" value={totalExpected != null ? (totalExpected).toLocaleString() + ' ₫' : '--'} color="bg-indigo-500" />
              <StatCard title="Tổng doanh thu thực tế" value={totalActual != null ? (totalActual).toLocaleString() + ' ₫' : '--'} color="bg-emerald-500" />
              <StatCard title="Tỷ lệ chuyển đổi" value={conversionRate != null ? `${conversionRate}%` : '--'} color="bg-teal-500" />
            </div>

            <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">So sánh</h3>
              <div className="mt-3">
                {aggLabels.length === 0 ? (
                  <Chart
                    options={{
                      chart: { toolbar: { show: false } },
                      plotOptions: { bar: { borderRadius: 8, columnWidth: '30%' } },
                      xaxis: { categories: ['Dự kiến', 'Thực tế'] },
                      dataLabels: { enabled: false },
                      colors: ['#465fff', '#10b981'],
                    }}
                    series={[{ name: 'VNĐ', data: [totalExpected ?? 0, totalActual ?? 0] }]}
                    type="bar"
                    height={260}
                    width="100%"
                  />
                ) : (
                  <Chart
                    options={{
                      chart: { toolbar: { show: false }, type: 'bar' },
                      plotOptions: { bar: { horizontal: false, columnWidth: '40%', borderRadius: 6 } },
                      xaxis: { categories: aggLabels },
                      dataLabels: { enabled: false },
                      tooltip: { y: { formatter: (v: number) => `${v.toLocaleString()} ₫` } },
                      legend: { position: 'top' },
                      colors: ['#7c3aed', '#10b981'],
                    }}
                    series={[
                      { name: 'Tổng doanh thu dự kiến', type: 'bar', data: aggExpected },
                      { name: 'Tổng doanh thu thực tế', type: 'bar', data: aggActual },
                    ]}
                    type="bar"
                    height={420}
                    width="100%"
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* CSKH Report Section */}
        <section id="section-cskh-report" className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 w-full">
          <CSKHReport />
        </section>

        {/* Employee Performance Report */}
        <section id="section-employee-report" className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 w-full">
          <div className="max-w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-800">Báo cáo Hiệu suất Nhân viên</h2>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Năm</label>
                  <select value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} className="mt-1 rounded-md border px-1 py-2 text-sm bg-white w-25">
                    {Array.from({ length: new Date().getFullYear() - 2019 }).map((_, i) => {
                      const y = 2020 + i;
                      return <option key={y} value={y}>{y}</option>;
                    })}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Tháng (tùy chọn)</label>
                  <select value={reportMonth} onChange={(e) => setReportMonth(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 rounded-md border px-3 py-1 text-sm bg-white w-36">
                    <option value="">Tất cả</option>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const m = i + 1;
                      return <option key={m} value={m}>{m}</option>;
                    })}
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Đội nhóm</label>
                  <select value={reportTeam} onChange={(e) => setReportTeam(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm bg-white w-44">
                    <option value="ALL">Tất cả</option>
                    <option value="DEPLOYMENT">Triển khai</option>
                    <option value="DEV">Phát triển</option>
                    <option value="MAINTENANCE">Bảo trì</option>
                    <option value="SALES">Kinh doanh</option>
                  </select>
                </div>

                <div className="flex flex-col">
                  <label className="block text-xs text-gray-500">Phòng ban (tùy chọn)</label>
                  <select value={reportDepartment} onChange={(e) => setReportDepartment(e.target.value)} className="mt-1 rounded-md border px-3 py-2 text-sm bg-white w-56">
                    <option value="">Tất cả</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

                <div className="mt-2 sm:mt-0 flex items-center gap-2">
                <button onClick={async () => { await fetchEmployeePerformance(); }} disabled={reportLoading} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700">Áp dụng</button>
                <button onClick={() => void exportEmployeePerformanceExcel()} disabled={reportLoading} className="rounded-md bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-200">Xuất Excel</button>
              </div>
            </div>

            <div className="mt-4">
              {reportLoading ? (
                <div className="text-sm text-gray-500">Đang tải báo cáo…</div>
              ) : reportData.length === 0 ? (
                <div className="text-sm text-gray-500">Chưa có dữ liệu. Nhấn Áp dụng để lấy báo cáo.</div>
              ) : (
                <div className="overflow-x-auto mt-2">
                  <table className="min-w-full text-sm table-auto">
                    <thead>
                      <tr className="text-xs text-gray-600 bg-gray-50">
                        <th className="px-2 py-1 text-center">ID</th>
                        <th className="px-2 py-1 text-center">Họ và tên</th>
                        <th className="px-2 py-1 text-center">Team</th>
                        <th className="px-2 py-1 text-center">Phòng ban</th>
                        <th className="px-2 py-1 text-center">Đã giao</th>
                        <th className="px-2 py-1 text-center">Đang xử lý</th>
                        <th className="px-2 py-1 text-center">Hoàn thành</th>
                        <th className="px-2 py-1 text-center">Quá hạn</th>
                        <th className="px-2 py-1 text-center">Đã tiếp nhận</th>
                        <th className="px-2 py-1 text-center">Viện nghiệm thu</th>
                        <th className="px-2 py-1 text-center">TB xử lý (h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((r, idx) => (
                        <tr key={`${r.userId ?? idx}`} className={`border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100`}>
                          <td className="px-2 py-2 align-middle text-center">{r.userId ?? '—'}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.fullName ?? '—'}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.team ? translateTeamName(r.team) : '—'}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.department ? translateDepartment(r.department) : '—'}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalAssigned ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalInProgress ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalCompleted ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalLate ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalReceived ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.totalTransferred ?? 0}</td>
                          <td className="px-2 py-2 align-middle text-center">{r.avgProcessingHours != null ? (Math.round(r.avgProcessingHours * 100) / 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Hospital Profile (inline on Home) */}
        <section id="section-team-report" className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 w-full">
          <div className="max-w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-blue-800">Báo cáo chi tiết theo Team</h2>
              </div>
              <div className="flex items-center gap-2">
                
                {viewMode === 'detail' && hasLoadedProfile && (
                  <button onClick={() => void exportDetailExcel()} disabled={profileLoading} className="rounded-md bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed ml-2">Xuất Excel</button>
                )}
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex items-center gap-2 mb-4 border-b border-gray-200">
              <button
                onClick={() => setViewMode('detail')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'detail'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Chi tiết
              </button>
              <button
                onClick={() => setViewMode('comparison')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'comparison'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                So sánh
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Team Selection Row */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chọn team</label>
                  <div ref={teamDropdownRef} className="relative w-48">
                    <button
                      type="button"
                      onClick={() => {
                        setTeamPage(0);
                        setTeamDropdownOpen((prev) => !prev);
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <span className="truncate">
                        {selectedTeam ? translateTeamName(selectedTeam) : "— Chọn team —"}
                      </span>
                      <svg className={`w-4 h-4 transition-transform ${teamDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {teamDropdownOpen && (
                      <div className="absolute z-30 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-3">
                        
                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {filteredTeams.length === 0 ? (
                            <div className="text-sm text-gray-500 text-center py-6">
                              Không tìm thấy team
                            </div>
                          ) : (
                            <>
                              {paginatedTeams.map((team) => (
                                <button
                                  key={team}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTeam(team);
                                    setTeamDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors ${
                                    selectedTeam === team ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                                  }`}
                                >
                                  {translateTeamName(team)}
                                </button>
                              ))}
                              {hasMoreTeams && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTeamPage((prev) => prev + 1);
                                  }}
                                  className="w-full text-sm text-indigo-600 hover:text-indigo-700 hover:underline py-2 text-center focus:outline-none border-t border-gray-200 pt-2 mt-1"
                                >
                                  Xem thêm ({filteredTeams.length - paginatedTeams.length} còn lại)
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => void loadTeamProfile()} 
                    disabled={profileLoading || !selectedTeam} 
                    className="h-10 inline-flex items-center rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Tải hồ sơ
                  </button>
                  <button
                    type="button"
                    onClick={resetTeamFilters}
                    disabled={!hasCustomTeamFilter}
                    className="h-10 inline-flex items-center rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                  >
                    Xóa lọc
                  </button>
                </div>
              </div>

              {/* Filter Row */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quý</label>
                  <select 
                    value={profileQuarter} 
                    onChange={(e) => { setProfileQuarter(e.target.value as any); setDetailCurrentPage(0); }} 
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                      <option value="all">Tất cả</option>
                      <option value="Q1">Q1</option>
                      <option value="Q2">Q2</option>
                      <option value="Q3">Q3</option>
                      <option value="Q4">Q4</option>
                    </select>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Năm</label>
                  <select 
                    value={profileYear} 
                    onChange={(e) => { setProfileYear(e.target.value); setDetailCurrentPage(0); }} 
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                      <option value="">Tất cả</option>
                      {Array.from({ length: new Date().getFullYear() - 2019 }).map((_, i) => {
                        const y = String(2020 + i);
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
                    <input 
                      type="date" 
                      value={profileDateFrom} 
                      onChange={(e) => { setProfileDateFrom(e.target.value); setDetailCurrentPage(0); }} 
                    onClick={(e) => {
                      if (typeof (e.currentTarget as HTMLInputElement).showPicker === 'function') {
                        (e.currentTarget as HTMLInputElement).showPicker();
                      }
                    }}
                    onFocus={(e) => {
                      if (typeof (e.currentTarget as HTMLInputElement).showPicker === 'function') {
                        (e.currentTarget as HTMLInputElement).showPicker();
                      }
                    }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    />
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                    <input 
                      type="date" 
                      value={profileDateTo} 
                      onChange={(e) => { setProfileDateTo(e.target.value); setDetailCurrentPage(0); }} 
                    onClick={(e) => {
                      if (typeof (e.currentTarget as HTMLInputElement).showPicker === 'function') {
                        (e.currentTarget as HTMLInputElement).showPicker();
                      }
                    }}
                    onFocus={(e) => {
                      if (typeof (e.currentTarget as HTMLInputElement).showPicker === 'function') {
                        (e.currentTarget as HTMLInputElement).showPicker();
                      }
                    }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    />
                </div>
                    {(profileDateFrom || profileDateTo) && (
                  <div className="flex items-end">
                      <button 
                        onClick={() => { setProfileDateFrom(''); setProfileDateTo(''); setDetailCurrentPage(0); }} 
                      className="text-xs text-gray-500 hover:text-gray-700 underline h-10 flex items-center"
                      >
                        Xóa lọc ngày
                      </button>
                  </div>
                    )}
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                    <select 
                      value={profileStatusFilter} 
                      onChange={(e) => { setProfileStatusFilter(e.target.value); setDetailCurrentPage(0); }} 
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Tất cả</option>
                      <option value="RECEIVED">Đã tiếp nhận</option>
                      <option value="IN_PROCESS">Đang xử lý</option>
                      <option value="COMPLETED">Hoàn thành</option>
                      <option value="ISSUE">Gặp sự cố</option>
                    </select>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách</label>
                    <select
                      value={profilePicFilter}
                      onChange={(e) => { setProfilePicFilter(e.target.value); setDetailCurrentPage(0); }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">Tất cả</option>
                      {profileUsers
                        .filter((u) => u.id != null)
                        .map((u) => (
                          <option key={u.id} value={String(u.id)}>
                          {u.fullname ?? u.username ?? `Người dùng #${u.id}`}
                          </option>
                        ))}
                    </select>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tình trạng</label>
                  <select
                    value={profileTransferFilter}
                    onChange={(e) => { setProfileTransferFilter(e.target.value); setDetailCurrentPage(0); }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tất cả</option>
                    <option value="transferred">Nghiệm thu</option>
                    <option value="not_transferred">Chưa nghiệm thu</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Comparison View */}
            {viewMode === 'comparison' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Khoảng thời gian</label>
                    <select 
                      value={timeRange} 
                      onChange={(e) => setTimeRange(e.target.value as any)} 
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="monthly">Theo tháng</option>
                      <option value="quarterly">Theo quý</option>
                      <option value="yearly">Theo năm</option>
                    </select>
                  </div>
                  <div className="flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">So sánh với năm</label>
                    <select 
                      value={compareYear} 
                      onChange={(e) => setCompareYear(e.target.value)} 
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm bg-white w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Không so sánh</option>
                      {Array.from({ length: new Date().getFullYear() - 2019 }).map((_, i) => {
                        const y = String(2020 + i);
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                </div>

                {/* Comparison Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Tổng số công việc</h3>
                    <Chart
                      options={{
                        chart: { type: 'line', toolbar: { show: false }, zoom: { enabled: false } },
                        xaxis: { categories: comparisonData.labels },
                        yaxis: { title: { text: 'Số lượng', style: { fontWeight: 'normal' } } },
                        legend: { position: 'top' },
                        colors: ['#465fff', '#10b981'],
                        stroke: { width: 2, curve: 'smooth' },
                        markers: { size: 4 },
                        tooltip: { shared: true, intersect: false }
                      }}
                      series={[
                        { name: profileYear || String(new Date().getFullYear()), data: comparisonData.currentSeries },
                        ...(compareYear ? [{ name: compareYear, data: comparisonData.compareSeries }] : [])
                      ]}
                      type="line"
                      height={300}
                    />
                  </div>

                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <h3 className="text-sm font-medium text-gray-700 mb-4">Công việc đã hoàn thành</h3>
                    <Chart
                      options={{
                        chart: { type: 'line', toolbar: { show: false }, zoom: { enabled: false } },
                        xaxis: { categories: comparisonData.labels },
                        yaxis: { title: { text: 'Số lượng', style: { fontWeight: 'normal' } } },
                        legend: { position: 'top' },
                        colors: ['#465fff', '#10b981'],
                        stroke: { width: 2, curve: 'smooth' },
                        markers: { size: 4 },
                        tooltip: { shared: true, intersect: false }
                      }}
                      series={[
                        { name: profileYear || String(new Date().getFullYear()), data: comparisonData.currentCompletedSeries },
                        ...(compareYear ? [{ name: compareYear, data: comparisonData.compareCompletedSeries }] : [])
                      ]}
                      type="line"
                      height={300}
                    />
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500">Tổng công việc ({profileYear || String(new Date().getFullYear())})</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {comparisonData.currentSeries.reduce((a, b) => a + b, 0)}
                    </div>
                    {compareYear && (
                      <div className="text-xs text-gray-500 mt-1">
                        Năm {compareYear}: {comparisonData.compareSeries.reduce((a, b) => a + b, 0)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500">Đã hoàn thành ({profileYear || String(new Date().getFullYear())})</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {comparisonData.currentCompletedSeries.reduce((a, b) => a + b, 0)}
                    </div>
                    {compareYear && (
                      <div className="text-xs text-gray-500 mt-1">
                        Năm {compareYear}: {comparisonData.compareCompletedSeries.reduce((a, b) => a + b, 0)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500">Tỷ lệ hoàn thành ({profileYear || String(new Date().getFullYear())})</div>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {comparisonData.currentSeries.reduce((a, b) => a + b, 0) > 0
                        ? Math.round((comparisonData.currentCompletedSeries.reduce((a, b) => a + b, 0) / comparisonData.currentSeries.reduce((a, b) => a + b, 0)) * 100)
                        : 0}%
                    </div>
                    {compareYear && (
                      <div className="text-xs text-gray-500 mt-1">
                        Năm {compareYear}: {comparisonData.compareSeries.reduce((a, b) => a + b, 0) > 0
                          ? Math.round((comparisonData.compareCompletedSeries.reduce((a, b) => a + b, 0) / comparisonData.compareSeries.reduce((a, b) => a + b, 0)) * 100)
                          : 0}%
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Detail View */}
            {viewMode === 'detail' && (
              <div className="space-y-6">
                {/* Visual Table View - Grouped by Hospital */}
                {profileLoading ? (
                  <div className="mb-6 mt-4 rounded-2xl bg-white p-8 shadow-sm border border-gray-100 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <div className="text-sm text-gray-500">Đang tải dữ liệu...</div>
                    </div>
                  </div>
                ) : isSalesSelected ? (
                  salesFilteredBusinesses.length > 0 ? (
                    <div className="mb-6 mt-4 rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-700">Danh sách hợp đồng kinh doanh</h3>
                        <div className="text-xs text-gray-500">Tổng: {detailTotalItems} hợp đồng</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr className="text-xs text-gray-600">
                              <th className="px-3 py-2 text-left">ID</th>
                              <th className="px-3 py-2 text-left">Tên dự án</th>
                              <th className="px-3 py-2 text-left">Người phụ trách</th>
                              <th className="px-3 py-2 text-center">Trạng thái</th>
                              <th className="px-3 py-2 text-center">Ngày bắt đầu</th>
                              <th className="px-3 py-2 text-center">Ngày hoàn thành</th>
                              <th className="px-3 py-2 text-right">Doanh thu</th>
                              <th className="px-3 py-2 text-right">Hoa hồng của viện</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesPaginatedBusinesses.map((b) => (
                              <tr key={String(b['id'] ?? Math.random())} className="border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                                <td className="px-3 py-2">{String(b['id'] ?? '—')}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-gray-900">{String(b['name'] ?? b['projectName'] ?? '—')}</div>
                                  <div className="text-xs text-gray-500">{(b as any)?.hospital?.label ?? (b as any)?.hospitalName ?? '—'}</div>
                                </td>
                                <td className="px-3 py-2 text-left">{(b as any)?.picUser?.label ?? (b as any)?.picName ?? '—'}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                    String(b['status'] ?? '').toUpperCase() === 'CONTRACTED'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {translateStatus(String(b['status'] ?? ''))}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">{(b['startDate'] ?? b['createdAt'] ?? b['created_at']) ? new Date(String(b['startDate'] ?? b['createdAt'] ?? b['created_at'])).toLocaleDateString('vi-VN') : '—'}</td>
                                <td className="px-3 py-2 text-center">{(b['completionDate'] ?? b['updatedAt'] ?? b['updated_at']) ? new Date(String(b['completionDate'] ?? b['updatedAt'] ?? b['updated_at'])).toLocaleDateString('vi-VN') : '—'}</td>
                                <td className="px-3 py-2 text-right">{new Intl.NumberFormat('vi-VN').format(Number(b['totalPrice'] ?? b['unitPrice'] ?? 0))} ₫</td>
                                <td className="px-3 py-2 text-right">{new Intl.NumberFormat('vi-VN').format(Number(b['commission'] ?? 0))} ₫</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {detailTotalItems > detailItemsPerPage && (
                        <Pagination
                          currentPage={detailCurrentPage}
                          totalPages={detailTotalPages}
                          totalItems={detailTotalItems}
                          itemsPerPage={detailItemsPerPage}
                          onPageChange={(page) => {
                            setDetailCurrentPage(page);
                          }}
                          onItemsPerPageChange={(size) => {
                            setDetailItemsPerPage(size);
                            setDetailCurrentPage(0);
                          }}
                          itemsPerPageOptions={[5, 10, 20, 50]}
                          showItemsPerPage={true}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="mb-6 mt-4 rounded-2xl bg-white p-8 shadow-sm border border-gray-100 text-center">
                      <div className="text-sm text-gray-500">Không có dữ liệu hợp đồng để hiển thị</div>
                    </div>
                  )
                ) : tasksByHospital.length > 0 ? (
                  <div className="mb-6 mt-4 rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-medium text-gray-700">Tổng quan công việc theo bệnh viện</h3>
                      <div className="text-xs text-gray-500">Tổng: {detailTotalItems} công việc / {allTasksByHospital.length} viện</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm table-fixed">
                        <thead className="bg-gray-50">
                          <tr className="text-xs text-gray-600">
                            <th className="px-3 py-2 text-left w-[20%]">Tên bệnh viện</th>
                            <th className="px-3 py-2 text-left w-[25%]">Nội dung công việc</th>
                            <th className="px-3 py-2 text-center w-[10%]">Ngày bắt đầu</th>
                            <th className="px-3 py-2 text-left w-[15%]">Người phụ trách</th>
                            <th className="px-3 py-2 text-center w-[10%]">Trạng thái</th>
                            <th className="px-3 py-2 text-center w-[10%]">Ngày hoàn thành</th>
                            <th className="px-3 py-2 text-center w-[10%]">Thời gian thực hiện</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasksByHospital.map((group, groupIdx) => {
                            // ✅ Tính chi tiết đến giờ: "X ngày Y giờ" hoặc "Y giờ" (nếu < 1 ngày)
                            // - Giữ nguyên timestamp (không normalize) để tính chính xác đến giờ
                            // - Kiểm tra diffTime >= 0 để phát hiện lỗi data (completionDate < startDate)
                            const calculateDuration = (startDate: string | null | undefined, completionDate: string | null | undefined): string => {
                              if (!startDate || !completionDate) return '—';
                              try {
                                const start = new Date(startDate);
                                const end = new Date(completionDate);
                                if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
                                
                                // ✅ Tính diff time (milliseconds) - giữ nguyên timestamp để tính chính xác đến giờ
                                const diffTime = end.getTime() - start.getTime();
                                
                                // ✅ Kiểm tra số âm (completionDate < startDate → lỗi data)
                                if (diffTime < 0) return '—';
                                
                                // ✅ Tính số ngày và số giờ
                                const totalHours = Math.floor(diffTime / (1000 * 60 * 60));
                                const days = Math.floor(totalHours / 24);
                                const hours = totalHours % 24;
                                
                                // ✅ Format: "X ngày Y giờ" hoặc "Y giờ" (nếu < 1 ngày)
                                if (days > 0) {
                                  return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
                                } else {
                                  return hours > 0 ? `${hours} giờ` : '< 1 giờ';
                                }
                              } catch {
                                return '—';
                              }
                            };

                            const isCollapsed = collapsedHospitals.has(group.hospitalName);
                            const toggleCollapse = () => {
                              setCollapsedHospitals(prev => {
                                const next = new Set(prev);
                                if (next.has(group.hospitalName)) {
                                  next.delete(group.hospitalName);
                                } else {
                                  next.add(group.hospitalName);
                                }
                                return next;
                              });
                            };

                            return (
                              <React.Fragment key={groupIdx}>
                                {/* Hospital header row */}
                                <tr className="bg-gray-100 hover:bg-gray-200 cursor-pointer" onClick={toggleCollapse}>
                                  <td colSpan={7} className="px-3 py-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-gray-900">
                                          <svg className={`w-4 h-4 inline-block mr-2 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          </svg>
                                          {group.hospitalName}
                                        </span>
                                        <span className="text-xs text-gray-500">Tổng: {group.tasks.length} công việc</span>
                                        {(() => {
                                          const entry = hospitalTransferMap.get(group.hospitalName);
                                          if (!entry?.transferred) return null;
                                          const at = entry.transferredAt;
                                          const dateStr = at ? new Date(at).toLocaleDateString('vi-VN') : null;
                                          return (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                               Nghiệm thu{dateStr ? ` ${dateStr}` : ''}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                {/* Task rows - only show if not collapsed */}
                                {!isCollapsed && group.tasks.map((task, taskIdx) => (
                                  <tr key={`${groupIdx}-${taskIdx}`} className="border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                                    <td className="px-3 py-2"></td>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-gray-900">{task.name ?? '—'}</div>
                                      <div className="text-xs text-gray-500 mt-0.5">{task.type}</div>
                                    </td>
                                    <td className="px-3 py-2 text-center">{task.startDate ? new Date(task.startDate).toLocaleDateString('vi-VN') : '—'}</td>
                                    <td className="px-3 py-2">{task.picName ?? '—'}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                        String(task.status ?? '').toUpperCase() === 'COMPLETED' || String(task.status ?? '').toUpperCase() === 'HOÀN THÀNH'
                                          ? 'bg-green-100 text-green-800'
                                          : String(task.status ?? '').toUpperCase() === 'IN_PROCESS' || String(task.status ?? '').toUpperCase() === 'ĐANG XỬ LÝ'
                                          ? 'bg-blue-100 text-blue-800'
                                          : String(task.status ?? '').toUpperCase() === 'ISSUE' || String(task.status ?? '').toUpperCase() === 'FAILED' || String(task.status ?? '').toUpperCase() === 'ERROR'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {translateStatus(String(task.status ?? ''))}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">{task.completionDate ? new Date(task.completionDate).toLocaleDateString('vi-VN') : '—'}</td>
                                    <td className="px-3 py-2 text-center">
                                      {task.startDate && task.completionDate ? (
                                        <span className="text-gray-700">{calculateDuration(task.startDate, task.completionDate)}</span>
                                      ) : task.startDate ? (
                                        <span className="text-gray-500">{calculateDuration(task.startDate, new Date().toISOString())}</span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {detailTotalPages > 1 && (
                      <div className="mt-4">
                      <Pagination
                        currentPage={detailCurrentPage}
                        totalPages={detailTotalPages}
                        totalItems={detailTotalItems}
                        itemsPerPage={detailItemsPerPage}
                        onPageChange={(page) => {
                          setDetailCurrentPage(page);
                        }}
                        onItemsPerPageChange={(size) => {
                          setDetailItemsPerPage(size);
                          setDetailCurrentPage(0);
                        }}
                          itemsPerPageOptions={[5, 10, 20, 50]}
                        showItemsPerPage={true}
                      />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-6 mt-4 rounded-2xl bg-white p-8 shadow-sm border border-gray-100 text-center">
                    <div className="text-sm text-gray-500">Không có dữ liệu công việc để hiển thị</div>
                  </div>
                )
                }

                {hasLoadedProfile && (
                  <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* Triển khai */}
                    {(selectedTeam?.toLowerCase().includes('triển khai') || selectedTeam?.toLowerCase().includes('trienkhai')) && (
                      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-medium text-gray-700">Triển khai ({profileImplTasks.length})</h3>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Lọc trạng thái</label>
                            <select value={implStatusFilter} onChange={(e) => { setImplStatusFilter(e.target.value); setImplCurrentPage(0); }} className="rounded-md border px-2 py-1 text-sm bg-white">
                              <option value="all">Tất cả</option>
                              {implStatusOptions.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3">
                          {profileImplTasks.length === 0 ? (
                            <div className="text-sm text-gray-500">Không có</div>
                          ) : (
                            <div className="overflow-x-auto mt-2">
                              <table className="min-w-full text-sm table-auto">
                                <thead>
                                  <tr className="text-xs text-gray-600 bg-gray-50">
                                    <th className="px-2 py-1 text-center">ID</th>
                                    <th className="px-2 py-1 text-center">Tên</th>
                                    <th className="px-2 py-1 text-center">PIC</th>
                                    <th className="px-2 py-1 text-center">Trạng thái</th>
                                    <th className="px-2 py-1 text-center">Ngày bắt đầu</th>
                                    <th className="px-2 py-1 text-center">Ngày hoàn thành</th>
                                    <th className="px-2 py-1 text-center">Phần cứng</th>
                                    <th className="px-2 py-1 text-center">Số lượng</th>
                                    <th className="px-2 py-1 text-center">Yêu cầu bổ sung</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedImplTasks.map((t) => (
                                    <tr key={t.id} className="border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                                      <td className="px-2 py-2 align-middle text-center">{t.id}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.name ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.picDeploymentName ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{translateStatus(String(t.status ?? ''))}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.startDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.completionDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '—')}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.quantity ?? 0}</td>
                                      <td className="px-2 py-2 align-middle text-center">{getSupplementRequest(t as unknown as Record<string, unknown>) ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        {implTotalPages > 1 && (
                          <div className="mt-4">
                            <Pagination
                              currentPage={implCurrentPage}
                              totalPages={implTotalPages}
                              totalItems={filteredImplTasks.length}
                              itemsPerPage={implItemsPerPage}
                              onPageChange={(page) => {
                                setImplCurrentPage(page);
                              }}
                              onItemsPerPageChange={(size) => {
                                setImplItemsPerPage(size);
                                setImplCurrentPage(0);
                              }}
                              itemsPerPageOptions={[5, 10, 20, 50]}
                              showItemsPerPage={true}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Phát triển */}
                    {(selectedTeam?.toLowerCase().includes('phát triển') || selectedTeam?.toLowerCase().includes('phattrien') || selectedTeam?.toLowerCase().includes('dev')) && (
                      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-medium text-gray-700">Phát triển ({profileDevTasks.length})</h3>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Lọc trạng thái</label>
                            <select value={devStatusFilter} onChange={(e) => setDevStatusFilter(e.target.value)} className="rounded-md border px-2 py-1 text-sm bg-white">
                              <option value="all">Tất cả</option>
                              {devStatusOptions.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3">
                          {profileDevTasks.length === 0 ? (
                            <div className="text-sm text-gray-500">Không có</div>
                          ) : (
                            <div className="overflow-x-auto mt-2">
                              <table className="min-w-full text-sm table-auto">
                                <thead>
                                  <tr className="text-xs text-gray-600 bg-gray-50">
                                    <th className="px-2 py-1 text-center">ID</th>
                                    <th className="px-2 py-1 text-center">Tên</th>
                                    <th className="px-2 py-1 text-center">PIC</th>
                                    <th className="px-2 py-1 text-center">Trạng thái</th>
                                    <th className="px-2 py-1 text-center">Ngày bắt đầu</th>
                                    <th className="px-2 py-1 text-center">Ngày kết thúc</th>
                                    <th className="px-2 py-1 text-center">Phần cứng</th>
                                    <th className="px-2 py-1 text-center">Số lượng</th>
                                    <th className="px-2 py-1 text-center">Yêu cầu bổ sung</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredDevTasks.map((t) => (
                                    <tr key={t.id} className="border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                                      <td className="px-2 py-2 align-middle text-center">{t.id}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.name ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.picDeploymentName ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{translateStatus(String(t.status ?? ''))}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.startDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.endDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '—')}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.quantity ?? 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bảo trì - own card - chỉ hiển thị nếu team chứa "Bảo trì" */}
                    {(selectedTeam?.toLowerCase().includes('bảo trì') || selectedTeam?.toLowerCase().includes('baotri')) && (
                      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-medium text-gray-700">Bảo trì ({profileMaintTasks.length})</h3>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Lọc trạng thái</label>
                            <select value={maintStatusFilter} onChange={(e) => { setMaintStatusFilter(e.target.value); setMaintCurrentPage(0); }} className="rounded-md border px-2 py-1 text-sm bg-white">
                              <option value="all">Tất cả</option>
                              {maintStatusOptions.map(s => <option key={s} value={s}>{translateStatus(s)}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="mt-3">
                          {profileMaintTasks.length === 0 ? (
                            <div className="text-sm text-gray-500">Không có</div>
                          ) : (
                            <div className="overflow-x-auto mt-2">
                              <table className="min-w-full text-sm table-auto">
                                <thead>
                                  <tr className="text-xs text-gray-600 bg-gray-50">
                                    <th className="px-2 py-1 text-center">ID</th>
                                    <th className="px-2 py-1 text-center">Tên</th>
                                    <th className="px-2 py-1 text-center">PIC</th>
                                    <th className="px-2 py-1 text-center">Trạng thái</th>
                                    <th className="px-2 py-1 text-center">Ngày bắt đầu</th>
                                    <th className="px-2 py-1 text-center">Ngày kết thúc</th>
                                    <th className="px-2 py-1 text-center">Phần cứng</th>
                                    <th className="px-2 py-1 text-center">Số lượng</th>
                                    <th className="px-2 py-1 text-center">Yêu cầu bổ sung</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedMaintTasks.map((t) => (
                                    <tr key={t.id} className="border-t odd:bg-white even:bg-gray-50 hover:bg-gray-100">
                                      <td className="px-2 py-2 align-middle text-center">{t.id}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.name ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.picDeploymentName ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{translateStatus(String(t.status ?? ''))}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.startDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.endDate ?? '—'}</td>
                                      <td className="px-2 py-2 align-middle text-center">{hardwareMap[String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '')] ?? String((((t as unknown) as Record<string, unknown>)['hardwareId']) ?? '—')}</td>
                                      <td className="px-2 py-2 align-middle text-center">{t.quantity ?? 0}</td>
                                      <td className="px-2 py-2 align-middle text-center">{getSupplementRequest(t as unknown as Record<string, unknown>) ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        {maintTotalPages > 1 && (
                          <div className="mt-4">
                            <Pagination
                              currentPage={maintCurrentPage}
                              totalPages={maintTotalPages}
                              totalItems={filteredMaintTasks.length}
                              itemsPerPage={maintItemsPerPage}
                              onPageChange={(page) => {
                                setMaintCurrentPage(page);
                              }}
                              onItemsPerPageChange={(size) => {
                                setMaintItemsPerPage(size);
                                setMaintCurrentPage(0);
                              }}
                              itemsPerPageOptions={[5, 10, 20, 50]}
                              showItemsPerPage={true}
                            />
                      </div>
                    )}
                          </div>
                        )}

                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Hardware report widget on dashboard */}
        <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 w-full">
          <div className="max-w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-800">Báo cáo Phần cứng</h2>
                <p className="text-sm text-gray-500 mt-1">Sản phẩm bán chạy & mức độ sử dụng (top theo doanh thu)</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500">Nhóm theo</label>
                <select value={hwGroupBy} onChange={(e) => setHwGroupBy(e.target.value as 'hardware' | 'type' | 'supplier')} className="rounded-md border px-3 py-2 text-sm bg-white">
                  <option value="hardware">Phần cứng</option>
                  <option value="type">Loại</option>
                  <option value="supplier">Nhà cung cấp</option>
                </select>
                <label className="text-sm text-gray-500">Hàng đầu</label>
                <select value={String(hwTopN)} onChange={(e) => setHwTopN(Number(e.target.value))} className="rounded-md border px-3 py-2 text-sm bg-white">
                  {[5,8,10,20].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={() => void loadHardwareReport()} disabled={hwLoading} className="rounded-md bg-indigo-600 text-white px-3 py-2 text-sm">Tải lại</button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-medium text-gray-700">Hàng đầu theo doanh thu</h3>
                <div className="mt-3">
                  <Chart
                    options={{
                      chart: { toolbar: { show: false } },
                      plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
                      xaxis: { categories: hwRows.map(r => r.label) },
                      dataLabels: { enabled: false },
                      tooltip: { y: { formatter: (v: number) => `${v.toLocaleString()} VNĐ` } },
                      colors: ['#465fff'],
                    }}
                    
                    series={[{ name: 'Doanh thu', data: hwRows.map(r => Math.round(r.revenue)) }]}
                    type="bar"
                    height={320}
                    width="100%"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">Chi tiết hàng đầu</h3>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm table-auto">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="px-3 py-2">Sản phẩm</th>
                        <th className="px-3 py-2">Danh mục</th>
                        <th className="px-3 py-2 text-right">Doanh thu</th>
                        <th className="px-3 py-2 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const displayed = hwRows.filter(r => r.label !== '-');
                        return displayed.map(r => (
                          <tr key={r.key} className="border-t">
                          <td className="px-3 py-3 align-top">
                            <div className="flex items-center gap-3">
                              {r.image ? (
                                // if image url available show thumbnail
                                <img src={r.image} alt={r.label} className="h-10 w-10 rounded-md object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">{(r.label || '?').charAt(0)}</div>
                              )}
                              <div>
                                <div className="font-medium text-gray-900">{r.label}</div>
                                <div className="text-xs text-gray-500">{r.quantity} Cái</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-600 align-top">
                            {r.impl ? 'Triển khai' : r.dev ? 'Phát triển' : r.maint ? 'Bảo trì' : '—'}
                          </td>
                          <td className="px-3 py-3 text-right font-medium align-top">{new Intl.NumberFormat('vi-VN').format(Math.round(r.revenue))} ₫</td>
                          <td className="px-3 py-3 text-right align-top">
                            {/* revenue-based status badge */}
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${r.revenue > 1000000 ? 'bg-emerald-100 text-emerald-700' : r.revenue > 500000 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {r.revenue > 1000000 ? 'Tốt nhất' : r.revenue > 500000 ? 'Tốt' : 'Thấp'}
                            </span>
                          </td>
                        </tr>
                        ));
                      })()}
                      {hwRows.filter(r => r.label !== '-').length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Không có dữ liệu</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}