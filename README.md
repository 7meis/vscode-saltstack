# SaltStack extension for Visual Studio Code

This extension adds syntax highlighting and snippet support for SaltStack SLS files, Saltcheck tests, and standalone Jinja templates in VS Code.

![IDE](https://raw.githubusercontent.com/korekontrol/vscode-saltstack/master/example.png)

## Features

- syntax highlighting for Salt SLS (`.sls`)
- syntax highlighting for Saltcheck (`.tst`)
- syntax highlighting for Jinja templates (`.jinja`, `.j2`)
- Salt state snippets for common modules and functions
- Saltcheck snippets via the `sctest` prefix
- Jinja-aware bracket and comment configuration

## Supported languages

| Language | Files |
| --- | --- |
| Salt SLS | `.sls` |
| Saltcheck | `.tst` |
| Jinja | `.jinja`, `.j2` |

## Usage

### Salt state snippets

In a `.sls` file, type part of a state function and trigger suggestions with `Ctrl+Space` (or `Trigger Suggest` from the command palette).

Examples:

- `test.` suggests available `test.*` state functions
- `file.managed:` inserts a more complete managed-file skeleton
- `service.running:` inserts a service state skeleton

### Saltcheck snippets

In a `.tst` file, type `sctest` and trigger suggestions to insert a Saltcheck test template.

## Local development

### Voraussetzungen

- VS Code `1.74.0` oder neuer
- Node.js `18+`
- npm

### Extension lokal starten

1. Repository in VS Code öffnen.
2. Im Terminal `npm run validate` ausführen.
3. `F5` drücken und die Launch-Konfiguration `Launch Extension` starten.
4. Im neuen Extension-Host-Fenster die Beispiel-Dateien unter `examples/` öffnen.

### Manuell testen

Mit den Dateien in `examples/` kannst du schnell prüfen, ob die Extension korrekt funktioniert:

1. `examples/example.sls`
   - Sprache sollte als SaltStack/SLS erkannt werden
   - `file.managed:` und `service.running:` sollten gute Snippets anbieten
2. `examples/example.tst`
   - Sprache sollte als Saltcheck erkannt werden
   - `sctest` sollte Saltcheck-Vorlagen anbieten
3. `examples/example.j2`
   - Jinja-Tags und Variablen sollten hervorgehoben sein
   - Jinja-Klammerpaare sollten sauber ergänzt werden

### Lokales VSIX bauen

Ein lokales Paket kannst du so erzeugen:

```bash
npm run package:local
```

Optional mit eigener Zieldatei:

```bash
npm run package:local -- -o saltstack-local.vsix
```

### Lokales VSIX installieren

Per VS Code UI:

1. Extensions-Ansicht öffnen
2. `...` Menü wählen
3. `Install from VSIX...`
4. das erzeugte `.vsix` auswählen

Oder per CLI:

```bash
code --install-extension saltstack-local.vsix
```

## Validierung

Das Projekt enthält einen lokalen Validator, der u. a. prüft:

- dass alle referenzierten Snippet- und Grammar-Dateien existieren
- dass alle JSON-Dateien parsebar sind
- dass Snippets auf gültige Language-IDs zeigen
- dass `.sls` und `.tst` korrekt verdrahtet sind

Ausführen mit:

```bash
npm run validate
```

## Snippets aktualisieren

`generate_snippets.py` kann neue Salt-State-Funktionen in Snippet-Dateien übernehmen. Dafür wird eine funktionierende lokale Salt-Umgebung benötigt.

Der Generator ergänzt fehlende State-Funktionen, ohne bereits manuell verbesserte Snippets zu überschreiben.

## CI / Publishing

Die Jenkins-Pipeline validiert das Projekt und baut anschließend ein `.vsix`-Paket. Das Publishing in den Marketplace bleibt ein manueller Freigabeschritt.

## Contributing

Pull Requests sind willkommen — besonders für:

- zusätzliche oder bessere Snippets
- Verbesserungen an der Jinja-/SLS-Grammatik
- Tests und Validierung
- spätere IntelliSense-/Hover-/Validation-Features

## Credits

Created by [Marek Obuchowicz](https://github.com/marek-obuchowicz) from [KoreKontrol](https://www.korekontrol.eu/).

Many thanks to William Holroyd, Ross Neufeld and Christian McHugh.

## License

[MIT](LICENSE)
