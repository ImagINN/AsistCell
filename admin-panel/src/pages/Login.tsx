import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Lock } from 'lucide-react';
import api from '../services/api';

// Girilen değer rakam/boşluk/+/- içeriyorsa GSM, aksi halde e-posta kabul edilir
const looksLikeGsm = (value: string) => /^[+\d][\d\s-]*$/.test(value.trim());

const formatCountdown = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lockRemaining, setLockRemaining] = useState(0);
  const navigate = useNavigate();
  const { login } = useAuth();

  // Kilit sayacı: her saniye azalır, sıfırlanınca form tekrar açılır
  useEffect(() => {
    if (lockRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockRemaining((prev) => {
        if (prev <= 1) {
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockRemaining > 0]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const body = looksLikeGsm(identifier)
        ? { gsmNumber: identifier, password }
        : { email: identifier, password };
      const res = await api.post('/auth/login', body);
      login(res.data.tokens.access_token, res.data.user);
      navigate('/');
    } catch (err: any) {
      const data = err.response?.data;
      if (err.response?.status === 423 && data?.remainingSeconds) {
        setLockRemaining(data.remainingSeconds);
        setError(data.message);
      } else {
        const msg = data?.message;
        setError(Array.isArray(msg) ? msg.join(' • ') : msg || 'Giriş başarısız');
      }
    }
  };

  const isLocked = lockRemaining > 0;

  return (
    <div className="min-h-screen bg-brand-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-cover bg-center" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-slide-up">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-brand-primary">
          AsistCell
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Müşteri, Temsilci veya Süpervizör Girişi
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glass-panel py-8 px-4 sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && !isLocked && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm text-center animate-pulse-soft">
                {error}
              </div>
            )}
            {isLocked && (
              <div className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm text-center">
                <div className="flex items-center justify-center mb-1">
                  <Lock className="w-4 h-4 mr-2" />
                  Hesabınız kilitlendi
                </div>
                <div className="text-2xl font-mono font-bold tracking-widest">
                  {formatCountdown(lockRemaining)}
                </div>
                <div className="text-xs mt-1">süre dolunca tekrar deneyebilirsiniz</div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                E-posta veya GSM Numarası
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ornek@mail.com veya 05XX XXX XX XX"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Şifre
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLocked}
                className="w-full flex justify-center items-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Giriş Yap
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Hesabınız yok mu?{' '}
            <Link to="/register" className="font-medium text-brand-primary hover:underline">
              Müşteri kaydı oluşturun
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
