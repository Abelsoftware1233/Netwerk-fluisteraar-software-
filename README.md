# 🔊 Netwerkverkeer Fluisteraar

**IoT Phone-Home Signal Monitor voor Penetration Testing**

Een lichtgewicht security-tool die in kaart brengt welke apparaten in uw netwerk
ongepland contact maken met externe servers in het buitenland.

---

## 📁 Bestandsstructuur

```
netwerkfluisteraar/
├── index.html        ← Frontend (open in browser)
├── style.css         ← Dark industrial UI
├── script.js         ← App controller + demo data
├── ui.js             ← Globe, kaart, apparatenlijst
├── server.py         ← Flask REST API
├── monitor.py        ← Netwerk scan engine
└── requirements.txt  ← Python dependencies
```

---

## 🚀 Snel starten (Demo modus)

Open `index.html` direct in uw browser — geen backend nodig.
De app draait met ingebouwde demo data om de interface te tonen.

---

## 🔧 Met echte network scan (Backend)

### 1. Python dependencies installeren
```bash
pip install -r requirements.txt
```

### 2. Server starten (als administrator/root voor volledige netstat toegang)
```bash
# Linux/macOS
sudo python server.py

# Windows (als Administrator)
python server.py
```

### 3. Frontend aanpassen
In `script.js`, regel 12, verander:
```js
const DEMO_MODE = true;   // → false voor echte data
```

### 4. Open browser
```
http://localhost:5000     # of open index.html direct
```

---

## 🔍 Wat het detecteert

| Type | Detectie |
|------|----------|
| **Phone-home signalen** | Apparaten die stilletjes contact maken met externe servers |
| **Buitenlandse verbindingen** | Verbindingen buiten uw land (configureerbaar) |
| **Hoog-risico poorten** | Niet-standaard poorten (niet 80/443/53) naar buitenland |
| **IoT apparaten** | ARP-tabel scan voor LAN-apparaatdetectie |
| **Geo-locatie** | IP → land, stad, organisatie via ip-api.com |

---

## ⚠️ Disclaimer

**Alleen voor gebruik op eigen netwerken en geautoriseerde penetration tests.**
Het monitoren van netwerken zonder toestemming is strafbaar.

---

## 🎨 UI Features

- **Wereldkaart** met live geanimeerde signaallijnen
- **Risico-classificatie**: HOOG / MEDIUM / LAAG
- **Verbindingstabel** met filter (alles / buitenlands / hoog-risico)
- **Detail panel** met mini-kaart en traceroute simulatie
- **Gebeurtenissenlog** met real-time updates
- **Apparatenlijst** met type-detectie op basis van hostname

---

## 🔌 API Endpoints (backend)

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/status` | GET | Systeem status |
| `/api/scan` | GET | Laatste scan resultaten |
| `/api/scan/run` | POST | Start nieuwe scan |
| `/api/connections/foreign` | GET | Alleen buitenlandse verbindingen |
| `/api/connections/high-risk` | GET | Hoog-risico verbindingen |
| `/api/devices` | GET | LAN apparaten |
| `/api/stream` | GET | Server-Sent Events (live updates) |
