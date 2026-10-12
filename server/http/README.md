<!-- THIS WAS PARTIALLY GENERATED WITH THE HELP OF AI -->

# HTTP-Tests

Tests für den Server im Format des IntelliJ/WebStorm HTTP Clients. Jede Datei
lässt sich mit _Run all requests in file_ ausführen, die Assertions erscheinen
im Tab **Tests** des Run-Fensters.

## Server starten

```bash
cd server
npm install
node server.js
```

Für `03-ablaufzeit.http` mit verkürzter Ablaufzeit starten:

```bash
GAME_TTL_MS=5000 node server.js
```

## Umgebung wählen

In `http-client.env.json` ist die Umgebung `dev` mit `host =
http://localhost:3000` definiert. Vor dem ersten Request oben rechts im Editor
`dev` auswählen, sonst bleibt `{{host}}` leer.

## Reihenfolge

| Datei                       | Inhalt                                                                          | Voraussetzung                                     |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `01-happy-path.http`        | Spiel erstellen, Einladungslink, Beitritt, beide Flotten platzieren, Spielstart | –                                                 |
| `02-fehlerfaelle.http`      | 404 / 403 / 409, Flotten-Validierung                                            | 01 vorher laufen lassen                           |
| `03-ablaufzeit.http`        | Ablauf einer Partie, 410, danach neues Spiel möglich                            | Server mit `GAME_TTL_MS=5000`, manuelle Wartezeit |
| `04-schuesse-socketio.http` | Schüsse, Zugwechsel, Treffer/Wasser/versenkt über Socket.IO                     | 01 vorher laufen lassen                           |

Die Dateien geben Werte über `client.global.set(...)` weiter (`gameId`,
`player1Session`, `player2Session`, …). Diese Variablen überleben innerhalb
einer IDE-Sitzung, darum funktioniert die Kette über mehrere Dateien.

## Zwei Spieler in einem HTTP-Client

Der HTTP Client hat **einen** Cookie-Jar. Würden die Cookies automatisch
mitlaufen, wären beide Spieler dieselbe Session und niemand könnte dem Spiel
beitreten — genau das Problem, das man auch mit zwei Tabs im selben Browser
hat.

Darum:

- jeder Request hat `# @no-cookie-jar`, der Jar bleibt leer
- die Sessions werden aus dem `Set-Cookie`-Header in Variablen gelesen
- jeder Request schickt die Session explizit als `Cookie: SESSION_ID={{...}}`

Wer sie weglässt, ist für den Server ein Unbeteiligter (403) oder ein neuer
Spieler. Sollte eine ältere IDE-Version `@no-cookie-jar` nicht kennen und die
Tests dadurch scheitern, hilft es, die Datei `http-client.cookies` im
Projektordner zu löschen.

## Socket.IO über HTTP testen

Der HTTP Client spricht kein Socket.IO. `04-schuesse-socketio.http` nutzt
deshalb den Polling-Transport von Engine.IO und schickt die Pakete von Hand:

| Paket                   | Bedeutung                                                |
| ----------------------- | -------------------------------------------------------- |
| `0{...}`                | OPEN, Antwort auf den Handshake, enthält die `sid`       |
| `40{...}`               | CONNECT, der JSON-Teil landet in `socket.handshake.auth` |
| `42["event",{...}]`     | Event ohne Acknowledgement                               |
| `42<id>["event",{...}]` | Event mit Acknowledgement-Id                             |
| `43<id>[{...}]`         | ACK, die Antwort des Servers auf dieses Event            |
| `2` / `3`               | Ping (Server) / Pong (Client)                            |

Das Session-Cookie muss beim **Handshake-GET** mitkommen — daraus baut
Socket.IO `socket.handshake` und darüber findet `io.use()` den Spieler.

Zwei Eigenheiten des Pollings:

- Ein GET-Poll ohne wartende Nachrichten blockiert bis zu 25 Sekunden. Es wird
  darum nur gepollt, wenn auch etwas abzuholen ist.
- Klickt man die Requests einzeln und langsam durch, verwirft Engine.IO die
  Verbindung nach rund 45 Sekunden, weil das Pong fehlt. Entweder die Datei als
  Ganzes ausführen oder den letzten Request (`pong`) zwischendurch abschicken.

Angenehmer zu lesen wäre ein kleines Node-Skript mit `socket.io-client`, das
ist aber eine zusätzliche Abhängigkeit und daher hier nicht enthalten.

## Was nicht getestet wird

- **Spielende und Sieger**: dafür müssten alle 17 Felder einer Flotte getroffen
  werden. `04` prüft das Versenken eines einzelnen Schiffs (`sunk`), nicht
  `game:over`.
- **`game:expired` und `game:player-joined`** als Push-Events — technisch
  möglich, aber die Polls müssten dafür zum richtigen Zeitpunkt offen sein.
- **Spiel beenden / aufgeben**: gibt es im Server noch nicht. `02` dokumentiert
  die Folge in einem Kommentar — nach `409 Beenden Sie zuerst das andere Spiel`
  bleibt die Session bis zum Ablauf der Partie blockiert.
