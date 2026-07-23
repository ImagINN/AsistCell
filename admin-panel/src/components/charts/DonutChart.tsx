import React from 'react';

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
}

// Bağımlılıksız basit donut grafik (SVG stroke-dasharray tekniği)
const DonutChart: React.FC<DonutChartProps> = ({ data, size = 160, thickness = 22 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={thickness}
        />
        {total === 0 ? null : (
          data.map((d) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return circle;
          })
        )}
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold text-gray-900">
              {d.value}
              {total > 0 && <span className="text-gray-400 font-normal"> ({Math.round((d.value / total) * 100)}%)</span>}
            </span>
          </div>
        ))}
        {total === 0 && <p className="text-sm text-gray-400">Henüz veri yok</p>}
      </div>
    </div>
  );
};

export default DonutChart;
