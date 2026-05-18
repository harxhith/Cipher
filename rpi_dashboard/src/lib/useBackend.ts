import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// Re-export shared types so other modules can import from here
export type { NetworkNode, LogEntry, BackendHook } from './types';
import type { NetworkNode, LogEntry } from './types';

// --------------------------------------------------------
// HELPER: Generate random position for new nodes
// --------------------------------------------------------
const getRandomPos = () => {
  const theta = Math.random() * Math.PI * 2;
  // Restrict phi to be near the equator (PI/2) to keep nodes on the "sides"
  // phi = 0 is North Pole (+Y), phi = PI is South Pole (-Y)
  const spread = 0.4; // Tight horizontal band around the equator
  const phi = (Math.PI / 2) + (Math.random() - 0.5) * spread;
  const r = 2.8 + Math.random() * 0.7;
  
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
};

const getAnchor = (pos: THREE.Vector3) => {
  return pos.clone().normalize().multiplyScalar(2.0);
};

// --------------------------------------------------------
// LIVE BACKEND HOOK
// --------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE || 
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' 
    ? `${window.location.protocol}//${window.location.host}` 
    : 'http://localhost:5000');

export function useBackend() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [activeAttack, setActiveAttack] = useState<'exfil' | 'recon' | 'flood' | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const nodesRef = useRef<NetworkNode[]>([]);
  const lastToggleTime = useRef<number>(0);

  const addLog = useCallback((message: string, level: LogEntry['level']) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      message,
      level,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50));
  }, []);

  // 1. Initial State Fetch
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/status`);
        const data = await resp.json();
        setProtectionEnabled(data.protection_enabled);
        
        // Convert devices object to nodes array, filtering out offline ones
        const initialNodes: NetworkNode[] = Object.keys(data.devices)
          .filter(ip => data.devices[ip].status !== 'Offline')
          .map((ip) => {
            const stats = data.devices[ip];
            const pos = getRandomPos();
            const isEsp = ip === data.esp32_ip || ip.endsWith('.151') || ip.endsWith('.10');
            
            return {
              id: ip,
              type: isEsp ? 'camera' : 'laptop',
              label: isEsp ? "ESP32-CAM" : `IoT Device ${ip.split('.').pop()}`,
              ip,
              mac: "AUTO-DISCOVERED",
              pos,
              anchor: getAnchor(pos),
              trustScore: Math.max(0.1, 1.0 - (stats.threat_score / 150)),
              isUnderAttack: !!stats.attack_type || stats.threat_score > 50,
              attackType: (stats.attack_type as 'exfil' | 'recon' | 'flood' | null) ?? null,
              status: stats.status
            };
          });
        setNodes(initialNodes);
        nodesRef.current = initialNodes;
      } catch (e) {
        console.error("Failed to fetch initial status", e);
      }
    };
    fetchInitial();
  }, []);

  // 2. SSE Stream for Live Updates
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { devices, logs: serverLogs, protection_enabled, esp32_ip } = data;

        // Prevent SSE from overwriting optimistic state if we just toggled
        if (Date.now() - lastToggleTime.current > 2000) {
          setProtectionEnabled(protection_enabled);
        }

        const now = new Date().toLocaleTimeString([], { hour12: false });

        setNodes(prevNodes => {
          // Reconcile: Only keep nodes that the backend says are online
          const activeIps = Object.keys(devices).filter(ip => devices[ip].status !== 'Offline');
          
          // Start with existing nodes that are still active
          const updatedNodes = prevNodes.filter(n => activeIps.includes(n.ip));
          
          activeIps.forEach(ip => {
            const stats = devices[ip];
            const isEsp = ip === esp32_ip || ip.endsWith('.151') || ip.endsWith('.10');

            const existingIdx = updatedNodes.findIndex(n => n.ip === ip);
            if (existingIdx !== -1) {
              updatedNodes[existingIdx] = {
                ...updatedNodes[existingIdx],
                label: isEsp ? "ESP32-CAM" : updatedNodes[existingIdx].label,
                type: isEsp ? 'camera' : updatedNodes[existingIdx].type,
                trustScore: Math.max(0.1, 1.0 - (stats.threat_score / 150)),
                isUnderAttack: !!stats.attack_type || stats.threat_score > 50,
                attackType: (stats.attack_type as 'exfil' | 'recon' | 'flood' | null) ?? null,
                status: stats.status
              };
            } else {
              // New device discovered!
              const pos = getRandomPos();
              updatedNodes.push({
                id: ip,
                type: isEsp ? 'camera' : 'laptop',
                label: isEsp ? "ESP32-CAM" : `IoT Device ${ip.split('.').pop()}`,
                ip,
                mac: "NEW",
                pos,
                anchor: getAnchor(pos),
                trustScore: 1.0,
                isUnderAttack: false,
                status: stats.status
              });
            }
          });
          
          return updatedNodes;
        });

        if (serverLogs && serverLogs.length > 0) {
          setLogs(prev => {
            const newLogs = serverLogs.map((msg: string) => {
              // Generate a simple stable ID from the message content
              const id = btoa(msg).substring(0, 16);
              return {
                id,
                timestamp: now,
                message: msg,
                level: msg.includes('[!]') ? 'critical' : msg.includes('MITIGATION') ? 'mitigation' : 'info'
              };
            });
            const filteredNew = newLogs.filter((nl: any) => !prev.some(pl => pl.id === nl.id));
            if (filteredNew.length === 0) return prev;
            return [...filteredNew, ...prev].slice(0, 50);
          });
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    return () => eventSource.close();
  }, []);

  // 3. Actions
  const toggleProtection = useCallback(async () => {
    // Optimistic Update
    const previousState = protectionEnabled;
    setProtectionEnabled(!previousState);
    lastToggleTime.current = Date.now();
    setIsToggling(true);

    try {
      const resp = await fetch(`${API_BASE}/api/toggle_protection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !previousState })
      });
      const data = await resp.json();
      setProtectionEnabled(data.protection_enabled);
    } catch (e) {
      console.error("Failed to toggle protection", e);
      // Rollback on failure
      setProtectionEnabled(previousState);
    } finally {
      setIsToggling(false);
    }
  }, [protectionEnabled]);

  const sendCommand = useCallback(async (action: string) => {
    try {
      await fetch(`${API_BASE}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: "esp32cam", action })
      });
      setActiveAttack(action === 'stop' ? null : action as any);
    } catch (e) {
      console.error("Failed to send command", e);
    }
  }, []);

  return {
    nodes,
    logs,
    protectionEnabled,
    toggleProtection,
    activeAttack,
    isToggling,
    isDemoMode: false,
    triggerExfil: () => sendCommand('start_exfil'),
    triggerRecon: () => sendCommand('start_scan'),
    triggerFlood: () => sendCommand('start_ddos'),
    stopAttacks: () => sendCommand('stop'),
    clearLogs: async () => {
      setLogs([]);
      try {
        await fetch(`${API_BASE}/api/clear_logs`, { method: 'POST' });
      } catch (e) {
        console.error("Failed to clear server logs", e);
      }
    },
  };
}
