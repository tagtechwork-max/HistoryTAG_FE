import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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
import Calendar from "./pages/Calendar";
import BusinessCalendar from "./pages/Calendar/BusinessCalendar";
import DeploymentCalendar from "./pages/Calendar/DeploymentCalendar";
import MaintenanceCalendar from "./pages/Calendar/MaintenanceCalendar";
import FormElements from "./pages/Forms/FormElements";
import AppLayout from "./layout/AppLayout";
import SuperAdminLayout from "./layout/SuperAdminLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import DeploymentDashboard from "./pages/Dashboard/DeploymentDashboard";
import ImplementationTasksPage from "./pages/PageClients/implementation-tasks";
import DevTasksPage from "./pages/PageClients/dev-tasks";
import MaintenanceTasksPage from "./pages/PageClients/maintenance-tasks";
import OtherTasksPage from "./pages/PageClients/other-tasks";
import Hospitals from "./pages/Page/Hospitals";
import HisSystemPage from "./pages/Page/HisSystem";
import HccFacilitiesPage from "./pages/Page/HccFacilities";
import SuperAdminHome from "./pages/SuperAdmin/Home";
import SuperAdminUsers from "./pages/SuperAdmin/Users";
import ListActivity from "./pages/UserAnalytics/ListActivity";
import Agencies from "./pages/SuperAdmin/Agencies";
import Hardware from "./pages/SuperAdmin/Hardware";
import SuperAdminProfile from "./pages/SuperAdmin/Profile";
import ImplementSuperTaskPage from "./pages/SuperAdmin/implementsuper-task";
import ListHospitalImplementation from "./pages/implementationTaskNew/ListHospitalImplementation";
import PhaseImplementation from "./pages/implementationTaskNew/SubImplementationTask/PhaseImplementation";
import TaskPhaseImplementation from "./pages/implementationTaskNew/SubImplementationTask/TaskPhaseImplementation";
import DevSuperTaskPage from "./pages/SuperAdmin/devsupertask";
import MaintenanceSuperTaskPage from "./pages/SuperAdmin/maintenacesuper-task";
import AllNotificationsPage from "./pages/Notifications/AllNotificationsPage";
import BusinessPage from "./pages/Admin/Business";
import MaintainContractsPage from "./pages/CustomerCare/MaintainContracts";
import HospitalCareList from "./pages/CustomerCare/HospitalCareList";
import HospitalDetailView from "./pages/CustomerCare/View/HospitalDetailView";
import HospitalDetail from "./pages/CustomerCare/HospitalDetail";
import LogOT from "./pages/PageClients/LogOT";
import SuperAdminLogOT from "./pages/SuperAdmin/LogOT";
import MapHospitals from "./pages/Utility/MapHospitals";
import DocumentLinksPage from "./pages/Utility/DocumentLinksPage";
import ListTicketPage from "./pages/Ticket/listticket";
import ToolEncryption from "./pages/Tool/ToolEncryption";
import { AuthProvider } from "./contexts/AuthContext";

// Helper to check SuperAdmin role
function checkIsSuperAdmin(): boolean {
  try {
    const rolesStr = localStorage.getItem("roles") || sessionStorage.getItem("roles");
    if (!rolesStr) return false;
    const roles = JSON.parse(rolesStr);
    if (!Array.isArray(roles)) return false;
    
    const normalizeRole = (r: unknown): string => {
      if (typeof r === "string") return r.toUpperCase();
      if (r && typeof r === "object") {
        const rr = r as Record<string, unknown>;
        const roleName = rr.roleName || rr.role_name || rr.role;
        if (typeof roleName === "string") return roleName.toUpperCase();
      }
      return "";
    };
    
    return roles.map(normalizeRole).some(r => r === "SUPERADMIN" || r === "SUPER_ADMIN");
  } catch {
    return false;
  }
}

// Profile Route - redirect based on role BEFORE rendering any layout
const ProfileRoute = () => {
  const isSuperAdmin = checkIsSuperAdmin();
  // Redirect ngay lập tức, không render layout nào cả
  return <Navigate to={isSuperAdmin ? "/superadmin/profile" : "/admin/profile"} replace />;
};

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  
  if (!token) { 
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
        <Routes>
          {/* Default redirect to Sign In */}
          <Route path="/" element={<Navigate to="/signin" replace />} />
          
          {/* Profile redirect - check role before entering any layout */}
          <Route path="/profile" element={<ProtectedRoute><ProfileRoute /></ProtectedRoute>} />

          {/* Super Admin Layout - Protected */}
          <Route element={<ProtectedRoute><SuperAdminLayout /></ProtectedRoute>}>
            <Route path="/superadmin/home" element={<SuperAdminHome />} />
            <Route path="/superadmin/deployment-dashboard" element={<DeploymentDashboard />} />
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
            <Route path="/superadmin/profile" element={<SuperAdminProfile />} />
            {/* SuperAdmin notifications - keep layout consistent for superadmin users */}
            {/* SuperAdmin Business (reuse Admin Business page) */}
            <Route path="/superadmin/business" element={<BusinessPage />} />
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

            {/* Admin - Business department */}
            <Route path="/admin/business" element={<BusinessPage />} />
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
      </Router>
    </div>
  );
}
