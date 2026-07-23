import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Trophy } from 'lucide-react';
import { fetchUsersByIds, fullName, type DirectoryUser } from '../services/directory';

interface LeaderboardEntry {
  agentId: string;
  score: number;
  rank?: number;
}

const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'all_time'>('daily');
  const [names, setNames] = useState<Map<string, DirectoryUser>>(new Map());

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await api.get(`/game/leaderboard?period=${period}&top=10`);
        setEntries(response.data);
        setNames(await fetchUsersByIds(response.data.map((e: LeaderboardEntry) => e.agentId)));
      } catch (error) {
        console.error('Leaderboard getirilemedi:', error);
      }
    };

    fetchLeaderboard();
  }, [period]);

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg">
            <Trophy className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Liderlik Tablosu</h2>
        </div>
        
        <select 
          className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-brand-primary focus:ring focus:ring-brand-primary focus:ring-opacity-50"
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
        >
          <option value="daily">Bugün</option>
          <option value="weekly">Bu Hafta</option>
          <option value="all_time">Tüm Zamanlar</option>
        </select>
      </div>

      <div className="divide-y divide-gray-100">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-gray-500">Henüz puan kazanan kimse yok.</p>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.agentId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index === 0 ? 'bg-yellow-100 text-yellow-700' :
                  index === 1 ? 'bg-gray-200 text-gray-700' :
                  index === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  #{index + 1}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{fullName(names.get(entry.agentId)) ?? entry.agentId}</h4>
                  <p className="text-xs text-gray-500">Temsilci</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-brand-primary">{entry.score}</span>
                <span className="text-xs text-gray-500">XP</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
