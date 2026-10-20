import { LANDESVERBAENDE, type LandesverbandId } from '../agents/landesverbaende.js';

import { type MarketplaceCollectionCover } from './frontpage.js';

/**
 * Ein Foto je Landesverband, meist die Landeshauptstadt: die Karte in der
 * Reihe „Landesverbände" und das Banner seiner Seite. Die Dateien liegen unter
 * `/images/marketplace/landesverbaende/<file>-{640,1200}.webp`; nginx liefert
 * `/images/**` immutable aus, ein neues Foto braucht also ein neues `-vN`.
 */
export const LANDESVERBAND_COVERS: Record<LandesverbandId, MarketplaceCollectionCover> = {
  berlin: {
    file: 'berlin-v1',
    alt: 'Das Brandenburger Tor mit dem Fernsehturm dahinter',
    credit: {
      author: 'Ansgar Scheffold',
      profileUrl:
        'https://unsplash.com/@ansgarscheffold?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/brandenburg-gate-and-tv-tower-berlin-mtfTz0FnwBw?utm_source=gruenerator&utm_medium=referral',
    },
  },
  hamburg: {
    file: 'hamburg-v1',
    alt: 'Die Speicherstadt in Hamburg mit Backsteinbauten am Fleet',
    credit: {
      author: 'Meduana',
      profileUrl: 'https://unsplash.com/@meduana?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/river-between-brown-concrete-buildings-PdnseHuDFZU?utm_source=gruenerator&utm_medium=referral',
    },
  },
  'mecklenburg-vorpommern': {
    file: 'mecklenburg-vorpommern-v1',
    alt: 'Das Schweriner Schloss am See',
    credit: {
      author: 'Jonathan Knüttel',
      profileUrl:
        'https://unsplash.com/@photographyjonathan?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/brown-and-white-castle-near-body-of-water-during-daytime-zTYoMtlDFl4?utm_source=gruenerator&utm_medium=referral',
    },
  },
  thueringen: {
    file: 'thueringen-v1',
    alt: 'Erfurt bei Nacht von oben',
    credit: {
      author: 'Daniel Hering',
      profileUrl: 'https://unsplash.com/@danielhering?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/an-aerial-view-of-a-city-at-night-yn5eVi6nFww?utm_source=gruenerator&utm_medium=referral',
    },
  },
  brandenburg: {
    file: 'brandenburg-v1',
    alt: 'Schloss Sanssouci in Potsdam mit Treppen und Statuen',
    credit: {
      author: 'Linda W.',
      profileUrl: 'https://unsplash.com/@linda_na?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/sanssouci-with-stairs-and-statues-ciJq1Qe9y7A?utm_source=gruenerator&utm_medium=referral',
    },
  },
  bayern: {
    file: 'bayern-v1',
    alt: 'Ein Alpenmassiv im Abendlicht',
    credit: {
      author: 'andreas kretschmer',
      profileUrl: 'https://unsplash.com/@andikausg?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/brown-mountain-during-daytime-4VXCQjiyVyc?utm_source=gruenerator&utm_medium=referral',
    },
  },
  'sachsen-anhalt': {
    file: 'sachsen-anhalt-v1',
    alt: 'Der Magdeburger Dom spiegelt sich in der Elbe',
    credit: {
      author: 'IKECHUKWU JULIUS UGWU',
      profileUrl: 'https://unsplash.com/@mijulshewrote?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/cathedral-reflected-in-a-calm-river-with-city-buildings-NM7mR4QJ6YI?utm_source=gruenerator&utm_medium=referral',
    },
  },
  hessen: {
    file: 'hessen-v1',
    alt: 'Das Kurhaus in Wiesbaden mit Springbrunnen',
    credit: {
      author: 'Masood Aslami',
      profileUrl: 'https://unsplash.com/@masoodaslami?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/a-large-building-with-a-fountain-in-front-of-it-Xot1WmWlHo8?utm_source=gruenerator&utm_medium=referral',
    },
  },
  saarland: {
    file: 'saarland-v1',
    alt: 'Die Saarschleife zwischen bewaldeten Hängen',
    credit: {
      author: 'Christopher Schaumloeffel',
      profileUrl: 'https://unsplash.com/@cs3200?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/green-trees-on-mountain-beside-river-during-daytime-idSjTa8WuSs?utm_source=gruenerator&utm_medium=referral',
    },
  },
  'schleswig-holstein': {
    file: 'schleswig-holstein-v1',
    alt: 'Der Kieler Hafen mit Booten an der Förde',
    credit: {
      author: 'Marvin Radke',
      profileUrl: 'https://unsplash.com/@marvinradke?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/a-body-of-water-with-boats-and-buildings-along-it-NyB61FMOwj0?utm_source=gruenerator&utm_medium=referral',
    },
  },
  oesterreich: {
    file: 'oesterreich-v1',
    alt: 'Der Wiener Stephansdom über den Dächern der Stadt',
    credit: {
      author: 'Jacek Dylag',
      profileUrl: 'https://unsplash.com/@dylu?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/st-stephens-cathedral-skyline-in-vienna-5SjAaqqCCmY?utm_source=gruenerator&utm_medium=referral',
    },
  },
};

/** Origin-relative; the web serves the files, the app prefixes the web origin. */
export const LANDESVERBAND_COVER_DIR = '/images/marketplace/landesverbaende';

/** The 3:4 card crop of a cover, at 320 and 480 px width. */
export const landesverbandCardPaths = (cover: MarketplaceCollectionCover) => ({
  w320: `${LANDESVERBAND_COVER_DIR}/${cover.file}-card-320.webp`,
  w480: `${LANDESVERBAND_COVER_DIR}/${cover.file}-card-480.webp`,
});

const COVER_BY_NOTEBOOK = new Map<string, MarketplaceCollectionCover>(
  LANDESVERBAENDE.map((lv) => [lv.notebookId, LANDESVERBAND_COVERS[lv.id]])
);

/** A Landesverband notebook shows its Landesverband's Marktplatz photo; any other notebook `null`. */
export const landesverbandCoverForNotebook = (
  notebookId: string
): MarketplaceCollectionCover | null => COVER_BY_NOTEBOOK.get(notebookId) ?? null;
