#!/bin/bash

# CIPHER: RPi Gateway Startup Script (The Defender)
# Run this on your Raspberry Pi

echo "===================================================="
echo "      🔥 CIPHER: Edge Gateway (Defender) 🔥         "
echo "===================================================="

echo "[+] Starting RPi Edge Gateway..."

# Build Dashboard if dist is missing
if [ ! -d "rpi_dashboard/dist" ]; then
    echo "[*] RPi Dashboard build not found. Building now..."
    cd rpi_dashboard && npm install && npm run build
    cd ..
fi

# Start ngrok in background
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

# Start Python Gateway
cd rpi_gateway
if [ ! -d "venv" ]; then
    echo "[*] Setting up Python virtual environment..."
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt
fi

echo "[*] Starting Scapy server with sudo..."
sudo venv/bin/python server.py
