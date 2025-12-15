import React from 'react';

interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  color?: string; // Kept for interface compatibility but mostly overriding with brutalist styles
  suffix?: string;
  emoji?: string;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step, 
  onChange,
  suffix = "",
  emoji = "🎚️"
}) => {
  return (
    <div className="w-full mb-8 bg-white text-black p-4 border-4 border-black shadow-hard">
      <div className="flex justify-between items-end mb-2">
        <label className="font-black text-xl uppercase tracking-tighter bg-black text-white px-2 py-1 transform -rotate-1">
          {emoji} {label}
        </label>
        <span className="font-mono font-bold text-2xl">
            {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-8 bg-gray-200 border-2 border-black rounded-none appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-[#ffff00]"
        style={{
            accentColor: '#ff00ff'
        }}
      />
    </div>
  );
};