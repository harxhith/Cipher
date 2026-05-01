import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { DeviceType } from '../components/DeviceNode';

// --------------------------------------------------------
// TYPES
// --------------------------------------------------------

export interface NetworkNode {
  id: string;
  type: DeviceType;
  label: string;
  pos: THREE.Vector3;
  anchor: THREE.Vector3;
  trustScore: number;
  ip: string;
  mac: string;
  isUnderAttack?: boolean;
  attackType?: 'exfil' | 'recon' | 'flood' | null;
}

export interface MetricData {
  time: string;
  pktRate: number;
  byteRate: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: 'info' | 'warning' | 'critical' | 'mitigation';
}

// --------------------------------------------------------
// INITIAL STATE (Based on CIPHER context)
// --------------------------------------------------------

const INITIAL_NODES: NetworkNode[] = [
  { 
    id: '1', type: 'phone', label: 'ESP32-CAM', 
    pos: new THREE.Vector3(2.8, 1.2, -1.8), anchor: new THREE.Vector3(0.9, 0.3, -0.6), 
    trustScore: 0.95, ip: '10.229.131.10', mac: 'AA:BB:CC:DD:EE:11' 
  },
  { 
    id: '2', type: 'laptop', label: 'Staff Laptop Alpha', 
    pos: new THREE.Vector3(-2.4, 2.0, 2.4), anchor: new THREE.Vector3(-0.7, 0.6, 0.7), 
    trustScore: 1.0, ip: '10.229.131.15', mac: 'AA:BB:CC:DD:EE:22' 
  },
  { 
    id: '3', type: 'laptop', label: 'Staff Laptop Beta', 
    pos: new THREE.Vector3(1.0, -2.8, 2.0), anchor: new THREE.Vector3(0.3, -0.8, 0.6), 
    trustScore: 0.99, ip: '10.229.131.16', mac: 'AA:BB:CC:DD:EE:33' 
  },
  { 
    id: '4', type: 'laptop', label: 'Guest Laptop', 
    pos: new THREE.Vector3(-3.2, -1.0, -2.2), anchor: new THREE.Vector3(-1.0, -0.3, -0.7), 
    trustScore: 0.90, ip: '10.229.131.17', mac: 'AA:BB:CC:DD:EE:44' 
  },
  { 
    id: '5', type: 'laptop', label: 'C2 Hacker (GCP)', 
    pos: new THREE.Vector3(0, 4.0, -0.5), anchor: new THREE.Vector3(0, 0.8, -0.1), 
    trustScore: 0.1, ip: '34.120.x.x', mac: 'EXTERNAL' 
  },
];

// --------------------------------------------------------
// MOCK HOOK
// --------------------------------------------------------

export function useMockBackend() {
  const [nodes, setNodes] = useState<NetworkNode[]>(INITIAL_NODES);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeAttack, setActiveAttack] = useState<'exfil' | 'recon' | 'flood' | null>(null);
  const [protectionEnabled, setProtectionEnabled] = useState(true);

  // Use refs for mutable state inside the interval loop
  const nodesRef = useRef(nodes);
  const metricsRef = useRef(metrics);
  const logsRef = useRef(logs);
  const attackRef = useRef(activeAttack);

  // Sync state to refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { metricsRef.current = metrics; }, [metrics]);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { attackRef.current = activeAttack; }, [activeAttack]);

  const addLog = useCallback((message: string, level: LogEntry['level']) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      message,
      level,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  // Expose triggers
  const triggerExfil = useCallback(() => {
    setActiveAttack('exfil');
    addLog('ATTACK INITIATED: Data Exfiltration triggered on ESP32-CAM', 'critical');
  }, [addLog]);

  const triggerRecon = useCallback(() => {
    setActiveAttack('recon');
    addLog('ATTACK INITIATED: Network Recon (Port Scanning) by ESP32-CAM', 'critical');
  }, [addLog]);

  const triggerFlood = useCallback(() => {
    setActiveAttack('flood');
    addLog('ATTACK INITIATED: UDP Packet Flood by ESP32-CAM', 'critical');
  }, [addLog]);

  const stopAttacks = useCallback(() => {
    setActiveAttack(null);
    addLog('COMMAND: Stop All Attacks. Returning to normal operations.', 'mitigation');
    
    // Reset nodes
    setNodes(prev => prev.map(n => ({ ...n, isUnderAttack: false, attackType: null, trustScore: Math.max(0.8, n.trustScore) })));
  }, [addLog]);

  const toggleProtection = useCallback(async () => {
    try {
      const resp = await fetch('/api/toggle_protection', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'} 
      });
      const data = await resp.json();
      setProtectionEnabled(data.protection_enabled);
    } catch (e) {
      console.error("Failed to toggle protection", e);
      setProtectionEnabled(prev => !prev);
    }
  }, []);

  // SSE Connection to real backend
  useEffect(() => {
    // Keep initial boot logs
    const initLogs = () => {
      addLog('SYSTEM START: hostapd — AP Cipher_IoT_Net online on wlan0', 'info');
      setTimeout(() => addLog('SYSTEM START: dnsmasq DHCP server active — 10.42.0.10–50', 'info'), 300);
      setTimeout(() => addLog('SYSTEM START: Scapy sniffer running in promiscuous mode on wlan0', 'info'), 600);
      setTimeout(() => addLog('DEVICE JOIN: ESP32-CAM [AA:BB:CC:DD:EE:11] → 10.42.0.10', 'info'), 900);
      setTimeout(() => addLog('DEVICE JOIN: Staff Laptop Alpha [AA:BB:CC:DD:EE:22] → 10.42.0.15', 'info'), 1200);
    };
    initLogs();

    const eventSource = new EventSource('http://localhost:5000/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { devices, logs: serverLogs, protection_enabled } = data;

        if (typeof protection_enabled === 'boolean') {
          setProtectionEnabled(protection_enabled);
        }

        const now = new Date().toLocaleTimeString([], { hour12: false });
        let totalPkts = 0;
        let totalBytes = 0;

        // Update nodes based on live_status
        setNodes(prevNodes => prevNodes.map(node => {
          let updatedNode = { ...node };
          if (devices[node.ip]) {
            const stats = devices[node.ip];
            // Normalize threat score (0-150) to trust score (1.0 - 0.1)
            updatedNode.trustScore = Math.max(0.1, 1.0 - (stats.threat_score / 150));
            updatedNode.isUnderAttack = stats.status !== "Safe";
            
            // For charting
            totalPkts += stats.pkt_rate;
            totalBytes += (stats.byte_rate / 1024); // KB
          } else if (node.id === '5' && attackRef.current) {
            updatedNode.isUnderAttack = true; // Pulse hacker node if attack is active locally
          } else {
             updatedNode.trustScore = Math.min(1.0, updatedNode.trustScore + 0.05);
             updatedNode.isUnderAttack = false;
          }
          return updatedNode;
        }));

        setMetrics(prev => {
          const next = [...prev, { time: now, pktRate: totalPkts, byteRate: Math.round(totalBytes) }];
          return next.length > 20 ? next.slice(1) : next;
        });

        // Sync logs
        if (serverLogs && serverLogs.length > 0) {
          setLogs(prev => {
            const newLogs = serverLogs.map((msg: string) => ({
              id: Math.random().toString(36).substring(7),
              timestamp: now,
              message: msg,
              level: msg.includes('[!]') ? 'critical' : msg.includes('MITIGATION') ? 'mitigation' : 'info'
            }));
            
            // Deduplicate logs loosely by message
            const filteredNew = newLogs.filter((nl: any) => !prev.some(pl => pl.message === nl.message));
            return [...filteredNew, ...prev].slice(0, 50);
          });
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    eventSource.onerror = () => {
      // Backend offline
    };

    return () => eventSource.close();
  }, [addLog]);

  return {
    nodes,
    metrics,
    logs,
    activeAttack,
    triggerExfil,
    triggerRecon,
    triggerFlood,
    stopAttacks,
    protectionEnabled,
    toggleProtection
  };
}
