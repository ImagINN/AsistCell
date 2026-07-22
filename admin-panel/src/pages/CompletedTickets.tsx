import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Archive, ChevronDown, Star } from 'lucide-react';
import api, { API_ORIGIN } from '../services/api';
import Navbar from '../components/Navbar';
import { fetchUsersByIds, fullName, type DirectoryUser } from '../services/directory';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../constants/tickets';

interface CompletedTicket {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  assignedAgentId?: string;
  customerId: string;
  resolvedAt?: string;
  closedAt?: string;
  rating?: number;
  createdAt: string;
}

const PAGE_SIZE = 30;

// Süpervizör/Admin: tamamlanan (KAPANDI/IPTAL) taleplerin log kayıtları.
// Bir talep KAPANDI durumuna geçtiği an aktif ekranlardan düşer, buraya eklenir.
const CompletedTickets: React.FC = () => {
  const [items, setItems] = useState<CompletedTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Map<string, DirectoryUser>>(new Map());

  const load = async (nextSkip: number, replace: boolean) => {
    setLoading(true);
    try {
      const res = await api.get('/tickets/completed', { params: { take: PAGE_SIZE, skip: nextSkip } });
      const nextItems: CompletedTicket[] = replace ? res.data.items : [...items, ...res.data.items];
      setItems(nextItems);
      setTotal(res.data.total);
      setSkip(nextSkip);
      fetchUsersByIds(nextItems.flatMap((i) => [i.assignedAgentId, i.customerId])).then((resolved) =>
        setNames((prev) => new Map([...prev, ...resolved])),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(0, true);

    // Bir talep KAPANDI'ya geçtiği anda listeyi tazele (en tepeye eklensin)
    const token = localStorage.getItem('access_token') || '';
    const socket: Socket = io(API_ORIGIN, {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
      query: { jwt: token },
      auth: { token },
    });
    socket.on('ticket_completed', () => load(0, true));

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">
              <Archive className="w-6 h-6" />
              Tamamlanan Talepler
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Kapatılan talepler burada log olarak tutulur ve aktif ekranlardan otomatik kaldırılır.
            </p>
          </div>
          <span className="bg-brand-primary text-white text-xs font-bold px-3 py-1 rounded-full">
            {total} kayıt
          </span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
          <div className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <p className="p-8 text-center text-gray-500">Henüz tamamlanan talep yok.</p>
            ) : (
              items.map((t) => (
                <Link
                  to={`/tickets/${t.ticketNumber}`}
                  key={t.ticketNumber}
                  className="p-5 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{t.ticketNumber}</span>
                      <span>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                      <span>•</span>
                      <span>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
                      <span>•</span>
                      <span>{fullName(names.get(t.assignedAgentId ?? '')) ?? '—'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {t.rating && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {t.rating}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      t.status === 'KAPANDI'
                        ? 'bg-gray-100 text-gray-700 border-gray-300'
                        : 'bg-gray-100 text-gray-500 border-gray-300'
                    }`}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(t.closedAt ?? t.resolvedAt ?? t.createdAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>

          {items.length < total && (
            <div className="p-4 text-center border-t border-gray-100">
              <button
                onClick={() => load(skip + PAGE_SIZE, false)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline disabled:opacity-50"
              >
                <ChevronDown className="w-4 h-4" />
                {loading ? 'Yükleniyor...' : 'Daha fazla göster'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CompletedTickets;
