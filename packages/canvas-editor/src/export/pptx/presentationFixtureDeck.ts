/**
 * Ein Prüf-Deck für den PPTX-Export: vier 16:9-Folien mit jeder Elementart,
 * einmal in deutscher, einmal in österreichischer Marke. Nur für Tests und
 * die Handprüfung in `FIDELITY.md`; nicht über `src/index.ts` erreichbar.
 *
 * Bildquellen sind Platzhalter (`fixture:`); wer das Deck schreibt, liefert
 * die Bilder über `loadImage`.
 */

import type { PptxPageState } from './buildPptxModel';
import type { AdditionalText } from '../../configs/types';
import type { ChartInstance } from '@ggraphic/editor/utils/chartUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

interface FixtureBrand {
  locale: 'de-DE' | 'de-AT';
  headline: string;
  body: string;
  primary: string;
  secondary: string;
  accent: string;
  stoerer: string;
  light: string;
}

const DE: FixtureBrand = {
  locale: 'de-DE',
  headline: 'GrueneTypeNeue',
  body: 'PT Sans',
  primary: '#005538',
  secondary: '#8ABD24',
  accent: '#FFF17A',
  stoerer: '#00CC4F',
  light: '#F5F1E9',
};

const AT: FixtureBrand = {
  locale: 'de-AT',
  headline: 'GothamNarrow-Ultra',
  body: 'GothamNarrow-Book',
  primary: '#257639',
  secondary: '#56AF31',
  accent: '#FCEC00',
  stoerer: '#E4007C',
  light: '#FFFFFF',
};

const base = { scale: 1, rotation: 0, opacity: 1 };

function slides(brand: FixtureBrand): PptxPageState[] {
  const at = brand.locale === 'de-AT';
  const text = (overrides: Partial<AdditionalText> & Pick<AdditionalText, 'id' | 'text'>) =>
    ({
      type: 'body',
      x: 120,
      y: 120,
      width: 1000,
      fontSize: 48,
      fontFamily: brand.body,
      fill: '#FFFFFF',
      ...overrides,
    }) satisfies AdditionalText;
  const shape = (overrides: Partial<ShapeInstance> & Pick<ShapeInstance, 'id'>) =>
    ({
      type: 'rect',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      fill: brand.secondary,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      ...overrides,
    }) satisfies ShapeInstance;
  const photo: UserImageInstance = {
    id: 'foto',
    src: 'fixture:foto',
    fileName: 'foto.jpg',
    x: 1180,
    y: 260,
    width: 600,
    height: 450,
    ...base,
  };
  const chart: ChartInstance = {
    id: 'diagramm',
    x: 120,
    y: 300,
    width: 900,
    height: 600,
    ...base,
    chartType: 'bar',
    data: [
      { name: 'Wind', value: 42 },
      { name: 'Sonne', value: 27 },
      { name: 'Wasser', value: at ? 60 : 4 },
      { name: 'Bio', value: 8 },
    ],
    colors: [brand.primary, brand.secondary, brand.stoerer, brand.accent],
    title: at ? 'Strommix Österreich' : 'Strommix Deutschland',
    unit: '%',
    showLegend: false,
    showGrid: true,
    showValues: true,
  };

  return [
    // 1 — Titel: Text mit Akzent und Marker, Pille, Sprechernotiz
    {
      backgroundMode: 'color',
      backgroundColor: brand.primary,
      additionalTexts: [
        text({
          id: 'titel',
          type: 'header',
          text: 'Klimaschutz ==jetzt==, nicht ++irgendwann++',
          x: 120,
          y: 360,
          width: 1680,
          fontSize: 120,
          fontFamily: brand.headline,
          align: 'left',
          accent: { fill: brand.accent, fontFamily: brand.headline },
        }),
        text({
          id: 'untertitel',
          text: at ? 'Landesversammlung · Wien' : 'Kreismitgliederversammlung · **Kassel**',
          x: 120,
          y: 640,
          width: 1400,
          fontSize: 48,
        }),
      ],
      pillBadgeInstances: [
        {
          id: 'pille',
          text: at ? 'Neu' : 'Wusstest du?',
          x: 120,
          y: 200,
          backgroundColor: brand.stoerer,
          textColor: '#FFFFFF',
          fontSize: 44,
          fontFamily: brand.headline,
          fontStyle: 'normal',
          paddingX: 36,
          paddingY: 14,
          cornerRadius: 40,
          ...base,
        },
      ],
      notes: at
        ? 'Begrüßung. Kurz vorstellen, dann zum Thema.'
        : 'Begrüßung, dann zu den drei Gründen.',
    },
    // 2 — Aufzählung, Foto, einfache Formen, gedrehte Form, Icon
    {
      backgroundMode: 'color',
      backgroundColor: brand.light,
      additionalTexts: [
        text({
          id: 'ueberschrift',
          type: 'header',
          text: 'Drei Gründe',
          fontSize: 96,
          fontFamily: brand.headline,
          fill: brand.primary,
        }),
        text({
          id: 'liste',
          text: '- Saubere Luft\n- Jobs vor Ort\n- *Günstiger* Strom\n\n4. Und viertens',
          y: 320,
          width: 900,
          fontSize: 54,
          fill: brand.primary,
          lineHeight: 1.3,
        }),
      ],
      userImageInstances: [photo],
      shapeInstances: [
        shape({ id: 'rechteck', x: 120, y: 900, width: 300, height: 60 }),
        shape({ id: 'kreis', type: 'circle', x: 560, y: 930, width: 80, height: 80 }),
        shape({ id: 'dreieck', type: 'triangle', x: 700, y: 900, width: 100, height: 80 }),
        shape({
          id: 'stern',
          type: 'star',
          x: 900,
          y: 930,
          width: 100,
          height: 100,
          fill: brand.accent,
        }),
        shape({
          id: 'gedreht',
          type: 'rounded-rect',
          x: 1500,
          y: 820,
          width: 260,
          height: 140,
          rotation: 12,
          fill: brand.stoerer,
          cornerRadius: 24,
        }),
      ],
      selectedIcons: ['pi-leaf'],
      iconStates: { 'pi-leaf': { x: 1100, y: 960, scale: 0.6, rotation: 0, color: brand.primary } },
      notes: 'Bei Punkt drei auf die Kosten eingehen.',
    },
    // 3 — Diagramm, Kreis-Badge, Illustration, Asset, Rahmen, Pfeil
    {
      backgroundMode: 'color',
      backgroundColor: '#FFFFFF',
      additionalTexts: [
        text({
          id: 'diagramm-titel',
          type: 'header',
          text: 'Erneuerbare im Strommix',
          fontSize: 80,
          fontFamily: brand.headline,
          fill: brand.primary,
        }),
      ],
      chartInstances: [chart],
      circleBadgeInstances: [
        {
          id: 'badge',
          x: 1600,
          y: 300,
          radius: 140,
          backgroundColor: brand.accent,
          textColor: brand.primary,
          rotation: -8,
          scale: 1,
          textLines: [
            { text: 'SA', yOffset: -40, fontFamily: brand.body, fontSize: 40, fontWeight: 'bold' },
            { text: '12.10.', yOffset: 16, fontFamily: brand.body, fontSize: 56 },
          ],
        },
      ],
      illustrationInstances: [
        {
          id: 'illustration',
          illustrationId: 'planet',
          source: 'kawaii',
          x: 1250,
          y: 700,
          color: brand.secondary,
          mood: 'happy',
          ...base,
        },
      ],
      assetInstances: [{ id: 'asset', assetId: 'sunflower', x: 1500, y: 650, ...base }],
      frameInstances: [
        {
          id: 'rahmen',
          clipType: 'circle',
          x: 1500,
          y: 800,
          width: 220,
          height: 220,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          imageSrc: null,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageScale: 1,
          borderColor: brand.primary,
          borderWidth: 6,
          cornerRadius: 0,
        },
      ],
      shapeInstances: [shape({ id: 'pfeil', type: 'arrow', x: 1060, y: 520, fill: brand.stoerer })],
      notes: null,
    },
    // 4 — Hintergrundfoto, Balken, gedrehter Text mit Schatten
    {
      backgroundMode: 'image',
      backgroundColor: brand.primary,
      hasBackgroundImage: true,
      currentImageSrc: 'fixture:hintergrund',
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      backgroundImageOpacity: 1,
      balkenInstances: [
        {
          id: 'balken',
          mode: 'single',
          colorSchemeId: 'tanne-sand',
          widthScale: 1,
          offset: { x: 0, y: 0 },
          scale: 1,
          texts: ['Danke!'],
          rotation: 0,
        },
      ],
      additionalTexts: [
        text({
          id: 'schluss',
          type: 'header',
          text: at ? 'gruene.at' : 'gruene.de',
          x: 1300,
          y: 860,
          width: 500,
          fontSize: 64,
          fontFamily: brand.headline,
          rotation: -6,
          shadowColor: '#000000',
          shadowBlur: 12,
          shadowOffsetX: 4,
          shadowOffsetY: 4,
          shadowOpacity: 0.6,
        }),
      ],
      notes: 'Fragen? Kontakt steht auf der Folie.',
    },
  ];
}

export const PRESENTATION_FIXTURE_DECKS = {
  'de-DE': slides(DE),
  'de-AT': slides(AT),
} as const;
