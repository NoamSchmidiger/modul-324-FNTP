# BBZBL Modul 324: Schiffe versenken

Dieses Repository enthält eine Web-Applikation für das Spiel **Schiffe versenken**, welche im Rahmen des **BBZBL Moduls 324** entwickelt wird.

Das Projekt besteht aktuell aus einem Vue-Frontend sowie einem Node.js-Server für die eigentliche Spielverwaltung. Zusätzlich ist ein Spring-Boot-Backend mit einem einfachen Test-Endpunkt vorhanden.

## Team
> Wird eine andere Ordnerstruktur verwendet, müssen die entsprechenden Build- und Deployment-Scripts angepasst werden.

- Peter Ngo
- Tim Marlétaz
- Furkan Güner
- Noam Schmidiger

## Projektidee

Die Applikation bildet das klassische Spiel **Schiffe versenken** als Web-Anwendung ab.

Die aktuelle Spielverwaltung unterstützt:

- Erstellen einer Partie und Erzeugen eines Einladungslinks
- Beitritt eines zweiten Spielers über den Einladungslink
- Platzierung und Validierung der Flotten auf einem 10x10-Spielfeld
- Spielstatus und Zugverwaltung
- Schüsse mit den Ergebnissen Treffer, Wasser und versenktes Schiff
- Echtzeit-Kommunikation über Socket.IO
- Ablaufzeiten für nicht abgeschlossene Partien

Das Frontend ist aktuell noch ein Vue-Prototyp und ruft beim Laden den
Spring-Boot-Endpunkt `/api/hello` auf. Die vollständige Spieloberfläche ist
noch nicht an den Spielserver angeschlossen.

## Lokal starten

### Voraussetzungen

- **Node.js** (LTS) und **npm**
- **Java 21** und **Maven** für das Spring-Boot-Backend
- Optional: [mise](https://mise.jdx.dev/) für die Versionen aus `mise.toml`

Der Spielserver und das Frontend laufen parallel. Dafür werden zwei Terminals
benötigt.

### Spielserver

```bash
cd server
npm install
node server.js
```

Der Spielserver läuft anschliessend auf [http://localhost:3000](http://localhost:3000).
Er stellt REST-Endpunkte für Partien und eine Socket.IO-Verbindung für Schüsse
bereit.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Der Vite-Dev-Server läuft anschliessend auf [http://localhost:5173](http://localhost:5173). Diese Adresse wird im Browser geöffnet.

### Spring-Boot-Backend

Das Spring-Boot-Backend liegt im Ordner `backend/` und stellt aktuell den
Test-Endpunkt `/api/hello` bereit:

```bash
cd backend
./mvnw spring-boot:run
```

Das Backend läuft anschliessend auf [http://localhost:8080](http://localhost:8080).
Der Endpunkt kann beispielsweise mit
[http://localhost:8080/api/hello](http://localhost:8080/api/hello) aufgerufen
werden.

## Tests

Die HTTP-Tests für den Spielserver liegen im Ordner `server/http/`. Sie können
mit dem HTTP-Client von IntelliJ oder WebStorm ausgeführt werden. Die Dateien
sind für die folgende Reihenfolge vorgesehen:

1. `01-happy-path.http` – Partie erstellen, beitreten und Flotten platzieren
2. `02-fehlerfaelle.http` – Fehlerfälle und Flottenvalidierung
3. `03-ablaufzeit.http` – Ablauf einer Partie
4. `04-schuesse-socketio.http` – Schüsse und Zugwechsel über Socket.IO

Für die Ablaufzeit-Tests kann der Server mit einer verkürzten Lebensdauer
gestartet werden:

```bash
cd server
GAME_TTL_MS=5000 node server.js
```

Im Frontend stehen ausserdem die npm-Scripts `npm run build`, `npm run lint` und
`npm run lint:ci` zur Verfügung.

## CI/CD

Das Repository enthält die Grundlagen für einen automatisierten Entwicklungsprozess analog zum [Musterprojekt](https://github.com/herrhodel/modul-324-muster).

Dazu gehören unter anderem:

1. **Test** – HTTP-Tests des Spielservers und Linting des Frontends
2. **Build** – Erstellen des Frontend-Builds mit Vite
3. **Release** – Erstellen einer neuen Version
4. **Deployment** – automatisches Bereitstellen der Anwendung

Die Umsetzung orientiert sich dabei am Musterprojekt des Moduls 324.

## Ordnerstruktur

```text
.
├── backend/          # Spring-Boot-Backend
├── frontend/         # Vue-Frontend mit Vite
├── server/           # Node.js-Spielserver mit Express und Socket.IO
│   └── http/         # HTTP-Testabläufe
├── tests/            # Playwright-Testvorlagen
├── docs/             # Projektdokumentation und Reflexionen
├── mise.toml         # Lokale Tool-Versionen
└── README.md
```

## Ziel

Am Ende soll eine vollständig nutzbare Version von **Schiffe versenken im
Browser** vorhanden sein. Dafür wird das bestehende Vue-Frontend noch mit dem
Spielserver verbunden und anschliessend der komplette Entwicklungsprozess von
den automatisierten Tests bis zum Deployment über die CI/CD-Pipeline
nachvollziehbar gemacht.
