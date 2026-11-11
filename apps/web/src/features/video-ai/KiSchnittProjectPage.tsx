/**
 * /studio/ki-schnitt/:slug — one KI-Schnitt: progress while the worker runs,
 * then the preview (the editor app in player-only mode), correction rounds,
 * the versions, what was cut out, and the hand-off to the editor.
 */
import { type VideoAiProjectDto } from '@gruenerator/contracts';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { Button, Textarea } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Scissors, Undo2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  applyOps,
  cancelProject,
  getProject,
  handOff,
  isActive,
  projectQueryKey,
  projectsQueryKey,
  removeProject,
  revise,
  selectVersion,
  STATUS_LABEL,
} from './videoAiApi';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function isTimeMessage(data: unknown): data is { type: 'videoai:time'; seconds: number } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as { type?: unknown; seconds?: unknown };
  return d.type === 'videoai:time' && typeof d.seconds === 'number';
}

function Preview({ project, onTime }: { project: VideoAiProjectDto; onTime: (s: number) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow)
        return;
      if (isTimeMessage(event.data)) onTime(event.data.seconds);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onTime]);
  const portrait = project.brief.format === '9:16' || project.brief.format === '4:5';
  return (
    <iframe
      ref={frame}
      key={project.version}
      title={`Vorschau von „${project.title}“, Version ${project.version ?? ''}`}
      src={`/videoeditor/app/?ki=${project.id}&v=${project.version ?? 1}&ansicht=vorschau`}
      className={`block w-full rounded-xl border-0 bg-black ${portrait ? 'mx-auto aspect-[9/16] max-h-[70dvh] max-w-sm' : 'aspect-video'}`}
      allow="autoplay; fullscreen"
    />
  );
}

function ProjectBody({ project }: { project: VideoAiProjectDto }) {
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const key = projectQueryKey(project.slugSuffix);
  const store = (next: VideoAiProjectDto) => queryClient.setQueryData(key, next);
  const onError = (error: Error) => toast.error(error.message);

  const round = useMutation({
    mutationFn: () =>
      revise(project.id, { baseVersion: project.version ?? 1, feedback: feedback.trim(), times }),
    onSuccess: ({ project: next, reply }) => {
      store(next);
      setFeedback('');
      setTimes([]);
      toast.success(reply);
    },
    onError,
  });
  const restore = useMutation({
    mutationFn: (unitId: string) =>
      applyOps(project.id, {
        baseVersion: project.version ?? 1,
        ops: [{ kind: 'restore_unit', unitId }],
      }),
    onSuccess: store,
    onError,
  });
  const choose = useMutation({
    mutationFn: (v: number) => selectVersion(project.id, v),
    onSuccess: store,
    onError,
  });
  const toEditor = useMutation({
    mutationFn: () => handOff(project.id),
    onSuccess: (next) => {
      store(next);
      void navigate(`/studio/videoeditor?ki=${project.id}`);
    },
    onError,
  });
  const cancel = useMutation({
    mutationFn: () => cancelProject(project.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => removeProject(project.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void navigate('/studio/ki-schnitt');
    },
    onError,
  });

  if (isActive(project.status)) {
    return (
      <div
        role="status"
        className="mt-lg rounded-xl border border-grey-200 p-lg text-center dark:border-grey-700"
      >
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-grey-500" aria-hidden />
        <p className="mt-sm font-medium">{STATUS_LABEL[project.status]} …</p>
        <p className="mt-xs text-sm text-grey-500">
          Das dauert ein paar Minuten. Du kannst die Seite schließen; du bekommst eine
          Benachrichtigung.
        </p>
        <Button
          variant="outline"
          className="mt-md"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending}
        >
          Abbrechen
        </Button>
      </div>
    );
  }

  if (project.status !== 'ready') {
    return (
      <div
        role="alert"
        className="mt-lg rounded-xl border border-dashed border-grey-200 p-lg text-center dark:border-grey-700"
      >
        <p className="font-medium">{STATUS_LABEL[project.status]}</p>
        {project.error && <p className="mt-xs text-sm text-grey-500">{project.error}</p>}
        <Button asChild className="mt-md">
          <Link to="/studio/ki-schnitt">Neuen KI-Schnitt anlegen</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-lg grid gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-sm">
        <Preview project={project} onTime={setTime} />
        <Button className="w-full" onClick={() => toEditor.mutate()} disabled={toEditor.isPending}>
          Im Editor weiterbearbeiten
        </Button>
        <p className="text-xs text-grey-500">
          {project.handedOff
            ? 'Der KI-Schnitt liegt im Editor. Änderungen machst du jetzt dort.'
            : 'Danach endet die Korrektur mit der KI; im Editor geht alles von Hand weiter. Der Editor läuft am besten am Computer.'}
        </p>
      </div>

      <div className="space-y-lg">
        {project.warnings.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-warning-50 p-sm text-sm dark:bg-warning-950">
            {project.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {project.rationale && <p className="text-sm text-grey-500">{project.rationale}</p>}

        {!project.handedOff && (
          <section aria-labelledby={`${id}-fix`} className="space-y-xs">
            <h2 id={`${id}-fix`} className="font-semibold text-foreground-heading">
              Was soll anders werden?
            </h2>
            <Textarea
              aria-labelledby={`${id}-fix`}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Zum Beispiel: Den Satz an der Stelle raus, und das Logo ans Ende."
            />
            <div className="flex flex-wrap items-center gap-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const at = Math.round(time * 10) / 10;
                  setTimes((t) => (t.length < 5 && !t.includes(at) ? [...t, at] : t));
                }}
              >
                <Clock className="mr-xs h-4 w-4" aria-hidden /> Stelle {formatTime(time)} merken
              </Button>
              {times.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimes((list) => list.filter((x) => x !== t))}
                  className="inline-flex items-center gap-1 rounded-full bg-grey-100 px-xs py-0.5 text-xs dark:bg-grey-800"
                  aria-label={`Stelle ${formatTime(t)} entfernen`}
                >
                  @{formatTime(t)} <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
            </div>
            <Button
              onClick={() => round.mutate()}
              disabled={feedback.trim().length < 2 || round.isPending}
            >
              {round.isPending && <Loader2 className="mr-xs h-4 w-4 animate-spin" aria-hidden />}
              Korrigieren (0,1 Baum)
            </Button>
          </section>
        )}

        {project.omitted.length > 0 && (
          <section aria-labelledby={`${id}-cut`} className="space-y-xs">
            <h2
              id={`${id}-cut`}
              className="flex items-center gap-xs font-semibold text-foreground-heading"
            >
              <Scissors className="h-4 w-4" aria-hidden /> Rausgeschnitten
            </h2>
            <ul className="space-y-xs">
              {project.omitted.map((o) => (
                <li key={o.unitId} className="flex items-start gap-sm text-sm">
                  <span className="flex-1">
                    „{o.text}“ <span className="text-grey-500">– {o.reason}</span>
                  </span>
                  {!project.handedOff && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restore.mutate(o.unitId)}
                      disabled={restore.isPending}
                    >
                      <Undo2 className="mr-1 h-4 w-4" aria-hidden /> Zurückholen
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {project.versions.length > 1 && (
          <section aria-labelledby={`${id}-versions`} className="space-y-xs">
            <h2 id={`${id}-versions`} className="font-semibold text-foreground-heading">
              Versionen
            </h2>
            <ol className="space-y-1 text-sm">
              {[...project.versions].reverse().map((v) => (
                <li key={v.version}>
                  {v.version === project.version ? (
                    <span className="font-medium">
                      {v.version}. {v.summary} (angezeigt)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline disabled:opacity-60"
                      onClick={() => choose.mutate(v.version)}
                      disabled={project.handedOff || choose.isPending}
                    >
                      {v.version}. {v.summary}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          In den Papierkorb
        </Button>
      </div>
    </div>
  );
}

export default function KiSchnittProjectPage() {
  const { slug = '' } = useParams();
  const ref = extractSlugSuffix(slug) ?? slug;
  const { data, isLoading, isError } = useQuery({
    queryKey: projectQueryKey(ref),
    enabled: ref.length > 0,
    queryFn: () => getProject(ref),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 3000 : false),
  });
  useDocumentTitle(data ? `${data.title} – KI-Schnitt – Grünerator` : 'KI-Schnitt – Grünerator');

  return (
    <PageContainer maxWidth="lg" gradient={false}>
      <Link to="/studio/ki-schnitt" className="text-sm text-grey-500 hover:underline">
        ← Alle KI-Schnitte
      </Link>
      {isLoading ? (
        <p role="status" className="mt-lg">
          Wird geladen …
        </p>
      ) : isError || !data ? (
        <p role="alert" className="mt-lg">
          Diesen KI-Schnitt gibt es nicht (mehr).
        </p>
      ) : (
        <>
          <h1 className="mt-xs text-2xl font-semibold text-foreground-heading">{data.title}</h1>
          <ProjectBody project={data} />
        </>
      )}
    </PageContainer>
  );
}
