import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Ticket, Trophy, User } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-brand-surface">
      <nav className="bg-brand-primary shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-white text-xl font-bold">AsistCell Admin</span>
            </div>
            <div className="flex items-center space-x-4">
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
              <p className="text-sm font-medium text-gray-500">Açık Talepler</p>
              <h3 className="text-2xl font-bold text-gray-900">0</h3>
            </div>
          </div>

          {/* Gamification / Liderlik */}
          <div className="glass-panel p-6 flex items-center space-x-4">
            <div className="p-3 bg-yellow-100 text-brand-secondary rounded-full">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Puanınız</p>
              <h3 className="text-2xl font-bold text-gray-900">0</h3>
            </div>
          </div>

          {/* Profil */}
          <div className="glass-panel p-6 flex items-center space-x-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-full">
              <User className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Seviye</p>
              <h3 className="text-2xl font-bold text-gray-900">Bronz</h3>
            </div>
          </div>

        </div>

        <div className="mt-8 animate-slide-up">
          <div className="glass-panel p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Aktif Talepler (Gerçek Zamanlı)</h2>
            <div className="border-t border-gray-200 py-4">
              <p className="text-gray-500 text-center py-8">Henüz talep yok veya yükleniyor...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
