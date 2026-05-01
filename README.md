# CIPHER: Edge-AI IoT Security & Threat Response

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Hardware: Raspberry Pi](https://img.shields.io/badge/Hardware-Raspberry_Pi-A22846?logo=raspberry-pi)](https://www.raspberrypi.org/)
[![Hardware: ESP32](https://img.shields.io/badge/Hardware-ESP32-E7352C?logo=espressif)](https://www.espressif.com/en/products/socs/esp32)

**Cipher** is a live, end-to-end IoT security demonstration platform. It demonstrates how a low-cost edge gateway (Raspberry Pi) can detect, score, and mitigate malicious IoT behavior in real-time without relying on cloud-based AI.


---

## 🏗️ System Architecture

1.  **Edge Gateway (Raspberry Pi):** The "Defender". Sniffs traffic and scores threats.
2.  **Cybersecurity Dashboard (React/3D):** The "Command Center". Real-time 3D visualization.
3.  **Cloud C2 Server (Node.js):** The "Attacker". Triggers attacks and receives stolen data.
4.  **Compromised IoT Nodes (ESP32):** The "Targets". Perform attacks on command.

---

## 🚀 Quick Start Guide

### 1. Cloud C2 Server (The Attacker)
Acts as the command center for triggering attacks and receiving exfiltrated images.
```bash
cd cloud_c2
npm install
node server.js
# Runs on http://localhost:5000
```

### 2. Edge Gateway (The Defender)
Raspberry Pi server that sniffs network packets and calculates threat scores.
```bash
cd rpi_gateway
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Run with root for packet sniffing:
sudo venv/bin/python server.py
# Runs on http://localhost:5000 (Relay) and http://localhost:8080 (Local UI)
```

### 3. Cybersecurity Dashboard (The UI)
Futuristic 3D dashboard to visualize the entire network.
```bash
cd rpi_dashboard
npm install
npm run dev
# View at http://localhost:3000
```

### 4. ESP32 Firmware
Flash the firmware to your ESP32-CAM using Arduino IDE or PlatformIO.
- File: `esp32cam/esp32cam.ino`
- Configure your Wi-Fi SSID and Server IPs in the code before flashing.

---

## 🚀 Attack Scenarios
- **Data Exfiltration:** ESP32-CAM steals images and uploads them to the Cloud C2.
- **DDoS (UDP Flood):** IoT nodes weaponized to flood a target server.
- **Local Reconnaissance:** Devices scanning the local network for vulnerabilities.

---

## 🛠️ Tech Stack
- **Frontend:** React 19, Three.js, Framer Motion, Tailwind CSS 4
- **Backend:** Node.js (C2), Python/Scapy (Gateway)
- **Firmware:** C++ (Arduino)

---

## 📄 License
This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---
*Built for the future of network security visualization.*

---

## 👥 Contributors

- **Harshith** ([@harxhith](https://github.com/harxhith)) - Project Lead & Core Developer
- **Yashas R** ([@YashasR1](https://github.com/YashasR1))
- **Manish M Gowda** ([@Manish-M-Gowda](https://github.com/Manish-M-Gowda))
- **N Shreyas Krishna** ([@nshreyaskrishna-sudo](https://github.com/nshreyaskrishna-sudo))

