import React, { useEffect, useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import api from '../services/api';

const SPECIALTIES = [
  { value: 'FATURA', label: 'Fatura' },
  { value: 'SEBEKE', label: 'Şebeke' },
  { value: 'CIHAZ', label: 'Cihaz' },
  { value: 'TARIFE', label: 'Tarife' },
  { value: 'IPTAL', label: 'İptal' },
];

const ROLE_LABELS: Record<string, string> = {
  USER: 'Müşteri',
  TEMSILCI: 'Temsilci',
  SUPERVIZOR: 'Süpervizör',
  ADMIN: 'Admin',
};

interface UserRow {
  id: string;
  email: string | null;
  gsmNumber: string | null;
  firstName: string;
  lastName: string;
  role: string;
  specialties: string[];
  isActive: boolean;
}

// Admin: temsilci/süpervizör hesabı oluşturma + kullanıcı listesi
const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('TEMSILCI');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState('');

  const loadUsers = () => {
    api.get('/auth/users')
      .then((res) => setUsers(res.data))
      .catch((err) => console.error('Kullanıcılar alınamadı:', err));
  };

  useEffect(loadUsers, []);

  const toggleSpecialty = (value: string) => {
    setSpecialties((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSuccess('');
    try {
      const body: Record<string, unknown> = { email, firstName, lastName, password, role };
      if (role === 'TEMSILCI') body.specialties = specialties;
      await api.post('/auth/users', body);
      setSuccess(`${ROLE_LABELS[role]} hesabı oluşturuldu: ${email}`);
      setEmail(''); setFirstName(''); setLastName(''); setPassword(''); setSpecialties([]);
      loadUsers();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setErrors(Array.isArray(msg) ? msg : [msg || 'Hesap oluşturulamadı']);
    }
  };

  const inputClass =
    'appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm';

  return (
    <div className="glass-panel p-6">
      <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
        <Users className="w-5 h-5 mr-2 text-brand-primary" />
        Kullanıcı Yönetimi
      </h3>

      <form onSubmit={handleCreate} className="space-y-3 mb-6">
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm">
            <ul className="list-disc list-inside">
              {errors.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input type="text" required minLength={2} placeholder="Ad" value={firstName}
            onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          <input type="text" required minLength={2} placeholder="Soyad" value={lastName}
            onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        </div>
        <input type="email" required placeholder="E-posta" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required placeholder="Şifre (min 8, büyük harf, rakam, özel karakter)"
          value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />

        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option value="TEMSILCI">Temsilci</option>
          <option value="SUPERVIZOR">Süpervizör</option>
          <option value="ADMIN">Admin</option>
        </select>

        {role === 'TEMSILCI' && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Uzmanlık Alanları <span className="text-gray-400">(birden fazla seçilebilir)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSpecialty(s.value)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    specialties.includes(s.value)
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-primary'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="submit" className="w-full flex justify-center items-center btn-primary">
          <UserPlus className="w-4 h-4 mr-2" />
          Hesap Oluştur
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">Ad Soyad</th>
              <th className="py-2 pr-4">E-posta / GSM</th>
              <th className="py-2 pr-4">Rol</th>
              <th className="py-2">Uzmanlıklar</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium text-gray-900">
                  {u.firstName} {u.lastName}
                </td>
                <td className="py-2 pr-4 text-gray-600">{u.email ?? u.gsmNumber}</td>
                <td className="py-2 pr-4">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="py-2 text-gray-600">
                  {u.specialties?.length
                    ? u.specialties.map((s) => SPECIALTIES.find((x) => x.value === s)?.label ?? s).join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;
