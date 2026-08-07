import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { Toaster } from "react-hot-toast";
import AppLayout from "./layout/AppLayout";
import SuperAdminLayout from "./layout/SuperAdminLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { useAuth } from "./contexts/AuthContext";
import { getAuthToken, getStoredAccessToken, isTokenExpired } from "./api/client";
import { isSuperAdmin as checkIsSuperAdminFromToken } from "./utils/permission";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const route = lazyWithRetry;
const SignIn = route("signin", () => import("./pages/AuthPages/SignIn"));
const SignUp = route("signup", () => import("./pages/AuthPages/SignUp"));
const ForgotPassword = route("forgot-password", () => import("./pages/AuthPages/ForgotPassword"));
const ResetPassword = route("reset-password", () => import("./pages/AuthPages/ResetPassword"));
const NotFound = route("not-found", () => import("./pages/OtherPage/NotFound"));
const UserProfiles = route("user-profiles", () => import("./pages/UserProfiles"));
const Videos = route("videos", () => import("./pages/UiElements/Videos"));
const Images = route("images", () => import("./pages/UiElements/Images"));
const Alerts = route("alerts", () => import("./pages/UiElements/Alerts"));
const Badges = route("badges", () => import("./pages/UiElements/Badges"));
const Avatars = route("avatars", () => import("./pages/UiElements/Avatars"));
const Buttons = route("buttons", () => import("./pages/UiElements/Buttons"));
const LineChart = route("line-chart", () => import("./pages/Charts/LineChart"));
const BarChart = route("bar-chart", () => import("./pages/Charts/BarChart"));
const FormElements = route("form-elements", () => import("./pages/Forms/FormElements"));
const Calendar = route("calendar", () => import("./pages/Calendar"));
const BusinessCalendar = route("business-calendar", () => import("./pages/Calendar/BusinessCalendar"));
const DeploymentCalendar = route("deployment-calendar", () => import("./pages/Calendar/DeploymentCalendar"));
const MaintenanceCalendar = route("maintenance-calendar", () => import("./pages/Calendar/MaintenanceCalendar"));
const Home = route("home", () => import("./pages/Dashboard/Home"));
const DeploymentDashboard = route("deployment-dashboard", () => import("./pages/Dashboard/DeploymentDashboard"));
const TicketStatistics = route("ticket-statistics", () => import("./pages/Dashboard/TicketStatistics"));
const ImplementationTasksPage = route("implementation-tasks", () => import("./pages/PageClients/implementation-tasks"));
const DevTasksPage = route("dev-tasks", () => import("./pages/PageClients/dev-tasks"));
const MaintenanceTasksPage = route("maintenance-tasks", () => import("./pages/PageClients/maintenance-tasks"));
const OtherTasksPage = route("other-tasks", () => import("./pages/PageClients/other-tasks"));
const TicketSentDevPage = route("ticket-sent-dev", () => import("./pages/PageClients/ticket-sent-dev"));
const Hospitals = route("hospitals", () => import("./pages/Page/Hospitals"));
const HisSystemPage = route("his-system", () => import("./pages/Page/HisSystem"));
const HccFacilitiesPage = route("hcc-facilities", () => import("./pages/Page/HccFacilities"));
const SuperAdminHome = route("superadmin-home", () => import("./pages/SuperAdmin/Home"));
const SuperAdminUsers = route("superadmin-users", () => import("./pages/SuperAdmin/Users"));
const ListActivity = route("list-activity", () => import("./pages/UserAnalytics/ListActivity"));
const Agencies = route("agencies", () => import("./pages/SuperAdmin/Agencies"));
const Suppliers = route("suppliers", () => import("./pages/SuperAdmin/Suppliers"));
const Hardware = route("hardware", () => import("./pages/SuperAdmin/Hardware"));
const SuperAdminProfile = route("superadmin-profile", () => import("./pages/SuperAdmin/Profile"));
const ImplementSuperTaskPage = route("implement-super-task", () => import("./pages/SuperAdmin/implementsuper-task"));
const ListHospitalImplementation = route("list-hospital-implementation", () => import("./pages/implementationTaskNew/ListHospitalImplementation"));
const PhaseImplementation = route("phase-implementation", () => import("./pages/implementationTaskNew/SubImplementationTask/PhaseImplementation"));
const TaskPhaseImplementation = route("task-phase-implementation", () => import("./pages/implementationTaskNew/SubImplementationTask/TaskPhaseImplementation"));
const DevSuperTaskPage = route("dev-super-task", () => import("./pages/SuperAdmin/devsupertask"));
const MaintenanceSuperTaskPage = route("maintenance-super-task", () => import("./pages/SuperAdmin/maintenacesuper-task"));
const AllNotificationsPage = route("all-notifications", () => import("./pages/Notifications/AllNotificationsPage"));
const BusinessPage = route("business", () => import("./pages/Admin/Business"));
const MaintainContractsPage = route("maintain-contracts", () => import("./pages/CustomerCare/MaintainContracts"));
const PurchaseOrders = route("purchase-orders", () => import("./pages/Admin/PurchaseOrders"));
const HospitalCareList = route("hospital-care-list", () => import("./pages/CustomerCare/HospitalCareList"));
const HospitalDetail = route("hospital-detail", () => import("./pages/CustomerCare/HospitalDetail"));
const LogOT = route("log-ot", () => import("./pages/PageClients/LogOT"));
const SuperAdminLogOT = route("superadmin-log-ot", () => import("./pages/SuperAdmin/LogOT"));
const MapHospitals = route("map-hospitals", () => import("./pages/Utility/MapHospitals"));
const DocumentLinksPage = route("document-links", () => import("./pages/Utility/DocumentLinksPage"));
const ListTicketPage = route("tickets", () => import("./pages/Ticket/listticket"));
const ToolEncryption = route("tool-encryption", () => import("./pages/Tool/ToolEncryption"));

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
            <Route path="/superadmin/suppliers" element={<Suppliers />} />
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
