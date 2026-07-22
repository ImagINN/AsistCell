import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Plus, Ticket, Trophy, User } from 'lucide-react';
import TicketsList from '../components/TicketsList';
import Leaderboard from '../components/Leaderboard';
import UserManagement from '../components/UserManagement';
import api from '../services/api';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      api.get(`/game/agents/${user.id}`)
        .then(res => setProfile(res.data))
        .catch(err => console.error("Profil alınamadı:", err));
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-brand-surface">
      <nav className="bg-brand-primary shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-white text-xl font-bold">AsistCell Admin</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/tickets/new"
                className="inline-flex items-center bg-brand-secondary text-brand-primary text-sm font-medium px-3 py-1.5 rounded-lg shadow-sm hover:bg-yellow-400 transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" />
                Yeni Talep
              </Link>
              <span className="text-gray-200 text-sm">
                Merhaba, {user?.firstName} ({user?.role})
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

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          
          {/* İstatistik Kartı */}
          <div className="glass-panel p-6 flex items-center space-x-4">
            <div className="p-3 bg-blue-100 text-brand-primary rounded-full">
              <Ticket className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Çözülen Talepler</p>
              <h3 className="text-2xl font-bold text-gray-900">{profile?.totalResolvedTickets || 0}</h3>
            </div>
          </div>

          {/* Gamification / Liderlik */}
          <div className="glass-panel p-6 flex items-center space-x-4">
            <div className="p-3 bg-yellow-100 text-brand-secondary rounded-full">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Puanınız</p>
              <h3 className="text-2xl font-bold text-gray-900">{profile?.totalPoints || 0}</h3>
            </div>
          </div>

          {/* Profil */}
          <div className="glass-panel p-6 flex items-center space-x-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-full">
              <User className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Seviye</p>
              <h3 className="text-2xl font-bold text-gray-900 uppercase">{profile?.currentLevel || 'BRONZ'}</h3>
            </div>
          </div>

        </div>

        <div className="mt-8 animate-slide-up grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TicketsList />
          </div>
          <div>
            <Leaderboard />
          </div>
        </div>

        {/* Kullanıcı yönetimi — sadece Admin */}
        {user?.role === 'ADMIN' && (
          <div className="mt-8 animate-slide-up">
            <UserManagement />
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
