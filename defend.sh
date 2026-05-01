#!/bin/bash

# CIPHER: RPi Gateway Startup Script (The Defender)
# Run this on your Raspberry Pi

echo "===================================================="
echo "      🔥 CIPHER: Edge Gateway (Defender) 🔥         "
echo "===================================================="

echo "[+] Starting RPi Edge Gateway..."

# 1. Build Dashboard if dist is missing
# Running as current user to preserve Node/NVM environment
if [ ! -d "rpi_dashboard/dist" ]; then
    echo "[*] RPi Dashboard build not found. Building now..."
    echo "[*] Increasing Node memory limit for Raspberry Pi..."
    cd rpi_dashboard && npm install && NODE_OPTIONS="--max-old-space-size=1024" npm run build
    
    if [ $? -ne 0 ]; then
        echo "[!] ERROR: Dashboard build failed (likely out of memory)."
        echo "[!] Try closing other apps or building on your laptop and copying the 'dist' folder."
        exit 1
    fi
    cd ..
fi

# Double check dist exists
if [ ! -d "rpi_dashboard/dist" ]; then
    echo "[!] ERROR: 'rpi_dashboard/dist' folder is missing. Build failed."
    exit 1
fi

# 2. Start ngrok in background
echo "[*] Exposing Gateway via ngrok tunnel..."
ngrok http 5000 > /dev/null 2>&1 &
NGROK_PID=$!

# Cleanup ngrok on exit
trap "echo '[!] Stopping ngrok...'; kill $NGROK_PID; exit" SIGINT SIGTERM

# Wait for ngrok to generate URL
echo "[*] Initializing tunnel..."
sleep 4

# Fetch Public URL from ngrok API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "[!] Error: Could not fetch ngrok URL. Is ngrok installed and configured?"
else
    echo ""
    echo "----------------------------------------------------"
    echo "🚀 DASHBOARD IS LIVE AT: $NGROK_URL"
    echo "----------------------------------------------------"
    echo ""
fi

# 3. Start Python Gateway
cd rpi_gateway
if [ ! -d "venv" ]; then
    echo "[*] Setting up Python virtual environment..."
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt
fi

echo "[*] Starting Scapy server (requires sudo)..."
export IFACE=wlan1
sudo -E venv/bin/python server.py
