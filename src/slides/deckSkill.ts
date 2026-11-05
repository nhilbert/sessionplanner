import { SLIDE_FORMAT, SLIDE_LAYOUTS } from '@/domain/slideFormat'

/**
 * Instructions for whatever AI someone uses, to turn a PowerPoint deck into what the slide pool imports: a ZIP with
 * deck.json and one file per slide. Written from the catalogue, so it is as current as the app. It needs no tools of
 * this repository, as the people who use it have none; .claude/skills/deck-translate is the same work for those who do.
 * The front matter makes the file a skill as it is; other assistants read it as plain instructions.
 */
export const DECK_SKILL_FILE = 'folien-uebersetzen.md'

const layoutDoc = () =>
  SLIDE_LAYOUTS.filter((l) => !l.generated)
    .map((l) => `### ${l.layout}\n\n${l.use}\n\n- Structure: ${l.structure}\n${l.options ? `- Options: ${l.options}\n` : ''}- Holds: ${l.fits}\n\n\`\`\`html\n${l.example}\n\`\`\``)
    .join('\n\n')

const classes = () =>
  Object.entries(SLIDE_FORMAT.classes)
    .map(([name, use]) => `- \`${name}\`: ${use}`)
    .join('\n')

export function deckSkill(): string {
  return `---
name: folien-uebersetzen
description: Übersetzt eine PowerPoint-Datei in das Folienformat der Foliensammlung und liefert ein ZIP zum Hochladen.
---

# Foliensatz für die Foliensammlung übersetzen

Du bekommst eine PowerPoint-Datei (.pptx). Mach daraus ein ZIP, das die Foliensammlung importiert: jede Folie wird in eine Vorlage des Katalogs übertragen, mit den Worten des Foliensatzes.

**Wichtig für die Person, die das nutzt:** Die Präsentation geht an den Anbieter dieser KI. Lade keine Inhalte hoch, die dort nichts zu suchen haben, etwa Namen von Teilnehmenden oder vertrauliche Kundendaten. Wer das vermeiden will, nutzt den Import ohne KI in der App.

## Vorgehen

1. **Lies die Datei vollständig:** Folien in ihrer Reihenfolge, Texte, Tabellen, Bilder, Sprechernotizen. Ausgeblendete Folien überspringst du. Wenn du Code ausführen kannst, lies die PPTX damit aus (sie ist ein ZIP mit XML). Wenn nicht, sag das und bitte um die Folientexte.
2. **Wähle je Folie die Vorlage nach dem, was die Folie tut,** nicht danach, wie sie aussah: ${SLIDE_FORMAT.choosing}
3. **Schreibe jede Folie als eigene Datei** \`NN-vorlage.html\` (\`01-section.html\`, \`02-list.html\`, …): genau ein \`<section class="slide VORLAGE">\`, wie der Katalog unten es zeigt.
4. **Bilder:** Fotos und Abbildungen, die etwas zeigen, kommen als Datei in \`assets/\` unter einem kurzen Namen und werden auf der Folie mit \`<img src="assets/name.jpg" alt="…">\` eingebunden. Nur PNG, JPEG, WebP und GIF, höchstens 10 MB. Dekoration, Hintergründe und Logos lässt du weg: Das Logo kommt aus dem Design.
5. **Schreibe \`deck.json\`** (unten) und packe alles in ein ZIP. Gib es zum Herunterladen aus.
6. **Sag, was du ausgelassen oder nicht übertragen konntest:** Folie für Folie, kurz.

## Regeln

- **Nur die Worte des Foliensatzes.** Erfinde nichts dazu. Wo eine Vorlage eine Zeile verlangt, die der Foliensatz nicht hat, lass sie weg.
- **Eine Idee je Folie.** Wenn eine Folie mehr enthält, als die Vorlage fasst, teile sie auf mehrere Folien auf.
- **Kundenspezifisches** wie Umfrageergebnisse, Teilnehmerlisten und Termine überträgst du nicht. Nenne die Folien am Ende.
- **Titelfolie, Agenda, Pausen und Abschluss** erzeugt die App selbst aus dem Workshop: Diese Folien überträgst du nicht.
- **Text:** ${SLIDE_FORMAT.text}
- **Sprechernotizen** gehören nicht auf die Folie. Sie kommen als \`notes\` in \`deck.json\`, aufgeräumt, nicht erfunden.

## Das ZIP

Alles liegt direkt im ZIP, ohne weiteren Ordner:

\`\`\`text
deck.json
01-section.html
02-list.html
03-split.html
assets/bild.jpg
\`\`\`

\`deck.json\` nennt den Titel und schlägt vor, was als Baustein in die Bibliothek kommt. Die Einträge sind freiwillig: Der Titel genügt.

\`\`\`json
{
  "title": "Titel des Foliensatzes",
  "entries": [
    { "title": "Name des Bausteins", "kind": "block", "category": "input", "duration": 15, "method": "Input", "material": "Moderationskarten, Stifte", "notes": "Sprechernotizen", "slides": ["02-list.html", "03-split.html"] }
  ]
}
\`\`\`

- Ein Eintrag steht für einen Input (eine bis drei Folien) oder eine Übung (eine oder zwei Folien).
- \`kind\` ist \`block\` oder \`break\`; \`category\` ist \`input\`, \`exercise\`, \`discussion\`, \`reflection\`, \`energizer\` oder \`organisation\`; \`duration\` sind Minuten.
- Trage eine Dauer nur ein, wenn sie im Foliensatz steht oder klar aus ihm folgt.

## Das Folienformat

${SLIDE_FORMAT.slide}

- Elemente: ${SLIDE_FORMAT.elements}
- Attribute: ${SLIDE_FORMAT.attributes}
- Verboten: ${SLIDE_FORMAT.forbidden}
- SVG: ${SLIDE_FORMAT.svg}

**Anders als im Text oben** bindest du Bilder hier nicht mit \`asset:<hash>\` ein, sondern mit \`assets/name.jpg\`: Die App lädt sie beim Import hoch und setzt die Adresse selbst. In den Beispielen unten steht deshalb \`asset:…\` für dein \`assets/name.jpg\`.

Klassen:

${classes()}

## Die Vorlagen

${layoutDoc()}

## Vor der Ausgabe prüfen

- Jede Datei enthält genau ein \`<section class="slide VORLAGE">\` einer Vorlage aus dem Katalog.
- Kein \`style\`, keine \`id\`, keine Links, keine Skripte, keine externen Adressen.
- Jedes Bild auf einer Folie liegt in \`assets/\`, und jede Datei in \`deck.json\` gibt es.
- Keine Folie hält mehr, als ihre Vorlage fasst.
`
}
