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
```bash
./attack.sh
```
*Note: This will automatically start the server and print the public URL (e.g., http://35.212.229.239:5000).*

### 2. Edge Gateway & Dashboard (The Defender)
```bash
./defend.sh
```
*Note: This will automatically start the server and print your public ngrok URL. It will ask for your password to run the packet sniffer.*

### 3. ESP32 Firmware
Flash the firmware to your ESP32-CAM using Arduino IDE or PlatformIO.
- File: `esp32cam/esp32cam.ino`
- Configure your Wi-Fi SSID and Password in the code before flashing.

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

