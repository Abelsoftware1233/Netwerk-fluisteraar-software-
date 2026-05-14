"""
Netwerkverkeer Fluisteraar - Flask API Server
Exposes network scan results as a REST API for the frontend.

Install dependencies:
    pip install flask flask-cors requests

Run:
    python server.py
"""

import json
import threading
import time
from datetime import datetime
from flask import Flask, jsonify, Response
from flask_cors import CORS

try:
    from monitor import run_scan
    MONITOR_AVAILABLE = True
except ImportError:
    MONITOR_AVAILABLE = False

app = Flask(__name__)
CORS(app)  # Allow all origins for local dev

# ─── DEMO DATA (used if monitor.py can't run or for testing) ──────────────────

DEMO_DATA = {
    "scan_time": datetime.now().isoformat(),
    "total_connections": 18,
    "foreign_count": 11,
    "country_tally": {
        "United States": 7,
        "China": 2,
        "Russia": 1,
        "Germany": 1,
        "Netherlands": 4,
        "Ireland": 2,
        "Singapore": 1,
    },
    "lan_devices": [
        {"ip": "192.168.1.1", "mac": "aa:bb:cc:dd:ee:01", "hostname": "router.local"},
        {"ip": "192.168.1.10", "mac": "aa:bb:cc:dd:ee:02", "hostname": "smart-tv.local"},
        {"ip": "192.168.1.15", "mac": "aa:bb:cc:dd:ee:03", "hostname": "thermostat.local"},
        {"ip": "192.168.1.20", "mac": "aa:bb:cc:dd:ee:04", "hostname": "camera-01.local"},
        {"ip": "192.168.1.25", "mac": "aa:bb:cc:dd:ee:05", "hostname": "echo-dot.local"},
    ],
    "connections": [
        {
            "proto": "tcp", "local": "192.168.1.10:54231", "remote_ip": "93.184.216.34",
            "remote_port": 443, "state": "ESTABLISHED", "country": "United States",
            "country_code": "US", "city": "Norwell", "org": "AS15133 Edgecast Inc.",
            "lat": 42.16, "lon": -70.82, "is_foreign": True, "process": "SmartTV-App",
            "hostname": "server.iana.example.com", "risk": "MEDIUM",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.15:61022", "remote_ip": "39.156.70.21",
            "remote_port": 8883, "state": "ESTABLISHED", "country": "China",
            "country_code": "CN", "city": "Beijing", "org": "AS23724 IDC, China Telecommunications",
            "lat": 39.90, "lon": 116.39, "is_foreign": True, "process": "thermostat-d",
            "hostname": "mqtt.tuya.cn", "risk": "HIGH",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.20:55701", "remote_ip": "185.53.178.9",
            "remote_port": 554, "state": "ESTABLISHED", "country": "Russia",
            "country_code": "RU", "city": "Moscow", "org": "AS204428 SRT Wireless LLC",
            "lat": 55.75, "lon": 37.62, "is_foreign": True, "process": "camera-agent",
            "hostname": "relay.hikvision.ru", "risk": "HIGH",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.25:49832", "remote_ip": "54.239.28.85",
            "remote_port": 443, "state": "ESTABLISHED", "country": "United States",
            "country_code": "US", "city": "Ashburn", "org": "AS16509 Amazon.com Inc.",
            "lat": 39.04, "lon": -77.49, "is_foreign": True, "process": "alexa-agent",
            "hostname": "avs-alexa-eu.amazon.com", "risk": "MEDIUM",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "udp", "local": "192.168.1.10:1900", "remote_ip": "239.255.255.250",
            "remote_port": 1900, "state": "STATELESS", "country": "United States",
            "country_code": "US", "city": "Mountain View", "org": "AS15169 Google LLC",
            "lat": 37.38, "lon": -122.08, "is_foreign": True, "process": "SmartTV-upnp",
            "hostname": "ssdp.mcast.net", "risk": "MEDIUM",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.15:60011", "remote_ip": "52.211.12.44",
            "remote_port": 443, "state": "ESTABLISHED", "country": "Ireland",
            "country_code": "IE", "city": "Dublin", "org": "AS16509 Amazon AWS",
            "lat": 53.33, "lon": -6.25, "is_foreign": True, "process": "nest-agent",
            "hostname": "home.nest.com", "risk": "MEDIUM",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.20:50221", "remote_ip": "13.251.19.45",
            "remote_port": 8443, "state": "ESTABLISHED", "country": "Singapore",
            "country_code": "SG", "city": "Singapore", "org": "AS16509 Amazon AWS SG",
            "lat": 1.35, "lon": 103.82, "is_foreign": True, "process": "camera-agent",
            "hostname": "p2p.reolink-sg.com", "risk": "HIGH",
            "timestamp": datetime.now().isoformat()
        },
        {
            "proto": "tcp", "local": "192.168.1.1:55312", "remote_ip": "37.49.226.10",
            "remote_port": 443, "state": "ESTABLISHED", "country": "Netherlands",
            "country_code": "NL", "city": "Amsterdam", "org": "AS12859 NL-BIT",
            "lat": 52.37, "lon": 4.89, "is_foreign": False, "process": "router-update",
            "hostname": "update.tp-link.com", "risk": "LOW",
            "timestamp": datetime.now().isoformat()
        },
    ],
}

# ─── SCAN STATE ───────────────────────────────────────────────────────────────

_scan_lock = threading.Lock()
_latest_scan = DEMO_DATA.copy()
_scan_running = False


def background_scan(local_country: str = "NL"):
    global _latest_scan, _scan_running
    with _scan_lock:
        _scan_running = True
    try:
        if MONITOR_AVAILABLE:
            result = run_scan(local_country)
        else:
            # Simulate a fresh scan with demo data + new timestamp
            import copy
            result = copy.deepcopy(DEMO_DATA)
            result["scan_time"] = datetime.now().isoformat()

        with _scan_lock:
            _latest_scan = result
    except Exception as e:
        print(f"Scan error: {e}")
    finally:
        with _scan_lock:
            _scan_running = False


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route("/api/status")
def status():
    with _scan_lock:
        running = _scan_running
    return jsonify({
        "status": "ok",
        "monitor_available": MONITOR_AVAILABLE,
        "scan_running": running,
        "version": "1.0.0",
    })


@app.route("/api/scan", methods=["GET"])
def get_scan():
    with _scan_lock:
        data = _latest_scan.copy()
    return jsonify(data)


@app.route("/api/scan/run", methods=["POST"])
def trigger_scan():
    with _scan_lock:
        if _scan_running:
            return jsonify({"error": "Scan already running"}), 409

    t = threading.Thread(target=background_scan, daemon=True)
    t.start()
    return jsonify({"message": "Scan started", "timestamp": datetime.now().isoformat()})


@app.route("/api/connections/foreign", methods=["GET"])
def foreign_connections():
    with _scan_lock:
        data = _latest_scan
    foreign = [c for c in data.get("connections", []) if c.get("is_foreign")]
    return jsonify({"count": len(foreign), "connections": foreign})


@app.route("/api/connections/high-risk", methods=["GET"])
def high_risk():
    with _scan_lock:
        data = _latest_scan
    risky = [c for c in data.get("connections", []) if c.get("risk") == "HIGH"]
    return jsonify({"count": len(risky), "connections": risky})


@app.route("/api/devices", methods=["GET"])
def devices():
    with _scan_lock:
        data = _latest_scan
    return jsonify({"devices": data.get("lan_devices", [])})


@app.route("/api/stream")
def stream():
    """Server-Sent Events endpoint for live updates."""
    def event_stream():
        last_scan_time = None
        while True:
            with _scan_lock:
                current_time = _latest_scan.get("scan_time")
                running = _scan_running

            payload = json.dumps({
                "scan_time": current_time,
                "scan_running": running,
                "foreign_count": _latest_scan.get("foreign_count", 0),
                "total_connections": _latest_scan.get("total_connections", 0),
            })
            yield f"data: {payload}\n\n"
            time.sleep(5)

    return Response(event_stream(), mimetype="text/event-stream")


# ─── ENTRY POINT ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("╔══════════════════════════════════════════════╗")
    print("║    NETWERKVERKEER FLUISTERAAR v1.0           ║")
    print("║    Network Phone-Home Monitor                ║")
    print("╠══════════════════════════════════════════════╣")
    print(f"║  Monitor available: {str(MONITOR_AVAILABLE):<26}║")
    print("║  Running on: http://localhost:5000           ║")
    print("╚══════════════════════════════════════════════╝")
    app.run(debug=False, host="0.0.0.0", port=5000, threaded=True)
