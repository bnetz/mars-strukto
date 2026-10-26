# Mars-Strukto – Schnittstelle (API) für eigene Befehle

Version der Schnittstelle: 1 (Mars-Strukto 1.x). Stand: 26.10.2026.

Mit dieser Schnittstelle meldet eine Webseite eigene Befehle beim eingebauten Struktogramm-Editor Mars-Strukto an – zum Beispiel die Befehle einer Roboter-Welt, eines Spiels oder einer Simulation. Danach kennt der Editor diese Befehle: Er schlägt sie beim Tippen vor, prüft Namen, Anzahl und Datentypen der Parameter und ruft beim Ausführen des Struktogramms die JavaScript-Funktion der Seite auf. So funktioniert auch Escape from Mars: Peetie meldet dort seine Befehle beim Editor an.

Ein vollständiges, lauffähiges Beispiel ist `beispiel-roboter.html` in diesem Ordner (online: https://escape-from-mars.de/mars-strukto/1/beispiel-roboter.html).

## Schnellstart

```html
<script src="https://escape-from-mars.de/mars-strukto/1/mars-strukto.js"></script>
<div class="mars-strukto" style="height: 600px"></div>
<script>
  MarsStrukto.befehle([
    {
      name: 'lampeAn',
      text: 'Schaltet die Lampe ein.',
      ausfuehren: function () { document.body.style.background = 'yellow'; }
    },
    {
      name: 'lampeIstAn',
      rueckgabe: 'Wahrheitswert',
      text: 'wahr, wenn die Lampe leuchtet.',
      ausfuehren: function () { return document.body.style.background === 'yellow'; }
    }
  ]);
</script>
```

Im Struktogramm stehen die Befehle dann so, wie in der Operatorenliste Aufrufe ohne Operator stehen: als Anweisung `lampeAn()`, als Bedingung `lampeIstAn()` oder `NOT lampeIstAn()`, in Ausdrücken `Ausgabe: lampeIstAn()` oder `Zuweisung: an = lampeIstAn()`.

## Reihenfolge beim Laden

1. Die Zeile `<script src="…/mars-strukto.js">` legt sofort ein Objekt `window.MarsStrukto` an. Alle Funktionen der Schnittstelle sind ab dieser Zeile aufrufbar.
2. Der Editor selbst lädt danach im Hintergrund. Aufrufe, die vorher kommen (`befehle`, `beimStart`, `beimEnde`, `bereit`), werden gesammelt und ausgeführt, sobald er geladen ist. Die Seite muss also nicht warten.
3. Wenn alle Editoren der Seite (alle Elemente mit der Klasse `mars-strukto`) fertig sind, ruft Mars-Strukto die mit `MarsStrukto.bereit(f)` angemeldeten Funktionen auf und meldet außerdem das Ereignis `mars-strukto-bereit` am `document`.

Befehle dürfen auch später noch angemeldet werden. Bereits angezeigte Editoren prüfen ihr Struktogramm dann neu.

## Referenz

### `MarsStrukto.befehle(liste)`

Meldet einen oder mehrere Befehle an. `liste` ist ein Array von Befehls-Objekten (ein einzelnes Objekt geht auch). Rückgabe: ein Array mit den Beschreibungen aller angemeldeten Befehle. Ein Befehl mit einem Namen, der schon angemeldet ist, ersetzt den alten. Die Befehle gelten für alle Mars-Strukto-Editoren der Seite.

Felder eines Befehls:

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `name` | ja | Name des Befehls im Struktogramm, z. B. `'geheVor'`. Erlaubt: Buchstaben a–z, A–Z ohne Umlaute, Ziffern und `_`, am Anfang ein Buchstabe oder `_`. Groß- und Kleinschreibung zählt. Üblich ist lowerCamelCase. Nicht erlaubt: `textAusgeben`, `einlesenGanzzahl`, `einlesenDezimalzahl`, `einlesenZeichenkette`, `_run`, `toString`, `equals`, `hashCode`, `wahr`, `falsch`, `true`, `false`, `null`, `new`, `this`. |
| `ausfuehren` | ja | JavaScript-Funktion, die beim Ausführen des Struktogramms aufgerufen wird (siehe unten). |
| `parameter` | nein | Array der Parameter, in der Reihenfolge des Aufrufs. Jeder Parameter ist `[name, Datentyp]`, z. B. `[['farbe', 'Zeichenkette'], ['anzahl', 'Ganzzahl']]`. Ohne Angabe: keine Parameter. |
| `rueckgabe` | nein | Datentyp des Ergebnisses: `'Ganzzahl'`, `'Dezimalzahl'`, `'Zeichenkette'` oder `'Wahrheitswert'`. Ohne Angabe oder `null`: Der Befehl liefert nichts und ist eine Anweisung. |
| `text` | nein | Kurze Beschreibung, die der Editor bei den Vorschlägen anzeigt. Ein Satz, z. B. `'Der Roboter geht ein Feld vor.'` |
| `gruppe` | nein | Überschrift, unter der der Befehl in den Vorschlägen steht. Standard: `'Befehle'`. |

Datentypen heißen wie in der Operatorenliste: `Ganzzahl`, `Dezimalzahl`, `Zeichenkette`, `Wahrheitswert`. Arrays als Parameter oder Rückgabe gibt es in Version 1 nicht.

Fehler in der Beschreibung (ungültiger Name, unbekannter Datentyp, fehlende Funktion) lösen sofort einen JavaScript-Fehler aus, der mit `MarsStrukto.befehle:` beginnt.

### Die Funktion `ausfuehren`

- **Argumente:** Die Werte der Parameter als gewöhnliche JavaScript-Werte, in der angemeldeten Reihenfolge: `Ganzzahl` → ganzzahlige `number`, `Dezimalzahl` → `number`, `Zeichenkette` → `string` (ohne Anführungszeichen), `Wahrheitswert` → `boolean`. Die Datentypen sind schon geprüft: Ein Struktogramm mit falschen Typen lässt sich gar nicht erst ausführen.
- **Rückgabe:** Bei `rueckgabe: 'Wahrheitswert'` wird das Ergebnis mit `!!` zu `true`/`false`, bei `Ganzzahl` zu einer ganzen Zahl (Nachkommastellen abgeschnitten), bei `Dezimalzahl` zu einer Zahl, bei `Zeichenkette` zu einem Text (`null`/`undefined` → leerer Text). Ohne `rueckgabe` wird das Ergebnis ignoriert.
- **Warten:** `ausfuehren` darf eine `async`-Funktion sein bzw. ein Promise zurückgeben. Das Struktogramm wartet, bis es erfüllt ist. So lassen sich Bewegungen animieren: `await new Promise(r => setTimeout(r, 250))`.
- **Fehler:** Wirft `ausfuehren` einen Fehler (`throw new Error('Der Roboter stößt an eine Wand.')`), hält das Programm an. Die Konsole zeigt „⚠ Fehler beim Ausführen: Der Roboter stößt an eine Wand.“, das Kästchen bleibt markiert. Die Meldung sollte für Schülerinnen und Schüler verständlich sein.
- **`this`:** Ein Objekt mit
  - `this.editor` – der Editor, in dem das Programm läuft (siehe `MarsStrukto.editoren`),
  - `this.laeuft()` – `false`, sobald das Programm gestoppt wurde. Lange Befehle (z. B. Animationen in einer Schleife) sollten das prüfen und dann vorzeitig zurückkehren.
- Das Programm ruft Befehle nacheinander auf, nie gleichzeitig. Der Tempo-Regler und der Schritt-Betrieb des Editors wirken zwischen den Kästchen, nicht innerhalb eines Befehls.

### `MarsStrukto.beimStart(f)`

`f(editor)` wird jedes Mal aufgerufen, bevor ein Struktogramm ausgeführt wird (nachdem es fehlerfrei übersetzt ist). Typisch: die Welt auf den Anfang zurücksetzen. `f` darf `async` sein; der Start wartet darauf.

### `MarsStrukto.beimEnde(f)`

`f(editor, fehler)` wird aufgerufen, wenn ein Programm endet. `fehler` ist `null`, wenn es normal zu Ende lief, `'gestoppt'`, wenn es mit „Stopp“ angehalten oder durch eine Änderung am Struktogramm abgebrochen wurde, sonst die Fehlermeldung (Text).

### `MarsStrukto.bereit(f)`

`f(editoren)` wird einmal aufgerufen, sobald alle Editoren der Seite fertig sind – sofort, falls das schon der Fall ist.

### `MarsStrukto.editoren`

Array der Editoren der Seite (in der Reihenfolge der Elemente). Jeder Editor bietet:

| Eigenschaft / Funktion | Bedeutung |
|---|---|
| `laden(text)` | Öffnet ein Struktogramm aus dem Text einer `.struktogramm.json`-Datei (ersetzt das aktuelle). |
| `text()` | Das aktuelle Struktogramm als Text im Dateiformat. |
| `doc` | Das aktuelle Struktogramm als Objekt (nur lesen). |
| `ausfuehren()` | Startet das Programm wie der Knopf „Ausführen“. |
| `stopp()` | Hält das laufende Programm an. |
| `laeuft` | `true`, solange ein Programm läuft. |
| `ausgabe(text)` | Schreibt einen Text in die Konsole des Editors (ohne Zeilenumbruch; `'\n'` selbst anhängen). |

### `MarsStrukto.angemeldet()`

Liefert die Beschreibungen der angemeldeten Befehle: `[{ name, parameter: [[name, Datentyp], …], rueckgabe, text, gruppe }]`.

### `MarsStrukto.version`

`'1'` – die Version der Schnittstelle.

## Dateiformat (zum Laden und Speichern)

Struktogramme sind JSON-Texte. Kästchen: `stmt` (Anweisung, Feld `text`), `if` (Verzweigung, Felder `cond`, `then`, `else`), `loop` (Schleife, Felder `head`, `body`). Das Hauptprogramm ist die Methode mit dem Namen `_run`; weitere Methoden sind Unterprogramme.

```json
{
  "format": "efm-struktogramm", "version": 1, "name": "Roboter", "attributes": [],
  "methods": [
    { "name": "_run", "params": [], "rtype": "void", "body": [
      { "kind": "loop", "head": "Wiederhole solange NOT wandVoraus()", "body": [
        { "kind": "stmt", "text": "geheVor()" } ] },
      { "kind": "stmt", "text": "Ausgabe: \"Schritte: \" + schritte()" } ] }
  ]
}
```

Unterprogramm: `{ "name": "quadrat", "params": [{ "name": "z", "type": "Ganzzahl" }], "rtype": "Ganzzahl", "body": [ … ] }`. Der Text der Kästchen folgt der Operatorenliste für Struktogramme (BW, Version 2.2), z. B. `Deklaration und Initialisierung: i als Ganzzahl = 0`, `Zuweisung: i = i + 1`, `Ausgabe: i`, `Einlesen: name`, `Wiederhole solange i < 10`, `Zähle i von 1 bis 10, Schrittweite 1`.

## Zusage für Version 1

Alles, was in dieser Datei steht, bleibt in Version 1 so (unter `…/mars-strukto/1/`). Neue Funktionen kommen höchstens dazu. Was hier nicht steht – insbesondere die globalen Objekte `Interp`, `Struktogramm`, `Programm`, `SgEditor`, `SgArbeitsplatz`, `SgPaket`, `SgSchrift`, `SgEinbau` – ist Innenleben und kann sich jederzeit ändern. Die Seite sollte diese Namen auch nicht selbst als globale Variablen verwenden.

## Hinweise für KI-Assistenten, die Code für diese Schnittstelle schreiben

- Erst die Skriptzeile `mars-strukto.js` einbinden, dann `MarsStrukto.befehle([...])` aufrufen. Kein Warten auf ein Ereignis nötig.
- Nur die hier beschriebenen Funktionen benutzen; nicht auf `Interp`, `Struktogramm` oder `SgEditor` zugreifen.
- Datentypen immer deutsch und genau so schreiben: `Ganzzahl`, `Dezimalzahl`, `Zeichenkette`, `Wahrheitswert`. Parameter als `[name, Datentyp]`.
- Befehle, die etwas abfragen (für Bedingungen), bekommen `rueckgabe: 'Wahrheitswert'`. Befehle, die etwas tun, bekommen keine `rueckgabe`.
- Fehler, die Schüler sehen sollen, mit `throw new Error('verständlicher Satz')` melden.
- Für Animationen `async` und `await` verwenden; bei langen Abläufen `this.laeuft()` prüfen.
- Die Welt in `MarsStrukto.beimStart(...)` zurücksetzen, damit jeder Lauf gleich beginnt.
- Namen ohne Umlaute und ohne Leerzeichen (`geheVor`, nicht `gehe vor` oder `gehVör`).
- Im Struktogramm werden Befehle ohne Operator geschrieben (`geheVor()`), eigene Unterprogramme dagegen mit `Aufruf: name(…)`.

## Lizenz

Mars-Strukto steht unter der MIT-Lizenz (`LIZENZ.txt`), ohne Gewähr und ohne Unterstützung. © 2026 Berthold Metz.
