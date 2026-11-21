import { hasNativeHost } from '@gruenerator/shared';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useHostAwareBack } from '../../hooks/useHostAwareBack';
import { downloadBlob } from '../../utils/downloadFile';

import { editorAppSrc, VIDEO_EDITOR_APP_PATH } from './editorAppSrc';
import VideoEditorBetaDialog from './VideoEditorBetaDialog';

/**
 * The full video editor, the second video path in the Studio next to Untertitel.
 * Open to everyone as a beta: the first visit shows VideoEditorBetaDialog.
 *
 * The editor is a separate application from a private repository (it is built on
 * proprietary code that must not enter this AGPL codebase). It is served
 * same-origin under VIDEO_EDITOR_APP_PATH — by nginx in production, by the Vite
 * dev proxy locally — so it shares the session cookie and calls /api directly.
 */
export { VIDEO_EDITOR_APP_PATH };

/**
 * Where this page offers the editor in the iframe what only the page can do
 * (F0: the deployed editor reads this name). Same origin, so the editor calls
 * it directly on `window.parent`; its side is `src/host.ts` in the editor repo.
 * An older page without it leaves the editor on its own anchor download.
 */
export const VIDEO_EDITOR_HOST_GLOBAL = '__GRUENERATOR_VIDEO_EDITOR_HOST__';

export interface VideoEditorHost {
  /**
   * Hands an exported file to the user through `downloadBlob`, which in the
   * mobile app sends it to the native host in pieces. A click on an anchor
   * inside the iframe does nothing there.
   */
  saveFile: (blob: Blob, filename: string) => Promise<void>;
  /** Leaves the editor: back in the browser, `CLOSE` in the app. */
  close: () => void;
  /** True inside the mobile app, where backgrounding stops an export. */
  inApp: boolean;
}

/** localStorage key (F0): set once the beta notice was closed. */
export const BETA_NOTICE_SEEN_KEY = 'videoeditor-beta-notice-seen';

function betaNoticeSeen(): boolean {
  try {
    return localStorage.getItem(BETA_NOTICE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** `ki:<id>:<version>` only for a KI-Schnitt hand-off that names both; it dedupes the project. */
function sourceRefFor(search: string): string | null {
  const params = new URLSearchParams(search);
  const ki = params.get('ki');
  const v = params.get('v');
  return ki && v ? `ki:${ki}:${v}` : null;
}

export default function VideoEditorPage() {
  const { slug } = useParams<{ slug: string }>();
  return slug ? <VideoEditorFrame slug={slug} /> : <CreateVideoProject />;
}

/** No slug in the route: make (or find, via source_ref) the server project, then move to its URL. */
function CreateVideoProject() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const create = useMutation({
    mutationFn: async () => {
      const sourceRef = sourceRefFor(search);
      const result = await getContractsClient().videoProjects.create({
        body: sourceRef ? { source_ref: sourceRef } : {},
      });
      if (result.status !== 201) throw new Error('create video project failed');
      return result.body.project;
    },
    onSuccess: (project) => {
      void navigate(`/studio/videoeditor/${project.slug}${search}`, { replace: true });
    },
  });

  useEffect(() => {
    // StrictMode runs effects twice in dev; one project per visit.
    if (started.current) return;
    started.current = true;
    create.mutate();
  }, [create]);

  if (create.isError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert">Das Projekt konnte nicht angelegt werden.</p>
        <div className="flex items-center gap-4">
          <button type="button" className="underline" onClick={() => create.mutate()}>
            Erneut versuchen
          </button>
          <Link to="/studio" className="underline">
            Zurück zum Studio
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <p role="status">Projekt wird angelegt …</p>
    </div>
  );
}

function VideoEditorFrame({ slug }: { slug: string }) {
  const { search } = useLocation();
  // Read once: the frame keeps its document; changing src later would reload the editor.
  const [src] = useState(() => editorAppSrc(search, slug));
  const [betaNoticeOpen, setBetaNoticeOpen] = useState(() => !betaNoticeSeen());
  const close = useHostAwareBack('/studio');

  useEffect(() => {
    const host: VideoEditorHost = { saveFile: downloadBlob, close, inApp: hasNativeHost() };
    const slot = window as unknown as Record<string, unknown>;
    slot[VIDEO_EDITOR_HOST_GLOBAL] = host;
    return () => {
      if (slot[VIDEO_EDITOR_HOST_GLOBAL] === host) delete slot[VIDEO_EDITOR_HOST_GLOBAL];
    };
  }, [close]);

  const closeBetaNotice = (open: boolean) => {
    if (open) return;
    setBetaNoticeOpen(false);
    try {
      localStorage.setItem(BETA_NOTICE_SEEN_KEY, '1');
    } catch {
      // Private mode: the notice simply shows again next time.
    }
  };

  return (
    <>
      <iframe
        src={src}
        title="Grünerator Video-Editor"
        className="block h-dvh w-full border-0"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
      />
      <VideoEditorBetaDialog open={betaNoticeOpen} onOpenChange={closeBetaNotice} />
    </>
  );
}
