#!/bin/bash

# Enforce sudo
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (use sudo)"
  exit
fi

# CIPHER: Cloud C2 Startup Script (The Attacker)
...
echo "===================================================="
echo "       🔥 CIPHER: Cloud C2 (Attacker) 🔥            "
echo "===================================================="

echo "[+] Starting Cloud C2 Server..."

# Build Dashboard if dist is missing
if [ ! -d "cloud_c2/dashboard/dist" ]; then
    echo "[*] C2 Dashboard build not found. Building now..."
    cd cloud_c2/dashboard && npm install && npm run build
    cd ../..
fi

# Start Node Server
cd cloud_c2
echo "[*] Running npm install..."
npm install --silent
echo "[*] Server starting on http://localhost:5000"
node server.js
