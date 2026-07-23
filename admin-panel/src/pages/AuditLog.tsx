import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { fetchUsersByIds, fullName, type DirectoryUser } from '../services/directory';
import { ROLE_LABELS } from '../constants/roles';

interface LogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetId: string | null;
  ipAddress: string | null;
  success: boolean;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

type SortField = 'createdAt' | 'actorEmail' | 'action' | 'targetId';

const PAGE_SIZE = 50;

const COLUMNS: { field: SortField; label: string }[] = [
  { field: 'createdAt', label: 'Zaman' },
  { field: 'actorEmail', label: 'Aktör (user_id)' },
  { field: 'action', label: 'İşlem' },
  { field: 'targetId', label: 'Hedef' },
];

const AuditLog: React.FC = () => {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Map<string, DirectoryUser>>(new Map());
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = async (nextSkip: number, replace: boolean) => {
    setLoading(true);
    try {
      const res = await api.get('/auth/audit-logs', {
        params: { take: PAGE_SIZE, skip: nextSkip, sortBy: sortField, sortOrder, search: search || undefined },
      });
      const nextItems: LogEntry[] = replace ? res.data.items : [...items, ...res.data.items];
      setItems(nextItems);
      setTotal(res.data.total);
      setSkip(nextSkip);
      fetchUsersByIds(nextItems.flatMap((i) => [i.actorId, i.targetId])).then((resolved) =>
        setNames((prev) => new Map([...prev, ...resolved])),
      );
    } catch (err) {
      console.error('Audit log yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  // Kişi ID'si ise "İsim Soyisim (Rol)" gösterir; kişi değilse (örn. talep numarası) ham değeri döner
  const personLabel = (id: string | null, fallbackEmail?: string | null) => {
    if (fallbackEmail) return fallbackEmail;
    if (!id) return '—';
    const u = names.get(id);
    return u ? `${fullName(u)} (${ROLE_LABELS[u.role] ?? u.role})` : id;
  };

  // Spec: her log kaydında detay (ilgili kaynak id'si) görünür olmalı.
  // detail JSON'ını "anahtar: değer" özetine çevirir (örn. ticketNumber: TCK-2026-000012 · from: ISLEMDE · to: COZULDU)
  const formatDetail = (detail: Record<string, unknown> | null) => {
    if (!detail || Object.keys(detail).length === 0) return '—';
    return Object.entries(detail)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ');
  };

  // Arama sunucuda Prisma'nın parametreli `contains` filtresiyle çalışır — ham SQL
  // birleştirme yapılmadığı için SQL injection riski taşımaz. Debounce ile aranır.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortOrder, search]);

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortIcon = (field: SortField) => {
    if (field !== sortField) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-brand-primary" /> : <ArrowDown className="w-3.5 h-3.5 text-brand-primary" />;
  };

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">Audit Log</h1>
            <p className="text-sm text-gray-500 mt-1">Giriş denemeleri, hesap kilitlenmesi, rol değişiklikleri ve yetkisiz erişim denemeleri.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="E-posta, işlem, ID veya IP ara..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-brand-primary focus:border-brand-primary"
            />
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-lg border border-white/20 shadow-lg rounded-2xl">
          <div className="overflow-x-auto rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500 border-b">
                  {COLUMNS.map((col) => (
                    <th key={col.field} className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleSort(col.field)}
                        className="inline-flex items-center gap-1 hover:text-brand-primary transition-colors"
                      >
                        {col.label}
                        {sortIcon(col.field)}
                      </button>
                    </th>
                  ))}
                  <th className="py-3 px-4 whitespace-nowrap">Detay</th>
                  <th className="py-3 px-4 whitespace-nowrap">IP</th>
                  <th className="py-3 px-4 whitespace-nowrap">Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                      {new Date(log.createdAt).toLocaleString('tr-TR')}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-800" title={log.actorId ?? undefined}>
                      {personLabel(log.actorId, log.actorEmail)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{log.action}</span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-500 text-xs" title={log.targetId ?? undefined}>
                      {personLabel(log.targetId)}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs font-mono max-w-xs truncate" title={formatDetail(log.detail)}>
                      {formatDetail(log.detail)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-500 text-xs">{log.ipAddress ?? '—'}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" /> Başarılı
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" /> Başarısız
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !loading && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Kayıt bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {items.length < total && (
            <div className="p-4 border-t border-gray-100 text-center">
              <button
                onClick={() => load(skip + PAGE_SIZE, false)}
                disabled={loading}
                className="btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ChevronDown className="w-4 h-4" />
                {loading ? 'Yükleniyor...' : `Daha fazla yükle (${items.length}/${total})`}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuditLog;
