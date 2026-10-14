/**
 * Explanations behind the "?" icons of the Reisekosten form, paraphrased from
 * the notes page (page 2) of the NRW form valid from 1.7.2025. One entry per
 * topic; the form references them by key.
 */
export const REISEKOSTEN_HILFE = {
  antragsberechtigt: {
    titel: 'Wer darf abrechnen?',
    text: 'Mitglieder, Beschäftigte, Praktikant*innen und Beauftragte, denen bei einem Amt oder einer Aufgabe der Partei Kosten entstanden sind. Die Aufgabe muss von einer Mitglieder- oder Delegiertenversammlung oder einem anderen satzungsgemäß berechtigten Gremium übertragen worden sein.',
  },
  wahlBeschluss: {
    titel: 'Wahl/Beschluss vom',
    text: 'Datum der Wahl oder des Beschlusses, mit dem dir das Amt oder die Aufgabe übertragen wurde, für die du gereist bist – z. B. deine Wahl als Delegierte*r.',
  },
  iban: {
    titel: 'Bankverbindung',
    text: 'Die Erstattung wird überwiesen, Barauszahlungen bitte vermeiden. Die IBAN bleibt nur in deinem Browser gespeichert und wird nie an den Grünerator geschickt – sie steht nur im PDF, das auf deinem Gerät entsteht.',
  },
  reisezeiten: {
    titel: 'Reisebeginn und Rückkehr',
    text: 'Zählt ab Haustür: Beginn ist das Verlassen der Wohnung, Rückkehr das Erreichen der eigenen Haustür. Erstattet werden Reisen vom und zum ersten deutschen Wohnsitz.',
  },
  ziel: {
    titel: 'Ziel der Reise',
    text: 'Die genaue Anschrift des Veranstaltungsorts. Sie muss sich aus den Unterlagen belegen lassen.',
  },
  wohnsitz: {
    titel: 'Start nicht am 1. Wohnsitz?',
    text: 'Dann musst du vor Reiseantritt belegen, dass deine Route nicht teurer ist: bei der Bahn ein Ausdruck des Flexpreises vom/zum 1. Wohnsitz (mit Datum, Zeiten, Start und Ziel), beim Pkw ein zweiter Routenplaner. Den Flexpreis kann man nur vor der Reise ermitteln.',
  },
  bahn: {
    titel: '1.1 Bahn',
    text: 'Erstattet wird höchstens der DB-Flexpreis 2. Klasse. Die Nutzung einer BahnCard wird empfohlen – trage den tatsächlich bezahlten Preis ein. Originalbelege müssen beigefügt sein. Fahrpreiserstattungen wegen Verspätung oder Ausfall musst du abziehen.',
  },
  bahncard: {
    titel: 'BahnCard und Deutschlandticket',
    text: 'Eine BahnCard kann auf Antrag bis zu 100 % erstattet werden, wenn das für die entsendende Gliederung wirtschaftlich ist. Ein Deutschlandticket wird anteilig erstattet, höchstens bis zum Monatspreis über alle Reisen – mit Belegen vergleichbarer Nahverkehrsfahrten.',
  },
  oepnv: {
    titel: '1.2 ÖPNV',
    text: 'Fahrten mit Bus, Straßenbahn, U- und S-Bahn. Originalbelege müssen beigefügt sein.',
  },
  kfz: {
    titel: '1.3 Kfz',
    text: 'Pkw 0,30 € je km, Motorrad oder Roller 0,20 € je km. Maßgeblich ist die kürzeste Strecke laut Routenplaner, exakt und nicht aufgerundet, Hin- und Rückweg zusammen höchstens 500 km. Der Routenplaner-Ausdruck gehört zum Antrag.',
  },
  mehrKm: {
    titel: 'Mehr als 500 km',
    text: 'Kilometer über 500 werden nur mit einem vorherigen Vorstandsbeschluss erstattet, der beizufügen ist.',
  },
  miete: {
    titel: '1.4 Mietwagen und Carsharing',
    text: 'Nur in begründeten Ausnahmefällen mit vorab gefasstem Vorstandsbeschluss, gegen Originalrechnung und mit Routenplaner für die kürzeste Strecke. Private Anteile werden nicht erstattet. Dasselbe gilt für Flüge.',
  },
  taxi: {
    titel: '1.5 Taxi',
    text: 'Nur im begründeten Ausnahmefall, mit einer korrekt ausgefüllten Originalquittung des Taxiunternehmens: Start, Ziel und Steuersatz.',
  },
  sonstiges: {
    titel: '1.6 Sonstiges',
    text: 'Zum Beispiel Teilnahmebeiträge oder Parkgebühren. Bewirtungsbelege werden nicht erstattet – Essen ist über die Verpflegungspauschale abgegolten.',
  },
  verpflegung: {
    titel: '2. Verpflegungsmehraufwand',
    text: 'Jeder Kalendertag wird einzeln berechnet. Eintägige Reise mit mehr als 8 Stunden Abwesenheit: 14 €. Mehrtägig: Anreise- und Abreisetag je 14 €, volle Zwischentage 28 €. Sonstige Verpflegungskosten sind damit abgegolten.',
  },
  mitternacht: {
    titel: 'Rückkehr nach Mitternacht',
    text: 'Eine Reise ohne Übernachtung bleibt eintägig, auch wenn du erst nach Mitternacht zurück bist: Die Stunden nach Mitternacht zählen zum Vortag. Beispiel: Montag 16:30 bis Dienstag 2:00 ergibt 14 € für Montag, nichts für Dienstag. Die Zeiten müssen realistisch und glaubhaft sein.',
  },
  abzuege: {
    titel: 'Abzüge für gestellte Mahlzeiten',
    text: 'Hat jemand anders eine Mahlzeit bezahlt (Tagung, Hotelpauschale), wird sie abgezogen: Frühstück 5,60 €, Mittag- oder Abendessen je 11,20 €. Höchstens bis zur Tagespauschale – mehr als die 14 € eines Tages werden nie abgezogen.',
  },
  uebernachtung: {
    titel: '3. Übernachtung',
    text: 'Eine Übernachtung wird erstattet, wenn die Reise sonst vor 6 Uhr beginnen oder nach 24 Uhr enden müsste. Alle anderen Fälle brauchen einen begründeten Antrag vor Reiseantritt. Hotels, Pensionen, Jugendherbergen und Airbnb gehen, wenn sie wirtschaftlich und angemessen sind – mit einer Rechnung auf deinen Namen oder einer Buchungsbestätigung.',
  },
  hotelfruehstueck: {
    titel: 'Hotelfrühstück',
    text: 'Nur bei einer Kleinbetragsrechnung bis 250 € erstattungsfähig, abzüglich 5,60 € je Frühstück, und nicht als Pauschale mit gemischten Steuersätzen oder mit 19 % ausgewiesen. Bei Rechnungen über 250 € wird das Frühstück nicht erstattet.',
  },
  uebernachtungPauschal: {
    titel: 'Übernachtung bei Bekannten',
    text: 'Pauschal 20 € pro Nacht, ohne Beleg.',
  },
  spende: {
    titel: 'Spende an die Partei',
    text: 'Du kannst die Erstattung ganz oder teilweise spenden. 50 % der Spende bekommst du über die Steuererklärung zurück (bis 1.650 € bei Ledigen, 3.300 € bei Verheirateten). Beantrage sie möglichst zeitnah zum Reiseende.',
  },
  frist: {
    titel: 'Frist',
    text: 'Abrechnungen müssen innerhalb von drei Monaten eingereicht werden. Für Reisen im November und Dezember endet die Frist spätestens am 31. Januar.',
  },
  anmerkungen: {
    titel: 'Anmerkungen',
    text: 'Das Formular hat kein Feld für Erläuterungen. Was du hier schreibst – etwa warum du nicht vom Wohnort abgereist bist oder warum ein Taxi nötig war –, steht im PDF auf einer eigenen Seite direkt nach dem Formular, zusammen mit deinen Kommentaren zu einzelnen Belegen.',
  },
  originalbelege: {
    titel: 'Originalbelege',
    text: 'Belege sind verlustsicher und klar geordnet beizufügen und dürfen bei keiner anderen Stelle eingereicht werden. Das PDF hängt sie in der Reihenfolge des Formulars an.',
  },
} as const;

export type HilfeKey = keyof typeof REISEKOSTEN_HILFE;
