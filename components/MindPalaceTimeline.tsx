import React, { useCallback } from 'react';

interface MindPalaceTimelineProps {
  minTime: number;
  maxTime: number;
  timeRange: [number, number];
  onTimeRangeChange: (range: [number, number]) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MindPalaceTimeline: React.FC<MindPalaceTimelineProps> = ({
  minTime,
  maxTime,
  timeRange,
  onTimeRangeChange,
}) => {
  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      onTimeRangeChange([Math.min(val, timeRange[1]), timeRange[1]]);
    },
    [timeRange, onTimeRangeChange],
  );

  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      onTimeRangeChange([timeRange[0], Math.max(val, timeRange[0])]);
    },
    [timeRange, onTimeRangeChange],
  );

  return (
    <div className="px-6 py-3 border-t border-white/8">
      <div className="flex items-center space-x-4">
        <span className="text-[10px] text-white/30 w-32 text-right">{formatDate(timeRange[0])}</span>
        <div className="flex-1 flex flex-col space-y-1">
          <input
            type="range"
            min={minTime}
            max={maxTime}
            value={timeRange[0]}
            onChange={handleStartChange}
            className="w-full accent-purple-400 h-1"
            style={{ opacity: 0.6 }}
          />
          <input
            type="range"
            min={minTime}
            max={maxTime}
            value={timeRange[1]}
            onChange={handleEndChange}
            className="w-full accent-purple-400 h-1"
            style={{ opacity: 0.6 }}
          />
        </div>
        <span className="text-[10px] text-white/30 w-32">{formatDate(timeRange[1])}</span>
      </div>
    </div>
  );
};

export default MindPalaceTimeline;
