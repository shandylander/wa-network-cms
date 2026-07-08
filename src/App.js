import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import ToastContainer from './components/UI/Toast';
import LoginForm      from './components/Auth/LoginForm';
import ForcePinChange from './components/Auth/ForcePinChange';
import Layout         from './components/Layout/Layout';
import Home           from './pages/Home';
import Profile        from './pages/Profile';
import Settings       from './pages/Settings/Settings';
import UserManagement from './pages/Settings/UserManagement';
import Permissions    from './pages/Settings/Permissions';
import AccessLevels   from './pages/Settings/AccessLevels';
import ProjectList    from './pages/Projects/ProjectList';
import ProjectDetail  from './pages/Projects/ProjectDetail';
import WorkerRegistry from './pages/Workers/WorkerRegistry';
import HSEHome        from './pages/HSE/HSEHome';
import Attendance      from './pages/Attendance/Attendance';
import LeaveManagement from './pages/HR/LeaveManagement';
import SalaryCalculator from './pages/HR/SalaryCalculator';
import PettyCash       from './pages/HR/PettyCash';
import Finance         from './pages/Finance/Finance';
import UploadsAudit    from './pages/Admin/UploadsAudit';
import Announcements   from './pages/Announcements/Announcements';
import Setup           from './pages/Setup/Setup';
import './App.css';

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--navy)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>WA!</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
          LOADING…
        </div>
      </div>
    </div>
  );
}


function ProtectedRoutes() {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading)       return <LoadingScreen />;
  if (!currentUser)  return <Navigate to="/login" replace />;
  if (userProfile?.firstLogin) return <ForcePinChange />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index                    element={<Home />} />
        <Route path="projects"          element={<ProjectList />} />
        <Route path="projects/:id"      element={<ProjectDetail />} />
        <Route path="workers"           element={<WorkerRegistry />} />
        <Route path="hse"               element={<HSEHome />} />
        <Route path="attendance"        element={<Attendance />} />
        <Route path="leave"             element={<LeaveManagement />} />
        <Route path="salary"            element={<SalaryCalculator />} />
        <Route path="petty-cash"        element={<PettyCash />} />
        <Route path="finance"           element={<Finance />} />
        <Route path="audit"             element={<UploadsAudit />} />
        <Route path="announcements"     element={<Announcements />} />
        <Route path="profile"           element={<Profile />} />
        <Route path="settings"          element={<Settings />} />
        <Route path="settings/users"       element={<UserManagement />} />
        <Route path="settings/permissions" element={<Permissions />} />
        <Route path="settings/access-levels" element={<AccessLevels />} />
        <Route path="*"                 element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<PublicRoute />} />
            <Route path="/*"    element={<ProtectedRoutes />} />
          </Routes>
          <ToastContainer />
        </BrowserRouter>
        </LanguageProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

function PublicRoute() {
  const { currentUser, loading } = useAuth();
  if (loading)      return <LoadingScreen />;
  if (currentUser)  return <Navigate to="/" replace />;
  return <LoginForm />;
}
