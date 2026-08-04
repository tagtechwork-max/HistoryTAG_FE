import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster } from "react-hot-toast";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import ForgotPassword from "./pages/AuthPages/ForgotPassword";
import ResetPassword from "./pages/AuthPages/ResetPassword";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import Videos from "./pages/UiElements/Videos";
import Images from "./pages/UiElements/Images";
import Alerts from "./pages/UiElements/Alerts";
import Badges from "./pages/UiElements/Badges";
import Avatars from "./pages/UiElements/Avatars";
import Buttons from "./pages/UiElements/Buttons";
import LineChart from "./pages/Charts/LineChart";
import BarChart from "./pages/Charts/BarChart";
import FormElements from "./pages/Forms/FormElements";
import AppLayout from "./layout/AppLayout";
import SuperAdminLayout from "./layout/SuperAdminLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { getAuthToken, getStoredAccessToken, isTokenExpired } from "./api/client";
import { isSuperAdmin as checkIsSuperAdminFromToken } from "./utils/permission";

const Calendar = lazy(() => import("./pages/Calendar"));
const BusinessCalendar = lazy(() => import("./pages/Calendar/BusinessCalendar"));
const DeploymentCalendar = lazy(() => import("./pages/Calendar/DeploymentCalendar"));
const MaintenanceCalendar = lazy(() => import("./pages/Calendar/MaintenanceCalendar"));
const Home = lazy(() => import("./pages/Dashboard/Home"));
const DeploymentDashboard = lazy(() => import("./pages/Dashboard/DeploymentDashboard"));
const TicketStatistics = lazy(() => import("./pages/Dashboard/TicketStatistics"));
const ImplementationTasksPage = lazy(() => import("./pages/PageClients/implementation-tasks"));
const DevTasksPage = lazy(() => import("./pages/PageClients/dev-tasks"));
const MaintenanceTasksPage = lazy(() => import("./pages/PageClients/maintenance-tasks"));
const OtherTasksPage = lazy(() => import("./pages/PageClients/other-tasks"));
const TicketSentDevPage = lazy(() => import("./pages/PageClients/ticket-sent-dev"));
const Hospitals = lazy(() => import("./pages/Page/Hospitals"));
const HisSystemPage = lazy(() => import("./pages/Page/HisSystem"));
const HccFacilitiesPage = lazy(() => import("./pages/Page/HccFacilities"));
const SuperAdminHome = lazy(() => import("./pages/SuperAdmin/Home"));
const SuperAdminUsers = lazy(() => import("./pages/SuperAdmin/Users"));
const ListActivity = lazy(() => import("./pages/UserAnalytics/ListActivity"));
const Agencies = lazy(() => import("./pages/SuperAdmin/Agencies"));
const Hardware = lazy(() => import("./pages/SuperAdmin/Hardware"));
const SuperAdminProfile = lazy(() => import("./pages/SuperAdmin/Profile"));
const ImplementSuperTaskPage = lazy(() => import("./pages/SuperAdmin/implementsuper-task"));
const ListHospitalImplementation = lazy(() => import("./pages/implementationTaskNew/ListHospitalImplementation"));
const PhaseImplementation = lazy(() => import("./pages/implementationTaskNew/SubImplementationTask/PhaseImplementation"));
const TaskPhaseImplementation = lazy(() => import("./pages/implementationTaskNew/SubImplementationTask/TaskPhaseImplementation"));
const DevSuperTaskPage = lazy(() => import("./pages/SuperAdmin/devsupertask"));
const MaintenanceSuperTaskPage = lazy(() => import("./pages/SuperAdmin/maintenacesuper-task"));
const AllNotificationsPage = lazy(() => import("./pages/Notifications/AllNotificationsPage"));
const BusinessPage = lazy(() => import("./pages/Admin/Business"));
const MaintainContractsPage = lazy(() => import("./pages/CustomerCare/MaintainContracts"));
const PurchaseOrders = lazy(() => import("./pages/Admin/PurchaseOrders"));
const HospitalCareList = lazy(() => import("./pages/CustomerCare/HospitalCareList"));
const HospitalDetail = lazy(() => import("./pages/CustomerCare/HospitalDetail"));
const LogOT = lazy(() => import("./pages/PageClients/LogOT"));
const SuperAdminLogOT = lazy(() => import("./pages/SuperAdmin/LogOT"));
const MapHospitals = lazy(() => import("./pages/Utility/MapHospitals"));
const DocumentLinksPage = lazy(() => import("./pages/Utility/DocumentLinksPage"));
const ListTicketPage = lazy(() => import("./pages/Ticket/listticket"));
const ToolEncryption = lazy(() => import("./pages/Tool/ToolEncryption"));

// Profile Route - redirect based on role BEFORE rendering any layout
const ProfileRoute = () => {
  const isSuperAdmin = checkIsSuperAdminFromToken();
  // Redirect ngay lập tức, không render layout nào cả
  return <Navigate to={isSuperAdmin ? "/superadmin/profile" : "/admin/profile"} replace />;
};

// Protected Route Component — reactive to AuthContext (refresh / session expiry)
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isLoading, roles } = useAuth();
  const stored = getStoredAccessToken();

  if (isLoading) {
    return null;
  }

  if (!stored) {
    return <Navigate to="/signin" replace />;
  }

  // Refresh failed: AuthContext cleared token but stale JWT may remain in storage
  if (roles.length === 0 && isTokenExpired(stored) && !getAuthToken()) {
    return <Navigate to="/signin" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  // Check if user is authenticated
  // @ts-ignore
  const isAuthenticated = () => {
    const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
    return !!token;
  };

  // ✅ Note: getUserRoles và isSuperAdmin functions giữ lại để backward compatibility
  // ✅ Nhưng trong components, nên dùng useAuth() hook từ AuthContext

  return (
    <div className="font-outfit overflow-x-hidden w-full max-w-full">
          <Toaster
            position="top-right"
            containerStyle={{
              zIndex: 100003,
            }}
            toastOptions={{
              duration: 3000,
              style: {
                background: '#fff',
                color: '#363636',
                padding: '16px',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                zIndex: 100003,
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
                duration: 6000, // Lỗi hiển thị lâu hơn
              },
            }}
          />
          <Router>
        <ScrollToTop />
        <Suspense fallback={<div className="min-h-[40vh]" aria-label="Đang tải trang" />}>
        <Routes>
          {/* Default redirect to Sign In */}
          <Route path="/" element={<Navigate to="/signin" replace />} />
          
          {/* Profile redirect - check role before entering any layout */}
          <Route path="/profile" element={<ProtectedRoute><ProfileRoute /></ProtectedRoute>} />

          {/* Super Admin Layout - Protected */}
          <Route element={<ProtectedRoute><SuperAdminLayout /></ProtectedRoute>}>
            <Route path="/superadmin/home" element={<SuperAdminHome />} />
            <Route path="/superadmin/deployment-dashboard" element={<DeploymentDashboard />} />
            <Route path="/superadmin/ticket-statistics" element={<TicketStatistics />} />
            <Route path="/superadmin/users" element={<SuperAdminUsers />} />
            <Route
              path="/superadmin/user-analytics/:userId"
              element={<Navigate to="/superadmin/user-analytics" replace />}
            />
            <Route path="/superadmin/user-analytics" element={<ListActivity />} />
            <Route path="/superadmin/hospitals" element={<Hospitals />} />
            <Route path="/superadmin/his-systems" element={<HisSystemPage />} />
            <Route path="/superadmin/hcc-facilities" element={<HccFacilitiesPage />} />
            <Route path="/superadmin/agencies" element={<Agencies />} />
            <Route path="/superadmin/hardware" element={<Hardware />} />
            {/* SuperAdmin-specific task pages */}
            <Route path="/superadmin/implementation-tasks" element={<ImplementSuperTaskPage />} />
            <Route path="/superadmin/implementation-tasks-new" element={<ListHospitalImplementation />} />
            <Route path="/superadmin/implementation-tasks-new/:hospitalId" element={<PhaseImplementation />} />
            <Route path="/superadmin/implementation-tasks-new/:hospitalId/:phaseId" element={<TaskPhaseImplementation />} />
            <Route path="/superadmin/dev-tasks" element={<DevSuperTaskPage />} />
            <Route path="/superadmin/maintenance-tasks" element={<MaintenanceSuperTaskPage />} />
            <Route path="/superadmin/other-tasks" element={<OtherTasksPage />} />
            <Route path="/superadmin/ticket-sent-dev" element={<TicketSentDevPage />} />
            <Route path="/superadmin/profile" element={<SuperAdminProfile />} />
            {/* SuperAdmin notifications - keep layout consistent for superadmin users */}
            {/* SuperAdmin Business (reuse Admin Business page) */}
            <Route path="/superadmin/business" element={<BusinessPage />} />
            <Route path="/superadmin/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/superadmin/maintain-contracts" element={<MaintainContractsPage />} />
            <Route path="/superadmin/notifications" element={<AllNotificationsPage />} />
            <Route path="/superadmin/calendar" element={<Calendar />} />
            <Route path="/superadmin/calendar/business" element={<BusinessCalendar />} />
            <Route path="/superadmin/calendar/deployment" element={<DeploymentCalendar />} />
            <Route path="/superadmin/calendar/maintenance" element={<MaintenanceCalendar />} />
            <Route path="/superadmin/hospital-care" element={<HospitalCareList />} />
            <Route path="/superadmin/hospital-care/:id" element={<HospitalDetail />} />
            <Route path="/superadmin/log-ot" element={<SuperAdminLogOT />} />
            <Route path="/superadmin/utility/map-hospitals" element={<MapHospitals />} />
            <Route path="/superadmin/utility/document-links" element={<DocumentLinksPage />} />
            <Route path="/superadmin/tickets" element={<ListTicketPage />} />

          </Route>

          {/* Dashboard Layout - Protected */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/home" element={<Home />} />
            <Route path="/deployment-dashboard" element={<DeploymentDashboard />} />
            <Route path="/ticket-statistics" element={<TicketStatistics />} />

            {/* Admin - Business department */}
            <Route path="/admin/business" element={<BusinessPage />} />
            <Route path="/admin/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/admin/maintain-contracts" element={<MaintainContractsPage />} />
            <Route path="/admin/hospital-care" element={<HospitalCareList />} />
            <Route path="/admin/hospital-care/:id" element={<HospitalDetail />} />
            {/* OT approval: same page as SuperAdmin, allowed for ADMIN when granted */}
            <Route path="/admin/log-ot-approval" element={<SuperAdminLogOT />} />

            {/* Others Page */}
            <Route path="/admin/profile" element={<UserProfiles />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/calendar/business" element={<BusinessCalendar />} />
            <Route path="/calendar/deployment" element={<DeploymentCalendar />} />
            <Route path="/calendar/maintenance" element={<MaintenanceCalendar />} />
            <Route path="/implementation-tasks" element={<ImplementationTasksPage />} />
            <Route path="/implementation-tasks-new" element={<ListHospitalImplementation />} />
            <Route path="/implementation-tasks-new/:hospitalId" element={<PhaseImplementation />} />
            <Route path="/implementation-tasks-new/:hospitalId/:phaseId" element={<TaskPhaseImplementation />} />
            <Route path="/dev-tasks" element={<DevTasksPage />} />
            <Route path="/maintenance-tasks" element={<MaintenanceTasksPage />} />
            <Route path="/other-tasks" element={<OtherTasksPage />} />
            <Route path="/ticket-sent-dev" element={<TicketSentDevPage />} />

            {/* Forms */}
            <Route path="/form-elements" element={<FormElements />} />

            {/* Tables */}
            <Route path="/hospitals" element={<Hospitals />} />
            <Route path="/his-sys" element={<HisSystemPage />} />
            <Route path="/hcc-facilities" element={<HccFacilitiesPage />} />

            {/* Ui Elements */}
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/avatars" element={<Avatars />} />
            <Route path="/badge" element={<Badges />} />
            <Route path="/buttons" element={<Buttons />} />
            <Route path="/images" element={<Images />} />
            <Route path="/videos" element={<Videos />} />

            {/* Charts */}
            <Route path="/line-chart" element={<LineChart />} />
            <Route path="/bar-chart" element={<BarChart />} />
            <Route path="/notifications" element={<AllNotificationsPage />} />
            <Route path="/log-ot" element={<LogOT />} />
            <Route path="/utility/map-hospitals" element={<MapHospitals />} />
            <Route path="/utility/document-links" element={<DocumentLinksPage />} />
            <Route path="/tickets" element={<ListTicketPage />} />
            <Route path="/tool-encryption" element={<ToolEncryption />} />
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </Router>
    </div>
  );
}
