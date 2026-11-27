/**
 * "Nachhaltigkeit" — the platform footprint told as six short chapters.
 *
 * Every number comes from `deriveFigures`; a chapter whose figure is missing
 * (no market-based saving, no area split) is left out and the rest renumber.
 * The two pieces that tick (equivalent rotator, live counter) are their own
 * components so their updates never re-render the page.
 */
import { type GetTransparencyStatsResponseDto } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  formatCount,
  formatEnergy,
  formatGrams,
  providerLabel,
} from '../../../../utils/usageFormat';

import {
  deriveFigures,
  formatMinutes,
  joinList,
  shareInWords,
  type StoryFigures,
  wholeNumber,
} from './figures';
import {
  DatacenterHorizon,
  DriftingClouds,
  Factory,
  PowerLines,
  Road,
  SolarHorizon,
  SproutHorizon,
  Sun,
  WindTurbine,
} from './illustrations';

const BIG = 'nh-display text-[clamp(52px,12vw,190px)] font-black leading-[0.95] tracking-[-0.04em]';
const PROSE =
  'nh-display m-0 max-w-[1120px] text-[clamp(24px,3.5vw,54px)] font-semibold leading-[1.28] tracking-[-0.015em]';
const INNER = 'mx-auto flex max-w-[1440px] flex-col gap-8 px-[clamp(20px,4vw,48px)] sm:gap-10';

function distance(km: number): string {
  return km >= 10 ? `${wholeNumber(km)} km` : `${wholeNumber(km * 1000)} m`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

/**
 * "= 507 km Autofahrt", then the next equivalent. Static (first item) for
 * reduced motion; screen readers get the full list once instead of a live region.
 */
function EquivalentRotator({ items }: { items: { big: string; small: string }[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion() || items.length < 2) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % items.length), 2600);
    return () => window.clearInterval(timer);
  }, [items.length]);

  const prev = (active - 1 + items.length) % items.length;

  return (
    <div>
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item.small}>
            {item.big} {item.small}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex items-center gap-[clamp(12px,2vw,32px)]">
        <span className={cn(BIG, 'text-[var(--nh-glow)]')}>=</span>
        <div className="relative h-[clamp(96px,13vw,200px)] flex-1 overflow-hidden">
          {items.map((item, i) => (
            <span
              key={item.small}
              className="nh-slot absolute inset-0 flex flex-col justify-center gap-1 sm:flex-row sm:items-baseline sm:justify-start sm:gap-[18px]"
              style={{
                transform: `translateY(${i === active ? 0 : i === prev ? -110 : 110}%)`,
                opacity: i === active ? 1 : 0,
              }}
            >
              <span className={cn(BIG, 'whitespace-nowrap')}>{item.big}</span>
              <span className="nh-display text-[clamp(20px,3.4vw,52px)] font-bold text-[#d6e8df]">
                {item.small}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-3 flex gap-2">
        {items.map((item, i) => (
          <span
            key={item.small}
            className="h-1.5 rounded-full transition-[width,background-color] duration-300"
            style={{
              width: i === active ? 40 : 14,
              background: i === active ? '#fff' : 'var(--nh-hero-deep)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Grams emitted since the page opened, at the window's average rate. Written
 * straight into the DOM four times a second — a React state here would
 * re-render the counter subtree for a number nobody reads that often.
 */
function LiveCounter({ gramsPerSecond }: { gramsPerSecond: number }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const start = performance.now();
    const format = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const tick = () => {
      if (ref.current) {
        ref.current.textContent = `+${format.format(((performance.now() - start) / 1000) * gramsPerSecond)} g CO₂`;
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [gramsPerSecond]);

  return (
    <div className="flex items-center gap-3.5 rounded-full bg-[var(--nh-hero-deep)] px-5 py-3.5">
      <span aria-hidden className="nh-live-dot size-2.5 rounded-full bg-[var(--nh-glow)]" />
      <span className="text-[17px]">
        Seit du hier bist: <b ref={ref} className="tabular-nums" />
      </span>
    </div>
  );
}

function Hero({ f, onMore }: { f: StoryFigures; onMore: () => void }) {
  const items = [
    { big: distance(f.carKm), small: 'Autofahrt' },
    { big: formatEnergy(f.energyWh), small: 'Strom' },
    { big: formatCount(f.requests), small: 'KI-Anfragen' },
    { big: formatGrams(f.gramsPerDay), small: 'jeden Tag' },
  ];

  return (
    <section className="relative flex min-h-[min(100dvh,960px)] flex-col justify-between gap-8 overflow-hidden bg-[var(--nh-hero)] px-[clamp(20px,4vw,48px)] py-10 text-white">
      <DriftingClouds fill="var(--nh-hero-soft)" top={110} />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-[4%] hidden items-end gap-7 md:flex"
      >
        <WindTurbine height={300} fill="var(--nh-hero-deep)" speed={5} />
        <WindTurbine height={220} fill="var(--nh-hero-deep)" />
        <WindTurbine height={170} fill="var(--nh-hero-deep)" speed={3.5} />
      </div>

      <span className="nh-display relative text-xl font-bold">Nachhaltigkeit</span>

      <div className="relative flex flex-col gap-2">
        <span className="text-[clamp(17px,1.8vw,24px)]">
          Alle Nutzer*innen des Grünerators, letzte {f.days} Tage:
        </span>
        <h1 className={cn(BIG, 'm-0')}>{formatGrams(f.emissionsG)} CO₂</h1>
        <EquivalentRotator items={items} />
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <LiveCounter gramsPerSecond={f.gramsPerSecond} />
        <button
          type="button"
          onClick={onMore}
          className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-base font-bold text-[#1f3a30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Was heißt das?
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>
      </div>
    </section>
  );
}

/* ── Kapitel ──────────────────────────────────────────────────────────────── */

type Tone = 'deep' | 'mint' | 'paper' | 'mist';

const TONE: Record<Tone, { band: string; number: string; strong: string; note: string }> = {
  deep: {
    band: 'bg-[var(--nh-deep)] text-white',
    number: 'text-[var(--nh-glow)]',
    strong: 'text-[var(--nh-glow)]',
    note: 'text-[var(--nh-glow-soft)]',
  },
  mint: {
    band: 'bg-[var(--nh-mint)]',
    number: 'text-[var(--nh-accent)]',
    strong: 'text-[var(--nh-strong)]',
    note: 'text-[var(--nh-muted)]',
  },
  paper: {
    band: 'bg-[var(--nh-paper)]',
    number: 'text-[var(--nh-accent)]',
    strong: 'text-[var(--nh-strong)]',
    note: 'text-[var(--nh-muted)]',
  },
  mist: {
    band: 'bg-[var(--nh-mist)]',
    number: 'text-[var(--nh-accent)]',
    strong: 'text-[var(--nh-strong)]',
    note: 'text-[var(--nh-muted)]',
  },
};

interface ChapterDef {
  key: string;
  title: string;
  tone: Tone;
  body: (strong: (text: ReactNode, size?: 'normal' | 'large') => ReactNode) => ReactNode;
  /** Small print under the paragraph. */
  note?: string;
  /** Anything between the paragraph and the note (the share bar). */
  extra?: ReactNode;
  /** Scenery floating in the band (top right); hidden on small screens. */
  scenery?: ReactNode;
  clouds?: string;
  /** Scenery standing at the foot of the band. */
  horizon?: ReactNode;
}

function Chapter({ number, def, id }: { number: number; def: ChapterDef; id?: string }) {
  const tone = TONE[def.tone];
  // Explicit size: the global stylesheet sizes `b`, the prose must not inherit that.
  const strong = (text: ReactNode, size: 'normal' | 'large' = 'normal') => (
    <b
      className={cn(
        'whitespace-nowrap font-extrabold tabular-nums',
        size === 'large' ? 'text-[1.25em]' : 'text-[1em]',
        tone.strong
      )}
    >
      {text}
    </b>
  );

  return (
    <section
      id={id}
      aria-labelledby={`nh-${def.key}`}
      className={cn('nh-band relative overflow-hidden', tone.band)}
    >
      {def.clouds && <DriftingClouds fill={def.clouds} top={30} />}
      {def.scenery && (
        <div aria-hidden className="pointer-events-none absolute right-[5%] top-8 hidden lg:block">
          {def.scenery}
        </div>
      )}
      <div className={cn(INNER, 'relative py-[clamp(56px,8vw,96px)]')}>
        <div className="flex flex-wrap items-baseline gap-4 sm:gap-5">
          <span className={cn('nh-display text-[22px] font-black sm:text-[28px]', tone.number)}>
            {String(number).padStart(2, '0')}
          </span>
          <h2 id={`nh-${def.key}`} className="nh-display m-0 text-[22px] font-bold sm:text-[28px]">
            {def.title}
          </h2>
        </div>
        <p className={PROSE}>{def.body(strong)}</p>
        {def.extra}
        {def.note && (
          <p className={cn('m-0 -mt-3 max-w-[760px] text-base leading-normal', tone.note)}>
            {def.note}
          </p>
        )}
      </div>
      {def.horizon}
    </section>
  );
}

function ShareBar({ shares }: { shares: { share: number; color: string; label: string }[] }) {
  return (
    <div
      className="flex h-4 max-w-[1120px] overflow-hidden rounded-full"
      role="img"
      aria-label={shares.map((s) => `${s.label} ${Math.round(s.share * 100)} %`).join(', ')}
    >
      {shares.map((s) => (
        <div key={s.label} style={{ flexBasis: `${s.share * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

function buildChapters(f: StoryFigures): ChapterDef[] {
  const g = formatGrams;
  const chapters: (ChapterDef | null)[] = [
    {
      key: 'woher',
      title: 'Woher kommt das CO₂?',
      tone: 'deep',
      scenery: <Factory />,
      clouds: 'var(--nh-hero-deep)',
      horizon: <PowerLines />,
      note: 'CO₂e heißt: Auch Gase wie Methan sind auf die Wirkung von CO₂ umgerechnet.',
      body: (b) => (
        <>
          Jede Frage an den Grünerator landet auf Servern in einem Rechenzentrum.{' '}
          {b(formatCount(f.requests))} Anfragen waren es in den letzten {f.days} Tagen. Grafikkarten
          schreiben die Antwort. Dafür brauchen sie Strom: rund {b(formatEnergy(f.whPerRequest))}{' '}
          pro Anfrage, Kühlung und Gebäude eingerechnet. Zusammen sind das{' '}
          {b(formatEnergy(f.energyWh))}. Wo dieser Strom erzeugt wird, entsteht CO₂, im Schnitt etwa{' '}
          {b(`${wholeNumber(f.gramsPerKwh)} g`)} pro Kilowattstunde. Unterm Strich:{' '}
          {b(`${g(f.emissionsG)} CO₂e`, 'large')}
        </>
      ),
    },
    {
      key: 'wieviel',
      title: 'Wie viel ist das?',
      tone: 'mint',
      clouds: 'var(--nh-cloud)',
      horizon: (
        <Road
          signs={[
            { value: distance(f.carKm), label: `Autofahrt für ${g(f.emissionsG)} CO₂` },
            { value: g(f.gramsPerRequest), label: 'CO₂ pro Frage' },
            { value: g(f.gramsPerDay), label: 'CO₂ jeden Tag' },
          ]}
        />
      ),
      body: (b) => (
        <>
          {g(f.emissionsG)} CO₂ stößt ein Auto auf {b(distance(f.carKm))} aus. Verteilt auf alle
          Anfragen sind es nur {b(g(f.gramsPerRequest))} pro Frage. Der Strom dafür reicht für eine
          10-Watt-LED rund {formatMinutes(f.ledMinutesPerRequest)} lang. Erst die Masse macht es:
          Jeden Tag kommen im Schnitt {b(g(f.gramsPerDay))} zusammen.
        </>
      ),
    },
    wobeiChapter(f),
    {
      key: 'genau',
      title: 'Wie genau ist das?',
      tone: 'mist',
      scenery: <Sun />,
      body: (b) => (
        <>
          Für {b(`${Math.round(f.measuredShare * 100)} %`)} des Stroms liefern uns die Anbieter
          eigene Werte. Auch das sind Schätzungen.
          {f.mainProvider === 'melious' && (
            <>
              {' '}
              Unser Hauptanbieter {providerLabel(f.mainProvider)} etwa rechnet nach einer festen,
              offenen Formel.
            </>
          )}{' '}
          Den Rest rechnen wir mit festen Werten pro Token oder schätzen ihn mit einer Spanne.
          Deshalb liegt das Ergebnis zwischen{' '}
          {b(`${g(f.emissionsLowG)} und ${g(f.emissionsHighG)}`)}. Wir zeigen die Mitte, nicht den
          günstigsten Wert.
          {f.unvaluedFunctions.length > 0 && (
            <>
              {' '}
              {joinList(f.unvaluedFunctions)} {f.unvaluedFunctions.length === 1 ? 'ist' : 'sind'}{' '}
              {b('nicht eingerechnet')}: Dafür liefern die Anbieter keine Daten.
            </>
          )}{' '}
          Ebenfalls nicht enthalten: {b('Training')} der Modelle, {b('Herstellung')} der Hardware
          und die {b('Datenübertragung')}.
        </>
      ),
    },
    f.marketEmissionsG === null
      ? null
      : {
          key: 'oekostrom',
          title: 'Und mit Ökostrom?',
          tone: 'paper',
          clouds: 'var(--nh-cloud-soft)',
          horizon: <SolarHorizon />,
          body: (b) => (
            <>
              Rechnet man den Ökostrom an, den unsere Rechenzentren einkaufen, sinkt unser
              Fußabdruck von {b(`${g(f.emissionsG)} auf ${g(f.marketEmissionsG ?? 0)}`)}. Offiziell
              zählen wir trotzdem den Strommix am Standort.
            </>
          ),
        },
    {
      key: 'tun',
      title: 'Was kannst du tun?',
      tone: 'mist',
      clouds: 'var(--nh-cloud)',
      horizon: <SproutHorizon />,
      body: (b) => (
        <>
          Bitte um {b('kurze Antworten')}, wenn sie dir reichen, denn Schreiben kostet am meisten.
          Sag lieber, {b('was sich ändern soll')}, statt neu zu generieren. Starte für ein neues
          Thema einen {b('neuen Chat')}, damit die KI nicht den ganzen Verlauf neu liest. Und häng
          nur an, {b('was wirklich gebraucht wird')}.
        </>
      ),
    },
  ];
  return chapters.filter((c): c is ChapterDef => c !== null);
}

/** Chapter 03 — only what the area split and token counts can actually say. */
function wobeiChapter(f: StoryFigures): ChapterDef | null {
  const { chat, images, rest } = f.groups;
  const total = chat + images + rest;
  const ratio = f.readPerWritten !== null && f.readPerWritten >= 2 ? f.readPerWritten : null;
  if (total <= 0 && ratio === null) return null;

  return {
    key: 'wobei',
    title: 'Wobei entsteht es?',
    tone: 'paper',
    clouds: 'var(--nh-cloud-soft)',
    horizon: <DatacenterHorizon />,
    note:
      ratio !== null
        ? 'Text wird in Tokens gemessen. Ein Token ist ein Wortteil, etwa drei Viertel eines Wortes.'
        : undefined,
    extra:
      total > 0 ? (
        <ShareBar
          shares={[
            { label: 'Chat', share: chat / total, color: 'var(--nh-deep)' },
            { label: 'Sharepics & Bilder', share: images / total, color: '#52907a' },
            { label: 'Alles Übrige', share: rest / total, color: 'var(--nh-glow-soft)' },
          ].filter((s) => s.share > 0)}
        />
      ) : undefined,
    body: (b) => (
      <>
        {total > 0 && chat > 0 && (
          <>
            {shareInWords(chat / total)}, {b(formatGrams(chat))},{' '}
            {chat / total >= 0.95 ? 'entsteht' : 'entstehen'} im Chat.{' '}
          </>
        )}
        {total > 0 && images > 0 && (
          <>
            {b(formatGrams(images))} gehen auf Sharepics und Bilder
            {rest > 0 ? <>, weitere {b(formatGrams(rest))} auf alles Übrige. </> : '. '}
          </>
        )}
        {ratio !== null && (
          <>
            Dabei liest die KI {b(`${wholeNumber(ratio)}-mal`)} so viel Text, wie sie schreibt.
            Trotzdem kostet das Schreiben den meisten Strom, denn jedes neue Wort wird einzeln
            berechnet.
          </>
        )}
      </>
    ),
  };
}

/* ── Seite ────────────────────────────────────────────────────────────────── */

export function NachhaltigkeitView({
  data,
  onOpenRechenweg,
}: {
  data: GetTransparencyStatsResponseDto;
  onOpenRechenweg: () => void;
}) {
  const figures = deriveFigures(data);
  const chapters = buildChapters(figures);
  const firstChapterId = 'nachhaltigkeit-kapitel-1';

  return (
    <>
      <Hero
        f={figures}
        onMore={() =>
          document
            .getElementById(firstChapterId)
            ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        }
      />
      {chapters.map((def, i) => (
        <Chapter key={def.key} number={i + 1} def={def} id={i === 0 ? firstChapterId : undefined} />
      ))}
      <section className="nh-band relative bg-[var(--nh-deep)] text-white">
        <div
          className={cn(
            INNER,
            'flex-row flex-wrap items-center justify-between gap-6 py-[clamp(56px,8vw,96px)]'
          )}
        >
          <h2 className="nh-display m-0 max-w-[600px] text-[clamp(26px,3vw,36px)] font-bold">
            Alle Faktoren, Anbieter und Modelle stehen im Rechenweg.
          </h2>
          <button
            type="button"
            onClick={onOpenRechenweg}
            className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white px-7 py-4 text-[17px] font-bold text-[#1f3a30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Zum Rechenweg
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="m-0 px-[clamp(20px,4vw,48px)] pb-8 text-center text-sm text-[var(--nh-glow-soft)]">
          Kein Wert auf dieser Seite ist einer einzelnen Person zuzuordnen. Tage mit weniger als{' '}
          {data.min_group_size} aktiven Personen entfallen.
        </p>
      </section>
    </>
  );
}
