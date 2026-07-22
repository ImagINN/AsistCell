import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Globe, Send } from 'lucide-react';
import api from '../services/api';

const TITLE_MIN = 5;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;

// Şu an tek kanal WEB — backend TicketChannel enum'u ile birebir eşleşir.
const CHANNEL = 'WEB';

const CreateTicket: React.FC = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [createdTicket, setCreatedTicket] = useState<{ ticketNumber: string } | null>(null);
  const navigate = useNavigate();

  const titleValid = title.length >= TITLE_MIN && title.length <= TITLE_MAX;
  const descriptionValid = description.length >= DESCRIPTION_MIN;
  const formValid = titleValid && descriptionValid;

  const extractErrors = (err: any): string[] => {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg;
    if (msg) return [msg];
    return ['Talep oluşturulamadı, lütfen tekrar deneyin'];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    if (!formValid) {
      const fieldErrors: string[] = [];
      if (!titleValid) fieldErrors.push(`Başlık ${TITLE_MIN}-${TITLE_MAX} karakter arasında olmalı`);
      if (!descriptionValid) fieldErrors.push(`Açıklama en az ${DESCRIPTION_MIN} karakter olmalı`);
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/tickets', { title, description, channel: CHANNEL });
      setCreatedTicket({ ticketNumber: res.data.ticketNumber });
    } catch (err: any) {
      setErrors(extractErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setErrors([]);
    setCreatedTicket(null);
  };

  const inputClass =
    'appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm';

  const counterClass = (valid: boolean) =>
    `text-xs mt-1 ${valid ? 'text-green-600' : 'text-gray-400'}`;

  return (
    <div className="min-h-screen bg-brand-surface py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto animate-slide-up">
        <Link to="/" className="inline-flex items-center text-sm text-gray-500 hover:text-brand-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Panele dön
        </Link>

        <div className="glass-panel p-8">
          {createdTicket ? (
            <div className="text-center py-6 animate-fade-in">
              <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-green-100 text-green-600 mb-4">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Talebiniz oluşturuldu</h2>
              <p className="mt-2 text-sm text-gray-500">
                Talep numaranız:
              </p>
              <p className="mt-1 font-mono text-lg bg-gray-100 inline-block px-4 py-1.5 rounded-lg text-brand-primary font-semibold">
                {createdTicket.ticketNumber}
              </p>
              <p className="mt-4 text-sm text-gray-500">
                Talebiniz yapay zeka tarafından analiz ediliyor; kategori ve öncelik
                kısa süre içinde otomatik atanacak.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={resetForm} className="btn-secondary">
                  Yeni Talep Oluştur
                </button>
                <button onClick={() => navigate('/')} className="btn-primary">
                  Panele Dön
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-brand-primary">Yeni Talep Oluştur</h2>
              <p className="mt-1 text-sm text-gray-500">
                Sorununuzu kısaca açıklayın, ekibimiz en kısa sürede size dönüş yapsın.
              </p>

              {errors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Başlık</label>
                  <input
                    type="text"
                    required
                    maxLength={TITLE_MAX}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Örn: Faturamda anlamadığım bir ücret var"
                    className={inputClass}
                  />
                  <p className={counterClass(titleValid)}>
                    {title.length}/{TITLE_MAX} karakter (en az {TITLE_MIN})
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Açıklama</label>
                  <textarea
                    required
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Yaşadığınız sorunu detaylıca açıklayın..."
                    className={inputClass}
                  />
                  <p className={counterClass(descriptionValid)}>
                    {description.length} karakter (en az {DESCRIPTION_MIN})
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Kanal</label>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    <Globe className="w-4 h-4 text-brand-primary" />
                    Web
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !formValid}
                  className="w-full flex justify-center items-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? 'Gönderiliyor...' : 'Talebi Gönder'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateTicket;
