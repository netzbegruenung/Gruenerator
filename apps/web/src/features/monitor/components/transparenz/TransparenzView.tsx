/**
 * Platform transparency — what the whole Grünerator consumes.
 *
 * One request, two renderings: "Nachhaltigkeit" tells it in six chapters,
 * "Rechenweg" lays out every factor behind it. The country and area filters
 * belong to the Rechenweg only — a `?locale=` left in a shared link must not
 * quietly narrow the story's headline number.
 */
import {
  type TransparencyFeature,
  type TransparencyLocale,
  transparencyFeatureSchema,
} from '@gruenerator/contracts';
import { cn, LoadingSection, StatusBanner } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { FEATURE_LABELS } from '../../../../utils/usageFormat';
import { useTransparencyStats } from '../../hooks/useTransparency';

import { NachhaltigkeitView } from './NachhaltigkeitView';
import {
  isTransparencyFeature,
  LOCALE_LABELS,
  TRANSPARENCY_DAYS,
  useFeatureParam,
  useRechenwegParam,
  useTransparencyLocaleParam,
} from './params';
import { RechenwegView } from './RechenwegView';
import './nachhaltigkeit.css';

const PILL_TRACK = 'flex items-center gap-1 rounded-full bg-[var(--nh-mint)] p-1';
const PILL = 'min-h-9 rounded-full px-3.5 text-[14px] font-semibold';

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(PILL, active ? 'bg-[var(--nh-deep)] text-white' : 'text-[var(--nh-ink)]')}
    >
      {children}
    </button>
  );
}

function RechenwegHeader({
  onBack,
  locale,
  setLocale,
  localeAvailable,
  feature,
  setFeature,
}: {
  onBack: () => void;
  locale: TransparencyLocale | null;
  setLocale: (l: TransparencyLocale | null) => void;
  localeAvailable: boolean;
  feature: TransparencyFeature | null;
  setFeature: (f: TransparencyFeature | null) => void;
}) {
  return (
    <header className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-[var(--nh-accent)]"
      >
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
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Zurück zur Übersicht
      </button>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <h1 className="nh-display m-0 text-[clamp(36px,5vw,56px)] font-black leading-none">
            Rechenweg
          </h1>
          <p className="m-0 mt-3 text-[16px] text-[var(--nh-muted)]">
            Alle Zahlen, Faktoren und Annahmen hinter der Nachhaltigkeitsseite, für die letzten{' '}
            {TRANSPARENCY_DAYS} Tage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {localeAvailable && (
            <div className={PILL_TRACK} role="group" aria-label="Land">
              <Pill active={locale === null} onClick={() => setLocale(null)}>
                Alle
              </Pill>
              {(Object.keys(LOCALE_LABELS) as TransparencyLocale[]).map((entry) => (
                <Pill key={entry} active={locale === entry} onClick={() => setLocale(entry)}>
                  {LOCALE_LABELS[entry]}
                </Pill>
              ))}
            </div>
          )}
          <label className={cn(PILL_TRACK, 'pl-3.5 text-[14px] text-[var(--nh-muted)]')}>
            Bereich
            <select
              value={feature ?? ''}
              onChange={(e) =>
                setFeature(isTransparencyFeature(e.target.value) ? e.target.value : null)
              }
              className="min-h-9 rounded-full border-0 bg-[var(--nh-card)] px-3 text-[14px] font-semibold text-[var(--nh-ink)]"
            >
              <option value="">Alle Bereiche</option>
              {transparencyFeatureSchema.options.map((entry) => (
                <option key={entry} value={entry}>
                  {FEATURE_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}

/**
 * Not an error and not an empty state: the platform HAS data, it is just too
 * thin to publish without pointing at individuals.
 */
function TooFewPeople({
  feature,
  locale,
  minGroupSize,
}: {
  feature: TransparencyFeature | null;
  locale: TransparencyLocale | null;
  minGroupSize: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--nh-line)] bg-[var(--nh-card)] p-7">
      <p className="m-0 text-[17px] font-bold">
        Zu wenige Personen für eine veröffentlichbare Zahl
      </p>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-[var(--nh-muted)]">
        {feature ? (
          <>
            Für den Bereich „{FEATURE_LABELS[feature]}“
            {locale ? ` in ${LOCALE_LABELS[locale]}` : ''} gibt es in den letzten{' '}
            {TRANSPARENCY_DAYS} Tagen keinen Tag, der sich veröffentlichen lässt.
          </>
        ) : (
          <>
            In den letzten {TRANSPARENCY_DAYS} Tagen waren
            {locale ? ` aus ${LOCALE_LABELS[locale]}` : ''} weniger als {minGroupSize} Personen
            aktiv. Ein Wert aus so wenigen Personen beschreibt einzelne Nachmittage, nicht die
            Plattform. Deshalb zeigen wir hier nichts.
          </>
        )}
      </p>
    </div>
  );
}

export function TransparenzView() {
  const { rechenweg, setRechenweg } = useRechenwegParam();
  const {
    locale: localeParam,
    setLocale,
    available: localeAvailable,
  } = useTransparencyLocaleParam();
  const { feature: featureParam, setFeature } = useFeatureParam();
  const locale = rechenweg ? localeParam : null;
  const feature = rechenweg ? featureParam : null;
  const { data, isLoading, isError } = useTransparencyStats(TRANSPARENCY_DAYS, locale, feature);

  const content = isLoading ? (
    <LoadingSection label="Verbrauchsdaten werden geladen..." />
  ) : isError || !data ? (
    <StatusBanner variant="error">
      Die Transparenzdaten konnten nicht geladen werden. Bitte versuche es später erneut.
    </StatusBanner>
  ) : !data.sufficient_data ? (
    <TooFewPeople feature={feature} locale={locale} minGroupSize={data.min_group_size} />
  ) : null;

  if (!rechenweg) {
    if (content)
      return (
        <div className="mx-auto max-w-[1120px] px-[clamp(20px,4vw,48px)] py-16">{content}</div>
      );
    return data ? (
      <NachhaltigkeitView data={data} onOpenRechenweg={() => setRechenweg(true)} />
    ) : null;
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-[clamp(16px,4vw,48px)] pb-16 pt-[clamp(20px,5vw,44px)]">
      <RechenwegHeader
        onBack={() => setRechenweg(false)}
        locale={localeParam}
        setLocale={setLocale}
        localeAvailable={localeAvailable}
        feature={featureParam}
        setFeature={setFeature}
      />
      {content ?? (data && <RechenwegView data={data} feature={feature} />)}
    </div>
  );
}
