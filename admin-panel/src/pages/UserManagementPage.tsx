import React from 'react';
import Navbar from '../components/Navbar';
import UserManagement from '../components/UserManagement';

const UserManagementPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-surface">
      <Navbar />
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-primary">Kullanıcı Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">Kullanıcı hesapları oluşturun ve rollerini yönetin.</p>
        </div>
        <div className="animate-slide-up">
          <UserManagement />
        </div>
      </main>
    </div>
  );
};

export default UserManagementPage;
