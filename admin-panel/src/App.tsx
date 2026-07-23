import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateTicket from './pages/CreateTicket';
import TicketDetail from './pages/TicketDetail';
import SupervisorDashboard from './pages/SupervisorDashboard';
import CompletedTickets from './pages/CompletedTickets';
import Profile from './pages/Profile';
import AuditLog from './pages/AuditLog';
import UserManagementPage from './pages/UserManagementPage';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';

// Korunan Route Bileşeni — giriş şart
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-brand-primary">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

// Rol bazlı korunan route — giriş + rol eşleşmesi şart
const RoleRoute = ({ roles, children }: { roles: string[]; children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-brand-primary">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/403" replace />;

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/tickets/new" element={
            <RoleRoute roles={['USER']}>
              <CreateTicket />
            </RoleRoute>
          } />
          <Route path="/tickets/:ticketNumber" element={
            <ProtectedRoute>
              <TicketDetail />
            </ProtectedRoute>
          } />
          <Route path="/dashboard/supervisor" element={
            <RoleRoute roles={['SUPERVIZOR', 'ADMIN']}>
              <SupervisorDashboard />
            </RoleRoute>
          } />
          <Route path="/log/completed-tickets" element={
            <RoleRoute roles={['SUPERVIZOR', 'ADMIN']}>
              <CompletedTickets />
            </RoleRoute>
          } />
          <Route path="/profile" element={
            <RoleRoute roles={['TEMSILCI']}>
              <Profile />
            </RoleRoute>
          } />
          <Route path="/admin/audit-logs" element={
            <RoleRoute roles={['ADMIN']}>
              <AuditLog />
            </RoleRoute>
          } />
          <Route path="/admin/users" element={
            <RoleRoute roles={['ADMIN']}>
              <UserManagementPage />
            </RoleRoute>
          } />
          <Route path="/403" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
