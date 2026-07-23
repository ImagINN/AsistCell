import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, ShieldCheck, Check, X } from 'lucide-react';
import api from '../services/api';

// Backend'deki şifre politikasının birebir istemci karşılığı (canlı gösterim için)
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'En az 8 karakter', test: (p) => p.length >= 8 },
  { label: 'En az 1 büyük harf', test: (p) => /[A-Z]/.test(p) },
  { label: 'En az 1 rakam', test: (p) => /\d/.test(p) },
  { label: 'En az 1 özel karakter', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const Register: React.FC = () => {
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gsmNumber, setGsmNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const extractErrors = (err: any): string[] => {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg;
    if (msg) return [msg];
    return ['İşlem başarısız, lütfen tekrar deneyin'];
  };

  // Adım 1: form doğrulanır, OTP istenir
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    const failed = PASSWORD_RULES.filter((r) => !r.test(password));
    if (failed.length > 0) {
      setErrors(failed.map((r) => `Şifre kuralı: ${r.label.toLowerCase()}`));
      return;
    }
    try {
      const res = await api.post('/auth/otp/request', { gsmNumber });
      setInfo(res.data.message);
      setStep('otp');
    } catch (err: any) {
      setErrors(extractErrors(err));
    }
  };

  // Adım 2: OTP ile kayıt tamamlanır
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    try {
      const body: Record<string, string> = {
        firstName,
        lastName,
        gsmNumber,
        password,
        otpCode,
      };
      if (email.trim()) body.email = email.trim();
      const res = await api.post('/auth/register', body);
      login(res.data.tokens.access_token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setErrors(extractErrors(err));
    }
  };

  const inputClass =
    'appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm';

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-cover bg-center" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-slide-up">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-brand-primary">
          Müşteri Kaydı
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Turkcell GSM numaranız ile kayıt olun
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glass-panel py-8 px-4 sm:px-10">
          {errors.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              <ul className="list-disc list-inside space-y-1">
                {errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 'form' && (
            <form className="space-y-4" onSubmit={handleRequestOtp}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ad</label>
                  <input type="text" required minLength={2} value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Soyad</label>
                  <input type="text" required minLength={2} value={lastName}
                    onChange={(e) => setLastName(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">GSM Numarası</label>
                <input type="tel" required value={gsmNumber} placeholder="5XX XXX XX XX"
                  onChange={(e) => setGsmNumber(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  E-posta <span className="text-gray-400">(opsiyonel)</span>
                </label>
                <input type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Şifre</label>
                <input type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const ok = rule.test(password);
                    return (
                      <li key={rule.label} className={`flex items-center text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
                        {ok ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button type="submit" className="w-full flex justify-center items-center btn-primary">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Doğrulama Kodu Gönder
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form className="space-y-4" onSubmit={handleRegister}>
              {info && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm text-center">
                  {info}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Doğrulama Kodu (SMS ile gönderildi)
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 haneli kod"
                  className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                />
              </div>
              <button type="submit" className="w-full flex justify-center items-center btn-primary">
                <UserPlus className="w-4 h-4 mr-2" />
                Kaydı Tamamla
              </button>
              <button
                type="button"
                onClick={() => { setStep('form'); setOtpCode(''); setErrors([]); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← Bilgileri düzenle
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-600">
            Zaten hesabınız var mı?{' '}
            <Link to="/login" className="font-medium text-brand-primary hover:underline">
              Giriş yapın
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
