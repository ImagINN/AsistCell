import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { ChevronRight } from 'lucide-react';
import api, { API_ORIGIN } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../constants/tickets';

interface Ticket {
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category?: string;
  createdAt: string;
  slaDeadline?: string;
  resolvedAt?: string;
}

// SLA COZULDU/KAPANDI/IPTAL durumlarında durur
const SLA_STOPPED_STATUSES = ['COZULDU', 'KAPANDI', 'IPTAL'];

const isSlaStopped = (ticket: Ticket) => SLA_STOPPED_STATUSES.includes(ticket.status);

const isSlaOverdue = (ticket: Ticket, now: number) =>
  !!ticket.slaDeadline && !isSlaStopped(ticket) && now > new Date(ticket.slaDeadline).getTime();

const formatRemaining = (ms: number) => {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}sa ${minutes}dk` : `${minutes}dk`;
};

const TicketsList: React.FC = () => {
  const { user } = useAuth();
  const isCustomer = user?.role === 'USER';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [now, setNow] = useState(Date.now());

  // Kalan SLA süresi sayacı — 30 saniyede bir tazelenir
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const fetchTickets = async () => {
      try {
        const response = isCustomer
          ? await api.get(`/tickets/customer/${user.id}`)
          : await api.get('/tickets');
        setTickets(response.data);
      } catch (error) {
        console.error('Talepler yüklenemedi:', error);
      }
    };

    fetchTickets();

    // Socket.IO: jwt query parametresi Kong JWT plugin'i için, auth.token
    // gateway'in kendi doğrulaması için gönderilir. Oda üyeliği token'dan çözülür.
    const token = localStorage.getItem('access_token') || '';
    const socket: Socket = io(API_ORIGIN, {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
      query: { jwt: token },
      auth: { token },
    });

    if (!isCustomer) {
      // Personel: gateway yeni talepleri tüm personele yayınlar
      socket.on('new_ticket_arrived', (ticket: Ticket) => {
        setTickets((prev) => [ticket, ...prev]);
      });
      // Genel yayından gelen durum/atama güncellemeleri (AI ataması dahil).
      // Talep tamamlandıysa (KAPANDI/IPTAL) aktif listeden anlık kaldırılır —
      // tamamlanan talepler log ekranına düşer (/log/completed-tickets).
      socket.on('ticket_updated', (ticket: Ticket) => {
        setTickets((prev) =>
          ['KAPANDI', 'IPTAL'].includes(ticket.status)
            ? prev.filter((t) => t.ticketNumber !== ticket.ticketNumber)
            : prev.map((t) => (t.ticketNumber === ticket.ticketNumber ? ticket : t)),
        );
      });
    } else {
      // Müşteri: kendi talebine özel bildirimler
      socket.on('ticket_created', (ticket: Ticket) => {
        setTickets((prev) => [ticket, ...prev]);
      });
      socket.on('ticket_status_updated', (ticket: Ticket) => {
        setTickets((prev) => prev.map((t) => (t.ticketNumber === ticket.ticketNumber ? ticket : t)));
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [isCustomer, user?.id]);

  // SLA aşan KRITIK talepler süpervizör panelinde en üstte görünür (spec 4.4)
  const sortedTickets = [...tickets].sort((a, b) => {
    const aTop = isSlaOverdue(a, now) && a.priority === 'KRITIK' ? 1 : 0;
    const bTop = isSlaOverdue(b, now) && b.priority === 'KRITIK' ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const slaChip = (ticket: Ticket) => {
    if (!ticket.slaDeadline) return null;
    const deadline = new Date(ticket.slaDeadline).getTime();

    if (isSlaStopped(ticket)) {
      const met = !ticket.resolvedAt || new Date(ticket.resolvedAt).getTime() <= deadline;
      return (
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
          met ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-600 border-gray-300'
        }`}>
          {met ? 'SLA karşılandı' : 'SLA aşılarak kapandı'}
        </span>
      );
    }

    if (isSlaOverdue(ticket, now)) {
      // Aşım: KRITIK kırmızı, YUKSEK turuncu, diğerleri görsel uyarı (spec 4.4)
      const cls =
        ticket.priority === 'KRITIK' ? 'bg-red-600 text-white border-red-700 animate-pulse' :
        ticket.priority === 'YUKSEK' ? 'bg-orange-500 text-white border-orange-600' :
        'bg-amber-100 text-amber-800 border-amber-300';
      return (
        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>
          SLA {formatRemaining(now - deadline)} aşıldı
        </span>
      );
    }

    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
        SLA: {formatRemaining(deadline - now)} kaldı
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">
          {isCustomer ? 'Taleplerim' : 'Aktif Talepler'}
        </h2>
        <span className="bg-brand-primary text-white text-xs font-bold px-3 py-1 rounded-full">
          {tickets.length} Toplam
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {tickets.length === 0 ? (
          <p className="p-8 text-center text-gray-500">Henüz talep bulunmuyor.</p>
        ) : (
          sortedTickets.map((ticket) => (
            <Link
              to={`/tickets/${ticket.ticketNumber}`}
              key={ticket.ticketNumber}
              className={`p-6 hover:bg-gray-50 transition-colors duration-150 flex items-center justify-between group ${
                isSlaOverdue(ticket, now)
                  ? ticket.priority === 'KRITIK' ? 'bg-red-50 border-l-4 border-red-600'
                  : ticket.priority === 'YUKSEK' ? 'bg-orange-50 border-l-4 border-orange-500'
                  : 'bg-amber-50 border-l-4 border-amber-400'
                  : ''
              }`}
            >
              <div className="min-w-0">
                <h3 className="font-medium text-gray-900 group-hover:text-brand-primary transition-colors truncate">
                  {ticket.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{ticket.ticketNumber}</span>
                  <span>•</span>
                  <span>{new Date(ticket.createdAt).toLocaleString('tr-TR')}</span>
                  {ticket.category && (
                    <>
                      <span>•</span>
                      <span>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {slaChip(ticket)}
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  ticket.priority === 'KRITIK' ? 'bg-red-50 text-red-700 border-red-200' :
                  ticket.priority === 'YUKSEK' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  ticket.priority === 'ORTA' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-gray-50 text-gray-700 border-gray-200'
                }`}>
                  {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-primary transition-colors" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketsList;
