import React from 'react';

export interface BarDatum {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: BarDatum[];
}

// Bağımlılıksız basit yatay bar grafik
const BarChart: React.FC<BarChartProps> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold text-gray-900">{d.value}</span>
          </div>
          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-gray-400">Henüz veri yok</p>}
    </div>
  );
};

export default BarChart;
