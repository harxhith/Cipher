import os
import time
import threading
import json
import requests
import subprocess
from collections import defaultdict
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS

# Check if scapy is available; if not, we can run in a mock mode for testing without sudo
try:
    from scapy.all import sniff, IP, TCP, UDP, ARP, Ether, srp
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("[WARNING] Scapy not found or requires root. Running in mock/simulation mode.")

# Initialize Flask to point to the built React dashboard directory
dashboard_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'rpi_dashboard', 'dist')
app = Flask(__name__, static_folder=dashboard_dir, static_url_path='/')
CORS(app)

# --- CONFIGURATION ---
def _auto_detect_iface():
    """Detect the interface that routes to the ESP32's subnet (10.42.0.0/24).

    Network topology supported:
      - Laptop runs WiFi hotspot (wlo1 / wlan0) → ESP32-CAM connects to it
      - Laptop tethered to phone via USB for internet (enx* / usb0)
      - 'ip route get 10.42.0.1' tells us exactly which interface to sniff

    Priority: IFACE env var > kernel route lookup > wireless prefix > any UP iface.
    """
    env_iface = os.environ.get("IFACE")
    if env_iface:
        return env_iface

    # Ask the kernel which interface reaches the ESP32 subnet
    try:
        import re
        # Try a few common hotspot/IoT IPs to see which interface they route through
        for target_ip in ["10.42.0.50", "192.168.4.10", "10.0.0.10"]:
            result = subprocess.run(
                ["ip", "route", "get", target_ip],
                capture_output=True, text=True, timeout=2
            )
            # Output looks like: "10.42.0.50 dev wlo1 src 10.42.0.1 ..."
            m = re.search(r'\bdev\s+(\S+)', result.stdout)
            if m:
                iface = m.group(1)
                # Reject loopback answers (can happen when host IS the gateway)
                if iface != "lo":
                    return iface
    except Exception:
        pass

    # Fallback: prefer UP wireless interfaces (hotspot is almost always wlo*/wlan*)
    try:
        ifaces = os.listdir("/sys/class/net")
    except Exception:
        return "wlo1"

    def is_up(iface):
        try:
            with open(f"/sys/class/net/{iface}/operstate") as f:
                return f.read().strip() in ("up", "unknown")
        except Exception:
            return False

    for prefix in ("wlo", "wlan", "wlp"):
        for iface in sorted(ifaces):
            if iface.startswith(prefix) and is_up(iface):
                return iface

    # Last resort: any non-loopback UP interface
    for iface in sorted(ifaces):
        if iface != "lo" and is_up(iface):
            return iface

    return "wlo1"

IFACE = _auto_detect_iface()
ESP32_CAM_IP = "10.42.0.151"  # Laptop hotspot → ESP32-CAM; auto-updated on first heartbeat
PROTECTION_ENABLED = True
CLOUD_C2_URL = "http://35.212.229.239:5000" # Cloud C2 Endpoint

# --- GLOBAL STATE (Thread-Safe enough for our demonstration) ---
state_lock = threading.RLock()
blocked_ips = set()
mock_attack_mode = None # For simulation without scapy

def mitigate_device(ip):
    """Executes active mitigation: iptables block."""
    global blocked_ips
    if ip not in blocked_ips:
        add_log(f"[MITIGATION] Actively blocking malicious host: {ip}")
        try:
            # 1. IPTables Drop
            subprocess.run(["sudo", "iptables", "-A", "FORWARD", "-s", ip, "-j", "DROP"], check=True)
            blocked_ips.add(ip)
        except Exception as e:
            add_log(f"[!] Mitigation failed: {e}")

def clear_mitigation(ip):
    """Removes firewall blocks once device is safe."""
    global blocked_ips
    if ip in blocked_ips:
        add_log(f"[MITIGATION] Restoring access for safe host: {ip}")
        try:
            subprocess.run(["sudo", "iptables", "-D", "FORWARD", "-s", ip, "-j", "DROP"], check=True)
            blocked_ips.remove(ip)
        except Exception as e:
            add_log(f"[!] Cleanup failed: {e}")

# Metrics accumulated over the current 1-second window
current_metrics = defaultdict(lambda: {
    "packets": 0,
    "bytes": 0,
    "dst_ports": set(),
    "dst_ips": set()
})

# Live status available to the UI
live_status = {}

logs = []

def add_log(msg):
    timestamp = time.strftime('%H:%M:%S')
    log_entry = f"[{timestamp}] {msg}"
    print(log_entry)
    with state_lock:
        logs.append(log_entry)
        if len(logs) > 50:
            logs.pop(0)

# --- 1. PACKET SNIFFER THREAD ---
def arp_discovery_thread():
    """Actively scans the 10.42.0.0/24 subnet for silent devices every 30s."""
    add_log("[*] Starting active ARP discovery thread (30s interval)")
    while True:
        try:
            # Scan the 10.42.0.0/24 subnet — this is the laptop's WiFi hotspot
            # network (wlo1 @ 10.42.0.1). ESP32-CAM connects here.
            ans, unans = srp(Ether(dst="ff:ff:ff:ff:ff:ff")/ARP(pdst="10.42.0.0/24"),
                             timeout=2, iface=IFACE, verbose=False)
            
            with state_lock:
                now = time.time()
                for snd, rcv in ans:
                    ip = rcv.psrc
                    if ip not in live_status:
                        live_status[ip] = {
                            "threat_score": 0, 
                            "pkt_rate": 0, 
                            "byte_rate": 0, 
                            "status": "Safe", 
                            "attack_type": None,
                            "last_seen": now
                        }
                        add_log(f"[*] Discovered silent device via ARP: {ip}")
                    else:
                        live_status[ip]["last_seen"] = now
        except Exception as e:
            add_log(f"[!] ARP Discovery Error: {e}")
            
        time.sleep(30)

def packet_handler(pkt):
    if IP in pkt:
        src_ip = pkt[IP].src
        dst_ip = pkt[IP].dst
        pkt_len = len(pkt)
        
        # We only care about traffic originating from our IoT devices (Hotspot range)
        if src_ip.startswith("10.42.0."):
            with state_lock:
                current_metrics[src_ip]["packets"] += 1
                current_metrics[src_ip]["bytes"] += pkt_len
                current_metrics[src_ip]["dst_ips"].add(dst_ip)
                
                if TCP in pkt:
                    current_metrics[src_ip]["dst_ports"].add(pkt[TCP].dport)
                elif UDP in pkt:
                    current_metrics[src_ip]["dst_ports"].add(pkt[UDP].dport)

def sniffer_thread():
    add_log(f"Starting Scapy sniffer on interface: {IFACE}")
    consecutive_errors = 0
    while True:
        try:
            sniff(iface=IFACE, prn=packet_handler, store=0)
            consecutive_errors = 0  # Reset on successful sniff
        except OSError as e:
            consecutive_errors += 1
            if consecutive_errors == 1:
                add_log(f"Sniffer error on '{IFACE}': {e}")
                add_log(f"Tip: run 'ip link show' to see available interfaces, "
                        f"then restart with: IFACE=<iface> sudo -E python server.py")
            if consecutive_errors >= 5:
                add_log("Sniffer: too many consecutive errors — stopping sniffer thread. "
                        "Falling back to heartbeat-only mode.")
                break
            time.sleep(2)
        except Exception as e:
            add_log(f"Sniffer error: {e}")
            time.sleep(2)
            add_log("Restarting sniffer...")

# --- 2. THREAT SCORING ENGINE (Runs every 1 second) ---
def scoring_engine():
    while True:
        time.sleep(0.5)
        now = time.time()
        with state_lock:
            # Process ALL known devices to ensure silent ones go to 0/Offline
            for ip in list(live_status.keys()):
                dev_status = live_status[ip]
                metrics = current_metrics[ip] # defaultdict ensures entry exists
                
                pkt_rate = metrics["packets"]
                byte_rate = metrics["bytes"]
                dst_entropy = len(metrics["dst_ports"])
                
                # Reset accumulators for the next second
                metrics["packets"] = 0
                metrics["bytes"] = 0
                metrics["dst_ports"] = set()
                metrics["dst_ips"] = set()
                
                dev_status["pkt_rate"] = pkt_rate
                dev_status["byte_rate"] = byte_rate
                
                # Update activity timestamp
                if pkt_rate > 0:
                    dev_status["last_seen"] = now
                
                score_delta = 0
                is_offline = (now - dev_status.get("last_seen", now) > 15)  # allow 3 missed heartbeats

                if is_offline:
                    dev_status["status"] = "Offline"
                    dev_status["attack_type"] = None
                    score_delta = -5 # Slower decay for offline
                else:
                    # Detection logic (always active)
                    # Lowered threshold: ESP32-CAM exfil can be bursty/slow (8KB/s)
                    if byte_rate > 8000:
                        if PROTECTION_ENABLED: score_delta += 40 # Bigger jump
                        dev_status["attack_type"] = "exfil"
                        dev_status["last_detection"] = now
                        add_log(f"[!] {ip}: Data Exfiltration Detected ({byte_rate/1000:.1f} KB/s)")
                    
                    elif pkt_rate > 80:
                        if PROTECTION_ENABLED: score_delta += 30
                        dev_status["attack_type"] = "flood"
                        dev_status["last_detection"] = now
                        add_log(f"[!] {ip}: Flood / DDoS Detected ({pkt_rate} pkt/s)")
                        
                    elif dst_entropy > 3:
                        if PROTECTION_ENABLED: score_delta += 20
                        dev_status["attack_type"] = "recon"
                        dev_status["last_detection"] = now
                        add_log(f"[!] {ip}: Port Scan Detected ({dst_entropy} unique ports)")
                    
                    else:
                        # No attack detected in this window
                        if dev_status["threat_score"] > 0:
                            # Much slower decay: from 150 to 0 takes ~25 seconds of silence
                            score_delta = -2 if not PROTECTION_ENABLED else -3
                        
                        # Only clear attack type if score has fully decayed AND no detection in 15s
                        if dev_status["threat_score"] <= 0 and now - dev_status.get("last_detection", 0) > 15:
                            dev_status["attack_type"] = None

                    # Set status based on score (only if online)
                    score = dev_status["threat_score"]
                    if score >= 150:
                        dev_status["status"] = "Critical (Blocked)"
                        if PROTECTION_ENABLED:
                            mitigate_device(ip)
                    elif score >= 100:
                        dev_status["status"] = "Malicious"
                    elif score >= 50:
                        dev_status["status"] = "Suspicious"
                    elif dev_status["attack_type"] is not None or now - dev_status.get("last_detection", 0) < 15:
                        # Keep status suspicious if we have an active or recently detected attack
                        dev_status["status"] = "Suspicious"
                    else:
                        dev_status["status"] = "Safe"
                        if ip in blocked_ips:
                            clear_mitigation(ip)

                # Apply score delta
                new_score = dev_status["threat_score"] + score_delta
                dev_status["threat_score"] = max(0, min(150, new_score))

            # 3. REPORTING (Outside the lock!)
            try:
                # Prepare a summary of all devices
                device_summary = []
                # Use a separate lock-scoped block to copy data, then release
                with state_lock:
                    for ip, stats in live_status.items():
                        device_summary.append({
                            "ip": ip,
                            "pktRate": stats["pkt_rate"],
                            "threatScore": stats["threat_score"],
                            "status": stats["status"]
                        })
                
                # Network call is now safe - if it hangs, it doesn't block the gateway
                requests.post(f"{CLOUD_C2_URL}/api/devices/sync", json=device_summary, timeout=1)
            except Exception:
                pass

# --- 3. FLASK API SERVER ---

@app.route('/heartbeat', methods=['GET'])
def heartbeat():
    """Receives periodic heartbeats from ESP32 to track its IP address."""
    global ESP32_CAM_IP
    client_ip = request.remote_addr
    if client_ip != ESP32_CAM_IP:
        ESP32_CAM_IP = client_ip
        add_log(f"[*] Auto-discovered ESP32-CAM at {ESP32_CAM_IP}")
    
    with state_lock:
        if client_ip not in live_status:
            live_status[client_ip] = {
                "threat_score": 0, 
                "pkt_rate": 0, 
                "byte_rate": 0, 
                "status": "Safe", 
                "attack_type": None,
                "last_seen": time.time()
            }
        else:
            live_status[client_ip]["last_seen"] = time.time()
            
    return jsonify({"status": "Alive"}), 200

@app.route('/command', methods=['POST'])
def relay_command():
    """
    Receives commands from the Google Cloud VM and forwards them to the ESP32.
    Expected JSON: { "target": "esp32cam", "action": "start_exfil" | "start_ddos" | "start_scan" | "stop" }
    """
    data = request.json
    if not data or 'action' not in data:
        return jsonify({"error": "Missing 'action' in payload"}), 400
        
    action = data['action']
    add_log(f"Received C2 command: {action}")
    
    # Map actions to ESP32-CAM endpoints
    action_map = {
        "start_exfil": "/trigger/exfil",
        "start_ddos": "/trigger/ddos",
        "start_flood": "/trigger/ddos",
        "start_scan": "/trigger/scan",
        "start_recon": "/trigger/scan", # Both start_scan and start_recon map to same ESP32 endpoint
        "stop": "/stop"
    }
    
    endpoint = action_map.get(action)
    if not endpoint:
        return jsonify({"error": "Unknown action"}), 400
        
    # Forward the command to the ESP32-CAM
    esp_url = f"http://{ESP32_CAM_IP}{endpoint}"
    add_log(f"Relaying command to ESP32: {esp_url}")
    
    global mock_attack_mode
    with state_lock:
        if action == "stop":
            mock_attack_mode = None
        elif "exfil" in action:
            mock_attack_mode = "exfil"
        elif "ddos" in action or "flood" in action:
            mock_attack_mode = "flood"
        elif "scan" in action or "recon" in action:
            mock_attack_mode = "recon"

        # Immediately reflect attack state in live_status so SSE picks it up
        # without waiting for the scoring engine's next tick.
        if ESP32_CAM_IP in live_status:
            live_status[ESP32_CAM_IP]["last_seen"] = time.time()  # prevent offline flip
            if mock_attack_mode is not None:
                live_status[ESP32_CAM_IP]["attack_type"] = mock_attack_mode
                live_status[ESP32_CAM_IP]["status"] = "Suspicious"
            else:
                live_status[ESP32_CAM_IP]["attack_type"] = None
                live_status[ESP32_CAM_IP]["status"] = "Safe"

        # Also inject traffic into current_metrics so the scoring engine
        # accumulates a threat score immediately on the next tick.
        if mock_attack_mode == "exfil":
            current_metrics[ESP32_CAM_IP]["bytes"] += 21000
        elif mock_attack_mode == "flood":
            current_metrics[ESP32_CAM_IP]["packets"] += 150
        elif mock_attack_mode == "recon":
            for p in range(80, 90):
                current_metrics[ESP32_CAM_IP]["dst_ports"].add(p)

    try:
        # Fire and forget (timeout=2) so we don't hang if ESP32 is offline
        resp = requests.post(esp_url, timeout=2)
        return jsonify({"status": "Relayed", "esp32_response": resp.status_code}), 200
    except Exception as e:
        add_log(f"Failed to reach ESP32: {str(e)}")
        return jsonify({"error": "ESP32 Unreachable", "details": str(e)}), 502

@app.route('/api/status', methods=['GET'])
def get_status():
    """Returns the current state of all devices for the dashboard."""
    with state_lock:
        return jsonify({
            "devices": live_status,
            "logs": logs[-20:], # Last 20 logs
            "protection_enabled": PROTECTION_ENABLED,
            "esp32_ip": ESP32_CAM_IP
        })

@app.route('/api/toggle_protection', methods=['POST'])
def toggle_protection():
    """Toggles the Gateway Protection Mode ON/OFF."""
    global PROTECTION_ENABLED
    data = request.json or {}
    if 'enabled' in data:
        PROTECTION_ENABLED = bool(data['enabled'])
    else:
        PROTECTION_ENABLED = not PROTECTION_ENABLED
    add_log(f"[*] Gateway Protection Mode: {'ON' if PROTECTION_ENABLED else 'OFF'}")
    return jsonify({"status": "success", "protection_enabled": PROTECTION_ENABLED}), 200

@app.route('/api/clear_logs', methods=['POST'])
def clear_logs():
    """Clears the global logs list."""
    global logs
    with state_lock:
        logs = []
    return jsonify({"status": "success"}), 200

@app.route('/stream')
def sse_stream():
    """Server-Sent Events endpoint to push live metrics to the React Dashboard."""
    def generate():
        while True:
            with state_lock:
                data = {
                    "devices": live_status,
                    "logs": logs[-10:],
                    "protection_enabled": PROTECTION_ENABLED,
                    "esp32_ip": ESP32_CAM_IP
                }
            yield f"data: {json.dumps(data)}\n\n"
            time.sleep(0.5)  # Push updates every 500ms
            
    response = Response(generate(), mimetype="text/event-stream")
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

# --- MOCK SIMULATOR FOR TESTING WITHOUT ACTUAL TRAFFIC ---
def mock_traffic_simulator():
    """Generates fake traffic metrics ONLY if scapy is not available to prevent ghost devices."""
    if SCAPY_AVAILABLE:
        return

    while True:
        with state_lock:
            # Simulate a baseline heartbeat
            current_metrics[ESP32_CAM_IP]["packets"] += 2
            current_metrics[ESP32_CAM_IP]["bytes"] += 1200
            
            # Artificial Injection if mock_attack_mode is active
            if mock_attack_mode == "exfil":
                current_metrics[ESP32_CAM_IP]["bytes"] += 20000
            elif mock_attack_mode == "flood":
                current_metrics[ESP32_CAM_IP]["packets"] += 150
            elif mock_attack_mode == "recon":
                # Simulate port scan by adding unique ports
                for p in range(80, 90):
                    current_metrics[ESP32_CAM_IP]["dst_ports"].add(p)
                    
        time.sleep(1)

@app.route('/mock/trigger/<attack_type>', methods=['POST'])
def mock_trigger(attack_type):
    """Hidden endpoint to test scoring logic by instantly modifying current_metrics."""
    with state_lock:
        if attack_type == "exfil":
            current_metrics[ESP32_CAM_IP]["bytes"] += 80000 # 80 KB
        elif attack_type == "ddos":
            current_metrics[ESP32_CAM_IP]["packets"] += 150 # 150 pkts
        elif attack_type == "scan":
            current_metrics[ESP32_CAM_IP]["dst_ports"] = set(range(1, 10)) # 9 ports
    return "Mock attack injected", 200

# --- SPA FALLBACK ROUTE ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react_app(path):
    """Serve the React frontend for all unknown routes"""
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    add_log("Starting CIPHER Edge Gateway...")
    
    # Start the Scoring Engine
    threading.Thread(target=scoring_engine, daemon=True).start()
    
    # Start the Packet Sniffer
    if SCAPY_AVAILABLE:
        threading.Thread(target=sniffer_thread, daemon=True).start()
        threading.Thread(target=arp_discovery_thread, daemon=True).start()
    # Always run the mock simulator — it only injects traffic when mock_attack_mode
    # is active, so it's a no-op during normal operation alongside the real sniffer.
    threading.Thread(target=mock_traffic_simulator, daemon=True).start()
        
    # Start the Flask API
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
