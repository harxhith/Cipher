import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Scan, Waves, StopCircle, FlaskConical, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface DemoPanelProps {
  activeAttack: 'exfil' | 'recon' | 'flood' | null | undefined;
  triggerExfil:  () => void;
  triggerRecon:  () => void;
  triggerFlood:  () => void;
  stopAttacks:   () => void;
  protectionEnabled: boolean;
}

const ATTACKS = [
  {
    key: 'exfil' as const,
    label: 'Data Exfil',
    sub: 'ESP32 → GCP C2',
    Icon: Zap,
    color: 'border-orange-500 text-orange-400 hover:bg-orange-500/20 bg-orange-500/10',
    activeColor: 'bg-orange-500/30 border-orange-400 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.4)]',
  },
  {
    key: 'recon' as const,
    label: 'Port Scan',
    sub: 'SYN sweep LAN',
    Icon: Scan,
    color: 'border-yellow-500 text-yellow-400 hover:bg-yellow-500/20 bg-yellow-500/10',
    activeColor: 'bg-yellow-500/30 border-yellow-400 text-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.4)]',
  },
  {
    key: 'flood' as const,
    label: 'UDP Flood',
    sub: 'DDoS gateway DNS',
    Icon: Waves,
    color: 'border-red-500 text-red-400 hover:bg-red-500/20 bg-red-500/10',
    activeColor: 'bg-red-500/30 border-red-400 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.4)]',
  },
] as const;

export const DemoPanel: React.FC<DemoPanelProps> = ({
  activeAttack,
  triggerExfil,
  triggerRecon,
  triggerFlood,
  stopAttacks,
  protectionEnabled,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const handlers: Record<string, () => void> = {
    exfil: triggerExfil,
    recon:  triggerRecon,
    flood:  triggerFlood,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      style={{ width: 'max-content' }}
    >
      {/* Demo banner pill */}
      <div className="flex justify-center mb-2">
        <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-500/50 text-purple-300 text-[9px] font-mono uppercase tracking-widest rounded-full">
          <FlaskConical size={10} />
          <span>Interactive Demo — No real RPi required</span>
          <button
            onClick={() => setCollapsed(p => !p)}
            className="ml-1 text-purple-400 hover:text-purple-200 transition-colors"
            aria-label="Toggle demo panel"
          >
            <ChevronUp
              size={11}
              className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.8, originY: 1 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.8 }}
            transition={{ duration: 0.2 }}
            className="bg-black/90 backdrop-blur-md border border-white/15 p-4 shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col gap-3"
          >
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.3em] text-center">
              Simulate Attack on ESP32-CAM
            </p>

            <div className="flex gap-2">
              {ATTACKS.map(({ key, label, sub, Icon, color, activeColor }) => {
                const isActive = activeAttack === key;
                return (
                  <button
                    key={key}
                    onClick={() => handlers[key]()}
                    disabled={!!activeAttack && !isActive}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1.5 px-4 py-3 border font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95',
                      isActive ? activeColor : color,
                      !!activeAttack && !isActive && 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    <Icon size={14} className={cn(isActive && 'animate-pulse')} />
                    <span>{label}</span>
                    <span className="text-[7px] font-mono opacity-60 normal-case tracking-normal">{sub}</span>
                    {isActive && (
                      <span className="text-[7px] font-mono animate-pulse uppercase tracking-widest">
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                onClick={stopAttacks}
                disabled={!activeAttack}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 px-4 py-3 border font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95',
                  activeAttack
                    ? 'border-white text-white hover:bg-white/10'
                    : 'border-white/10 text-white/20 cursor-not-allowed'
                )}
              >
                <StopCircle size={14} />
                <span>Stop</span>
              </button>
            </div>

            {/* Status row */}
            <div className="flex justify-between items-center text-[8px] font-mono pt-1 border-t border-white/10">
              <span className="text-white/30">
                Auto-mitigates in ~6 s • Gateway:{' '}
                <span className={cn(protectionEnabled ? 'text-green-400' : 'text-red-400')}>
                  {protectionEnabled ? 'ON' : 'OFF'}
                </span>
              </span>
              <span className="text-white/20 uppercase tracking-widest">Cipher Edge Demo v1.0</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
