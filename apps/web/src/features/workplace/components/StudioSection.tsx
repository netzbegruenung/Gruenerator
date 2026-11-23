import { sharepicVorlageThumbPath } from '@gruenerator/contracts';
import { cn } from '@gruenerator/ui';
import { type ReactNode, useEffect, useRef } from 'react';
import { HiPlay } from 'react-icons/hi2';
import { PiFilmSlate, PiMusicNotes, PiTextT } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { DASH_CARD } from '../../../components/dashboard/dashboardStyles';
import { usePopularVorlagen } from '../../vorlagen/hooks/usePopularVorlagen';

import { SECTION_LINK } from './arbeitenGrid';
import { ArbeitenSection } from './ArbeitenSections';

import { getToolTheme } from '@/config/toolTheme';

const HEADING = 'm-0 text-xl font-bold leading-tight text-foreground-heading md:text-2xl';
const SUB = 'm-0 mt-1.5 text-base text-(--dash-mg-sub)';

/** The Network Information API (Chromium only; Safari and Firefox leave it out). */
type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Whether a looping film is worth its bytes here: not with reduced motion, not with
 * data saver on, not on a 2G connection. Without network information (Safari) the
 * still stays until the film can play.
 */
function filmWanted(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (connection?.saveData) return false;
  return !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

/** Plays a muted loop while at least half of it is on screen, if `filmWanted`. */
function useAutoplayInView() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !filmWanted()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/**
 * The Sharepic launch film in a phone. A 360 px cut without sound (235 KB, the
 * original is 1.5 MB): the phone is 118 px wide. `preload="none"`: nothing loads
 * until the film starts; until then, and when it never does, the poster shows.
 */
function SharepicPhone() {
  const ref = useAutoplayInView();
  return (
    <div
      aria-hidden
      className="aspect-[9/16] w-[118px] shrink-0 rotate-2 rounded-[22px] bg-[#111] p-1 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out hover:-translate-y-2 hover:rotate-0 motion-reduce:transition-none"
    >
      <video
        ref={ref}
        src="/videos/sharepic-launch-hochkant-klein.mp4"
        poster="/videos/sharepic-launch-hochkant-klein-poster.webp"
        muted
        loop
        playsInline
        preload="none"
        className="size-full rounded-[18px] object-cover"
      />
    </div>
  );
}

// Clips per track as [start, width] in percent of the timeline, as in VideoEditorBetaDialog.
const TRACKS = [
  {
    kind: 'video',
    icon: PiFilmSlate,
    clips: [
      [0, 34],
      [36, 26],
      [64, 36],
    ],
    tone: 'bg-primary-500',
  },
  {
    kind: 'text',
    icon: PiTextT,
    clips: [
      [8, 22],
      [44, 30],
    ],
    tone: 'bg-secondary-400',
  },
  {
    kind: 'audio',
    icon: PiMusicNotes,
    clips: [[0, 100]],
    tone: 'bg-primary-300 dark:bg-primary-700',
  },
] as const;

/** A drawn editor: the preview over three tracks; the playhead runs across on hover. */
function EditorMock() {
  return (
    <div
      aria-hidden
      className="group/editor flex w-full max-w-[232px] shrink-0 flex-col gap-2 rounded-xl bg-white p-2.5 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:bg-grey-900 dark:ring-white/10"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg">
        <img
          src="/arbeiten-previews/video.webp"
          alt=""
          loading="lazy"
          className="size-full object-cover dark:brightness-[.8]"
        />
        <span className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-white/90 text-grey-900 shadow-md">
          <HiPlay className="ml-0.5 size-5" />
        </span>
      </div>
      <div className="relative flex flex-col gap-1.5">
        {TRACKS.map((track) => (
          <div key={track.kind} className="flex items-center gap-1.5">
            <track.icon className="size-3.5 shrink-0 text-grey-500" />
            <div className="relative h-4 flex-1 rounded bg-grey-100 dark:bg-grey-800">
              {track.clips.map(([left, width]) => (
                <span
                  key={left}
                  className={cn('absolute inset-y-0.5 rounded-sm', track.tone)}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              ))}
            </div>
          </div>
        ))}
        {/* The playhead; the track icons take 1.25rem on the left. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 left-5">
          <span className="absolute inset-y-0 left-[18%] w-0.5 rounded-full bg-grey-900 transition-[left] duration-[1600ms] ease-linear group-hover/editor:left-[96%] motion-reduce:transition-none dark:bg-white" />
        </div>
      </div>
    </div>
  );
}

const SHEET =
  'absolute bottom-0 aspect-[4/5] w-[116px] overflow-hidden rounded-lg shadow-[0_14px_28px_-12px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out motion-reduce:transition-none';

// Left, right, front: the front sheet sits on top and lifts on hover, the others spread.
const FAN = [
  {
    place: 'left-0 -rotate-12 group-hover/fan:-translate-x-2 group-hover/fan:-rotate-[16deg]',
    fallback: 'bg-primary-600',
  },
  {
    place: 'right-0 rotate-12 group-hover/fan:translate-x-2 group-hover/fan:rotate-[16deg]',
    fallback: 'bg-secondary-400',
  },
  {
    place: 'left-1/2 z-10 -translate-x-1/2 group-hover/fan:-translate-y-2',
    fallback: 'bg-primary-200 dark:bg-primary-800',
  },
] as const;

/**
 * The three most popular Grünerator-Vorlagen fanned out, as in „Beliebte
 * Sharepic-Vorlagen" in the Studio. Plain coloured sheets until they have loaded,
 * or if there are none.
 */
function VorlagenFan() {
  const { data } = usePopularVorlagen(FAN.length);
  const thumbs = (data ?? []).map(({ vorlage }) =>
    sharepicVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion)
  );
  return (
    <div aria-hidden className="group/fan relative h-[150px] w-[220px]">
      {FAN.map((sheet, i) => (
        <span key={sheet.place} className={cn(SHEET, sheet.place, sheet.fallback)}>
          {thumbs[i] && (
            // Eager, not lazy: the list arrives with the page, so the pictures are
            // loaded before anyone scrolls down to them.
            <img
              src={thumbs[i]}
              alt=""
              loading="eager"
              decoding="async"
              className="size-full object-cover"
            />
          )}
        </span>
      ))}
    </div>
  );
}

/** One promotion card: the picture on a tinted stage on top, then heading and line. */
function PromoCard({
  title,
  badge,
  text,
  picture,
  theme,
}: {
  title: string;
  badge?: string;
  text: string;
  picture: ReactNode;
  /** `toolTheme` key for the stage's tint. */
  theme: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-2xl md:rounded-[20px]',
        DASH_CARD
      )}
    >
      <div
        className={cn(
          'flex h-56 items-center justify-center overflow-hidden px-6',
          getToolTheme(theme)?.tile
        )}
      >
        {picture}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className={cn(HEADING, 'flex flex-wrap items-center gap-2')}>
          {title}
          {badge && (
            <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs leading-tight font-bold text-white">
              {badge}
            </span>
          )}
        </h3>
        <p className={SUB}>{text}</p>
      </div>
    </div>
  );
}

/**
 * „Gestalte grüne Inhalte" on the Arbeiten tab: three cards of equal weight, Sharepics
 * from the chat, the Vorlagen and the Video-Editor. One way in: „Zum Studio".
 */
export function StudioSection() {
  return (
    <ArbeitenSection
      title="Gestalte grüne Inhalte"
      action={
        <Link to="/studio" className={SECTION_LINK}>
          Zum Studio
        </Link>
      }
    >
      <div className="dashboard-surface dashboard-neutral grid grid-cols-1 gap-4 md:grid-cols-3">
        <PromoCard
          title="Sharepics im Chat"
          text="Thema nennen, Entwürfe bekommen und im Editor anpassen."
          picture={<SharepicPhone />}
          theme="canvas-ki"
        />
        <PromoCard
          title="Vorlagen"
          text="Fertige Designs für Sharepics und Drucksachen: aussuchen und anpassen."
          picture={<VorlagenFan />}
          theme="docs"
        />
        <PromoCard
          title="Video-Editor"
          badge="Neu"
          text="Reels schneiden, mit Text und Musik. Direkt im Browser."
          picture={<EditorMock />}
          theme="studio-videoeditor"
        />
      </div>
    </ArbeitenSection>
  );
}
