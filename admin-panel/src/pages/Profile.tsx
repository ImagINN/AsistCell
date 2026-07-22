import React, { useEffect, useState } from 'react';
import { Award, Lock, Star, Ticket, Trophy } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';

const BADGES: { type: string; label: string; description: string }[] = [
  { type: 'ILK_ADIM', label: 'İlk Adım', description: 'İlk talebi çöz' },
  { type: 'HIZ_USTASI', label: 'Hız Ustası', description: '30 dakikanın altında 10 talep çözümü' },
  { type: 'MUSTERI_DOSTU', label: 'Müşteri Dostu', description: 'En az 20 puanlamada 4.5+ ortalama' },
  { type: 'MARATONCU', label: 'Maratoncu', description: 'Toplamda 100 talep çözümü' },
  { type: 'KRIZ_YONETICISI', label: 'Kriz Yöneticisi', description: '10 KRİTİK talebi SLA içinde çözme' },
  { type: 'UZMAN', label: 'Uzman', description: 'Altın veya Platin seviyeye ulaşma' },
];

const LEVELS = [
  { key: 'BRONZE', label: 'Bronz', min: 0, max: 500, color: '#B45309' },
  { key: 'SILVER', label: 'Gümüş', min: 500, max: 1500, color: '#64748B' },
  { key: 'GOLD', label: 'Altın', min: 1500, max: 3000, color: '#D97706' },
  { key: 'PLATINUM', label: 'Platin', min: 3000, max: 3000, color: '#0EA5E9' },
];

interface Profile {
  totalPoints: number;
  currentLevel: string;
  totalResolvedTickets: number;
  averageRating: number;
  ratedCount: number;
  badges: { badgeType: string; earnedAt: string }[];
}

interface HistoryEntry {
  id: string;
  pointsChanged: number;
  reason: string;
  createdAt: string;
}

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/game/agents/${user.id}`).then((r) => setProfile(r.data)).catch(() => {});
    api.get(`/game/agents/${user.id}/history`).then((r) => setHistory(r.data)).catch(() => {});
  }, [user?.id]);

  const level = LEVELS.find((l) => l.key === profile?.currentLevel) ?? LEVELS[0];
  const isMaxLevel = level.key === 'PLATINUM';
  const levelProgress = profile
    ? isMaxLevel
      ? 100
      : Math.min(100, Math.round(((profile.totalPoints - level.min) / (level.max - level.min)) * 100))
    : 0;

  const earnedTypes = new Set((profile?.badges ?? []).map((b) => b.badgeType));

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Profilim</h1>
          <p className="text-sm text-gray-500 mt-1">Puanların, rozetlerin ve seviyen burada.</p>
        </div>

        {/* Seviye kartı */}
        <div className="glass-panel p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full" style={{ backgroundColor: `${level.color}20`, color: level.color }}>
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Mevcut Seviye</p>
                <h2 className="text-xl font-bold" style={{ color: level.color }}>{level.label}</h2>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Toplam Puan</p>
              <p className="text-2xl font-bold text-gray-900">{profile?.totalPoints ?? 0}</p>
            </div>
          </div>
          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${levelProgress}%`, backgroundColor: level.color }}
            />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            {isMaxLevel ? 'En yüksek seviyedesin!' : `Sonraki seviyeye ${Math.max(0, level.max - (profile?.totalPoints ?? 0))} puan kaldı`}
          </p>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 animate-slide-up">
          <div className="glass-panel p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-brand-primary rounded-full"><Ticket className="w-6 h-6" /></div>
            <div>
              <p className="text-xs text-gray-500">Çözülen Talep</p>
              <h3 className="text-xl font-bold text-gray-900">{profile?.totalResolvedTickets ?? 0}</h3>
            </div>
          </div>
          <div className="glass-panel p-5 flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-full"><Star className="w-6 h-6" /></div>
            <div>
              <p className="text-xs text-gray-500">Ortalama Müşteri Puanı</p>
              <h3 className="text-xl font-bold text-gray-900">{profile?.averageRating ? profile.averageRating.toFixed(1) : '—'}</h3>
            </div>
          </div>
          <div className="glass-panel p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full"><Award className="w-6 h-6" /></div>
            <div>
              <p className="text-xs text-gray-500">Kazanılan Rozet</p>
              <h3 className="text-xl font-bold text-gray-900">{profile?.badges.length ?? 0} / {BADGES.length}</h3>
            </div>
          </div>
        </div>

        {/* Rozetler */}
        <div className="glass-panel p-6 animate-slide-up">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Rozetler</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {BADGES.map((b) => {
              const earned = earnedTypes.has(b.type);
              return (
                <div
                  key={b.type}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    earned ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full mb-2 ${
                    earned ? 'bg-brand-secondary text-brand-primary' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {earned ? <Award className="w-6 h-6" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{b.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{b.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Puan geçmişi */}
        <div className="glass-panel p-6 animate-slide-up">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Puan Geçmişi</h3>
          <div className="divide-y divide-gray-100">
            {history.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">Henüz puan hareketi yok.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800">{h.reason}</p>
                    <p className="text-xs text-gray-400">{new Date(h.createdAt).toLocaleString('tr-TR')}</p>
                  </div>
                  <span className={`font-bold text-sm ${h.pointsChanged >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {h.pointsChanged >= 0 ? '+' : ''}{h.pointsChanged}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
