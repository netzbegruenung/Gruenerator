import { describe, expect, it } from 'vitest';

import { classifyBelegText } from './classify.js';

// Synthetic texts shaped like what pdfjs extracts from the real documents.
const DB_ONLINE_TICKET = `Online-Ticket
Deutsche Bahn  DB Fernverkehr AG
Auftragsnummer: 7Q4XYZ
Hinfahrt am 14.03.2026
von Köln Hbf nach Berlin Hbf
Flexpreis  2. Klasse  1 Erwachsener  BahnCard 25
Gesamtpreis 87,40 €
enthaltene MwSt. 7%: 5,72 €`;

const DB_RECHNUNG = `Rechnung
DB Vertrieb GmbH
Rechnungsnummer 2026-123456
Rechnungsdatum 15.03.2026
Fahrkarte von Düsseldorf Hbf nach Hamburg Hbf
Summe 112,90 EUR`;

const HOTEL = `Hotel am Westhafen
Rechnung Nr. 4711
Zimmer 212, 1 Nacht, 14.03.2026
Übernachtung 89,00 €
Business-Package 14,50 €
Gesamtbetrag 103,50 €`;

const TAXI = `Taxi Müller  Quittung
Fahrt von Hauptbahnhof nach Westhafenstraße 1
Betrag 18,40 € inkl. 7 % MwSt.`;

const ROUTENPLANER = `Google Maps
Köln nach Düsseldorf  Kürzeste Strecke 41,3 km  38 Min.`;

describe('classifyBelegText', () => {
  it('recognises a DB online ticket with route, date and total', () => {
    const r = classifyBelegText(DB_ONLINE_TICKET);
    expect(r.kategorie).toBe('db_ticket');
    expect(r.betrag).toBe(87.4);
    expect(r.datum).toBe('2026-03-14');
    expect(r.von).toBe('Köln Hbf');
    expect(r.nach).toBe('Berlin Hbf');
    expect(r.sicher).toBe(true);
  });

  it('tells a DB invoice from a ticket', () => {
    const r = classifyBelegText(DB_RECHNUNG);
    expect(r.kategorie).toBe('db_rechnung');
    expect(r.betrag).toBe(112.9);
  });

  it('reads a hotel invoice and its Business-Package', () => {
    const r = classifyBelegText(HOTEL);
    expect(r.kategorie).toBe('hotelrechnung');
    expect(r.betrag).toBe(103.5);
    expect(r.businessPackage).toBe(true);
  });

  it('flags a hotel breakfast listed as Frühstück', () => {
    const r = classifyBelegText(HOTEL.replace('Business-Package', 'Frühstück'));
    expect(r.businessPackage).toBe(false);
  });

  it('recognises a taxi receipt', () => {
    expect(classifyBelegText(TAXI)).toMatchObject({ kategorie: 'taxiquittung', betrag: 18.4 });
  });

  it('accepts a route printout without an amount', () => {
    const r = classifyBelegText(ROUTENPLANER);
    expect(r.kategorie).toBe('routenplaner');
    expect(r.sicher).toBe(true);
  });

  it('is unsure about an unknown document, so the server takes over', () => {
    const r = classifyBelegText('Vielen Dank für Ihren Einkauf. Summe 12,00 €');
    expect(r.kategorie).toBe('sonstiges');
    expect(r.sicher).toBe(false);
  });

  it('is unsure about an invoice whose amount it cannot read', () => {
    const r = classifyBelegText('Taxi Quittung Fahrt zum Bahnhof');
    expect(r.kategorie).toBe('taxiquittung');
    expect(r.sicher).toBe(false);
  });
});
