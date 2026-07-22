import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown } from 'lucide-react';
import api from '../services/api';
import Navbar from '../components/Navbar';

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

const PAGE_SIZE = 50;

const AuditLog: React.FC = () => {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async (nextSkip: number, replace: boolean) => {
    setLoading(true);
    try {
      const res = await api.get('/auth/audit-logs', { params: { take: PAGE_SIZE, skip: nextSkip } });
      setItems((prev) => (replace ? res.data.items : [...prev, ...res.data.items]));
      setTotal(res.data.total);
      setSkip(nextSkip);
    } catch (err) {
      console.error('Audit log yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-primary">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">Giriş denemeleri, hesap kilitlenmesi, rol değişiklikleri ve yetkisiz erişim denemeleri.</p>
        </div>

        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-3 px-4">Zaman</th>
                  <th className="py-3 px-4">Aktör</th>
                  <th className="py-3 px-4">İşlem</th>
                  <th className="py-3 px-4">Hedef</th>
                  <th className="py-3 px-4">IP</th>
                  <th className="py-3 px-4">Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {items.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                      {new Date(log.createdAt).toLocaleString('tr-TR')}
                    </td>
                    <td className="py-2.5 px-4 text-gray-800">{log.actorEmail ?? log.actorId ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{log.action}</span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">{log.targetId ?? '—'}</td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">{log.ipAddress ?? '—'}</td>
                    <td className="py-2.5 px-4">
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
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Kayıt bulunamadı</td></tr>
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
