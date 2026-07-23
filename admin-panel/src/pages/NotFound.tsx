import React from 'react';
import { Link } from 'react-router-dom';
import { CompassIcon } from 'lucide-react';

const NotFound: React.FC = () => (
  <div className="min-h-screen bg-brand-surface flex flex-col items-center justify-center px-4 text-center">
    <div className="p-5 bg-blue-100 text-brand-primary rounded-full mb-4">
      <CompassIcon className="w-10 h-10" />
    </div>
    <h1 className="text-4xl font-extrabold text-brand-primary">404</h1>
    <p className="mt-2 text-gray-600">Aradığınız sayfa bulunamadı.</p>
    <Link to="/" className="mt-6 btn-primary">Panele dön</Link>
  </div>
);

export default NotFound;
