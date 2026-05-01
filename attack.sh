#!/bin/bash

# CIPHER: Cloud C2 Startup Script (The Attacker)
# Run this on your Cloud VM or Laptop

echo "===================================================="
echo "       🔥 CIPHER: Cloud C2 (Attacker) 🔥            "
echo "===================================================="

echo "[+] Starting Cloud C2 Server..."

# 1. Build Dashboard if dist is missing
if [ ! -d "cloud_c2/dashboard/dist" ]; then
    echo "[*] C2 Dashboard build not found. Building now..."
    cd cloud_c2/dashboard && npm install && npm run build
    cd ../..
fi

# 2. Start Node Server
cd cloud_c2
echo "[*] Running npm install..."
npm install --silent
echo "[*] Server starting on http://localhost:5000"
node server.js
