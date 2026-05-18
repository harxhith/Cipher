import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { MetricData } from '../lib/types';

interface AnalyticsPanelProps {
  metrics: MetricData[];
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ metrics }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute right-10 bottom-10 w-80 z-40 bg-black/80 backdrop-blur-md border border-white/20 p-6 pointer-events-none shadow-[8px_8px_0px_white]"
    >
      <div className="flex justify-between items-end mb-4 border-b border-white/20 pb-2">
        <h4 className="font-black uppercase italic text-sm text-white">Live Traffic</h4>
        <span className="text-[9px] font-mono text-white/50 animate-pulse">LIVE STREAM</span>
      </div>
      
      <div className="h-32 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metrics}>
            <XAxis dataKey="time" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.2)', fontSize: '10px' }}
              labelStyle={{ color: '#aaa' }}
              itemStyle={{ color: '#fff' }}
            />
            <Line type="monotone" dataKey="pktRate" stroke="#fff" strokeWidth={2} dot={false} name="Pkts/s" />
            <Line type="monotone" dataKey="byteRate" stroke="#3b82f6" strokeWidth={2} dot={false} name="KB/s" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white" />
          <span className="text-[10px] font-mono text-white/70">Packets/s</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[10px] font-mono text-white/70">KB/s</span>
        </div>
      </div>
    </motion.div>
  );
};
