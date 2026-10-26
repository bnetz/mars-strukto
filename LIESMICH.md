# Mars-Strukto

Mars-Strukto ist der Struktogramm-Editor aus dem Lernspiel Escape from Mars (https://escape-from-mars.de/). Struktogramme nach der Operatorenliste für Struktogramme (Abitur Baden-Württemberg, Version 2.2) bauen, ausführen (Konsole, Ein- und Ausgabe, Variablen, Schritt-Betrieb) und als Datei oder Bild speichern – im Browser, ohne Anmeldung, ohne Cookies, ohne Bibliotheken.

Online: https://escape-from-mars.de/mars-strukto/

## Benutzen

`index.html` im Browser öffnen (auch per Doppelklick, ohne Internet).

## In eine eigene Seite einbauen

```html
<script src="https://escape-from-mars.de/mars-strukto/1/mars-strukto.js"></script>
<div class="mars-strukto"></div>
```

Oder diesen Ordner auf den eigenen Server legen und `mars-strukto.js` von dort laden. Einstellungen (Höhe, Programmname, Speichern), Datenschutz-Hinweise und Versionen stehen in `einbinden.html`.

## Eigene Befehle (Schnittstelle)

Eine Seite kann dem Editor eigene Befehle beibringen (z. B. für eine Roboter-Welt): `MarsStrukto.befehle([...])`. Beschreibung in `API.md`, lauffähiges Beispiel in `beispiel-roboter.html`.

## Lizenz

MIT-Lizenz, ohne Gewähr und ohne Unterstützung – siehe `LIZENZ.txt`. Die eingebetteten Schriften „Mars Sans“ und „Mars Code“ (Teilmengen von Source Sans Pro und Source Code Pro, Adobe) stehen unter der SIL Open Font License 1.1 – siehe `fonts/OFL.txt`.

© Berthold Metz 2026
