import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { AlertCircle, CheckCircle2, Clock, Gauge, Sparkles, Users, UserCheck } from 'lucide-react';
import api, { API_ORIGIN } from '../services/api';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';
import DonutChart from '../components/charts/DonutChart';
import BarChart from '../components/charts/BarChart';
import AutoAssignmentFeed from '../components/AutoAssignmentFeed';
import {
  CATEGORY_LABELS, CATEGORY_COLORS, PRIORITY_LABELS,
  STATUS_LABELS, SENTIMENT_LABELS, SENTIMENT_COLORS,
} from '../constants/tickets';
import { fetchUsersByIds, fetchUsersByRole, fullName, type DirectoryUser } from '../services/directory';

interface DashboardStats {
  totals: { total: number; open: number; byStatus: Record<string, number>; byPriority: Record<string, number> };
  sla: { resolvedWithSla: number; slaMet: number; complianceRate: number | null };
  satisfaction: { avgRating: number | null; ratedCount: number };
  ai: { analyzedCount: number; reassignedCount: number; categoryOverriddenCount: number; accuracyRate: number | null };
}

interface TeamRow {
  agentId: string;
  resolvedCount: number;
  avgRating: number | null;
  slaComplianceRate: number | null;
  avgResolutionMinutes: number | null;
}

interface SlaOverdueTicket {
  ticketNumber: string;
  title: string;
  priority: string;
  category: string;
  slaDeadline: string;
  assignedAgentId?: string;
}

interface AiStats {
  by_category: Record<string, number>;
  by_sentiment: Record<string, number>;
}

interface PendingTicket {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; tone: string }> = ({
  icon, label, value, tone,
}) => (
  <div className="glass-panel p-5 flex items-center gap-4">
    <div className={`p-3 rounded-full ${tone}`}>{icon}</div>
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
    </div>
  </div>
);

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const SupervisorDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [pending, setPending] = useState<PendingTicket[]>([]);
  const [assignDrafts, setAssignDrafts] = useState<Record<string, string>>({});
  const [assignError, setAssignError] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Map<string, DirectoryUser>>(new Map());
  const [agents, setAgents] = useState<DirectoryUser[]>([]);
  const [pendingPage, setPendingPage] = useState(0);
  const PENDING_PAGE_SIZE = 10;
  const [slaOverdue, setSlaOverdue] = useState<SlaOverdueTicket[]>([]);

  const loadAll = () => {
    api.get('/tickets/stats/dashboard').then((r) => setStats(r.data)).catch(() => {});
    api.get('/tickets/stats/team').then((r) => {
      setTeam(r.data);
      fetchUsersByIds(r.data.map((t: TeamRow) => t.agentId)).then(setNames);
    }).catch(() => {});
    api.get('/ai/stats').then((r) => setAiStats(r.data)).catch(() => {});
    // Bekleyen kuyruk: henüz kimseye atanmamış (YENI) talepler
    api.get('/tickets', { params: { status: 'YENI' } }).then((r) => setPending(r.data)).catch(() => {});
    // SLA aşmış aktif talepler: slaDeadline geçmiş, henüz kapatılmamış
    api.get('/tickets', { params: { slaOverdue: true } })
      .then((r) => {
        const overdue: SlaOverdueTicket[] = (Array.isArray(r.data) ? r.data : [])
          .filter((t: any) => t.slaDeadline && new Date(t.slaDeadline) < new Date()
            && !['KAPANDI', 'IPTAL', 'COZULDU'].includes(t.status));
        setSlaOverdue(overdue);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadAll();
    fetchUsersByRole('TEMSILCI').then(setAgents).catch(() => {});
    // Ağır agregasyonlar (istatistik/takım) için periyodik tazeleme — canlı
    // event'ler (auto_assignment, ticket_completed) ayrıca anlık tetikler.
    const id = setInterval(loadAll, 20000);

    const token = localStorage.getItem('access_token') || '';
    const socket: Socket = io(API_ORIGIN, {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
      query: { jwt: token },
      auth: { token },
    });

    // Bekleyen atama kuyruğu (henüz atanmamış / YENI) her ticket güncellemesinde anlık senkron olur
    socket.on('ticket_updated', (ticket: PendingTicket & { status: string }) => {
      setPending((prev) => {
        const stillPending = ticket.status === 'YENI';
        const exists = prev.some((p) => p.ticketNumber === ticket.ticketNumber);
        if (stillPending) {
          return exists
            ? prev.map((p) => (p.ticketNumber === ticket.ticketNumber ? ticket : p))
            : [ticket, ...prev];
        }
        return exists ? prev.filter((p) => p.ticketNumber !== ticket.ticketNumber) : prev;
      });
    });

    // Otomatik atama veya tamamlanma gerçekleştiğinde üst istatistikleri/takım
    // performansını beklemeden anlık tazele
    socket.on('auto_assignment', loadAll);
    socket.on('ticket_completed', loadAll);

    return () => {
      clearInterval(id);
      socket.disconnect();
    };
  }, []);

  const assignPending = async (ticketNumber: string) => {
    const agentId = assignDrafts[ticketNumber]?.trim();
    if (!agentId) return;
    setAssignError((prev) => ({ ...prev, [ticketNumber]: '' }));
    try {
      await api.patch(`/tickets/${ticketNumber}/assign`, { agentId });
      setAssignDrafts((prev) => ({ ...prev, [ticketNumber]: '' }));
      loadAll();
    } catch (err: any) {
      setAssignError((prev) => ({ ...prev, [ticketNumber]: err.response?.data?.message || 'Atama başarısız' }));
    }
  };

  const statusData = stats
    ? Object.entries(STATUS_LABELS)
        .filter(([key]) => (stats.totals.byStatus[key] ?? 0) > 0)
        .map(([key, label]) => ({ label, value: stats.totals.byStatus[key] ?? 0, color: '#163F93' }))
    : [];

  const categoryData = aiStats
    ? Object.entries(aiStats.by_category).map(([key, value]) => ({
        label: CATEGORY_LABELS[key] ?? key,
        value,
        color: CATEGORY_COLORS[key] ?? '#94A3B8',
      }))
    : [];

  const sentimentData = aiStats
    ? Object.entries(aiStats.by_sentiment).map(([key, value]) => ({
        label: SENTIMENT_LABELS[key] ?? key,
        value,
        color: SENTIMENT_COLORS[key] ?? '#94A3B8',
      }))
    : [];

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Süpervizör Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Operasyonel görünürlük — tüm sistem tek ekranda.</p>
        </div>

        {/* Üst özet kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 animate-fade-in">
          <StatCard
            icon={<Gauge className="w-6 h-6 text-brand-primary" />}
            tone="bg-blue-100"
            label="Açık Talepler"
            value={String(stats?.totals.open ?? '—')}
          />
          <StatCard
            icon={<Clock className="w-6 h-6 text-emerald-600" />}
            tone="bg-emerald-100"
            label="SLA Uyum Oranı"
            value={pct(stats?.sla.complianceRate ?? null)}
          />
          <StatCard
            icon={<Sparkles className="w-6 h-6 text-amber-600" />}
            tone="bg-amber-100"
            label="AI Doğruluk Oranı"
            value={pct(stats?.ai.accuracyRate ?? null)}
          />
          <StatCard
            icon={<CheckCircle2 className="w-6 h-6 text-purple-600" />}
            tone="bg-purple-100"
            label="Ort. Müşteri Puanı"
            value={stats?.satisfaction.avgRating ? stats.satisfaction.avgRating.toFixed(1) : '—'}
          />
        </div>

        {/* Grafikler + Canlı Otomatik Atama Akışı */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
          <div className="glass-panel p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Durum Dağılımı</h3>
            <BarChart data={statusData} />
          </div>
          <div className="glass-panel p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Kategori Dağılımı</h3>
            <DonutChart data={categoryData} />
          </div>
          <AutoAssignmentFeed />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
          <div className="glass-panel p-6 lg:col-span-1">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Sentiment Dağılımı</h3>
            <DonutChart data={sentimentData} />
          </div>
        </div>

        {/* Takım performansı */}
        <div className="glass-panel p-6 animate-slide-up">
          <h3 className="text-sm font-bold text-gray-900 flex items-center mb-4">
            <Users className="w-4 h-4 mr-2 text-brand-primary" />
            Takım Performansı
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Temsilci</th>
                  <th className="py-2 pr-4">Çözülen Talep</th>
                  <th className="py-2 pr-4">Ort. Çözüm Süresi</th>
                  <th className="py-2 pr-4">Ort. Müşteri Puanı</th>
                  <th className="py-2">SLA Uyumu</th>
                </tr>
              </thead>
              <tbody>
                {team.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400">Henüz veri yok</td></tr>
                ) : (
                  team.map((t) => (
                    <tr key={t.agentId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <span className="font-medium text-gray-900">{fullName(names.get(t.agentId)) ?? t.agentId}</span>
                        <span className="ml-2 text-xs text-gray-400">Temsilci</span>
                      </td>
                      <td className="py-2 pr-4 font-semibold text-gray-900">{t.resolvedCount}</td>
                      <td className="py-2 pr-4 text-gray-700">
                        {t.avgResolutionMinutes != null
                          ? t.avgResolutionMinutes >= 60
                            ? `${Math.floor(t.avgResolutionMinutes / 60)}sa ${t.avgResolutionMinutes % 60}dk`
                            : `${t.avgResolutionMinutes}dk`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">{t.avgRating ? t.avgRating.toFixed(1) : '—'}</td>
                      <td className="py-2">{pct(t.slaComplianceRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SLA Aşmış Aktif Talepler */}
        {slaOverdue.length > 0 && (
          <div className="glass-panel p-6 animate-slide-up border-l-4 border-red-500">
            <h3 className="text-sm font-bold text-red-700 flex items-center mb-4">
              <AlertCircle className="w-4 h-4 mr-2" />
              SLA Aşmış Aktif Talepler
              <span className="ml-2 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{slaOverdue.length}</span>
            </h3>
            <div className="divide-y divide-gray-100">
              {slaOverdue.map((t) => {
                const overdueMs = Date.now() - new Date(t.slaDeadline).getTime();
                const overdueMin = Math.floor(overdueMs / 60000);
                const overdueStr = overdueMin >= 60
                  ? `${Math.floor(overdueMin / 60)}sa ${overdueMin % 60}dk`
                  : `${overdueMin}dk`;
                return (
                  <div key={t.ticketNumber} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/tickets/${t.ticketNumber}`} className="font-medium text-gray-900 hover:text-brand-primary">
                        {t.title}
                      </Link>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {t.ticketNumber} • {CATEGORY_LABELS[t.category] ?? t.category} • {PRIORITY_LABELS[t.priority] ?? t.priority}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      t.priority === 'KRITIK' ? 'bg-red-600 text-white border-red-700 animate-pulse'
                      : 'bg-orange-100 text-orange-800 border-orange-300'
                    }`}>
                      SLA {overdueStr} aşıldı
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bekleyen atama kuyruğu */}
        <div className="glass-panel p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-amber-600" />
              Bekleyen Atama Kuyruğu (Atanmamış Talepler)
            </h3>
            {pending.length > 0 && (
              <div className="flex items-center gap-2">
                {Math.ceil(pending.length / PENDING_PAGE_SIZE) > 1 && (
                  <span className="text-xs text-gray-500">
                    {pendingPage * PENDING_PAGE_SIZE + 1}–{Math.min((pendingPage + 1) * PENDING_PAGE_SIZE, pending.length)} / {pending.length}
                  </span>
                )}
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {pending.length} talep
                </span>
              </div>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {pending.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">Kuyrukta bekleyen talep yok.</p>
            ) : (
              pending
                .slice(pendingPage * PENDING_PAGE_SIZE, (pendingPage + 1) * PENDING_PAGE_SIZE)
                .map((t) => (
                <div key={t.ticketNumber} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/tickets/${t.ticketNumber}`} className="font-medium text-gray-900 hover:text-brand-primary">
                      {t.title}
                    </Link>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {t.ticketNumber} • {PRIORITY_LABELS[t.priority] ?? t.priority} • {new Date(t.createdAt).toLocaleString('tr-TR')}
                    </div>
                    {assignError[t.ticketNumber] && (
                      <p className="text-xs text-red-600 mt-1">{assignError[t.ticketNumber]}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <select
                      value={assignDrafts[t.ticketNumber] ?? ''}
                      onChange={(e) => setAssignDrafts((prev) => ({ ...prev, [t.ticketNumber]: e.target.value }))}
                      className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg shadow-sm focus:border-brand-primary focus:ring focus:ring-brand-primary focus:ring-opacity-50"
                    >
                      <option value="">Temsilci seçin...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {fullName(a)}{a.specialties?.length ? ` — ${a.specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignPending(t.ticketNumber)}
                      disabled={!assignDrafts[t.ticketNumber]}
                      className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                    >
                      <UserCheck className="w-4 h-4" /> Ata
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {Math.ceil(pending.length / PENDING_PAGE_SIZE) > 1 && (
            <div className="border-t border-gray-100 pt-2">
              <Pagination
                currentPage={pendingPage}
                totalPages={Math.ceil(pending.length / PENDING_PAGE_SIZE)}
                onPageChange={setPendingPage}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SupervisorDashboard;
