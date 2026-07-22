import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Plus, LayoutDashboard, BarChart3, ShieldCheck, User } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  USER: 'Müşteri',
  TEMSILCI: 'Temsilci',
  SUPERVIZOR: 'Süpervizör',
  ADMIN: 'Admin',
};

const NavItem: React.FC<{ to: string; active: boolean; children: React.ReactNode }> = ({
  to,
  active,
  children,
}) => (
  <Link
    to={to}
    className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
      active ? 'bg-white/15 text-white' : 'text-gray-200 hover:text-white hover:bg-white/10'
    }`}
  >
    {children}
  </Link>
);

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  if (!user) return null;

  const isSupervisorOrAdmin = user.role === 'SUPERVIZOR' || user.role === 'ADMIN';

  return (
    <nav className="bg-brand-primary shadow-lg sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-white text-xl font-bold tracking-tight">
              AsistCell
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <NavItem to="/" active={location.pathname === '/'}>
                <LayoutDashboard className="w-4 h-4" />
                Panelim
              </NavItem>
              {isSupervisorOrAdmin && (
                <NavItem to="/dashboard/supervisor" active={location.pathname === '/dashboard/supervisor'}>
                  <BarChart3 className="w-4 h-4" />
                  Süpervizör Dashboard
                </NavItem>
              )}
              {user.role === 'TEMSILCI' && (
                <NavItem to="/profile" active={location.pathname === '/profile'}>
                  <User className="w-4 h-4" />
                  Profilim
                </NavItem>
              )}
              {user.role === 'ADMIN' && (
                <NavItem to="/admin/audit-logs" active={location.pathname === '/admin/audit-logs'}>
                  <ShieldCheck className="w-4 h-4" />
                  Audit Log
                </NavItem>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user.role === 'USER' && (
              <Link
                to="/tickets/new"
                className="inline-flex items-center bg-brand-secondary text-brand-primary text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm hover:bg-yellow-400 transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" />
                Yeni Talep
              </Link>
            )}
            <span className="text-gray-200 text-sm hidden sm:inline">
              {user.firstName} <span className="text-gray-300">({ROLE_LABELS[user.role] ?? user.role})</span>
            </span>
            <button
              onClick={logout}
              className="text-white hover:text-brand-secondary transition-colors"
              title="Çıkış Yap"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
