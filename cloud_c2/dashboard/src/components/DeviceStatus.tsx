import React from 'react';
import { AttackType } from './AttackControls';

type DeviceState = 'idle' | 'active' | 'blocked';

interface DeviceStatusProps {
  activeAttack: AttackType;
  frameCount: number;
}

const STATUS_DOT: Record<DeviceState, string> = {
  idle: 'bg-white/20',
  active: 'bg-red-500 pulse-red',
  blocked: 'bg-yellow-500',
};

export const DeviceStatus: React.FC<DeviceStatusProps> = ({ activeAttack }) => {
  const state: DeviceState = activeAttack === 'exfil' ? 'active' : 'idle';

  return (
    <div className="relative group">
      <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 bg-white pointer-events-none opacity-50" />
      <div className="relative bg-black border border-white/20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-black uppercase italic text-white/90">ESP32-CAM</span>
          <span className="text-[8px] font-mono text-white/40 tracking-wider">192.168.4.10</span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[state]}`} />
      </div>
    </div>
  );
};
