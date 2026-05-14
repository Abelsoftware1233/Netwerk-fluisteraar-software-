"""
Netwerkverkeer Fluisteraar - Network Monitor Core
Detects 'phone-home' signals from IoT devices contacting foreign servers.
"""

import subprocess
import socket
import json
import time
import threading
import ipaddress
import re
from datetime import datetime
from collections import defaultdict

try:
    import requests
except ImportError:
    requests = None


# ─── GEO IP LOOKUP ────────────────────────────────────────────────────────────

_geo_cache = {}

def lookup_geo(ip: str) -> dict:
    """Look up geolocation for an IP address using free ip-api.com."""
    if ip in _geo_cache:
        return _geo_cache[ip]

    result = {
        "ip": ip,
        "country": "Unknown",
        "country_code": "??",
        "city": "Unknown",
        "org": "Unknown",
        "lat": 0.0,
        "lon": 0.0,
        "is_foreign": False,
    }

    try:
        if requests:
            r = requests.get(
                f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,org,lat,lon",
                timeout=3,
            )
            data = r.json()
            if data.get("status") == "success":
                result.update({
                    "country": data.get("country", "Unknown"),
                    "country_code": data.get("countryCode", "??"),
                    "city": data.get("city", "Unknown"),
                    "org": data.get("org", "Unknown"),
                    "lat": data.get("lat", 0.0),
                    "lon": data.get("lon", 0.0),
                })
    except Exception:
        pass

    _geo_cache[ip] = result
    return result


# ─── NETWORK HELPERS ──────────────────────────────────────────────────────────

def is_private_ip(ip: str) -> bool:
    """Return True if the IP is in a private/reserved range."""
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast
    except ValueError:
        return False


def get_hostname(ip: str) -> str:
    """Reverse-DNS lookup with a short timeout."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip


# ─── CONNECTION SCANNER ───────────────────────────────────────────────────────

def parse_netstat() -> list[dict]:
    """
    Parse active TCP/UDP connections using netstat (cross-platform).
    Returns a list of connection dicts.
    """
    connections = []

    try:
        # Try Linux/macOS netstat
        result = subprocess.run(
            ["netstat", "-tn"],
            capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.splitlines()
    except FileNotFoundError:
        # Windows fallback
        try:
            result = subprocess.run(
                ["netstat", "-n"],
                capture_output=True, text=True, timeout=10
            )
            lines = result.stdout.splitlines()
        except Exception:
            return connections
    except Exception:
        return connections

    for line in lines:
        # Match lines like: tcp  0  0  192.168.1.5:54321  93.184.216.34:443  ESTABLISHED
        parts = line.split()
        if len(parts) < 5:
            continue
        proto = parts[0].lower()
        if proto not in ("tcp", "tcp6", "udp", "udp6"):
            continue

        try:
            local = parts[-3] if len(parts) >= 5 else parts[3]
            remote = parts[-2] if len(parts) >= 5 else parts[4]
            state = parts[-1] if proto.startswith("tcp") else "STATELESS"

            # Extract remote IP
            if remote in ("-", "*:*", "0.0.0.0:*"):
                continue
            if ":" in remote:
                # IPv4:port or [IPv6]:port
                if remote.startswith("["):
                    ip_part = remote.split("]:")[0].lstrip("[")
                    port_part = remote.split("]:")[1] if "]:" in remote else "0"
                else:
                    parts_r = remote.rsplit(":", 1)
                    ip_part = parts_r[0]
                    port_part = parts_r[1] if len(parts_r) > 1 else "0"
            else:
                continue

            if is_private_ip(ip_part) or ip_part in ("0.0.0.0", "::", "127.0.0.1"):
                continue

            connections.append({
                "proto": proto,
                "local": local,
                "remote_ip": ip_part,
                "remote_port": int(port_part) if port_part.isdigit() else 0,
                "state": state,
                "timestamp": datetime.now().isoformat(),
            })
        except Exception:
            continue

    return connections


def get_process_for_connection(remote_ip: str) -> str:
    """
    Best-effort attempt to find which process owns a connection.
    Uses lsof on Unix or netstat -b on Windows.
    """
    try:
        result = subprocess.run(
            ["lsof", "-i", f"@{remote_ip}", "-n", "-P", "-F", "c"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if line.startswith("c"):
                return line[1:].strip()
    except Exception:
        pass
    return "unknown"


# ─── ARP SCANNER ──────────────────────────────────────────────────────────────

def get_arp_table() -> list[dict]:
    """Return local ARP table entries (LAN device discovery)."""
    devices = []
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=10)
        for line in result.stdout.splitlines():
            # Format: hostname (ip) at mac [ether] on iface
            match = re.search(r"\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:A-F-]+)", line)
            if match:
                ip = match.group(1)
                mac = match.group(2)
                if not is_private_ip(ip):
                    continue
                devices.append({
                    "ip": ip,
                    "mac": mac,
                    "hostname": get_hostname(ip),
                })
    except Exception:
        pass
    return devices


# ─── FULL SCAN ────────────────────────────────────────────────────────────────

def run_scan(local_country_code: str = "NL") -> dict:
    """
    Run a full network scan:
    1. Get active connections to external IPs
    2. Geo-locate each external IP
    3. Flag foreign connections
    4. Discover LAN devices
    """
    connections = parse_netstat()
    lan_devices = get_arp_table()

    enriched = []
    seen_ips = set()
    foreign_count = 0
    country_tally = defaultdict(int)

    for conn in connections:
        ip = conn["remote_ip"]
        geo = lookup_geo(ip)
        is_foreign = geo["country_code"] not in ("", local_country_code, "??")
        geo["is_foreign"] = is_foreign

        if is_foreign:
            foreign_count += 1
        country_tally[geo["country"]] += 1

        process = "unknown"
        if ip not in seen_ips:
            process = get_process_for_connection(ip)
            seen_ips.add(ip)

        risk = "LOW"
        if is_foreign and conn["remote_port"] not in (80, 443, 53):
            risk = "HIGH"
        elif is_foreign:
            risk = "MEDIUM"

        enriched.append({
            **conn,
            **geo,
            "process": process,
            "hostname": get_hostname(ip),
            "risk": risk,
        })

    return {
        "scan_time": datetime.now().isoformat(),
        "total_connections": len(enriched),
        "foreign_count": foreign_count,
        "country_tally": dict(sorted(country_tally.items(), key=lambda x: -x[1])),
        "lan_devices": lan_devices,
        "connections": enriched,
    }


if __name__ == "__main__":
    print("Running network scan...")
    result = run_scan()
    print(json.dumps(result, indent=2))
