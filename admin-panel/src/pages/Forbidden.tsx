import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';

const Forbidden: React.FC = () => (
  <div className="min-h-screen bg-brand-surface flex flex-col items-center justify-center px-4 text-center">
    <div className="p-5 bg-red-100 text-red-600 rounded-full mb-4">
      <ShieldOff className="w-10 h-10" />
    </div>
    <h1 className="text-4xl font-extrabold text-red-600">403</h1>
    <p className="mt-2 text-gray-600">Bu sayfayı görüntülemek için yetkiniz yok.</p>
    <Link to="/" className="mt-6 btn-primary">Panele dön</Link>
  </div>
);

export default Forbidden;
