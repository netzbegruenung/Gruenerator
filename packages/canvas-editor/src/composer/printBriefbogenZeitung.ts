/**
 * The letterhead of the DE design guide (2024 p. 32) and the AT Gemeindezeitung
 * (2026 p. 96).
 *
 * Letterhead: the first page carries the Tanne band with the word mark top
 * right, the return line above the address window (DIN 5008: the window
 * starts 45 mm from the top) and the sender at the foot; the follow-up page
 * only the foot line.
 *
 * Newspaper: a cover with the photo, the title in yellow and six teasers;
 * two article pages on white in three columns; the back with contact and
 * Impressum.
 */
import { type PrintSpec } from '@gruenerator/contracts';

import { DE_WORDMARK, SHAREPIC_COLOR_HEX } from './chromeParts';
import { type ComposedSlide } from './composeSharepic';
import { brandFont } from './fontRole';
import {
  ART,
  BODY_LEADING,
  fitStack,
  flowColumns,
  HEAD_LEADING,
  impressumElement,
  impressumText,
  kontaktText,
  mm,
  page,
  placeStack,
  rect,
  stackHeight,
  stoerer,
  WHITE,
  type Block,
  type Frame,
  type PhotoSrc,
} from './printFrame';

type BriefbogenSpec = Extract<PrintSpec, { variante: 'briefbogen' }>;
type ZeitungSpec = Extract<PrintSpec, { variante: 'gemeindezeitung' }>;

const TANNE = SHAREPIC_COLOR_HEX.tanne;

/** One line of small copy. */
function zeile(
  f: Frame,
  id: string,
  text: string,
  size: number,
  fill: string,
  bold = false
): Block['props'] {
  return {
    id,
    text,
    type: 'body',
    fontSize: size,
    ...brandFont(f.theme.fonts, 'body'),
    fontStyle: bold ? 'bold' : 'normal',
    fill,
    lineHeight: BODY_LEADING,
  };
}

export function briefbogen(f: Frame, spec: BriefbogenSpec): ComposedSlide[] {
  const { trim } = f;
  const s = spec.slots;
  const rand = mm(f, 20);
  const width = trim.width - 2 * rand;
  const klein = f.pt(7.5);
  const fuss = [
    s.organisation,
    s.adresse,
    kontaktText(s)?.replace(/\*\*/g, '').replace(/\n/g, ' · '),
  ]
    .filter((line): line is string => Boolean(line))
    .join(' · ');
  const fussY = trim.y + trim.height - mm(f, 15);

  const erste = page(WHITE);
  const band = trim.y + mm(f, 40);
  erste.shape(rect('pr-band', { x: 0, y: 0, width: f.format.width, height: band }, TANNE));
  const logoW = mm(f, 48);
  erste.asset(
    'pr-logo',
    DE_WORDMARK.farbe,
    trim.x + trim.width - rand - logoW / 2,
    band / 2 + trim.y / 2,
    logoW
  );
  // The return line sits just above the address window (DIN 5008 form B).
  const ruecksende = [s.organisation, s.adresse].filter(Boolean).join(' · ');
  erste.text({
    ...zeile(f, 'pr-ruecksende', ruecksende, f.pt(7), TANNE),
    x: trim.x + mm(f, 20),
    y: trim.y + mm(f, 45),
    width: mm(f, 85),
  });
  erste.text({ ...zeile(f, 'pr-fuss', fuss, klein, TANNE), x: trim.x + rand, y: fussY, width });

  const folge = page(WHITE);
  folge.text({ ...zeile(f, 'pr-fuss', fuss, klein, TANNE), x: trim.x + rand, y: fussY, width });
  return [erste.out, folge.out];
}

// ── AT Gemeindezeitung ───────────────────────────────────────────────────────

export function gemeindezeitung(f: Frame, spec: ZeitungSpec, src: PhotoSrc): ComposedSlide[] {
  const { inner, trim } = f;
  const s = spec.slots;
  const X = f.margin;
  const { primary: dunkel, accent: gelb, accentOnLight } = f.theme.colors;
  const gap = mm(f, 5);
  const colWidth = (inner.width - 2 * gap) / 3;
  const logoW = 3 * X;
  const logoH = (logoW * ART.atLogo.h) / ART.atLogo.w;

  // ── Cover ────────────────────────────────────────────────────────────────
  const cover = page(dunkel);
  const seam = trim.y + trim.height * 0.5;
  cover.image({
    id: 'pr-foto',
    src: src(s.foto),
    fileName: s.foto,
    x: 0,
    y: 0,
    width: f.format.width,
    height: seam,
    rotation: 0,
    scale: 1,
    opacity: 1,
    fit: 'cover',
  });
  // The issue line on a Dunkelgrün strip across the head, cut hard into the photo.
  cover.shape(
    rect(
      'pr-kopf',
      { x: 0, y: 0, width: f.format.width, height: inner.y + f.pt(9) * BODY_LEADING + 0.5 * X },
      dunkel
    )
  );
  cover.text({
    ...zeile(f, 'pr-ausgabe', s.ausgabe, f.pt(9), WHITE, true),
    x: inner.x,
    y: inner.y,
    width: inner.width,
    align: 'right',
  });
  cover.asset('pr-logo', 'gruene-at-logo-weiss', trim.x + trim.width / 2, seam, logoW);
  const titelTop = seam + logoH / 2 + X * 0.3;
  const teaserTop = trim.y + trim.height * 0.75;
  const r = mm(f, 17);
  const titel = fitStack(
    f,
    (size) => [
      {
        before: 0,
        props: {
          id: 'pr-titel',
          text: s.titel,
          type: 'header' as const,
          fontSize: size,
          ...brandFont(f.theme.fonts, 'headline'),
          fontStyle: 'normal' as const,
          fill: gelb,
          lineHeight: HEAD_LEADING['de-AT'],
          align: 'center' as const,
        },
      },
    ],
    mm(f, 26),
    inner.width - 4 * r,
    teaserTop - titelTop - X * 0.5
  );
  const titelH = stackHeight(f, titel, inner.width - 4 * r);
  placeStack(
    cover,
    f,
    titel,
    inner.x + 2 * r,
    titelTop + (teaserTop - titelTop - titelH) / 2,
    inner.width - 4 * r
  );
  if (s.stoerer)
    stoerer(
      cover,
      f,
      'pr-stoerer',
      s.stoerer,
      inner.x + inner.width - r,
      titelTop + (teaserTop - titelTop) / 2,
      r
    );
  // Teasers: three columns, two rows.
  const rowH = (inner.y + inner.height - teaserTop) / 2;
  s.teaser.slice(0, 6).forEach((t, i) => {
    const blocks = fitStack(
      f,
      (size) => [
        {
          before: 0,
          props: { ...zeile(f, `pr-teaser-${i + 1}-titel`, t.headline, size, WHITE, true) },
        },
        { before: 0.15 * size, props: { ...zeile(f, `pr-teaser-${i + 1}`, t.text, size, WHITE) } },
      ],
      f.pt(8),
      colWidth,
      rowH * 0.9
    );
    placeStack(
      cover,
      f,
      blocks,
      inner.x + (i % 3) * (colWidth + gap),
      teaserTop + Math.floor(i / 3) * rowH,
      colWidth
    );
  });

  // ── Article pages ────────────────────────────────────────────────────────
  const body = f.pt(8.5);
  const artikel = s.artikel.map((a, n) => {
    const p = page(WHITE);
    const kopf = fitStack(
      f,
      (size) => [
        {
          before: 0,
          props: {
            id: 'pr-artikel-headline',
            text: a.headline,
            type: 'header' as const,
            fontSize: size,
            ...brandFont(f.theme.fonts, 'headline'),
            fontStyle: 'normal' as const,
            fill: accentOnLight,
            lineHeight: HEAD_LEADING['de-AT'],
          },
        },
        ...(a.vorspann
          ? [
              {
                before: 0.4 * size,
                props: { ...zeile(f, 'pr-vorspann', a.vorspann, 0.5 * size, accentOnLight, true) },
              },
            ]
          : []),
      ],
      f.pt(22),
      inner.width,
      inner.height * 0.25
    );
    const kopfH = stackHeight(f, kopf, inner.width);
    placeStack(p, f, kopf, inner.x, inner.y, inner.width);
    const textTop = inner.y + kopfH + X * 0.5;
    const fussY = inner.y + inner.height - f.pt(8);
    const fotoH = a.foto ? inner.height * 0.32 : 0;
    if (a.foto) {
      p.image({
        id: 'pr-artikel-foto',
        src: src(a.foto),
        fileName: a.foto,
        x: inner.x,
        y: fussY - X * 0.4 - fotoH,
        width: inner.width,
        height: fotoH,
        rotation: 0,
        scale: 1,
        opacity: 1,
        fit: 'cover',
      });
    }
    const colH = fussY - X * 0.4 - (a.foto ? fotoH + X * 0.5 : 0) - textTop;
    flowColumns(f, a.text, 3, colWidth, colH, body, f.theme.fonts.body, BODY_LEADING).forEach(
      (text, c) => {
        if (!text) return;
        p.text({
          ...zeile(f, `pr-spalte-${c + 1}`, text, body, '#1A1A1A'),
          x: inner.x + c * (colWidth + gap),
          y: textTop,
          width: colWidth,
        });
      }
    );
    // The page number at the foot, outside (2 left, 3 right).
    p.text({
      ...zeile(f, 'pr-seitenzahl', String(n + 2), f.pt(8), accentOnLight, true),
      x: inner.x,
      y: fussY,
      width: inner.width,
      align: n === 0 ? 'left' : 'right',
    });
    return p.out;
  });

  // ── Back: contact and Impressum ─────────────────────────────────────────
  const back = page(dunkel);
  back.asset(
    'pr-logo',
    'gruene-at-logo-weiss',
    trim.x + trim.width / 2,
    inner.y + logoH,
    2 * logoW
  );
  const kontakt = [s.kontakt.organisation, s.kontakt.name, s.kontakt.funktion, s.kontakt.adresse]
    .filter((line): line is string => Boolean(line))
    .join('\n');
  const wege = kontaktText(s.kontakt);
  const blocks: Block[] = [
    {
      before: 0,
      props: {
        id: 'pr-kontakt-titel',
        text: 'Kontakt',
        type: 'header',
        fontSize: f.pt(24),
        ...brandFont(f.theme.fonts, 'headline'),
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: HEAD_LEADING['de-AT'],
        align: 'center',
      },
    },
    ...(kontakt
      ? [
          {
            before: f.pt(12),
            props: {
              ...zeile(f, 'pr-kontakt', kontakt, f.pt(11), WHITE),
              align: 'center' as const,
            },
          },
        ]
      : []),
    ...(wege
      ? [
          {
            before: f.pt(8),
            props: {
              ...zeile(f, 'pr-kontakt-wege', wege, f.pt(11), WHITE),
              align: 'center' as const,
            },
          },
        ]
      : []),
  ];
  const h = stackHeight(f, blocks, inner.width);
  placeStack(back, f, blocks, inner.x, trim.y + (trim.height - h) / 2, inner.width);
  if (spec.impressum) back.text(impressumElement(f, impressumText(spec.impressum)));

  return [cover.out, ...artikel, back.out];
}
