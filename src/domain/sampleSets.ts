/**
 * Sample content for starter slides (starters.ts): small made-up subjects with enough material for every layout,
 * in German and English. A starter slide shows a layout filled the way it is meant to be filled, so its words
 * have to be nobody's real content: easy to recognise as a sample, and fun to replace.
 */

export interface Pair {
  title: string
  text: string
}

export interface SampleSet {
  /** The subject in a word or two, shown where the subject is chosen. */
  name: string
  title: string
  kicker: string
  lead: string
  question: string
  questionSub: string
  quote: string
  cite: string
  /** Six parallel points. */
  points: Pair[]
  /** Five steps of a sequence. */
  steps: Pair[]
  /** A date for each step, for a timeline. */
  dates: string[]
  numbers: { value: string; label: string }[]
  sides: [{ title: string; points: string[] }, { title: string; points: string[] }]
  axes: { y: [string, string]; x: [string, string] }
  /** Four fields of a 2 × 2, in reading order. */
  cells: Pair[]
  acronym: { letter: string; term: string; text: string }[]
  exercise: { tag: string; title: string; lead: string; steps: string[]; facts: [string, string][] }
  table: { head: string[]; rows: string[][] }
  /** Six boxes with a guiding question each. */
  boxes: Pair[]
  /** The word in the middle of a diagram. */
  core: string
  section: Pair
  caption: string
  source: string
}

const de: SampleSet[] = [
  {
    name: 'Mondreise',
    title: 'Betriebsausflug zum Mond',
    kicker: 'Mondreise · Planung',
    lead: 'Was wir klären, bevor jemand die Rakete bestellt',
    question: 'Wer gießt die Büropflanzen, während wir auf dem Mond sind?',
    questionSub: 'Zwei Minuten still nachdenken, dann zu zweit austauschen',
    quote: 'Ein kleiner Schritt für uns, ein großer Posten in der Reisekostenabrechnung.',
    cite: 'Aus dem Protokoll der Mondgruppe',
    points: [
      { title: 'Raumanzüge anprobieren', text: 'Auch die Handschuhe, vor allem die Handschuhe' },
      { title: 'Proviant einpacken', text: 'Nichts, was krümelt' },
      { title: 'Fensterplätze verlosen', text: 'Alle wollen die Erde sehen' },
      { title: 'Rückflug buchen', text: 'Wird erstaunlich oft vergessen' },
      { title: 'Mondstaub abklopfen', text: 'Bevor es wieder ins Büro geht' },
      { title: 'Postkarten schreiben', text: 'Der Stempel ist der Clou' },
    ],
    steps: [
      { title: 'Countdown üben', text: 'Rückwärts zählen, ohne zu lachen' },
      { title: 'Abheben', text: 'Bitte sitzen bleiben' },
      { title: 'Schweben', text: 'Der schönste Teil der Reise' },
      { title: 'Landen', text: 'Sanft, wenn es geht' },
      { title: 'Fahne aufstellen', text: 'Und ein Gruppenfoto machen' },
    ],
    dates: ['Januar', 'März', 'Juni', 'September', 'Dezember'],
    numbers: [
      { value: '384 400 km', label: 'bis zum Mond, einfache Strecke' },
      { value: '3 Tage', label: 'Flugzeit ohne Zwischenhalt' },
      { value: '1/6', label: 'der gewohnten Schwerkraft' },
    ],
    sides: [
      { title: 'Hinflug', points: ['Vorfreude an Bord', 'Volle Proviantdosen', 'Niemand kennt den Weg'] },
      { title: 'Rückflug', points: ['Mondstaub in den Taschen', 'Leere Proviantdosen', 'Alle kennen eine Abkürzung'] },
    ],
    axes: { y: ['Macht Freude', 'Macht Mühe'], x: ['Geht schnell', 'Dauert lange'] },
    cells: [
      { title: 'Schweben üben', text: 'Sofort und ausgiebig' },
      { title: 'Krater zählen', text: 'Eine Aufgabe für Geduldige' },
      { title: 'Helm putzen', text: 'Zwischendurch erledigen' },
      { title: 'Formulare ausfüllen', text: 'Vor der Abreise, in Ruhe' },
    ],
    acronym: [
      { letter: 'M', term: 'Mutig', text: 'Einsteigen, obwohl es wackelt' },
      { letter: 'O', term: 'Ordentlich', text: 'Alles festzurren, was fliegen kann' },
      { letter: 'N', term: 'Neugierig', text: 'Aus jedem Fenster schauen' },
      { letter: 'D', term: 'Dankbar', text: 'Für die Schwerkraft daheim' },
    ],
    exercise: {
      tag: 'Übung',
      title: 'Schweben in Dreiergruppen',
      lead: 'Jede Person schwebt einmal, hält einmal fest und staunt einmal',
      steps: ['Rollen verteilen: schweben, festhalten, staunen', 'Drei Minuten schweben, dann wechseln', 'Gemeinsam aufschreiben, was überrascht hat'],
      facts: [
        ['Dauer', '20 Minuten'],
        ['Format', 'Dreiergruppen'],
        ['Material', 'Ein Seil und viel Platz'],
      ],
    },
    table: {
      head: ['', 'Rakete', 'Weltraumfahrstuhl'],
      rows: [
        ['Reisezeit', 'Drei Tage', 'Sehr, sehr lange'],
        ['Aussicht', 'Durchs Bullauge', 'Rundum verglast'],
        ['Gepäck', 'Nur Handgepäck', 'Auch der Schreibtisch'],
      ],
    },
    boxes: [
      { title: 'Reiseziel', text: 'Wohin genau auf dem Mond?' },
      { title: 'Mannschaft', text: 'Wer kommt mit, wer hält die Stellung?' },
      { title: 'Ausrüstung', text: 'Was brauchen wir wirklich?' },
      { title: 'Risiken', text: 'Was tun wir, wenn der Kaffee ausgeht?' },
      { title: 'Zeitplan', text: 'Wann müssen wir zurück sein?' },
      { title: 'Andenken', text: 'Was bringen wir den anderen mit?' },
    ],
    core: 'Mondreise',
    section: { title: 'Abflug', text: 'Der Teil, in dem es ernst wird' },
    caption: 'Die Erde, vom Mond aus gesehen',
    source: 'Reisebüro Mondschein, alle Angaben ohne Gewähr',
  },
  {
    name: 'Kaffee',
    title: 'Der perfekte Kaffee im Büro',
    kicker: 'Kaffeeküche · Grundlagen',
    lead: 'Was zwischen Bohne und Tasse alles schiefgehen kann',
    question: 'Wer hat die letzte Tasse genommen und keinen neuen aufgesetzt?',
    questionSub: 'Bitte ehrlich antworten, es bleibt unter uns',
    quote: 'Ohne Kaffee ist auch die beste Besprechung nur ein Stuhlkreis.',
    cite: 'Volksweisheit aus der Teeküche',
    points: [
      { title: 'Bohnen frisch mahlen', text: 'Das Geräusch gehört dazu' },
      { title: 'Wasser nicht kochen', text: 'Kurz vor dem Sieden reicht' },
      { title: 'Tasse vorwärmen', text: 'Der Kaffee dankt es' },
      { title: 'Zeit nehmen', text: 'Vier Minuten sind keine Verschwendung' },
      { title: 'Milch für die anderen', text: 'Auch wenn man selbst schwarz trinkt' },
      { title: 'Kanne ausspülen', text: 'Die Nächsten merken den Unterschied' },
    ],
    steps: [
      { title: 'Mahlen', text: 'Grob für die Kanne, fein für den Kocher' },
      { title: 'Aufgießen', text: 'Langsam, in kleinen Kreisen' },
      { title: 'Warten', text: 'Der schwierigste Schritt' },
      { title: 'Einschenken', text: 'Erst den anderen, dann sich selbst' },
      { title: 'Genießen', text: 'Im Sitzen, wenn möglich' },
    ],
    dates: ['7:30', '9:00', '10:30', '13:00', '15:30'],
    numbers: [
      { value: '92 °C', label: 'ist die Wassertemperatur der Wahl' },
      { value: '4 Minuten', label: 'zieht ein guter Filterkaffee' },
      { value: '60 g', label: 'Kaffee auf einen Liter Wasser' },
    ],
    sides: [
      { title: 'Filterkaffee', points: ['Braucht Geduld', 'Reicht für die ganze Runde', 'Duftet durchs Treppenhaus'] },
      { title: 'Espresso', points: ['Ist in Sekunden fertig', 'Reicht genau für eine Person', 'Macht ordentlich Lärm'] },
    ],
    axes: { y: ['Viel Geschmack', 'Wenig Geschmack'], x: ['Wenig Aufwand', 'Viel Aufwand'] },
    cells: [
      { title: 'Handfilter', text: 'Der stille Favorit' },
      { title: 'Siebträger', text: 'Für Leute mit Geduld und Platz' },
      { title: 'Löslicher Kaffee', text: 'Wenn es wirklich eilt' },
      { title: 'Kalter Rest von gestern', text: 'Lieber nicht' },
    ],
    acronym: [
      { letter: 'B', term: 'Bohne', text: 'Frisch geröstet, kühl gelagert' },
      { letter: 'O', term: 'Ordnung', text: 'Jedes Ding hat seinen Haken' },
      { letter: 'H', term: 'Hitze', text: 'Heiß, aber nicht kochend' },
      { letter: 'N', term: 'Nachschub', text: 'Wer leert, füllt auf' },
      { letter: 'E', term: 'Erholung', text: 'Die Pause zählt mit' },
    ],
    exercise: {
      tag: 'Übung',
      title: 'Blindverkostung zu zweit',
      lead: 'Eine Person schenkt ein, die andere rät, was in der Tasse ist',
      steps: ['Drei Tassen vorbereiten, ohne dass die andere Person zusieht', 'Reihum probieren und Vermutungen notieren', 'Auflösen und die Rollen tauschen'],
      facts: [
        ['Dauer', '15 Minuten'],
        ['Format', 'Zu zweit'],
        ['Material', 'Drei Tassen, ein Geschirrtuch'],
      ],
    },
    table: {
      head: ['', 'Filterkaffee', 'Espresso'],
      rows: [
        ['Mahlgrad', 'Mittel bis grob', 'Sehr fein'],
        ['Zubereitung', 'Vier Minuten', 'Dreißig Sekunden'],
        ['Passt zu', 'Langen Besprechungen', 'Kurzen Entscheidungen'],
      ],
    },
    boxes: [
      { title: 'Bohnen', text: 'Woher kommen sie, wer kauft nach?' },
      { title: 'Maschine', text: 'Wer weiß, wie man sie entkalkt?' },
      { title: 'Tassen', text: 'Wem gehört die mit dem Sprung?' },
      { title: 'Kasse', text: 'Wie rechnen wir ab, ohne zu rechnen?' },
      { title: 'Regeln', text: 'Was gilt, wenn die Kanne leer ist?' },
      { title: 'Gäste', text: 'Was bieten wir an, wenn Besuch kommt?' },
    ],
    core: 'Kaffee',
    section: { title: 'Aufguss', text: 'Jetzt wird es heiß' },
    caption: 'Die Kaffeeküche an einem ruhigen Morgen',
    source: 'Eigene Erhebung an der Kaffeemaschine',
  },
  {
    name: 'Büropflanze',
    title: 'Wie die Büropflanze überlebt',
    kicker: 'Fensterbank · Pflege',
    lead: 'Eine Anleitung für alle, die es gut meinen',
    question: 'Wann hat diese Pflanze zuletzt Wasser gesehen?',
    questionSub: 'Jede Person tippt, dann fragen wir die Erde',
    quote: 'Sie hat drei Umzüge überlebt und zwei Geschäftsführungen.',
    cite: 'Über den Gummibaum im zweiten Stock',
    points: [
      { title: 'Regelmäßig gießen', text: 'Aber nicht alle am selben Tag' },
      { title: 'Ans Licht stellen', text: 'Der Platz hinter dem Drucker zählt nicht' },
      { title: 'Blätter abstauben', text: 'Sie atmet damit' },
      { title: 'Gut zureden', text: 'Schadet nachweislich nicht' },
      { title: 'Rechtzeitig umtopfen', text: 'Wenn die Wurzeln winken' },
      { title: 'Urlaub vertreten', text: 'Eine Liste an der Tür hilft' },
    ],
    steps: [
      { title: 'Hinsehen', text: 'Hängen die Blätter?' },
      { title: 'Fingerprobe', text: 'Zwei Zentimeter tief in die Erde' },
      { title: 'Gießen', text: 'Langsam, bis der Untersetzer feucht ist' },
      { title: 'Drehen', text: 'Eine Vierteldrehung zum Fenster' },
      { title: 'Eintragen', text: 'Ein Strich in die Gießliste' },
    ],
    dates: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
    numbers: [
      { value: '1 ×', label: 'in der Woche gießen genügt den meisten' },
      { value: '21 °C', label: 'mag sie am liebsten' },
      { value: '7 Blätter', label: 'sind seit dem Frühjahr dazugekommen' },
    ],
    sides: [
      { title: 'Zu viel Fürsorge', points: ['Nasse Füße im Untersetzer', 'Dünger nach Gefühl', 'Jede Woche ein neuer Platz'] },
      { title: 'Zu wenig Fürsorge', points: ['Staub auf jedem Blatt', 'Erde hart wie Beton', 'Seit Monaten im Schatten'] },
    ],
    axes: { y: ['Braucht viel Licht', 'Braucht wenig Licht'], x: ['Verzeiht alles', 'Nimmt alles übel'] },
    cells: [
      { title: 'Geldbaum', text: 'Sonnig, genügsam, dankbar' },
      { title: 'Zimmerorchidee', text: 'Hell, aber bitte ohne Zugluft' },
      { title: 'Bogenhanf', text: 'Übersteht jede Urlaubszeit' },
      { title: 'Zimmerfarn', text: 'Schattig, aber anspruchsvoll' },
    ],
    acronym: [
      { letter: 'G', term: 'Gießen', text: 'Lieber selten und gründlich' },
      { letter: 'R', term: 'Ruhe', text: 'Nicht ständig umstellen' },
      { letter: 'Ü', term: 'Überblick', text: 'Wer war zuletzt dran?' },
      { letter: 'N', term: 'Nährstoffe', text: 'Im Frühjahr ein wenig Dünger' },
    ],
    exercise: {
      tag: 'Übung',
      title: 'Pflanzenvisite im Flur',
      lead: 'Zu dritt eine Pflanze besuchen und herausfinden, was ihr fehlt',
      steps: ['Eine Pflanze aussuchen und eine Minute still betrachten', 'Erde, Blätter und Standort prüfen', 'Eine Empfehlung auf eine Karte schreiben und dazustellen'],
      facts: [
        ['Dauer', '25 Minuten'],
        ['Format', 'Dreiergruppen'],
        ['Material', 'Karten, Stifte, eine Gießkanne'],
      ],
    },
    table: {
      head: ['', 'Gummibaum', 'Zimmerfarn'],
      rows: [
        ['Standort', 'Hell, ohne pralle Sonne', 'Halbschatten'],
        ['Wasser', 'Einmal in der Woche', 'Jeden zweiten Tag'],
        ['Laune', 'Ausgeglichen', 'Schnell beleidigt'],
      ],
    },
    boxes: [
      { title: 'Standort', text: 'Wo bekommt sie genug Licht?' },
      { title: 'Gießdienst', text: 'Wer ist diese Woche dran?' },
      { title: 'Vertretung', text: 'Wer springt in den Ferien ein?' },
      { title: 'Ausstattung', text: 'Haben wir eine Gießkanne, die nicht tropft?' },
      { title: 'Warnzeichen', text: 'Woran merken wir, dass etwas fehlt?' },
      { title: 'Nachwuchs', text: 'Wohin mit den Ablegern?' },
    ],
    core: 'Pflanze',
    section: { title: 'Wurzeln', text: 'Was man nicht sieht, trägt den Rest' },
    caption: 'Der Gummibaum im zweiten Stock, Stand heute',
    source: 'Beobachtungen von der Fensterbank',
  },
  {
    name: 'Picknick',
    title: 'Das Teampicknick im Stadtpark',
    kicker: 'Picknick · Vorbereitung',
    lead: 'Was in den Korb gehört und was besser im Büro bleibt',
    question: 'Wer bringt den Kartoffelsalat mit, und wer nur Hunger?',
    questionSub: 'Kurz überlegen, dann in die Liste eintragen',
    quote: 'Es gibt kein schlechtes Wetter, nur zu wenig Picknickdecken.',
    cite: 'Alte Regel aus dem Stadtpark',
    points: [
      { title: 'Decken ausbreiten', text: 'Großzügig, mit Blick auf den Teich' },
      { title: 'Ameisen umleiten', text: 'Freundlich, aber bestimmt' },
      { title: 'Salate verteilen', text: 'Drei Sorten Nudelsalat sind normal' },
      { title: 'Schatten sichern', text: 'Der Baum gehört denen, die früh kommen' },
      { title: 'Federball spielen', text: 'Ohne Netz und ohne Punkte' },
      { title: 'Reste gerecht teilen', text: 'Niemand geht mit leeren Dosen heim' },
    ],
    steps: [
      { title: 'Wetter prüfen', text: 'Dreimal, mit drei Apps' },
      { title: 'Korb packen', text: 'Schweres nach unten, Kuchen nach oben' },
      { title: 'Platz finden', text: 'Nicht zu nah am Ententeich' },
      { title: 'Zugreifen', text: 'Erst ansehen, dann loben, dann essen' },
      { title: 'Aufräumen', text: 'Der Park soll nichts merken' },
    ],
    dates: ['11:00', '12:00', '13:00', '15:00', '17:00'],
    numbers: [
      { value: '12 Decken', label: 'für achtzehn Leute, es wird gekuschelt' },
      { value: '3 Sorten', label: 'Nudelsalat, mindestens' },
      { value: '26 °C', label: 'im Schatten, sagt die Vorhersage' },
    ],
    sides: [
      { title: 'Bei Sonne', points: ['Alle suchen den Schatten', 'Die Butter gibt als Erste auf', 'Der Nachmittag wird lang'] },
      { title: 'Bei Regen', points: ['Alle rücken unter die Plane', 'Der Kuchen wird zur Suppe', 'Die Geschichten werden besser'] },
    ],
    axes: { y: ['Schmeckt allen', 'Schmeckt wenigen'], x: ['Schnell gemacht', 'Viel Arbeit'] },
    cells: [
      { title: 'Belegte Brote', text: 'Der verlässliche Klassiker' },
      { title: 'Selbst gebackener Kuchen', text: 'Der Aufwand lohnt sich' },
      { title: 'Rohkost ohne Dip', text: 'Bleibt meistens übrig' },
      { title: 'Sülze nach Omas Rezept', text: 'Mutig, aber einsam' },
    ],
    acronym: [
      { letter: 'K', term: 'Kühltasche', text: 'Das Herz jedes Picknicks' },
      { letter: 'O', term: 'Obst', text: 'Geschnitten, sonst isst es niemand' },
      { letter: 'R', term: 'Regenplan', text: 'Eine Plane schadet nie' },
      { letter: 'B', term: 'Besteck', text: 'Wird immer vergessen' },
    ],
    exercise: {
      tag: 'Übung',
      title: 'Den Korb zu dritt packen',
      lead: 'Drei Leute, ein Korb und mehr Essen, als hineinpasst',
      steps: ['Alles auf die Decke legen, was mit soll', 'Gemeinsam entscheiden, was hierbleibt', 'Packen und dem Plenum die Reihenfolge erklären'],
      facts: [
        ['Dauer', '15 Minuten'],
        ['Format', 'Dreiergruppen'],
        ['Material', 'Ein Korb, eine Decke'],
      ],
    },
    table: {
      head: ['', 'Stadtpark', 'Dachterrasse'],
      rows: [
        ['Anreise', 'Zu Fuß durch den Park', 'Mit dem Fahrstuhl'],
        ['Mitbewohner', 'Enten und Ameisen', 'Tauben und Wind'],
        ['Bei Regen', 'Unter die große Buche', 'Zurück ins Büro'],
      ],
    },
    boxes: [
      { title: 'Treffpunkt', text: 'Wo finden uns die Nachzügler?' },
      { title: 'Buffet', text: 'Wer bringt was, und wie viel davon?' },
      { title: 'Getränke', text: 'Wer trägt die schwere Kiste?' },
      { title: 'Spiele', text: 'Was geht ohne Verletzte?' },
      { title: 'Wetterplan', text: 'Ab wann sagen wir ab?' },
      { title: 'Abbau', text: 'Wer nimmt den Müll mit?' },
    ],
    core: 'Picknick',
    section: { title: 'Zu Tisch', text: 'Also eigentlich: zu Decke' },
    caption: 'Die große Wiese kurz vor dem Ansturm',
    source: 'Erfahrungen aus sieben Sommern',
  },
  {
    name: 'Schatzsuche',
    title: 'Die Schatzsuche im Bürogebäude',
    kicker: 'Schatzsuche · Spielregeln',
    lead: 'Vom ersten Hinweis im Kopierraum bis zur Truhe im Keller',
    question: 'Wo würdest du in diesem Haus einen Schatz verstecken?',
    questionSub: 'Nicht verraten, nur aufschreiben',
    quote: 'Das X markiert nie die Stelle, aber es schadet nicht, dort anzufangen.',
    cite: 'Handbuch für Schatzsuchende, Kapitel eins',
    points: [
      { title: 'Karte entziffern', text: 'Die Kaffeeflecken gehören nicht dazu' },
      { title: 'Hinweise sammeln', text: 'Auch die, die keinen Sinn ergeben' },
      { title: 'Schritte zählen', text: 'Laut, sonst zählt jeder anders' },
      { title: 'Im Team bleiben', text: 'Niemand geht allein in den Keller' },
      { title: 'Falsche Fährten feiern', text: 'Sie gehören zum Spiel' },
      { title: 'Beute ehrlich teilen', text: 'Auch die Schokomünzen' },
    ],
    steps: [
      { title: 'Karte finden', text: 'Sie klebt unter dem Drucker' },
      { title: 'Rätsel lösen', text: 'Zusammen geht es schneller' },
      { title: 'Spur folgen', text: 'Treppe statt Fahrstuhl' },
      { title: 'Truhe öffnen', text: 'Der Schlüssel hängt am Schlüsselbrett' },
      { title: 'Schatz teilen', text: 'Gerecht, also laut verhandelt' },
    ],
    dates: ['Start', 'Kopierraum', 'Treppenhaus', 'Kantine', 'Keller'],
    numbers: [
      { value: '7 Hinweise', label: 'führen vom Empfang bis zur Truhe' },
      { value: '45 Minuten', label: 'braucht ein eingespieltes Team' },
      { value: '100 Münzen', label: 'aus Schokolade liegen in der Truhe' },
    ],
    sides: [
      { title: 'Mit Karte', points: ['Alle laufen in dieselbe Richtung', 'Einer hält sie falsch herum', 'Am Ende stimmt der Weg'] },
      { title: 'Ohne Karte', points: ['Alle laufen irgendwohin', 'Jede Tür wird ausprobiert', 'Am Ende kennt man das ganze Haus'] },
    ],
    axes: { y: ['Gutes Versteck', 'Schlechtes Versteck'], x: ['Leicht zu erreichen', 'Schwer zu erreichen'] },
    cells: [
      { title: 'Hinter dem Feuerlöscher', text: 'Sieht niemand, findet jeder' },
      { title: 'Im Archiv ganz hinten', text: 'Dort war seit Jahren niemand' },
      { title: 'Auf dem Empfangstresen', text: 'Hält keine fünf Minuten' },
      { title: 'Auf dem Dach im Blumenkasten', text: 'Viel Mühe für nichts' },
    ],
    acronym: [
      { letter: 'S', term: 'Suchen', text: 'Mit offenen Augen durchs Haus' },
      { letter: 'P', term: 'Prüfen', text: 'Passt der Hinweis zur Karte?' },
      { letter: 'U', term: 'Umdenken', text: 'Wenn die Spur kalt wird' },
      { letter: 'R', term: 'Rufen', text: 'Wer etwas findet, sagt es allen' },
    ],
    exercise: {
      tag: 'Übung',
      title: 'Einen Hinweis für die anderen schreiben',
      lead: 'Jede Gruppe versteckt etwas und beschreibt den Weg in einem Rätsel',
      steps: ['Ein Versteck im Raum aussuchen, ohne dass es jemand sieht', 'Einen Hinweis in zwei Sätzen schreiben', 'Hinweise tauschen und suchen gehen'],
      facts: [
        ['Dauer', '20 Minuten'],
        ['Format', 'Vierergruppen'],
        ['Material', 'Karten, Stifte, eine Schokomünze'],
      ],
    },
    table: {
      head: ['', 'Gruppe Kompass', 'Gruppe Fernrohr'],
      rows: [
        ['Strategie', 'Erst denken, dann laufen', 'Erst laufen, dann denken'],
        ['Tempo', 'Gemächlich', 'Im Laufschritt'],
        ['Fundstücke', 'Die Truhe', 'Drei alte Regenschirme'],
      ],
    },
    boxes: [
      { title: 'Schatz', text: 'Was liegt in der Truhe?' },
      { title: 'Verstecke', text: 'Welche Räume dürfen mitspielen?' },
      { title: 'Hinweise', text: 'Wie schwer dürfen die Rätsel sein?' },
      { title: 'Gruppen', text: 'Wer sucht mit wem?' },
      { title: 'Spielregeln', text: 'Was ist verboten, was nur unfein?' },
      { title: 'Siegerehrung', text: 'Was bekommen die, die nichts finden?' },
    ],
    core: 'Schatz',
    section: { title: 'Die Spur', text: 'Ab hier wird gesucht' },
    caption: 'Die Karte, gefunden unter dem Drucker',
    source: 'Handbuch für Schatzsuchende, eigene Ausgabe',
  },
]

const en: SampleSet[] = [
  {
    name: 'Moon trip',
    title: 'The office outing to the moon',
    kicker: 'Moon trip · Planning',
    lead: 'What we settle before anyone orders the rocket',
    question: 'Who waters the office plants while we are on the moon?',
    questionSub: 'Two minutes on your own, then compare notes in pairs',
    quote: 'One small step for us, one large item on the expense report.',
    cite: 'From the minutes of the moon group',
    points: [
      { title: 'Try on the space suits', text: 'The gloves too, the gloves above all' },
      { title: 'Pack the provisions', text: 'Nothing that makes crumbs' },
      { title: 'Draw lots for window seats', text: 'Everyone wants to see the Earth' },
      { title: 'Book the flight back', text: 'Forgotten surprisingly often' },
      { title: 'Brush off the moon dust', text: 'Before going back to the office' },
      { title: 'Write the postcards', text: 'The postmark is the whole point' },
    ],
    steps: [
      { title: 'Practise the countdown', text: 'Count backwards without laughing' },
      { title: 'Lift off', text: 'Please remain seated' },
      { title: 'Float', text: 'The best part of the journey' },
      { title: 'Touch down', text: 'Gently, if at all possible' },
      { title: 'Plant the flag', text: 'And take a group photo' },
    ],
    dates: ['January', 'March', 'June', 'September', 'December'],
    numbers: [
      { value: '384,400 km', label: 'to the moon, one way' },
      { value: '3 days', label: 'of flying without a stopover' },
      { value: '1/6', label: 'of the gravity we are used to' },
    ],
    sides: [
      { title: 'The way there', points: ['Excitement on board', 'Full lunch boxes', 'Nobody knows the way'] },
      { title: 'The way back', points: ['Moon dust in every pocket', 'Empty lunch boxes', 'Everybody knows a shortcut'] },
    ],
    axes: { y: ['A joy to do', 'A chore to do'], x: ['Done quickly', 'Takes for ever'] },
    cells: [
      { title: 'Practise floating', text: 'At once, and at length' },
      { title: 'Count the craters', text: 'A task for the patient' },
      { title: 'Polish the helmet', text: 'Fit it in between' },
      { title: 'Fill in the forms', text: 'Before departure, in peace' },
    ],
    acronym: [
      { letter: 'M', term: 'Merry', text: 'Board the rocket although it wobbles' },
      { letter: 'O', term: 'Orderly', text: 'Strap down whatever could fly off' },
      { letter: 'O', term: 'Observant', text: 'Look out of every window' },
      { letter: 'N', term: 'Nostalgic', text: 'For the gravity back home' },
    ],
    exercise: {
      tag: 'Exercise',
      title: 'Floating in groups of three',
      lead: 'Everyone floats once, holds on once and marvels once',
      steps: ['Hand out the roles: floating, holding on, marvelling', 'Float for three minutes, then swap', 'Write down together what came as a surprise'],
      facts: [
        ['Duration', '20 minutes'],
        ['Format', 'Groups of three'],
        ['Material', 'A rope and plenty of room'],
      ],
    },
    table: {
      head: ['', 'Rocket', 'Space elevator'],
      rows: [
        ['Travel time', 'Three days', 'A very long while'],
        ['The view', 'Through a porthole', 'Glass all round'],
        ['Luggage', 'Carry-on only', 'The desk comes too'],
      ],
    },
    boxes: [
      { title: 'Destination', text: 'Where on the moon exactly?' },
      { title: 'Crew', text: 'Who comes along, who holds the fort?' },
      { title: 'Equipment', text: 'What do we really need?' },
      { title: 'Risks', text: 'What do we do when the coffee runs out?' },
      { title: 'Schedule', text: 'When do we have to be back?' },
      { title: 'Souvenirs', text: 'What do we bring the others?' },
    ],
    core: 'Moon trip',
    section: { title: 'Lift-off', text: 'The part where it gets serious' },
    caption: 'The Earth, seen from the moon',
    source: 'Moonshine Travel, all figures without guarantee',
  },
  {
    name: 'Coffee',
    title: 'The perfect office coffee',
    kicker: 'Kitchenette · Basics',
    lead: 'Everything that can go wrong between bean and cup',
    question: 'Who took the last cup and did not put on a fresh pot?',
    questionSub: 'Honest answers please, it stays in this room',
    quote: 'Without coffee even the best meeting is just a circle of chairs.',
    cite: 'Folk wisdom from the kitchenette',
    points: [
      { title: 'Grind the beans fresh', text: 'The noise is part of it' },
      { title: 'Never boil the water', text: 'Just short of boiling will do' },
      { title: 'Warm the cup first', text: 'The coffee will thank you' },
      { title: 'Take your time', text: 'Four minutes are not a waste' },
      { title: 'Milk for the others', text: 'Even if you drink yours black' },
      { title: 'Rinse the pot', text: 'The next ones will taste the difference' },
    ],
    steps: [
      { title: 'Grind', text: 'Coarse for the pot, fine for the stove' },
      { title: 'Pour', text: 'Slowly, in small circles' },
      { title: 'Wait', text: 'The hardest step of all' },
      { title: 'Serve', text: 'The others first, then yourself' },
      { title: 'Enjoy', text: 'Sitting down, if you can' },
    ],
    dates: ['7:30', '9:00', '10:30', '13:00', '15:30'],
    numbers: [
      { value: '92 °C', label: 'is the water temperature of choice' },
      { value: '4 minutes', label: 'is how long a good filter coffee brews' },
      { value: '60 g', label: 'of coffee to a litre of water' },
    ],
    sides: [
      { title: 'Filter coffee', points: ['Takes patience', 'Enough for the whole round', 'Scents the stairwell'] },
      { title: 'Espresso', points: ['Ready in seconds', 'Enough for exactly one', 'Makes a proper racket'] },
    ],
    axes: { y: ['Lots of flavour', 'Little flavour'], x: ['Little effort', 'Lots of effort'] },
    cells: [
      { title: 'Pour-over', text: 'The quiet favourite' },
      { title: 'Espresso machine', text: 'For people with patience and space' },
      { title: 'Instant coffee', text: 'When it really is urgent' },
      { title: 'Cold leftovers from yesterday', text: 'Better not' },
    ],
    acronym: [
      { letter: 'B', term: 'Beans', text: 'Freshly roasted, stored cool' },
      { letter: 'R', term: 'Routine', text: 'Everything has its hook' },
      { letter: 'E', term: 'Even heat', text: 'Hot, but never boiling' },
      { letter: 'W', term: 'Whoever empties, refills', text: 'The one rule that matters' },
    ],
    exercise: {
      tag: 'Exercise',
      title: 'Blind tasting in pairs',
      lead: 'One person pours, the other guesses what is in the cup',
      steps: ['Prepare three cups while the other person looks away', 'Taste them in turn and note your guesses', 'Reveal the answer and swap roles'],
      facts: [
        ['Duration', '15 minutes'],
        ['Format', 'In pairs'],
        ['Material', 'Three cups, one tea towel'],
      ],
    },
    table: {
      head: ['', 'Filter coffee', 'Espresso'],
      rows: [
        ['Grind', 'Medium to coarse', 'Very fine'],
        ['Brewing', 'Four minutes', 'Thirty seconds'],
        ['Goes with', 'Long meetings', 'Short decisions'],
      ],
    },
    boxes: [
      { title: 'Beans', text: 'Where do they come from, who restocks?' },
      { title: 'Machine', text: 'Who knows how to descale it?' },
      { title: 'Cups', text: 'Whose is the one with the crack?' },
      { title: 'Kitty', text: 'How do we settle up without counting?' },
      { title: 'House rules', text: 'What applies when the pot is empty?' },
      { title: 'Guests', text: 'What do we offer when visitors come?' },
    ],
    core: 'Coffee',
    section: { title: 'The brew', text: 'Now it gets hot' },
    caption: 'The kitchenette on a quiet morning',
    source: 'Our own survey at the coffee machine',
  },
  {
    name: 'Office plant',
    title: 'How the office plant survives',
    kicker: 'Window sill · Care',
    lead: 'A guide for everyone who means well',
    question: 'When did this plant last see any water?',
    questionSub: 'Everyone takes a guess, then we ask the soil',
    quote: 'It has survived three office moves and two managing directors.',
    cite: 'About the rubber plant on the second floor',
    points: [
      { title: 'Water it regularly', text: 'But not everyone on the same day' },
      { title: 'Put it in the light', text: 'Behind the printer does not count' },
      { title: 'Dust the leaves', text: 'It breathes through them' },
      { title: 'Say something kind', text: 'There is no evidence it hurts' },
      { title: 'Repot it in time', text: 'When the roots start waving' },
      { title: 'Cover for holidays', text: 'A list on the door helps' },
    ],
    steps: [
      { title: 'Look', text: 'Are the leaves drooping?' },
      { title: 'Finger test', text: 'Two centimetres into the soil' },
      { title: 'Water', text: 'Slowly, until the saucer is damp' },
      { title: 'Turn', text: 'A quarter turn towards the window' },
      { title: 'Tick it off', text: 'One stroke on the watering list' },
    ],
    dates: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    numbers: [
      { value: '1 ×', label: 'a week is enough water for most of them' },
      { value: '21 °C', label: 'is what it likes best' },
      { value: '7 leaves', label: 'have appeared since spring' },
    ],
    sides: [
      { title: 'Too much care', points: ['Wet feet in the saucer', 'Fertiliser by feeling', 'A new spot every week'] },
      { title: 'Too little care', points: ['Dust on every leaf', 'Soil as hard as concrete', 'In the shade for months'] },
    ],
    axes: { y: ['Needs a lot of light', 'Needs little light'], x: ['Forgives everything', 'Takes everything personally'] },
    cells: [
      { title: 'Jade plant', text: 'Sunny, modest, grateful' },
      { title: 'Orchid', text: 'Bright, but no draughts please' },
      { title: 'Snake plant', text: 'Outlasts any holiday season' },
      { title: 'Indoor fern', text: 'Shady, but demanding' },
    ],
    acronym: [
      { letter: 'L', term: 'Light', text: 'A window beats a lamp' },
      { letter: 'E', term: 'Even watering', text: 'Seldom and thoroughly' },
      { letter: 'A', term: 'Attention', text: 'Who was last on duty?' },
      { letter: 'F', term: 'Food', text: 'A little fertiliser in spring' },
    ],
    exercise: {
      tag: 'Exercise',
      title: 'Plant rounds in the corridor',
      lead: 'Visit a plant in threes and find out what it is missing',
      steps: ['Choose a plant and look at it in silence for a minute', 'Check the soil, the leaves and the spot it stands in', 'Write a recommendation on a card and leave it there'],
      facts: [
        ['Duration', '25 minutes'],
        ['Format', 'Groups of three'],
        ['Material', 'Cards, pens, a watering can'],
      ],
    },
    table: {
      head: ['', 'Rubber plant', 'Indoor fern'],
      rows: [
        ['Spot', 'Bright, no blazing sun', 'Half shade'],
        ['Water', 'Once a week', 'Every other day'],
        ['Mood', 'Even-tempered', 'Easily offended'],
      ],
    },
    boxes: [
      { title: 'The spot', text: 'Where does it get enough light?' },
      { title: 'Watering duty', text: 'Whose turn is it this week?' },
      { title: 'Stand-in', text: 'Who steps in during the holidays?' },
      { title: 'Kit', text: 'Do we own a watering can that does not drip?' },
      { title: 'Warning signs', text: 'How do we notice something is missing?' },
      { title: 'Offspring', text: 'Where do the cuttings go?' },
    ],
    core: 'The plant',
    section: { title: 'Roots', text: 'What you cannot see carries the rest' },
    caption: 'The rubber plant on the second floor, as of today',
    source: 'Observations from the window sill',
  },
  {
    name: 'Picnic',
    title: 'The team picnic in the park',
    kicker: 'Picnic · Preparation',
    lead: 'What goes into the basket and what had better stay at the office',
    question: 'Who brings the potato salad, and who brings only an appetite?',
    questionSub: 'Think for a moment, then put your name on the list',
    quote: 'There is no bad weather, only too few picnic blankets.',
    cite: 'An old rule of the park',
    points: [
      { title: 'Spread the blankets', text: 'Generously, with a view of the pond' },
      { title: 'Redirect the ants', text: 'Kindly but firmly' },
      { title: 'Hand round the salads', text: 'Three kinds of pasta salad are normal' },
      { title: 'Secure the shade', text: 'The tree belongs to those who come early' },
      { title: 'Play badminton', text: 'Without a net and without a score' },
      { title: 'Share the leftovers fairly', text: 'Nobody goes home with empty boxes' },
    ],
    steps: [
      { title: 'Check the weather', text: 'Three times, with three apps' },
      { title: 'Pack the basket', text: 'Heavy things below, cake on top' },
      { title: 'Find a spot', text: 'Not too close to the duck pond' },
      { title: 'Tuck in', text: 'First look, then praise, then eat' },
      { title: 'Tidy up', text: 'The park should not notice a thing' },
    ],
    dates: ['11:00', '12:00', '13:00', '15:00', '17:00'],
    numbers: [
      { value: '12 blankets', label: 'for eighteen people, it gets cosy' },
      { value: '3 kinds', label: 'of pasta salad, at the very least' },
      { value: '26 °C', label: 'in the shade, says the forecast' },
    ],
    sides: [
      { title: 'In the sun', points: ['Everyone looks for shade', 'The butter gives up first', 'The afternoon gets long'] },
      { title: 'In the rain', points: ['Everyone huddles under the tarp', 'The cake turns into soup', 'The stories get better'] },
    ],
    axes: { y: ['Everyone likes it', 'Few like it'], x: ['Quickly made', 'A lot of work'] },
    cells: [
      { title: 'Sandwiches', text: 'The dependable classic' },
      { title: 'Home-made cake', text: 'Worth every bit of effort' },
      { title: 'Raw vegetables, no dip', text: 'Usually left over' },
      { title: 'Aspic after a family recipe', text: 'Brave, but lonely' },
    ],
    acronym: [
      { letter: 'F', term: 'Fridge box', text: 'The heart of every picnic' },
      { letter: 'O', term: 'Oranges, sliced', text: 'Whole fruit stays uneaten' },
      { letter: 'R', term: 'Rain plan', text: 'A tarp never hurts' },
      { letter: 'K', term: 'Knives and forks', text: 'Forgotten every single time' },
    ],
    exercise: {
      tag: 'Exercise',
      title: 'Packing the basket in threes',
      lead: 'Three people, one basket and more food than fits into it',
      steps: ['Lay out on the blanket everything that is to come along', 'Decide together what stays behind', 'Pack it and explain the order to the whole group'],
      facts: [
        ['Duration', '15 minutes'],
        ['Format', 'Groups of three'],
        ['Material', 'One basket, one blanket'],
      ],
    },
    table: {
      head: ['', 'The park', 'The roof terrace'],
      rows: [
        ['Getting there', 'On foot through the park', 'By lift'],
        ['Fellow guests', 'Ducks and ants', 'Pigeons and wind'],
        ['If it rains', 'Under the big beech', 'Back to the office'],
      ],
    },
    boxes: [
      { title: 'Meeting point', text: 'Where do latecomers find us?' },
      { title: 'Buffet', text: 'Who brings what, and how much of it?' },
      { title: 'Drinks', text: 'Who carries the heavy crate?' },
      { title: 'Games', text: 'What works without injuries?' },
      { title: 'Weather plan', text: 'At what point do we call it off?' },
      { title: 'Clearing up', text: 'Who takes the rubbish along?' },
    ],
    core: 'Picnic',
    section: { title: 'Lunch is served', text: 'On a blanket, to be precise' },
    caption: 'The big meadow shortly before the rush',
    source: 'Experience from seven summers',
  },
  {
    name: 'Treasure hunt',
    title: 'The treasure hunt in the office building',
    kicker: 'Treasure hunt · Rules',
    lead: 'From the first clue in the copy room to the chest in the basement',
    question: 'Where in this building would you hide a treasure?',
    questionSub: 'Do not tell anyone, just write it down',
    quote: 'X never marks the spot, but it does no harm to start there.',
    cite: 'The treasure hunter’s handbook, chapter one',
    points: [
      { title: 'Decipher the map', text: 'The coffee stains are not part of it' },
      { title: 'Collect the clues', text: 'Even those that make no sense' },
      { title: 'Count the steps', text: 'Aloud, or everyone counts differently' },
      { title: 'Stay together', text: 'Nobody goes to the basement alone' },
      { title: 'Celebrate false trails', text: 'They are part of the game' },
      { title: 'Share the loot honestly', text: 'The chocolate coins too' },
    ],
    steps: [
      { title: 'Find the map', text: 'It is taped under the printer' },
      { title: 'Solve the riddle', text: 'It goes faster together' },
      { title: 'Follow the trail', text: 'Stairs, not the lift' },
      { title: 'Open the chest', text: 'The key hangs on the key board' },
      { title: 'Share the treasure', text: 'Fairly, that is: after loud negotiation' },
    ],
    dates: ['Start', 'Copy room', 'Stairwell', 'Canteen', 'Basement'],
    numbers: [
      { value: '7 clues', label: 'lead from reception to the chest' },
      { value: '45 minutes', label: 'is what a practised team needs' },
      { value: '100 coins', label: 'made of chocolate lie in the chest' },
    ],
    sides: [
      { title: 'With a map', points: ['Everyone walks the same way', 'Someone holds it upside down', 'In the end the route is right'] },
      { title: 'Without a map', points: ['Everyone walks somewhere', 'Every door gets tried', 'In the end you know the whole building'] },
    ],
    axes: { y: ['A good hiding place', 'A poor hiding place'], x: ['Easy to reach', 'Hard to reach'] },
    cells: [
      { title: 'Behind the fire extinguisher', text: 'Nobody looks, anybody finds it' },
      { title: 'At the back of the archive', text: 'Nobody has been there for years' },
      { title: 'On the reception desk', text: 'Lasts less than five minutes' },
      { title: 'In the flower box on the roof', text: 'A lot of trouble for nothing' },
    ],
    acronym: [
      { letter: 'H', term: 'Have a look round', text: 'Eyes open on every floor' },
      { letter: 'U', term: 'Use the map', text: 'Does the clue fit it?' },
      { letter: 'N', term: 'New idea', text: 'When the trail goes cold' },
      { letter: 'T', term: 'Tell the others', text: 'Whoever finds something says so' },
    ],
    exercise: {
      tag: 'Exercise',
      title: 'Writing a clue for the others',
      lead: 'Each group hides something and describes the way in a riddle',
      steps: ['Choose a hiding place in the room without being seen', 'Write a clue in two sentences', 'Swap clues and go looking'],
      facts: [
        ['Duration', '20 minutes'],
        ['Format', 'Groups of four'],
        ['Material', 'Cards, pens, one chocolate coin'],
      ],
    },
    table: {
      head: ['', 'Team Compass', 'Team Telescope'],
      rows: [
        ['Strategy', 'Think first, then walk', 'Walk first, then think'],
        ['Pace', 'Leisurely', 'At a jog'],
        ['Finds', 'The chest', 'Three old umbrellas'],
      ],
    },
    boxes: [
      { title: 'Treasure', text: 'What is in the chest?' },
      { title: 'Hiding places', text: 'Which rooms may join the game?' },
      { title: 'Clues', text: 'How hard may the riddles be?' },
      { title: 'Teams', text: 'Who searches with whom?' },
      { title: 'Rules of play', text: 'What is forbidden, what merely bad form?' },
      { title: 'Prize giving', text: 'What do those get who find nothing?' },
    ],
    core: 'Treasure',
    section: { title: 'The trail', text: 'From here on we search' },
    caption: 'The map, found under the printer',
    source: 'The treasure hunter’s handbook, our own edition',
  },
]

export const SAMPLE_SETS: Record<'de' | 'en', SampleSet[]> = { de, en }

/** A random source that gives the same numbers for the same seed (mulberry32), so a picker shows the same samples while it is open. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffled = <T>(list: T[], random: () => number): T[] => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * A variant of a subject: what has no order of its own (the parallel points, the figures, the boxes) in another
 * order, so a starter that shows three of six points shows other ones. Sequences, the two sides, the 2 × 2 and the
 * acronym stay as they are written.
 */
export const variant = (set: SampleSet, random: () => number): SampleSet => ({ ...set, points: shuffled(set.points, random), numbers: shuffled(set.numbers, random), boxes: shuffled(set.boxes, random) })

/** The sample sets of a language (German for "de…", English for everything else). */
export const sampleSets = (language: string): SampleSet[] => (language.toLowerCase().startsWith('de') ? de : en)

function strings(v: unknown, out: Set<string>): void {
  if (typeof v === 'string') out.add(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
}

/** Words of the samples that a real slide may well say too (the label "Duration", a weekday): never counted as sample text. */
function common(set: SampleSet, out: Set<string>): void {
  out.add(set.exercise.tag)
  for (const [term] of set.exercise.facts) out.add(term)
  for (const d of set.dates) out.add(d)
}

const [BROAD, STRICT]: [Set<string>, Set<string>] = (() => {
  const all = new Set<string>()
  const plain = new Set<string>()
  for (const set of [...de, ...en]) {
    strings(set, all)
    common(set, plain)
  }
  const broad = new Set([...all].filter((s) => s.trim().length >= 2 && !plain.has(s)))
  // one word ("Risks", "Schedule") may be a real slide's own; a phrase of the samples is not
  return [broad, new Set([...broad].filter((s) => s.trim().length >= 8 && /\s/.test(s.trim())))]
})()

/** Whether a text is a phrase of the samples, word for word: what a slide should not still say when it is shown. */
export const isSampleText = (text: string): boolean => STRICT.has(text.trim())

/** Whether a text is any of the samples' words, a single one too: what is selected as a whole when it is edited, so typing replaces it. */
export const isSampleWord = (text: string): boolean => BROAD.has(text.trim())
