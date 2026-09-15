import {
  ArtifactPanel,
  ChatThreadRouting,
  GrueneratorThread,
  ReelArtifactPanel,
  SharepicArtifactPanel,
  setMentionInstance,
  setMentionLandesverbaende,
  setMentionLocale,
  useAgentStore,
  useChatRuntimeReady,
  useDockedPanelActive,
  useReportPanelDockable,
  useUserAgentsRegistry,
  useUserLandesverbaende,
} from '@gruenerator/chat';
import {
  getLandesverbandHubBySlug,
  getSystemAgent,
  resolveAgentSlug,
  resolveSkillMention,
} from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
import { useContainerWidth, useIsNarrowerThan } from '@gruenerator/ui';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { CURRENT_INSTANCE } from '@/config/instance';
import { useUserAgents } from '@/features/agents/api';
import ChatHero from '@/features/chat/ChatHero';
import { LandesverbandHub } from '@/features/chat/LandesverbandHub';
import { useGroupDetails } from '@/features/groups/hooks/useGroups';
import { resolveChatBackground } from '@/features/workplace/chatBackgrounds';
import { useFirstName } from '@/hooks/useFirstName';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';
import { isDesktopApp } from '@/utils/platform';

import '@/features/workplace/workplace-sunrise.css';

/**
 * AT users get this notebook when their selected agent doesn't pin its own.
 * Keeps `@notebook` lookups and RAG aligned to gruene.at content instead of
 * silently retaining whichever (likely DE) notebook the user picked last.
 * DE has no equivalent single-notebook default — DE keeps its current behavior
 * (no auto-switch when the agent has no preference).
 */
const AT_DEFAULT_NOTEBOOK_ID = 'oesterreich-notebook';

// Instance-filter the @-mention notebook picker. Set at module scope rather than
// in an effect: unlike the locale, the instance is fixed for the lifetime of the
// bundle, and the picker may be read before this component ever mounts.
setMentionInstance(CURRENT_INSTANCE);

/**
 * The in-thread composer: the slim pill in the browser, the taller card in the
 * desktop shell.
 *
 * The two run the same bundle, so this is not a build-time difference — but it
 * is a fixed one per install, which is why it is read once at module scope
 * rather than per render.
 *
 * The pill is the same shape the new-chat hero already wears, so sending a
 * first message no longer swaps the composer under the cursor. The desktop app
 * keeps the card: it is a window someone leaves open, and the toolbar row that
 * the card gives its own line stays legible there.
 */
const COMPOSER_VARIANT = isDesktopApp() ? 'card' : 'pill';

/**
 * Ab welcher Breite ein Artefakt als angedockte Schiene neben dem Faden steht,
 * statt sich als Schiene über ihn zu legen: die 24rem der Schiene plus 48rem,
 * die dem Faden bleiben müssen.
 *
 * Gemessen wird die Chat-Spalte, nicht das Fenster. Dieselbe Oberfläche steckt
 * als schmales Panel in den Editoren — dort ist ein 1440px breites Fenster kein
 * Beleg dafür, dass 24rem übrig sind.
 */
const ARTIFACT_DOCK_MIN_WIDTH = 72 * 16;

// Default/minimum docked width — the panel only grows from here via the
// resize handle, it never gets narrower than the original fixed width.
const ARTIFACT_PANEL_DEFAULT_WIDTH = 24 * 16;
// Per-keypress growth for the ArrowLeft/ArrowRight keyboard resize (WAI-ARIA
// "window splitter" pattern — the handle must be operable without a pointer).
const ARTIFACT_PANEL_RESIZE_KEY_STEP = 32;

const ARTIFACT_PANEL_DOCKED =
  'flex w-[var(--gr-artifact-panel-width,24rem)] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt';
// Zu schmal zum Andocken heißt nicht Vollbild: die Schiene legt sich rechts
// über den Faden, der Chat bleibt daneben sichtbar und antippbar.
const ARTIFACT_PANEL_OVERLAY =
  'fixed inset-y-0 right-0 z-[1010] flex w-[min(24rem,85vw)] flex-col overflow-hidden border-l border-border bg-background-alt shadow-2xl';

function ChatPage() {
  const [searchParams] = useSearchParams();
  // `slug` comes from /agents/:slug, `threadSlug` from /chat/:threadSlug.
  const { slug, threadSlug } = useParams<{ slug?: string; threadSlug?: string }>();
  const navigate = useNavigate();
  // False while the lazy assistant-ui runtime chunk is still loading (or in the
  // Suspense fallback on a cold direct load of /chat). Gating the runtime-using
  // content below on it keeps useAui() from running outside the provider —
  // the "requires an AuiProvider" prod crash.
  const runtimeReady = useChatRuntimeReady();
  const shellRef = useRef<HTMLDivElement>(null);
  const shellNarrow = useIsNarrowerThan(shellRef, ARTIFACT_DOCK_MIN_WIDTH);
  const shellWidth = useContainerWidth(shellRef);
  const artifactPanelClass = shellNarrow ? ARTIFACT_PANEL_OVERLAY : ARTIFACT_PANEL_DOCKED;
  const dockedPanelActive = useDockedPanelActive();

  // Dieselbe Messung entscheidet auch, ob ein eingehendes Artefakt die Schiene
  // von selbst aufziehen darf — der SSE-Parser kann sie nicht selbst anstellen.
  useReportPanelDockable(!shellNarrow);

  // User-resizable docked panel width, grown by dragging the handle left.
  // Never below the original fixed width, never past half the chat column —
  // the thread needs to stay usable, not just "not fully covered".
  const [panelWidthPx, setPanelWidthPx] = useState(ARTIFACT_PANEL_DEFAULT_WIDTH);
  const maxPanelWidthPx = Math.max(ARTIFACT_PANEL_DEFAULT_WIDTH, Math.floor(shellWidth / 2));
  const clampedPanelWidthPx = Math.min(panelWidthPx, maxPanelWidthPx);

  // Drag state lives in a ref, not closed-over locals: with pointer capture,
  // move/end fire as React prop callbacks on the handle itself (see below),
  // so they need to read the values `start` captured without re-subscribing
  // per render.
  const panelResizeRef = useRef<{ startX: number; startWidth: number; maxWidth: number } | null>(
    null
  );

  const handlePanelResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // The docked panel is mostly an <iframe>; plain window-level listeners
      // stop receiving events the moment the pointer crosses into it (a
      // shrink-drag moves back toward the panel almost immediately) because
      // the iframe has its own document. Capturing the pointer on the handle
      // retargets all of its events here regardless of what's underneath.
      e.currentTarget.setPointerCapture(e.pointerId);
      panelResizeRef.current = {
        startX: e.clientX,
        startWidth: clampedPanelWidthPx,
        maxWidth: Math.max(
          ARTIFACT_PANEL_DEFAULT_WIDTH,
          Math.floor((shellRef.current?.clientWidth ?? 0) / 2)
        ),
      };
    },
    [clampedPanelWidthPx]
  );

  const handlePanelResizeMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelResizeRef.current;
    if (!drag) return;
    // The handle sits at the panel's left edge — dragging it further left
    // (smaller clientX) grows the panel.
    const next = drag.startWidth + (drag.startX - e.clientX);
    setPanelWidthPx(Math.min(drag.maxWidth, Math.max(ARTIFACT_PANEL_DEFAULT_WIDTH, next)));
  }, []);

  const handlePanelResizeEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    panelResizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // WAI-ARIA "window splitter" pattern: a separator that resizes layout must
  // be operable from the keyboard, not pointer-only.
  const handlePanelResizeKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const dragMaxWidth = Math.max(
      ARTIFACT_PANEL_DEFAULT_WIDTH,
      Math.floor((shellRef.current?.clientWidth ?? 0) / 2)
    );
    setPanelWidthPx((current) => {
      const next =
        e.key === 'ArrowLeft'
          ? current + ARTIFACT_PANEL_RESIZE_KEY_STEP
          : current - ARTIFACT_PANEL_RESIZE_KEY_STEP;
      return Math.min(dragMaxWidth, Math.max(ARTIFACT_PANEL_DEFAULT_WIDTH, next));
    });
  }, []);

  const shellStyle = useMemo(
    () => ({ '--gr-artifact-panel-width': `${clampedPanelWidthPx}px` }) as CSSProperties,
    [clampedPanelWidthPx]
  );
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const currentThreadTitle = useAgentStore((s) => s.currentThreadTitle);
  const firstName = useFirstName();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  // The background the user picked in /profile/aussehen. The hero below wears
  // it in full; the thread wears only the band derived from it. Resolved here
  // rather than in ChatHero because both branches need the answer — and because
  // the hero used to hardcode `sunrise`, which meant a pick made on /workplace
  // did not show on /chat.
  const chatBackground = resolveChatBackground(useAuthStore((s) => s.user?.chat_background));
  const { data: userAgents } = useUserAgents();
  // Bridge the user-agents query into the chat package so its welcome screen
  // and message avatars can resolve a user agent's title/icon by identifier.
  const setRegistryAgents = useUserAgentsRegistry((s) => s.setUserAgents);
  useEffect(() => {
    if (userAgents) setRegistryAgents(userAgents);
  }, [userAgents, setRegistryAgents]);
  // Locale-filter the @-mention / skill picker (de-DE/de-AT/all), matching the
  // agent audience rule.
  useEffect(() => {
    setMentionLocale(userLocale);
  }, [userLocale]);
  // Dasselbe für die Landesverbands-Zuteilung: der Picker bietet LV-Rezepte und
  // -Notebooks nur denen an, die laut Profilrolle in der Landesgeschäftsstelle
  // dieses Landesverbands arbeiten. Ohne diese Rolle sind sie nicht im Menü;
  // solange die Rollen nicht geladen sind (`lvIds === null`) wird nicht
  // gefiltert. Auflösung bleibt davon unberührt — ein `@bayern` in einem alten
  // Thread muss für alle weiter auflösen.
  const { lvIds } = useUserLandesverbaende();
  useEffect(() => {
    setMentionLandesverbaende(lvIds);
  }, [lvIds]);
  // The agent we've already auto-applied a default notebook for. Prevents the
  // effect from re-applying (and clobbering a manual notebook pick) when the
  // `userAgents` query reference changes on an unrelated cache invalidation.
  const notebookAppliedForRef = useRef<string | null>(null);
  // A Landesverband hub slug (`gruene-berlin`) opens a landing offering both LV
  // agents instead of resolving straight to one. Checked first so the slug
  // never falls through to agent resolution (which would bind a bogus agent).
  // Mit Instanz: ohne sie fällt der Standardwert auf `production` zurück, und
  // eine Instanz, die einen Landesverband wirklich sperrt, bekäme seine Landing
  // samt drei funktionsfähiger Agenten trotzdem.
  const hub = slug ? getLandesverbandHubBySlug(slug, CURRENT_INSTANCE) : null;
  // Agentura skill links land on `/chat?skill=<mention>` (e.g. presse-bayern).
  // Resolve the mention to its agent identifier so the agent activates and its
  // own welcome screen (welcomeQuestion + opening-question examples) renders
  // instead of the generic overview greeting. Lowest priority in the chain so
  // an explicit ?agent= or path slug still wins.
  const skillParam = hub ? null : searchParams.get('skill');
  const resolvedFromSkill = skillParam ? resolveSkillMention(skillParam) : null;
  // Path-based /agents/:slug is the canonical form; ?agent= is legacy but
  // still wins when explicitly set so old deep links keep their behavior.
  const agentParam = hub
    ? null
    : (searchParams.get('agent') ?? (slug ? resolveAgentSlug(slug) : null) ?? resolvedFromSkill);
  const rawModeParam = searchParams.get('mode');
  const modeParam =
    rawModeParam === 'search' || rawModeParam === 'notebook' || rawModeParam === 'eigener'
      ? rawModeParam
      : null;

  // When the URL carries an agent/mode param or a thread deep link, jump
  // straight into the thread — otherwise users land on the new-chat hero
  // first and have no idea their click on a sidebar agent entry "did anything".
  // For deep links this also keeps the hero's ChatInner (which resets chat
  // context and switches to a new thread on mount) from racing the thread
  // resolution.
  const effectiveViewMode = agentParam || threadSlug || modeParam ? 'thread' : chatViewMode;

  useDocumentTitle(hub ? hub.name : effectiveViewMode === 'thread' ? currentThreadTitle : null);

  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentParam) {
      if (store.selectedAgentId !== agentParam) {
        store.setSelectedAgent(agentParam);
        store.setChatViewMode('thread');
      }
      // Auto-pair the agent's FIRST bound notebook into the composer chip — but
      // only ONCE per agent, not on every effect run. The agent's full notebook
      // set scopes search server-side (resolved from the agent record in
      // ChatGraph); the chip just shows one for continuity. System agents (per-LV
      // PR agents etc.) resolve synchronously; user-created agents resolve from
      // the user-agents list (which may load late), so we wait until it's
      // available before marking this agent handled. Applying once avoids
      // clobbering a manual notebook pick when the query reference changes later.
      if (notebookAppliedForRef.current !== agentParam) {
        const agentMeta = getSystemAgent(agentParam);
        const userAgentNotebook = agentMeta
          ? undefined
          : userAgents?.find((a) => a.identifier === agentParam)?.defaultNotebookIds?.[0];
        const boundNotebookId = agentMeta?.defaultNotebookIds?.[0] ?? userAgentNotebook;
        // "Resolved" = a system agent (sync) or the user-agents list has loaded.
        const resolved = !!agentMeta || userAgents !== undefined;
        if (boundNotebookId) {
          if (store.selectedNotebookId !== boundNotebookId) {
            store.setSelectedNotebook(boundNotebookId);
          }
          notebookAppliedForRef.current = agentParam;
        } else if (resolved) {
          // AT-first: agents without an explicit notebook pair with the
          // Österreich notebook so RAG / @notebook queries stay in-locale.
          if (userLocale === 'de-AT' && store.selectedNotebookId !== AT_DEFAULT_NOTEBOOK_ID) {
            store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
          }
          notebookAppliedForRef.current = agentParam;
        }
        // else: user agent whose data hasn't loaded yet — wait for the next run.
      }
    } else if (!threadSlug) {
      // Not on a thread deep link: /chat without agent context is a blank
      // slate. With a threadSlug the agent is restored from the thread row
      // (ChatThreadRouting) and must not be wiped by a late userAgents re-run.
      notebookAppliedForRef.current = null;
      if (store.selectedAgentId !== null) {
        store.resetChatContext();
      }
    }
    if (modeParam && store.threadMode !== modeParam) {
      store.setThreadMode(modeParam);
      store.setChatViewMode('thread');
    }
  }, [agentParam, modeParam, threadSlug, userLocale, userAgents]);

  // "Neuer Chat in diesem Projekt" arrives as /chat?projekt=<groupId>. File the
  // freshly created thread into that Projekt, reusing the same thread-groupId
  // PATCH as MoveToSpaceDialog. Guards against mis-filing:
  //  - baseline: never file the thread that was already active when armed.
  //  - live `projektParam`: only file while the intent is still in the URL.
  //    Navigating to an EXISTING chat drops ?projekt= first (the URL becomes
  //    /chat/<slug>), so an unrelated chat opened next is never captured; a
  //    freshly created thread updates currentThreadId while ?projekt= is still
  //    present (canonicalization to the pretty slug happens a tick later).
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const projektParam = searchParams.get('projekt');
  const { data: projektDetails } = useGroupDetails(projektParam);
  const projektName = projektDetails?.group.name ?? null;
  const projektBaselineThreadRef = useRef<string | null>(null);
  const projektFiledThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projektParam) return;
    projektBaselineThreadRef.current = useAgentStore.getState().currentThreadId;
  }, [projektParam]);
  useEffect(() => {
    if (!projektParam || !currentThreadId) return;
    if (currentThreadId === projektBaselineThreadRef.current) return;
    if (projektFiledThreadRef.current === currentThreadId) return;
    projektFiledThreadRef.current = currentThreadId;
    void getContractsClient()
      .threads.update({ body: { threadId: currentThreadId, groupId: projektParam } })
      .then((res) => {
        if (res.status === 200) {
          try {
            window.dispatchEvent(new CustomEvent('gruenerator:space-threads-changed'));
          } catch {
            // no window (SSR) — ignore
          }
        }
      })
      .catch(() => {
        // Filing is best-effort; the chat itself already exists.
      });
  }, [currentThreadId, projektParam]);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const handleNavigateToThread = useCallback(
    (slugPath: string) => {
      // Always a replace: this only ever canonicalizes the URL for a thread the
      // runtime is already on (a draft that just minted, a generated title).
      // Clicking a thread is the only thing that pushes, so Back walks the
      // threads the user actually visited and can never replay an oscillation.
      void navigate(`/chat/${slugPath}`, { replace: true });
    },
    [navigate]
  );
  const handleThreadGone = useCallback(() => {
    // Land on the new-chat hero, not on whatever thread is still current.
    useAgentStore.getState().setChatViewMode('overview');
    void navigate('/chat', { replace: true });
  }, [navigate]);
  const handleLeaveThread = useCallback(() => {
    // The runtime moved to a fresh draft on its own (agent switch). The thread
    // still exists, so this is not "gone" — just follow it out of the thread
    // URL and leave the view mode alone: the draft is where the user types next.
    void navigate('/chat', { replace: true });
  }, [navigate]);

  // Don't mount runtime-dependent content until the assistant-ui runtime is
  // actually present. On a cold direct load the Suspense fallback renders this
  // page without the provider; a neutral shell (matching withAuthRequired's
  // fallback) avoids the AuiProvider crash until the chunk loads.
  if (!runtimeReady) {
    return <div className="flex min-h-0 h-full bg-background" />;
  }

  return (
    <div ref={shellRef} className="flex min-h-0 h-full bg-background" style={shellStyle}>
      {!hub && (
        <ChatThreadRouting
          threadSlug={threadSlug ?? null}
          onNavigateToThread={handleNavigateToThread}
          onThreadGone={handleThreadGone}
          onLeaveThread={handleLeaveThread}
          onOpenNotebookThread={handleNavigate}
        />
      )}
      {/* `min-w-0`: ohne das ist die Mindestbreite dieses Flex-Items die
          min-content-Breite des GANZEN Threads. Eine nicht umbrechende Zeile in
          einer Tool-Karte (`truncate` = white-space: nowrap) zieht damit den
          kompletten Chat auf ihre Textbreite auf — gemessen 528 px bei 390 px
          Viewport. Weiter innen wirkt der Riegel nicht: `min-w-0` bzw.
          `overflow-hidden` am Thread-Root oder am Viewport ändern nichts, nur
          das äußerste Flex-Item zählt. Die übrigen Chat-Wirte (ChatLayout,
          Docs-/Sheets-/Presentations-/Board-Panel) sind über ihr
          `overflow-hidden` bereits abgesichert. */}
      {/* Das untere Padding trägt die Höhe der Bildschirmtastatur, die der
          Composer als --mobile-keyboard-offset veröffentlicht
          (useMobileKeyboardOffset). Diese eine Spalte um sie zu kürzen bedient
          beide Zweige darunter — im Thread hebt es den unten verankerten
          Composer über die Tastatur, in der Übersicht rückt es den zentrierten
          Hero in den noch sichtbaren Bereich. Die Variable darf genau hier
          einmal verrechnet werden; ein zweites Padding weiter innen zöge den
          Composer um die doppelte Tastaturhöhe hoch. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-4 pb-[var(--mobile-keyboard-offset,0px)] md:pt-0">
        {hub ? (
          <LandesverbandHub hub={hub} onNavigate={handleNavigate} userLocale={userLocale} />
        ) : effectiveViewMode === 'overview' ? (
          // New-chat empty state in the Workplace chat-tab design: the chosen
          // background, vertically centered greeting + pill composer.
          // `workplace-chat-accent` re-points the primary token so the send
          // button follows the preset, exactly as on the Workplace chat tab.
          <div
            className={cn(
              'workplace-chat-sunrise workplace-chat-accent',
              chatBackground.className,
              // `justify-center-safe` wie auf dem Workplace-Chat-Tab: sobald die
              // Tastatur die Spalte kürzt, überläuft der zentrierte Inhalt — bei
              // reinem `justify-center` nach oben aus dem Scrollbereich heraus
              // und damit unerreichbar.
              'flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-[6vh]'
            )}
          >
            <ChatHero projectName={projektName} />
          </div>
        ) : (
          <GrueneratorThread
            onNavigate={handleNavigate}
            firstName={firstName}
            requireProfileHydration
            enableSearch
            // `neutral` promises "kein Verlauf — nur der Seitenhintergrund", so
            // it gets no band either. Every other preset does: the band is the
            // same one regardless of which was picked, because it is the
            // composer's light and not the page's colour.
            {...(chatBackground.key === 'neutral' ? {} : { className: 'chat-thread-glow' })}
            composerVariant={COMPOSER_VARIANT}
            enablePastedTextAttachments
            userLocale={userLocale}
          />
        )}
      </div>
      {!hub && effectiveViewMode === 'thread' && !shellNarrow && dockedPanelActive && (
        // Drag handle for the docked panel's width — grows it left, capped at
        // half the chat column (see ARTIFACT_PANEL_DEFAULT_WIDTH/maxPanelWidthPx
        // above). Hidden in overlay mode (too narrow to dock, nothing to split)
        // and while no panel is showing (nothing to resize).
        <div
          role="slider"
          aria-orientation="vertical"
          aria-label="Panelbreite anpassen"
          aria-valuenow={clampedPanelWidthPx}
          aria-valuemin={ARTIFACT_PANEL_DEFAULT_WIDTH}
          aria-valuemax={maxPanelWidthPx}
          tabIndex={0}
          className="w-1 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/20 active:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
          onPointerDown={handlePanelResizeStart}
          onPointerMove={handlePanelResizeMove}
          onPointerUp={handlePanelResizeEnd}
          onPointerCancel={handlePanelResizeEnd}
          onKeyDown={handlePanelResizeKeyDown}
        />
      )}
      {!hub && effectiveViewMode === 'thread' && (
        // Sharepic-Modus: pins the active sharepic as a docked artifact while
        // the user iterates via chat. Too narrow to dock, it covers the thread
        // instead — the inline card's only effect is opening this panel, so a
        // panel that stays `display:none` makes the card a button that does
        // nothing the user can see.
        <SharepicArtifactPanel className={artifactPanelClass} />
      )}
      {!hub && effectiveViewMode === 'thread' && (
        // Reel-Modus: pins the reel video with a live subtitle overlay while
        // the user edits subtitle text via chat. Renders null unless a reel
        // is active, so it coexists with the sharepic panel.
        <ReelArtifactPanel className={artifactPanelClass} />
      )}
      {!hub && effectiveViewMode === 'thread' && (
        // Artefakt-Modus: pins a generated HTML/SVG artifact (sandboxed iframe)
        // while the user iterates via chat. Renders null unless an artifact is
        // active; opening one closes the sharepic/reel panel (single docked rail).
        <ArtifactPanel className={artifactPanelClass} />
      )}
    </div>
  );
}

export default withAuthRequired(ChatPage, {
  title: 'Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
