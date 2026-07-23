import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  ArrowLeft, Send, Star, UserCheck, Sparkles, CheckCircle2,
  PlayCircle, Tag, Gauge, ThumbsUp, ThumbsDown, AlertTriangle,
  Frown, Meh, Smile,
} from 'lucide-react';
import api, { API_ORIGIN } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import {
  CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS,
  SENTIMENT_LABELS, SENTIMENT_COLORS,
} from '../constants/tickets';
import { fetchUsersByIds, fetchUsersByRole, fullName, type DirectoryUser } from '../services/directory';

const CATEGORY_OPTIONS = ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL'];
const PRIORITY_OPTIONS = ['DUSUK', 'ORTA', 'YUKSEK', 'KRITIK'];
const MESSAGE_ROLE_LABELS: Record<string, string> = { MUSTERI: 'Müşteri', TEMSILCI: 'Temsilci', SISTEM: 'Sistem' };
const SENTIMENT_ICONS: Record<string, React.ElementType> = { OFKELI: Frown, NOTR: Meh, MEMNUN: Smile };

interface Message {
  senderId: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

interface Ticket {
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  aiCategory?: string;
  customerId: string;
  assignedAgentId?: string;
  messages: Message[];
  slaDeadline?: string;
  resolvedAt?: string;
  rating?: number;
  ratingComment?: string;
  createdAt: string;
}

interface AiAnalysis {
  confidence: number;
  sentiment: string;
  manual_queue: boolean;
}

const inputClass =
  'appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm';

const badgeClass = (kind: 'priority' | 'status', value: string) => {
  if (kind === 'priority') {
    return (
      {
        KRITIK: 'bg-red-50 text-red-700 border-red-200',
        YUKSEK: 'bg-orange-50 text-orange-700 border-orange-200',
        ORTA: 'bg-blue-50 text-blue-700 border-blue-200',
        DUSUK: 'bg-gray-50 text-gray-700 border-gray-200',
      } as Record<string, string>
    )[value] ?? 'bg-gray-50 text-gray-700 border-gray-200';
  }
  return (
    {
      YENI: 'bg-blue-50 text-blue-700 border-blue-200',
      ATANDI: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      ISLEMDE: 'bg-amber-50 text-amber-700 border-amber-200',
      MUSTERI_BEKLENIYOR: 'bg-purple-50 text-purple-700 border-purple-200',
      COZULDU: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      KAPANDI: 'bg-gray-100 text-gray-700 border-gray-300',
      IPTAL: 'bg-gray-100 text-gray-500 border-gray-300',
    } as Record<string, string>
  )[value] ?? 'bg-gray-50 text-gray-700 border-gray-200';
};

const TicketDetail: React.FC = () => {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [awaitCustomer, setAwaitCustomer] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [priorityDraft, setPriorityDraft] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [directory, setDirectory] = useState<Map<string, DirectoryUser>>(new Map());
  const [agents, setAgents] = useState<DirectoryUser[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isOwner = ticket && user?.role === 'USER' && ticket.customerId === user.id;
  const isAssignedAgent = ticket && user?.role === 'TEMSILCI' && ticket.assignedAgentId === user.id;
  const isSupervisorOrAdmin = user?.role === 'SUPERVIZOR' || user?.role === 'ADMIN';
  // Spec: mesajlaşma yalnızca talep sahibi müşteri ile atanan temsilci arasındadır
  const canMessage = isOwner || isAssignedAgent;
  const isClosed = ticket && ['KAPANDI', 'IPTAL'].includes(ticket.status);

  const loadTicket = async () => {
    if (!ticketNumber) return;
    try {
      const res = await api.get(`/tickets/${ticketNumber}`);
      setTicket(res.data);
      setCategoryDraft(res.data.category);
      setPriorityDraft(res.data.priority);
    } catch (err: any) {
      if (err.response?.status === 404) setNotFound(true);
      else setError('Talep yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadAi = async () => {
    if (!ticketNumber) return;
    try {
      const res = await api.get(`/ai/analysis/${ticketNumber}`);
      setAi(res.data);
    } catch {
      setAi(null); // Henüz analiz edilmemiş olabilir — sessizce yoksay
    }
  };

  useEffect(() => {
    loadTicket();
    loadAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketNumber]);

  // İlgili kişilerin isim+rol bilgisini çöz (ID yerine gösterim için)
  useEffect(() => {
    if (!ticket) return;
    const ids = [ticket.customerId, ticket.assignedAgentId, ...ticket.messages.map((m) => m.senderId)];
    fetchUsersByIds(ids).then(setDirectory);
  }, [ticket]);

  // Süpervizör manuel atama listesi: temsilci dizini
  useEffect(() => {
    if (user?.role === 'SUPERVIZOR') {
      fetchUsersByRole('TEMSILCI').then(setAgents).catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    if (!ticketNumber) return;
    const token = localStorage.getItem('access_token') || '';
    const socket: Socket = io(API_ORIGIN, {
      path: '/api/v1/tickets/socket.io',
      transports: ['websocket'],
      query: { jwt: token },
      auth: { token },
    });

    const onUpdate = (updated: Ticket) => {
      if (updated.ticketNumber === ticketNumber) {
        setTicket(updated);
        setCategoryDraft(updated.category);
        setPriorityDraft(updated.priority);
        // AI analizi asenkron gelir (~4sn) — güncelleme geldiğinde analiz kartını tazele
        loadAi();
      }
    };
    socket.on('ticket_updated', onUpdate);
    socket.on('ticket_status_updated', onUpdate);
    socket.on('assigned_ticket_updated', onUpdate);
    socket.on('new_message', (payload: { ticketId: string; message: Message }) => {
      if (payload.ticketId === ticketNumber) {
        setTicket((prev) => (prev ? { ...prev, messages: [...prev.messages, payload.message] } : prev));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [ticketNumber]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  const extractError = (err: any) =>
    err.response?.data?.message
      ? Array.isArray(err.response.data.message) ? err.response.data.message.join(' • ') : err.response.data.message
      : 'İşlem başarısız';

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !ticketNumber) return;
    setSending(true);
    try {
      await api.post(`/tickets/${ticketNumber}/messages`, {
        content: messageText.trim(),
        ...(isAssignedAgent && awaitCustomer ? { awaitCustomer: true } : {}),
      });
      setMessageText('');
      setAwaitCustomer(false);
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: string, note?: string) => {
    if (!ticketNumber) return;
    setError('');
    try {
      await api.patch(`/tickets/${ticketNumber}/status`, note ? { status, resolutionNote: note } : { status });
      setShowResolveForm(false);
      setResolutionNote('');
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  const saveCategory = async () => {
    if (!ticketNumber) return;
    try {
      await api.patch(`/tickets/${ticketNumber}/category`, { category: categoryDraft });
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  const savePriority = async () => {
    if (!ticketNumber) return;
    try {
      await api.patch(`/tickets/${ticketNumber}/priority`, { priority: priorityDraft });
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketNumber || !assignAgentId.trim()) return;
    try {
      await api.patch(`/tickets/${ticketNumber}/assign`, { agentId: assignAgentId.trim() });
      setAssignAgentId('');
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  const submitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketNumber || ratingValue < 1) return;
    try {
      await api.post(`/tickets/${ticketNumber}/rating`, {
        rating: ratingValue,
        comment: ratingComment.trim() || undefined,
      });
      await loadTicket();
    } catch (err: any) {
      setError(extractError(err));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-surface">
        <Navbar />
        <div className="max-w-5xl mx-auto py-16 text-center text-gray-500">Yükleniyor...</div>
      </div>
    );
  }

  if (notFound || !ticket) {
    return (
      <div className="min-h-screen bg-brand-surface">
        <Navbar />
        <div className="max-w-5xl mx-auto py-16 text-center">
          <p className="text-lg font-medium text-gray-700">Talep bulunamadı.</p>
          <Link to="/" className="mt-4 inline-block text-brand-primary hover:underline">Panele dön</Link>
        </div>
      </div>
    );
  }

  const canOverrideCategory = (isAssignedAgent || user?.role === 'SUPERVIZOR') && !isClosed;

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center text-sm text-gray-500 hover:text-brand-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Panele dön
        </Link>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="glass-panel p-6 mb-6 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-500">{ticket.ticketNumber}</span>
              <h1 className="mt-2 text-xl font-bold text-gray-900">{ticket.title}</h1>
              <p className="mt-1 text-xs text-gray-400">
                Oluşturulma: {new Date(ticket.createdAt).toLocaleString('tr-TR')}
              </p>
              {!isOwner && (
                <p className="mt-1 text-xs text-gray-500">
                  Müşteri: <span className="font-medium text-gray-700">{fullName(directory.get(ticket.customerId)) ?? '—'}</span>
                </p>
              )}
              <p className="mt-0.5 text-xs text-gray-500">
                Atanan Temsilci:{' '}
                <span className="font-medium text-gray-700">
                  {ticket.assignedAgentId ? (fullName(directory.get(ticket.assignedAgentId)) ?? '—') : 'Henüz atanmadı'}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClass('status', ticket.status)}`}>
                {STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClass('priority', ticket.priority)}`}>
                {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">
                <Tag className="w-3 h-3 inline mr-1" />
                {CATEGORY_LABELS[ticket.category] ?? ticket.category}
              </span>
            </div>
          </div>
          <p className="mt-4 text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mesajlaşma */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-gray-100 bg-gray-50 font-semibold text-gray-800">Mesajlar</div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto flex-1">
              {ticket.messages.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Henüz mesaj yok.</p>
              ) : (
                ticket.messages.map((m, i) => {
                  const mine = m.senderId === user?.id;
                  return (
                    <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                        mine ? 'bg-brand-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                          {fullName(directory.get(m.senderId)) ?? MESSAGE_ROLE_LABELS[m.senderRole] ?? m.senderRole}
                          {' '}({MESSAGE_ROLE_LABELS[m.senderRole] ?? m.senderRole}) ·{' '}
                          {new Date(m.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            {canMessage && !isClosed ? (
              <form onSubmit={sendMessage} className="p-4 border-t border-gray-100 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                    className={inputClass}
                  />
                  <button type="submit" disabled={sending || !messageText.trim()} className="btn-primary shrink-0 disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                {isAssignedAgent && ticket.status === 'ISLEMDE' && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={awaitCustomer} onChange={(e) => setAwaitCustomer(e.target.checked)} />
                    Müşteriden bilgi bekleniyor olarak işaretle
                  </label>
                )}
              </form>
            ) : (
              <div className="p-4 border-t border-gray-100 text-xs text-gray-400 text-center">
                {isClosed ? 'Talep kapatıldığı için mesajlaşma devre dışı.' : 'Bu talep üzerinde mesajlaşma yetkiniz yok.'}
              </div>
            )}
          </div>

          {/* Yan panel: AI analizi + işlemler */}
          <div className="space-y-6 animate-slide-up">
            {/* AI analiz kartı */}
            <div className="glass-panel p-5">
              <h3 className="text-sm font-bold text-gray-900 flex items-center mb-3">
                <Sparkles className="w-4 h-4 mr-2 text-brand-primary" />
                Yapay Zeka Analizi
              </h3>
              {ai ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Güven skoru</span>
                    <span className="font-medium text-gray-900">{Math.round(ai.confidence * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Duygu tonu</span>
                    {(() => {
                      const SentimentIcon = SENTIMENT_ICONS[ai.sentiment] ?? Meh;
                      const color = SENTIMENT_COLORS[ai.sentiment] ?? '#64748B';
                      return (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ color, borderColor: color, backgroundColor: `${color}14` }}
                        >
                          <SentimentIcon className="w-3.5 h-3.5" />
                          {SENTIMENT_LABELS[ai.sentiment] ?? ai.sentiment}
                        </span>
                      );
                    })()}
                  </div>
                  {ticket.aiCategory && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">AI önerisi</span>
                      <span className="font-medium text-gray-900">{CATEGORY_LABELS[ticket.aiCategory] ?? ticket.aiCategory}</span>
                    </div>
                  )}
                  {ai.manual_queue && (
                    <p className="flex items-center gap-1.5 text-amber-600 text-xs mt-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Manuel atama kuyruğunda bekliyor
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Analiz sonucu henüz gelmedi.</p>
              )}
            </div>

            {/* Temsilci işlemleri */}
            {isAssignedAgent && !isClosed && (
              <div className="glass-panel p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Temsilci İşlemleri</h3>
                <div className="space-y-2">
                  {ticket.status === 'ATANDI' && (
                    <button onClick={() => changeStatus('ISLEMDE')} className="w-full flex items-center justify-center btn-primary text-sm">
                      <PlayCircle className="w-4 h-4 mr-2" /> İşe Başla
                    </button>
                  )}
                  {ticket.status === 'ISLEMDE' && !showResolveForm && (
                    <button onClick={() => setShowResolveForm(true)} className="w-full flex items-center justify-center btn-primary text-sm">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Çözüldü Olarak İşaretle
                    </button>
                  )}
                  {showResolveForm && (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        placeholder="Çözüm notu (zorunlu)"
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        className={inputClass}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => changeStatus('COZULDU', resolutionNote)}
                          disabled={!resolutionNote.trim()}
                          className="flex-1 btn-primary text-sm disabled:opacity-50"
                        >
                          Gönder
                        </button>
                        <button onClick={() => setShowResolveForm(false)} className="flex-1 btn-secondary text-sm">
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Kategori override (temsilci-atanan / süpervizör) */}
            {canOverrideCategory && (
              <div className="glass-panel p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Kategori (AI Override)</h3>
                <div className="flex gap-2">
                  <select value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} className={inputClass}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <button onClick={saveCategory} disabled={categoryDraft === ticket.category} className="btn-secondary text-sm shrink-0 disabled:opacity-50">
                    Kaydet
                  </button>
                </div>
              </div>
            )}

            {/* Süpervizör işlemleri */}
            {isSupervisorOrAdmin && user?.role === 'SUPERVIZOR' && !isClosed && (
              <div className="glass-panel p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center">
                  <Gauge className="w-4 h-4 mr-2 text-brand-primary" /> Süpervizör İşlemleri
                </h3>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Öncelik</label>
                  <div className="flex gap-2">
                    <select value={priorityDraft} onChange={(e) => setPriorityDraft(e.target.value)} className={inputClass}>
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                      ))}
                    </select>
                    <button onClick={savePriority} disabled={priorityDraft === ticket.priority} className="btn-secondary text-sm shrink-0 disabled:opacity-50">
                      Kaydet
                    </button>
                  </div>
                </div>
                <form onSubmit={submitAssign}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Manuel Atama (Temsilci)</label>
                  <div className="flex gap-2">
                    <select value={assignAgentId} onChange={(e) => setAssignAgentId(e.target.value)} className={inputClass}>
                      <option value="">Temsilci seçin...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {fullName(a)}{a.specialties?.length ? ` — ${a.specialties.map((s) => CATEGORY_LABELS[s] ?? s).join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={!assignAgentId} className="btn-primary text-sm shrink-0 disabled:opacity-50">
                      <UserCheck className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Müşteri: çözüm onayı/reddi */}
            {isOwner && ticket.status === 'COZULDU' && (
              <div className="glass-panel p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Çözüm Bekliyor</h3>
                <p className="text-xs text-gray-500 mb-3">Talebiniz temsilci tarafından çözüldü olarak işaretlendi. Onaylıyor musunuz?</p>
                <div className="flex gap-2">
                  <button onClick={() => changeStatus('KAPANDI')} className="flex-1 flex items-center justify-center btn-primary text-sm">
                    <ThumbsUp className="w-4 h-4 mr-2" /> Onayla
                  </button>
                  <button onClick={() => changeStatus('ISLEMDE')} className="flex-1 flex items-center justify-center btn-secondary text-sm">
                    <ThumbsDown className="w-4 h-4 mr-2" /> Reddet
                  </button>
                </div>
              </div>
            )}

            {/* Müşteri: puanlama */}
            {isOwner && ['COZULDU', 'KAPANDI'].includes(ticket.status) && !ticket.rating && (
              <div className="glass-panel p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Çözümü Puanla</h3>
                <form onSubmit={submitRating} className="space-y-3">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} type="button" onClick={() => setRatingValue(star)}>
                        <Star
                          className={`w-7 h-7 ${star <= ratingValue ? 'fill-brand-secondary text-brand-secondary' : 'text-gray-300'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Yorumunuz (opsiyonel)"
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    className={inputClass}
                  />
                  <button type="submit" disabled={ratingValue < 1} className="w-full btn-primary text-sm disabled:opacity-50">
                    Puanı Gönder
                  </button>
                </form>
              </div>
            )}

            {ticket.rating && (
              <div className="glass-panel p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Müşteri Puanı</h3>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`w-5 h-5 ${star <= ticket.rating! ? 'fill-brand-secondary text-brand-secondary' : 'text-gray-300'}`} />
                  ))}
                </div>
                {ticket.ratingComment && <p className="mt-2 text-sm text-gray-600 italic">"{ticket.ratingComment}"</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetail;
