# BBZBL Modul 324: Schiffe versenken

Dieses Repository enthält eine Web-Applikation für das Spiel **Schiffe versenken**, welche im Rahmen des **BBZBL Moduls 324** entwickelt wird.

Ziel des Projekts ist es, eine Web-Applikation mit **JavaScript** zu erstellen, welche analog zum [Musterprojekt](https://github.com/herrhodel/modul-324-muster) automatisch:

* getestet
* gebaut
* released
* deployed

wird.

> [!NOTE]
> Die Web-Applikation befindet sich im Ordner `/app`.
> Wird eine andere Ordnerstruktur verwendet, müssen die entsprechenden Build- und Deployment-Scripts angepasst werden.

## Team

Das Team besteht aus vier Personen:
* Peter Ngo
* Tim Marlétaz
* Furkan Güner
* Noam Schmidiger

## Projektidee

Die Applikation bildet das klassische Spiel **Schiffe versenken** als Web-Anwendung ab.

Die Spiellogik wird mit **JavaScript** umgesetzt. Die Benutzeroberfläche wird mit **HTML und CSS** erstellt.

Geplant sind unter anderem folgende Funktionen:

* Darstellung eines Spielfeldes
* Platzierung von Schiffen
* Auswahl von Feldern zum Angreifen
* Erkennung von Treffern und Fehlschüssen
* Erkennung versenkter Schiffe
* Erkennung des Spielendes
* Möglichkeit, ein neues Spiel zu starten

Die Spiellogik soll möglichst unabhängig von der Benutzeroberfläche aufgebaut werden, damit sie automatisiert getestet werden kann.

## CI/CD

Das Repository soll so aufgebaut werden, dass Änderungen automatisiert überprüft und verarbeitet werden.

Dazu gehören unter anderem:

1. **Test** – automatisierte Tests der JavaScript-Spiellogik
2. **Build** – Erstellen der deploybaren Web-Applikation
3. **Release** – Erstellen einer neuen Version
4. **Deployment** – automatisches Bereitstellen der Anwendung

Die Umsetzung orientiert sich dabei am Musterprojekt des Moduls 324.

## Ordnerstruktur

Die Ordnerstruktur wird analog zum Musterprojekt aufgebaut.

```text
.
├── app/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── docs/
│
└── ...
```

Der Ordner `docs` ist bereits im Starter-Projekt vorhanden und wird für die Dokumentation des Projekts verwendet.

## Ziel

Am Ende soll eine funktionsfähige Version von **Schiffe versenken im Browser** vorhanden sein, bei welcher der komplette Entwicklungsprozess von den automatisierten Tests bis zum Deployment über die CI/CD-Pipeline nachvollziehbar ist.

