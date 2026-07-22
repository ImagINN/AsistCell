import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Ticket, Trophy, User } from 'lucide-react';
import Navbar from '../components/Navbar';
import TicketsList from '../components/TicketsList';
import Leaderboard from '../components/Leaderboard';
import UserManagement from '../components/UserManagement';
import api from '../services/api';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const isAgent = user?.role === 'TEMSILCI';
  const isStaff = user?.role === 'TEMSILCI' || user?.role === 'SUPERVIZOR' || user?.role === 'ADMIN';

  useEffect(() => {
    if (isAgent && user?.id) {
      api.get(`/game/agents/${user.id}`)
        .then(res => setProfile(res.data))
        .catch(err => console.error('Profil alınamadı:', err));
    }
  }, [isAgent, user]);

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Temsilci gamification özeti — yalnızca temsilci rolünde */}
        {isAgent && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in mb-8">
            <div className="glass-panel p-6 flex items-center space-x-4">
              <div className="p-3 bg-blue-100 text-brand-primary rounded-full">
                <Ticket className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Çözülen Talepler</p>
                <h3 className="text-2xl font-bold text-gray-900">{profile?.totalResolvedTickets || 0}</h3>
              </div>
            </div>

            <div className="glass-panel p-6 flex items-center space-x-4">
              <div className="p-3 bg-yellow-100 text-brand-secondary rounded-full">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Puanınız</p>
                <h3 className="text-2xl font-bold text-gray-900">{profile?.totalPoints || 0}</h3>
              </div>
            </div>

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
        )}

        <div className={`animate-slide-up grid grid-cols-1 gap-8 ${isStaff ? 'lg:grid-cols-3' : ''}`}>
          <div className={isStaff ? 'lg:col-span-2' : ''}>
            <TicketsList />
          </div>
          {isStaff && (
            <div>
              <Leaderboard />
            </div>
          )}
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
