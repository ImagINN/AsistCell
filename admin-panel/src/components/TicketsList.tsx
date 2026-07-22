import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

const TicketsList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const { user } = useAuth();
  
  useEffect(() => {
    // 1. Mevcut biletleri getir
    const fetchTickets = async () => {
      try {
        const response = await api.get('/tickets');
        setTickets(response.data);
      } catch (error) {
        console.error('Biletler yüklenemedi:', error);
      }
    };
    
    fetchTickets();

    // 2. Socket.IO bağlantısını kur
    const socket: Socket = io('http://localhost:8000', {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket.IO bağlantısı başarılı:', socket.id);
      // Temsilci ise genel odaya (varsa) veya kendi odasına katılabilir
      if (user?.id) {
        socket.emit('joinRoom', `user_${user.id}`);
      }
    });

    socket.on('ticketCreated', (data: { ticket: Ticket }) => {
      setTickets((prev) => [data.ticket, ...prev]);
    });

    socket.on('ticketStatusUpdated', (data: { ticket: Ticket }) => {
      setTickets((prev) => prev.map(t => t.ticketNumber === data.ticket.ticketNumber ? data.ticket : t));
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const updateStatus = async (ticketNumber: string, status: string) => {
    try {
      await api.patch(`/tickets/${ticketNumber}/status`, { status });
      // Başarılı olursa listeyi yenileyecek socket event'i de tetiklenecektir.
    } catch (error) {
      console.error('Durum güncellenemedi:', error);
      alert('Durum güncellenemedi, state geçerli değil olabilir.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Aktif Talepler</h2>
        <span className="bg-brand-primary text-white text-xs font-bold px-3 py-1 rounded-full">
          {tickets.length} Toplam
        </span>
      </div>
      
      <div className="divide-y divide-gray-100">
        {tickets.length === 0 ? (
          <p className="p-8 text-center text-gray-500">Henüz talep bulunmuyor.</p>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.ticketNumber} className="p-6 hover:bg-gray-50 transition-colors duration-150 flex items-center justify-between group">
              <div>
                <h3 className="font-medium text-gray-900 group-hover:text-brand-primary transition-colors">
                  {ticket.title}
                </h3>
                <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{ticket.ticketNumber}</span>
                  <span>•</span>
                  <span>Oluşturulma: {new Date(ticket.createdAt).toLocaleString('tr-TR')}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  ticket.priority === 'KRITIK' ? 'bg-red-50 text-red-700 border-red-200' :
                  ticket.priority === 'YUKSEK' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  ticket.priority === 'ORTA' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-gray-50 text-gray-700 border-gray-200'
                }`}>
                  {ticket.priority}
                </span>
                
                <select 
                  className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-brand-primary focus:ring focus:ring-brand-primary focus:ring-opacity-50"
                  value={ticket.status}
                  onChange={(e) => updateStatus(ticket.ticketNumber, e.target.value)}
                >
                  <option value="YENI">Yeni</option>
                  <option value="ATANDI">Atandı</option>
                  <option value="ISLEMDE">İşlemde</option>
                  <option value="MUSTERI_BEKLENIYOR">Müşteri Bekleniyor</option>
                  <option value="COZULDU">Çözüldü</option>
                  <option value="IPTAL">İptal</option>
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketsList;
