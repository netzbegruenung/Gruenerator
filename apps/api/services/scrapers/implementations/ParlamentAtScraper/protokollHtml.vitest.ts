import { describe, expect, it } from 'vitest';

import { parseProtokoll } from './protokollHtml.js';

// Gekürzt nach XXVIII/NRSITZ/30 (16.06.2025): Inhaltsverzeichnis mit Art der
// Wortmeldung, Randnummern als Sprecherwechsel, Zwischenrufe in <i>.
const RANDNUMMERN = `<root>
<div class="inhaltsverzeichnis-verweis"><p class="_IV_Liste_Einzelzeilen">Bundeskanzler Dr. <a href="https://www.parlament.gv.at/person/5439"><span class="generated">Christian Stocker</span></a> | rb |</p><p class="_IV_Liste_Einzelzeilen"><a href="#30">RN/30</a></p></div>
<div class="inhaltsverzeichnis-verweis"><p class="_IV_Liste_Einzelzeilen"><a href="https://www.parlament.gv.at/person/5653"><span class="generated">Leonore Gewessler</span></a>, BA (Grüne) | c |</p><p class="_IV_Liste_Einzelzeilen"><a href="#32">RN/32</a></p></div>
<p class="_ZM">Bundesfinanzgesetz 2025</p>
<p class="randnummer" id="29" title="Präsidium">RN/29</p>
<p><strong>Präsident Dr. Walter Rosenkranz:</strong> Zu Wort gelangt nun der Herr Bundeskanzler. Bitte sehr, Herr Bundeskanzler.</p>
<p class="randnummer" id="30" title="Christian Stocker, Bundeskanzler">RN/30</p>
<p class="_RB">12.30</p>
<p><strong>Bundeskanzler Dr. </strong><a href="https://www.parlament.gv.at/person/5439"><span class="generated"><strong>Christian Stocker</strong></span></a>: Sehr geehrter Herr Präsident! Dieses Budget ist ein Budget der Verantwortung für die kommenden Generationen.</p>
<p class="_RE">12.36</p>
<p class="randnummer" id="32" title="Leonore Gewessler (Grüne)">RN/32</p>
<p><strong>Abgeordnete </strong><a href="https://www.parlament.gv.at/person/5653"><span class="generated"><strong>Leonore Gewessler</strong></span></a><strong>, BA</strong> (Grüne): Herr Präsident, herzlichen Dank! Budget ist in Zahlen gegossene Politik.</p>
<p>Diese Regierung friert Familien- und Sozial<span class="shy">\u00AD</span>leistungen ein. <i>(Abg. <strong>Hafenecker</strong> [FPÖ]: Ihr habt die Chance vertan!)</i> Der Klimabonus wird abgeschafft. <i>(Beifall bei den Grünen.)</i></p>
</root>`;

// Gekürzt nach XXVII/NRSITZ/200 (24.02.2023): Word-Export, Sprecherwechsel am
// versteckten Kommentar im fetten Kopf, Seitenumbruch mitten im Absatz.
const WORD_EXPORT = `<html><body>
<p class=ZM>Erklärungen des Bundeskanzlers gemäß § 19 Abs. 2 GOG</p>
<p class=MsoNormal><b><span style='display:none'><!--†--></span>Präsident <A HREF="/WWER/PAD_88386/index.shtml">Mag. Wolfgang Sobotka</A><span style='display:none'><!--¦--></span>:</b> Zu Wort gemeldet ist Abgeordnete Maurer. – Bitte.</p>
<p class=RB><a name="RU_290320">13.00<span style='display:none'>.08</span></a></p>
<p class=StandardRB><a name="R_290320_8"><b><span style='display:none'><!--†--></span>Abgeordnete
<A HREF="/WWER/PAD_83119/index.shtml">Sigrid Maurer</A>, BA</b> (Grüne)</a><span style='display:none'><!--¦--></span>: Frau Präsidentin! Werte Mitglieder der</p>
<hr><span class="threecol textleft">Nationalrat, XXVII.GP</span><span class="threecol textright">Seite 101</span><hr>
<p class=StandardRB>Bundesregierung! Jedes Windrad ist ein Symbol der Freiheit. <i>(Beifall bei den Grünen.)</i></p>
<p class=MsoNormal><b><span style='display:none'><!--†--></span>Präsidentin <A HREF="/WWER/PAD_1/index.shtml">Doris Bures</A><span style='display:none'><!--¦--></span>:</b> Bitte setzen Sie fort.</p>
<p class=MsoNormal><b><span style='display:none'><!--†--></span>Abgeordnete <A HREF="/WWER/PAD_83119/index.shtml">Sigrid Maurer</A>, BA <i>(fortsetzend)</i><span style='display:none'><!--¦--></span>:</b> Und darum braucht es den Ausbau der Erneuerbaren jetzt.</p>
<p class=StandardRB><a name="R_290330_2"><b><span style='display:none'><!--†--></span>Bundeskanzler <A HREF="/WWER/PAD_02136/index.shtml">Karl Nehammer, MSc</A></b><span style='display:none'><!--¦--></span>: Sehr geehrter Herr Präsident! Die österreichische Neutralität steht nicht zur Disposition.</p>
</body></html>`;

describe('parseProtokoll — Randnummern (ab XXVIII. GP)', () => {
  const speeches = parseProtokoll(RANDNUMMERN);

  it('nimmt Wortmeldungen, aber nie die Sitzungsleitung', () => {
    expect(speeches.map((s) => s.speaker)).toEqual(['Christian Stocker', 'Leonore Gewessler']);
  });

  it('liest Art, Klub, Person und Tagesordnungspunkt', () => {
    expect(speeches[0]).toMatchObject({
      anchor: '30',
      party: null,
      isGovernment: true,
      role: 'regierungsbank',
      personId: '5439',
      agenda: 'Bundesfinanzgesetz 2025',
    });
    expect(speeches[1]).toMatchObject({ anchor: '32', party: 'GRÜNE', role: 'contra' });
  });

  it('schneidet den Kopf ab, entfernt Zwischenrufe und hält Absätze', () => {
    expect(speeches[1].text).toBe(
      'Herr Präsident, herzlichen Dank! Budget ist in Zahlen gegossene Politik.\n\n' +
        'Diese Regierung friert Familien- und Sozialleistungen ein. Der Klimabonus wird abgeschafft.'
    );
    expect(speeches[0].text).not.toContain('12.30');
  });
});

describe('parseProtokoll — Word-Export (bis XXVII. GP)', () => {
  const speeches = parseProtokoll(WORD_EXPORT);

  it('erkennt Sprecherwechsel am versteckten Marker und lässt das Präsidium aus', () => {
    expect(speeches.map((s) => [s.speaker, s.party, s.isGovernment])).toEqual([
      ['Sigrid Maurer', 'GRÜNE', false],
      ['Karl Nehammer, MSc', null, true],
    ]);
    expect(speeches[0]).toMatchObject({
      anchor: 'R_290320_8',
      personId: '83119',
      agenda: 'Erklärungen des Bundeskanzlers gemäß § 19 Abs. 2 GOG',
    });
  });

  it('fügt einen am Seitenumbruch geteilten Absatz und die fortgesetzte Rede zusammen', () => {
    expect(speeches[0].text).toBe(
      'Frau Präsidentin! Werte Mitglieder der Bundesregierung! Jedes Windrad ist ein Symbol der Freiheit.\n\n' +
        'Und darum braucht es den Ausbau der Erneuerbaren jetzt.'
    );
  });
});
