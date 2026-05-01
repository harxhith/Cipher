#!/bin/bash

# CIPHER: RPi Gateway Startup Script (The Defender)
# Run this on your Raspberry Pi

echo "===================================================="
echo "      🔥 CIPHER: Edge Gateway (Defender) 🔥         "
echo "===================================================="

echo "[+] Starting RPi Edge Gateway..."

# 1. Ensure Hotspot is active on wlan1
echo "[*] Verifying Cipher_IoT_Net hotspot on wlan1..."
if ! nmcli con show --active | grep -q "wlan1"; then
    echo "[!] Hotspot not active on wlan1. Attempting to start..."
    
    # Check if the connection profile already exists
    if ! nmcli con show "CipherHotspot" > /dev/null 2>&1; then
        echo "[*] Creating new hotspot profile: Cipher_IoT_Net"
        sudo nmcli con add type wifi ifname wlan1 con-name CipherHotspot autoconnect yes ssid Cipher_IoT_Net
        sudo nmcli con modify CipherHotspot 802-11-wireless.mode ap 802-11-wireless.band bg ipv4.method shared
        sudo nmcli con modify CipherHotspot wifi-sec.key-mgmt wpa-psk wifi-sec.psk cipher2024
    fi
    
    sudo nmcli con up CipherHotspot
    if [ $? -ne 0 ]; then
        echo "[!] ERROR: Failed to start hotspot on wlan1."
        echo "[!] Please ensure the USB WiFi adapter is plugged in and supports AP mode."
        exit 1
    fi
    echo "[+] Hotspot active at 10.42.0.1"
else
    echo "[+] Hotspot already active on wlan1."
fi

# 2. Build Dashboard if dist is missing
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
