
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import "./index.css";
import Dashboard from "./pages/Dashboard";
import { clearAuthentication, dashboardPaths } from "./services/auth";
import PublicSiteLayout from "./components/PublicSiteLayout";
import HomePage from "./pages/HomePage";
import AboutPage from "./pages/AboutPage";
import CoursesPage from "./pages/CoursesPage";
import PlacementProcessPage from "./pages/PlacementProcessPage";
import TrainingMethodologyPage from "./pages/TrainingMethodologyPage";
import ContactPage from "./pages/ContactPage";

export default function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    if (pathname !== "/") {
      sessionStorage.removeItem("ssa_home_visit_active");
      sessionStorage.removeItem("ssa_home_visit_weather");
    }
  }, [pathname]);

  return (
    <Routes>
      <Route element={<PublicSiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="placement-process" element={<PlacementProcessPage />} />
        <Route path="training-methodology" element={<TrainingMethodologyPage />} />
        <Route path="contact" element={<ContactPage />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/login/:legacyRole" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
      <Route path="/manager/dashboard" element={<ProtectedDashboard requiredRole="manager" />} />
      <Route path="/hr/dashboard" element={<ProtectedDashboard requiredRole="hr" />} />
      <Route path="/trainer/dashboard" element={<ProtectedDashboard requiredRole="trainer" />} />
      <Route path="/student/dashboard" element={<ProtectedDashboard requiredRole="student" />} />
      <Route path="/dashboard/:role" element={<LegacyDashboard />} />
      <Route path="/dashboard/:role/:section" element={<LegacyDashboard />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("ssa_user") || "null");
  } catch {
    return null;
  }
}

function ProtectedDashboard({ requiredRole }) {
  const storedUser = readStoredUser();
  if (!localStorage.getItem("ssa_access") || !storedUser || !dashboardPaths[storedUser.role]) {
    clearAuthentication();
    return <Navigate to="/login" replace />;
  }
  if (storedUser.role !== requiredRole) {
    return <Navigate to={dashboardPaths[storedUser.role]} replace />;
  }
  return <Dashboard roleOverride={requiredRole} />;
}

function LegacyDashboard() {
  const { role, section } = useParams();
  if (!dashboardPaths[role]) return <Navigate to="/login" replace />;
  if (section) {
    return <LegacySectionDashboard role={role} />;
  }
  return <Navigate to={dashboardPaths[role]} replace />;
}

function LegacySectionDashboard({ role }) {
  const storedUser = readStoredUser();
  if (!localStorage.getItem("ssa_access") || !storedUser || !dashboardPaths[storedUser.role]) {
    clearAuthentication();
    return <Navigate to="/login" replace />;
  }
  if (storedUser.role !== role) {
    return <Navigate to={dashboardPaths[storedUser.role]} replace />;
  }
  return <Dashboard roleOverride={role} />;
}
