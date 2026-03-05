/**
 * Mecklenburg-Vorpommern Scraping Script
 *
 * Scrapes Grüne Mecklenburg-Vorpommern content:
 *   - mecklenburg-vorpommern-lv: Pressemitteilungen (gruene-mv.de)
 *
 * Modes:
 *   Default:          Scrape press releases via LandesverbandScraper
 *   --beschluesse:    Ingest manually curated Beschlüsse PDFs (see MV_BESCHLUESSE below)
 *
 * Flags:
 *   --source <id>   → Run only a specific source (e.g., mecklenburg-vorpommern-lv)
 *   --max <number>  → Limit number of documents to scrape per content path
 *   --beschluesse   → Ingest Beschlüsse PDFs from the curated list below
 *   --force         → Re-process even if already stored
 *
 * Run: npx tsx apps/api/scrape-mecklenburg-vorpommern.ts
 * Run: npx tsx apps/api/scrape-mecklenburg-vorpommern.ts --beschluesse
 */

import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';

const MV_SOURCES = ['mecklenburg-vorpommern-lv'];

/**
 * Curated list of MV Beschlüsse PDFs with manually assigned dates.
 * The MV Beschlüsse page (gruene-mv.de/parteitags-beschluesse/) has dates in
 * <h3> headings that automated extraction can't reliably parse from Elementor HTML.
 * Add new entries here after each LDK.
 */
const MV_BESCHLUESSE: Array<{ url: string; title: string; date: string }> = [
  // === 27. September 2025 - LDK & LWV Wismar ===
  {
    url: 'https://gruene-mv.de/download/protokoll-der-landesdelegiertenkonferenz-am-27-09-2025/',
    title: 'Protokoll der Landesdelegiertenkonferenz am 27.09.2025',
    date: '2025-09-27',
  },
  {
    url: 'https://gruene-mv.de/download/protokoll-der-landeswahlversammlung-vom-27-09-2025/',
    title: 'Protokoll der Landeswahlversammlung vom 27.09.2025',
    date: '2025-09-27',
  },

  // === 24. Mai 2025 - LDK Güstrow ===
  {
    url: 'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-24-5-2025/',
    title: 'Protokoll der LDK Güstrow, 24.5.2025',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/prozess-zur-aufstellung-der-landesliste/',
    title: 'Prozess zur Aufstellung der Landesliste',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/meilensteine-zur-landtagswahl-2026/',
    title: 'Meilensteine zur Landtagswahl 2026',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/femizide-benennen-gewalt-gegen-frauen-sichtbar-machen-und-bekaempfen/',
    title: 'Femizide benennen – Gewalt gegen Frauen sichtbar machen und bekämpfen',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/bildungsgerechtigkeit-schaffen/',
    title: 'Bildungsgerechtigkeit schaffen',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/fuer-eine-politik-die-junge-menschen-in-den-mittelpunkt-stellt/',
    title: 'Für eine Politik, die junge Menschen in den Mittelpunkt stellt',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/starke-kinder-starkes-land-fuer-eine-selbstbestimmte-chancengerechte-und-unbeschwerte-kindheit-und-jugend-in-mecklenburg-vorpommern/',
    title:
      'Starke Kinder, starkes Land: Für eine selbstbestimmte, chancengerechte und unbeschwerte Kindheit und Jugend in Mecklenburg-Vorpommern',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/pflege-und-gesundheitliche-versorgung-sozial-gerecht-gestalten/',
    title: 'Pflege und gesundheitliche Versorgung sozial gerecht gestalten',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/fuer-einen-tourismus-der-unser-land-voranbringt/',
    title: 'Für einen Tourismus, der unser Land voranbringt',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/umbenennung-des-landesfrauenrats-zum-landes-finta-rat-und-oeffnung-fuer-alle-finta-personen/',
    title:
      'Umbenennung des Landesfrauenrats zum Landes-FINTA*-Rat und Öffnung für alle FINTA*-Personen',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/einsamkeit-begegnen-fuer-ein-mecklenburg-vorpommern-der-gelebten-gemeinschaft/',
    title: 'Einsamkeit begegnen – Für ein Mecklenburg-Vorpommern der gelebten Gemeinschaft',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/inklusiver-feminismus/',
    title: 'Inklusiver Feminismus',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/schutz-oekologisch-wirtschaftender-agrarbetriebe-vor-verfrachtung-und-abdrift-von-pflanzenschutzmitteln/',
    title:
      'Schutz ökologisch wirtschaftender Agrarbetriebe vor Verfrachtung und Abdrift von Pflanzenschutzmitteln',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/keine-investitionen-in-neue-fossile-infrastruktur-no-more-gas-no-more-oil-keep-the-carbon-in-the-soil/',
    title: 'Keine Investitionen in neue fossile Infrastruktur',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/erneuerbare-auf-kurs-bringen-statt-kehrtwende-in-die-klimakatastrophe/',
    title: 'Erneuerbare auf Kurs bringen, statt Kehrtwende in die Klimakatastrophe',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/demokratie-foerdern-zivilgesellschaft-staerken/',
    title: 'Demokratie fördern – Zivilgesellschaft stärken',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/integration-statt-repression-bezahlkarte-abschaffen/',
    title: 'Integration statt Repression – Bezahlkarte abschaffen',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/mit-gutem-beispiel-voran-fuer-mehr-nachhaltigkeit-im-landesverband/',
    title: 'Mit gutem Beispiel voran - Für mehr Nachhaltigkeit im Landesverband',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/einfuehrung-einer-landesweiten-games-foerderung-in-mecklenburg-vorpommern-zur-staerkung-des-digitalen-wirtschafts-und-kulturstandorts/',
    title: 'Einführung einer landesweiten Games-Förderung in Mecklenburg-Vorpommern',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/dringlichkeitsantrag-afd-verbotsverfahren-jetzt-einleiten/',
    title: 'Dringlichkeitsantrag „AfD-Verbotsverfahren jetzt einleiten!"',
    date: '2025-05-24',
  },
  {
    url: 'https://gruene-mv.de/download/leitantrag-ostsee-im-wandel-lebensraeume-retten-frieden-sichern/',
    title: 'Leitantrag "Ostsee im Wandel: Lebensräume retten, Frieden sichern"',
    date: '2025-05-24',
  },

  // === 12. Oktober 2024 - LDK Güstrow ===
  {
    url: 'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-12-oktober-2024/',
    title: 'Protokoll der LDK Güstrow 12. Oktober 2024',
    date: '2024-10-12',
  },

  // === 13. April 2024 - LDR Güstrow ===
  {
    url: 'https://gruene-mv.de/download/grundsteuerreform-jetzt-nachjustieren-wohnen-muss-bezahlbar-bleiben/',
    title: 'Grundsteuerreform jetzt nachjustieren – Wohnen muss bezahlbar bleiben',
    date: '2024-04-13',
  },
  {
    url: 'https://gruene-mv.de/download/schulsozialarbeit-finanziell-auf-sichere-beine-stellen/',
    title: 'Schulsozialarbeit finanziell auf sichere Beine stellen',
    date: '2024-04-13',
  },
  {
    url: 'https://gruene-mv.de/download/chancen-risiken-und-folgen-aller-zuechtungstechniken-nach-wissenschaftlichen-kriterien-gleichberechtigt-pruefen-wahlfreiheit-sichern/',
    title:
      'Chancen, Risiken und Folgen aller Züchtungstechniken gleichberechtigt prüfen – Wahlfreiheit sichern!',
    date: '2024-04-13',
  },
  {
    url: 'https://gruene-mv.de/download/leitantrag-demokratie-verteidigen-rechtsextremismus-und-soziale-ungleichheit-bekaempfen/',
    title:
      'Leitantrag Demokratie verteidigen - Rechtsextremismus und soziale Ungleichheit bekämpfen',
    date: '2024-04-13',
  },

  // === 23. September 2023 - LDK Güstrow ===
  {
    url: 'https://gruene-mv.de/download/protokoll-der-landesdelegiertenkonferenz-23-9-2023-entwurf/',
    title: 'Protokoll der Landesdelegiertenkonferenz 23.9.2023 (Entwurf)',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/mehr-tempo-bei-der-munitionsbeseitigung/',
    title: 'Mehr Tempo bei der Munitionsbeseitigung',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/nachhaltiger-reittourismus-und-regionale-wertschoepfung-reitwegenetz-staerken/',
    title: 'Nachhaltiger Reittourismus und regionale Wertschöpfung - Reitwegenetz stärken',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/zwangsausgesiedelte-als-sed-opfer-anerkennen/',
    title: 'Zwangsausgesiedelte als SED-Opfer anerkennen',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/digitale-souveraenitaet-und-freiheitsrechte-sichern/',
    title: 'Digitale Souveränität und Freiheitsrechte sichern',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/ambulante-pflege-in-mv-staerken/',
    title: 'Ambulante Pflege in MV stärken',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/wir-machen-mv-mobil-und-fit-fuer-die-zukunft/',
    title: 'Wir machen MV mobil und fit für die Zukunft',
    date: '2023-09-23',
  },
  {
    url: 'https://gruene-mv.de/download/haushalt-2024/',
    title: 'Haushalt 2024',
    date: '2023-09-23',
  },

  // === 22. April 2023 - LDK Grimmen ===
  {
    url: 'https://gruene-mv.de/download/energiewende-vorantreiben-erneuerbare-ausbauen/',
    title: 'Energiewende vorantreiben - Erneuerbare ausbauen',
    date: '2023-04-22',
  },
  {
    url: 'https://gruene-mv.de/download/beitritt-mvs-zur-string-megaregion/',
    title: 'Beitritt MVs zur STRING-Megaregion',
    date: '2023-04-22',
  },
  {
    url: 'https://gruene-mv.de/download/mv-stoppt-den-bodenverbrauch/',
    title: 'MV stoppt den Bodenverbrauch',
    date: '2023-04-22',
  },
  {
    url: 'https://gruene-mv.de/download/29-euro-ticket-auf-landesebene-einfuehren/',
    title: '29-Euro-Ticket auf Landesebene einführen',
    date: '2023-04-22',
  },
  {
    url: 'https://gruene-mv.de/download/keine-fossilen-ueberkapazitaeten-schaffen/',
    title: 'Keine fossilen Überkapazitäten schaffen',
    date: '2023-04-22',
  },
  {
    url: 'https://gruene-mv.de/download/gruenes-land-programm-fuer-zukunftsfaehige-laendliche-raeume-in-mecklenburg-vorpommern/',
    title: 'Grünes Land - Programm für zukunftsfähige ländliche Räume in Mecklenburg-Vorpommern',
    date: '2023-04-22',
  },

  // === 24. September 2022 - LDK Rostock ===
  {
    url: 'https://gruene-mv.de/download/protokoll-der-landesdelegiertenkonferenz-vom-september-2022-entwurf/',
    title: 'Protokoll der Landesdelegiertenkonferenz vom September 2022 (Entwurf)',
    date: '2022-09-24',
  },
  {
    url: 'https://gruene-mv.de/download/investitionsschutzklagen-vor-privaten-schiedsgerichten-im-cetafreihandelsabkommen-wirksam-beschraenken/',
    title:
      'Investitionsschutzklagen vor privaten Schiedsgerichten im CETA-Freihandelsabkommen wirksam beschränken!',
    date: '2022-09-24',
  },
  {
    url: 'https://gruene-mv.de/download/land-braucht-wasser-jetzt-in-not-geratene-landnutzerinnen-unterstuetzen/',
    title: 'Land braucht Wasser! Jetzt in Not geratene Landnutzer*innen unterstützen',
    date: '2022-09-24',
  },
  {
    url: 'https://gruene-mv.de/download/hitzeaktionsplaene-fuer-alle-kommunen/',
    title: 'Hitzeaktionspläne für alle Kommunen',
    date: '2022-09-24',
  },
  {
    url: 'https://gruene-mv.de/download/das-buendnisgruene-10-punkte-energie-programm-fuer-mv/',
    title: 'Das BÜNDNISGRÜNE 10-Punkte-Energie-Programm für MV',
    date: '2022-09-24',
  },

  // === 26. März 2022 - LDR Greifswald ===
  {
    url: 'https://gruene-mv.de/download/protokoll-des-ldr-greifswald-26-3-2022/',
    title: 'Protokoll des LDR Greifswald 26.3.2022',
    date: '2022-03-26',
  },
  {
    url: 'https://gruene-mv.de/download/solidaritaet-mit-der-ukraine/',
    title: 'Solidarität mit der Ukraine!',
    date: '2022-03-26',
  },
  {
    url: 'https://gruene-mv.de/download/leitantrag-klimaschutz-innovation-und-nachhaltigkeit/',
    title: 'Klimaschutz, Innovation und Nachhaltigkeit',
    date: '2022-03-26',
  },
  {
    url: 'https://gruene-mv.de/download/europa-sicherer-machen/',
    title: 'Europa sicherer machen',
    date: '2022-03-26',
  },
  {
    url: 'https://gruene-mv.de/download/leitantrag-der-gruene-fahrplan-zur-kommunalwahl-2024/',
    title: 'Der Grüne Fahrplan zur Kommunalwahl 2024',
    date: '2022-03-26',
  },

  // === 6. November 2021 - LDK Wismar ===
  {
    url: 'https://gruene-mv.de/download/regional-saisonal-bio-fair-fuer-eine-nachhaltige-und-qualitativ-hochwertige-gemeinschaftsverpflegung/',
    title:
      'Regional, Saisonal, Bio, Fair – Für eine nachhaltige und qualitativ hochwertige Gemeinschaftsverpflegung',
    date: '2021-11-06',
  },
  {
    url: 'https://gruene-mv.de/download/nachtragshaushalt-2021-und-haushalt-2022/',
    title: 'Nachtragshaushalt 2021 und Haushalt 2022',
    date: '2021-11-06',
  },
];

function parseArgs(): { source?: string; max?: number; beschluesse?: boolean; force?: boolean } {
  const args = process.argv.slice(2);
  const result: { source?: string; max?: number; beschluesse?: boolean; force?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') {
      result.source = args[++i];
    } else if (args[i] === '--max') {
      result.max = parseInt(args[++i], 10);
    } else if (args[i] === '--beschluesse') {
      result.beschluesse = true;
    } else if (args[i] === '--force') {
      result.force = true;
    }
  }

  return result;
}

async function ingestBeschluesse(force: boolean) {
  if (MV_BESCHLUESSE.length === 0) {
    console.log('No Beschlüsse configured in MV_BESCHLUESSE. Add entries and re-run.');
    return;
  }

  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (const pdf of MV_BESCHLUESSE) {
    try {
      console.log(`  Processing: ${pdf.title}`);
      const result = await landesverbandScraperService.ingestPdf(
        'mecklenburg-vorpommern-lv',
        pdf.url,
        pdf.title,
        pdf.date,
        { forceUpdate: force }
      );

      if (result.stored) {
        console.log(`  ✓ Stored: ${pdf.title} (${result.vectors} vectors)`);
        stored++;
      } else {
        console.log(`  ⏭ Skipped: ${pdf.title} (${result.reason})`);
        skipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Error: ${pdf.title}: ${msg}`);
      errors++;
    }
  }

  console.log(`\nBeschlüsse: ${stored} stored, ${skipped} skipped, ${errors} errors`);
}

async function main() {
  const args = parseArgs();

  console.log('=== Mecklenburg-Vorpommern Scraping Script ===');

  console.log('Initializing scraper...');
  await landesverbandScraperService.init();

  if (args.beschluesse) {
    console.log('Mode: Manual Beschlüsse ingestion');
    console.log(`Configured PDFs: ${MV_BESCHLUESSE.length}`);
    if (args.force) console.log('Force update: yes');

    await ingestBeschluesse(!!args.force);
  } else {
    if (args.source) console.log(`Source filter: ${args.source}`);
    if (args.max) console.log(`Max documents per path: ${args.max}`);

    const sources = args.source ? [args.source] : MV_SOURCES;

    for (const sourceId of sources) {
      console.log(`\nScraping source: ${sourceId}`);

      try {
        const result = await landesverbandScraperService.scrapeSource(sourceId, {
          forceUpdate: false,
          ...(args.max ? { maxDocuments: args.max } : {}),
        });
        console.log(`Result for ${sourceId}:`, JSON.stringify(result, null, 2));
      } catch (err) {
        console.error(`Error scraping ${sourceId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
