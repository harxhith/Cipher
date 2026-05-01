import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Zap, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface CommandPanelProps {
  activeAttack: 'exfil' | 'recon' | 'flood' | null;
  onExfil: () => void;
  onStop: () => void;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({ activeAttack, onExfil, onStop }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-50 pointer-events-auto"
    >
      <div className="bg-black/80 backdrop-blur-md border border-white/20 p-4 flex gap-4 shadow-[8px_8px_0px_white] rounded-xl">
        <button
          onClick={onExfil}
          disabled={activeAttack !== null}
          className={cn(
            "flex items-center gap-2 px-6 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-md border",
            activeAttack === 'exfil' 
              ? "bg-red-500/20 text-red-500 border-red-500/50 animate-pulse" 
              : activeAttack !== null 
                ? "opacity-50 cursor-not-allowed border-white/10 text-white/50"
                : "hover:bg-red-500 hover:text-white hover:border-red-500 border-white/20 text-white"
          )}
        >
          <Zap size={16} />
          Start Exfil
        </button>

        <div className="w-[1px] bg-white/20 mx-2" />

        <button
          onClick={onStop}
          disabled={activeAttack === null}
          className={cn(
            "flex items-center gap-2 px-6 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-md border",
            activeAttack === null 
              ? "opacity-50 cursor-not-allowed border-white/10 text-white/50"
              : "bg-white text-black border-white hover:bg-gray-200"
          )}
        >
          <XCircle size={16} />
          Stop All
        </button>
      </div>
    </motion.div>
  );
};
