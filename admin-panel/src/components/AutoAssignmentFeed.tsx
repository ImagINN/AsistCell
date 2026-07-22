import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Zap } from 'lucide-react';
import api, { API_ORIGIN } from '../services/api';
import { fetchUsersByIds, fullName, type DirectoryUser } from '../services/directory';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../constants/tickets';

interface AutoAssignment {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  confidence?: number;
  assignedAgentId: string;
  assignedAt: string;
}

const MAX_ITEMS = 20;

const relativeTime = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  return `${hours} sa önce`;
};

// Süpervizör/Admin: Gemini'nin uzmanlık eşleştirmesiyle yaptığı otomatik
// atamaların canlı akışı. WebSocket ile anlık güncellenir (auto_assignment event'i).
const AutoAssignmentFeed: React.FC = () => {
  const [items, setItems] = useState<AutoAssignment[]>([]);
  const [names, setNames] = useState<Map<string, DirectoryUser>>(new Map());
  const [, forceTick] = useState(0);

  useEffect(() => {
    api.get('/tickets/auto-assignments', { params: { take: MAX_ITEMS } }).then((res) => {
      setItems(res.data);
      fetchUsersByIds(res.data.map((i: AutoAssignment) => i.assignedAgentId)).then(setNames);
    }).catch(() => {});

    const token = localStorage.getItem('access_token') || '';
    const socket: Socket = io(API_ORIGIN, {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
      query: { jwt: token },
      auth: { token },
    });

    socket.on('auto_assignment', (item: AutoAssignment) => {
      setItems((prev) => [item, ...prev.filter((i) => i.ticketNumber !== item.ticketNumber)].slice(0, MAX_ITEMS));
      fetchUsersByIds([item.assignedAgentId]).then((resolved) =>
        setNames((prev) => new Map([...prev, ...resolved])),
      );
    });

    // Göreli zaman etiketlerini tazelemek için 30sn'de bir yeniden render
    const tick = setInterval(() => forceTick((n) => n + 1), 30000);

    return () => {
      socket.disconnect();
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="glass-panel p-6">
      <h3 className="text-sm font-bold text-gray-900 flex items-center mb-4">
        <Zap className="w-4 h-4 mr-2 text-brand-primary" />
        Otomatik Atama Akışı
        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> canlı
        </span>
      </h3>
      <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Henüz otomatik atama yapılmadı.</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.ticketNumber}
              to={`/tickets/${item.ticketNumber}`}
              className="py-3 flex items-center justify-between gap-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate text-sm">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{item.ticketNumber}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      color: CATEGORY_COLORS[item.category] ?? '#64748B',
                      backgroundColor: `${CATEGORY_COLORS[item.category] ?? '#64748B'}14`,
                    }}
                  >
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                  <span>→ {fullName(names.get(item.assignedAgentId)) ?? item.assignedAgentId}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                {typeof item.confidence === 'number' && (
                  <p className="text-xs font-semibold text-gray-700">%{Math.round(item.confidence * 100)}</p>
                )}
                <p className="text-[10px] text-gray-400">{relativeTime(item.assignedAt)}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default AutoAssignmentFeed;
