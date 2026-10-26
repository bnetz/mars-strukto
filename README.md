# Mars-Strukto

**Struktogramm-Editor nach der Operatorenliste für Struktogramme (Abitur Baden-Württemberg, Version 2.2) – aus dem Lernspiel [Escape from Mars](https://escape-from-mars.de/).**

Struktogramme bauen, ausführen (Konsole mit Ein- und Ausgabe, Variablenanzeige, Schritt-Betrieb) und als Datei oder Bild speichern – im Browser, ohne Anmeldung, ohne Cookies, ohne Bibliotheken, ohne Build-Schritt.

- Online benutzen: https://escape-from-mars.de/mars-strukto/
- Einbinden, Einstellungen, Datenschutz, Versionen: [einbinden.html](einbinden.html) (online: https://escape-from-mars.de/mars-strukto/1/einbinden.html)
- Eigene Befehle anmelden (Schnittstelle/API): [API.md](API.md), Beispiel: [beispiel-roboter.html](beispiel-roboter.html)

## In eine eigene Seite einbauen

```html
<script src="https://escape-from-mars.de/mars-strukto/1/mars-strukto.js"></script>
<div class="mars-strukto"></div>
```

Oder diesen Ordner auf den eigenen Server legen bzw. offline benutzen (`index.html` doppelklicken).

## Aufbau

| Datei | Inhalt |
|---|---|
| `mars-strukto.js` | Lader zum Einbauen (lädt CSS und Skripte, macht jedes `.mars-strukto` zum Editor, legt `MarsStrukto` an) |
| `js/arbeitsplatz.js` | Arbeitsplatz (Leiste, Konsole, Variablen, Ausführen) und die Schnittstelle `MarsStrukto` |
| `js/sg-editor.js` | Struktogramm-Editor (Kästchen, Lückentext, Vorschläge, Menüs) |
| `js/struktogramm.js` | Dokumentformat, Übersetzung Struktogramm → Programmbaum, Fehlermeldungen in Schülerdeutsch |
| `js/interp.js` | Parser, Typprüfung und Ausführung |
| `js/programm.js`, `js/sg-svg.js` | Programmbaum, Bild-Export (SVG/PNG) |
| `js/schrift.js`, `js/paket.js` | eingebettete Schriften „Mars Sans“/„Mars Code“, Paketangaben (Version) |
| `css/struktogramm.css` | Aussehen des Editors; `css/seite.css` Aussehen der eigenen Seiten |
| `index.html`, `einbinden.html`, `beispiel-roboter.html` | Standalone-Editor, Doku, Beispiel für die Schnittstelle |

Escape from Mars benutzt dasselbe Paket und meldet dort seine Peetie-Befehle an.

## Lizenz

MIT-Lizenz, ohne Gewähr und ohne Unterstützung – siehe [LIZENZ.txt](LIZENZ.txt) (deutsche Kurzfassung) bzw. [LICENSE](LICENSE). Schriften: SIL Open Font License 1.1 – siehe `fonts/`. Der Schriftzug im Logo (`img/logo.svg`) ist eine feste Grafik mit der Schrift Nasalization (Typodermic Fonts).

© 2026 Berthold Metz
