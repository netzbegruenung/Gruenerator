/**
 * /studio/ki-schnitt — a new KI-Schnitt: material from the Mediathek or new
 * uploads, a short briefing, the price, start. Below, the person's earlier
 * KI-Schnitte.
 */
import {
  VIDEO_AI_LIMITS,
  videoAiTreeUnits,
  type VideoAiFormat,
  type VideoAiInputRole,
  type VideoAiStyle,
} from '@gruenerator/contracts';
import { getMediaLibrary } from '@gruenerator/shared/media-library';
import { Button, Input, Label, Textarea } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Film, Image, Loader2, Music, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  createProject,
  defaultRole,
  listProjects,
  projectsQueryKey,
  STATUS_LABEL,
  uploadMaterial,
  type UploadedMaterial,
} from './videoAiApi';

import PageContainer from '@/components/common/PageContainer';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';

interface Selected extends UploadedMaterial {
  role: VideoAiInputRole;
}

const PLATFORMS: Record<
  string,
  { label: string; format: VideoAiFormat; min: number; max: number }
> = {
  reel: { label: 'Instagram/TikTok (9:16)', format: '9:16', min: 30, max: 60 },
  feed: { label: 'Feed (4:5)', format: '4:5', min: 30, max: 60 },
  quadrat: { label: 'Quadrat (1:1)', format: '1:1', min: 30, max: 60 },
  youtube: { label: 'YouTube (16:9)', format: '16:9', min: 60, max: 120 },
};

const STYLES: Record<VideoAiStyle, string> = {
  'talking-head-ruhig': 'Talking Head, ruhig',
  'talking-head-dynamisch': 'Talking Head, dynamisch (Zooms)',
  'statement-mit-bild': 'Statement mit Bildern',
};

const ROLES: Record<VideoAiInputRole, string> = {
  footage: 'Hauptvideo (gesprochen)',
  broll: 'B-Roll (Zwischenschnitt)',
  image: 'Bild',
  logo: 'Logo',
  audio: 'Musik',
};

const rolesFor = (t: Selected['mediaType']): VideoAiInputRole[] =>
  t === 'video' ? ['footage', 'broll'] : t === 'image' ? ['image', 'logo'] : ['audio'];

const ICON = { video: Film, image: Image, audio: Music } as const;

function MaterialPicker({
  onAdd,
  chosen,
}: {
  onAdd: (m: UploadedMaterial) => void;
  chosen: Set<string>;
}) {
  const library = useQuery({
    queryKey: ['media-library', 'video-ai'],
    queryFn: () => getMediaLibrary({ type: 'all', limit: 60 }),
  });
  const items = (library.data?.data ?? []).filter((m) => !chosen.has(m.id));
  if (library.isLoading) return <p className="text-sm text-grey-500">Mediathek wird geladen …</p>;
  if (items.length === 0)
    return <p className="text-sm text-grey-500">Nichts (mehr) in der Mediathek.</p>;
  return (
    <ul className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {items.map((m) => {
        const Icon = ICON[m.mediaType];
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() =>
                onAdd({
                  mediaId: m.id,
                  mediaType: m.mediaType,
                  title: m.title ?? 'Ohne Titel',
                  durationSeconds: m.duration ?? null,
                })
              }
              className="flex w-full items-center gap-xs rounded-lg border border-grey-200 p-xs text-left text-sm hover:bg-grey-50 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              {m.thumbnailUrl ? (
                <img
                  src={m.thumbnailUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <Icon className="h-10 w-10 shrink-0 p-xs text-grey-500" aria-hidden />
              )}
              <span className="line-clamp-2">{m.title ?? 'Ohne Titel'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EarlierProjects() {
  const { data } = useQuery({ queryKey: projectsQueryKey, queryFn: listProjects });
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="ki-schnitt-earlier" className="mt-xl">
      <h2 id="ki-schnitt-earlier" className="text-lg font-semibold text-foreground-heading">
        Deine KI-Schnitte
      </h2>
      <ul className="mt-sm divide-y divide-grey-200 dark:divide-grey-700">
        {data.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-xs">
            <Link
              to={`/studio/ki-schnitt/${p.slugSuffix}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {p.title}
            </Link>
            <span className="text-sm text-grey-500">{STATUS_LABEL[p.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function KiSchnittNewPage() {
  useDocumentTitle('KI-Schnitt – Grünerator');
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Selected[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('reel');
  const [style, setStyle] = useState<VideoAiStyle>('talking-head-ruhig');
  const [personName, setPersonName] = useState('');
  const [personRole, setPersonRole] = useState('');
  const [keyterms, setKeyterms] = useState('');
  const [hints, setHints] = useState('');

  const add = (m: UploadedMaterial) =>
    setSelected((list) =>
      list.some((s) => s.mediaId === m.mediaId)
        ? list
        : [...list, { ...m, role: defaultRole(m.mediaType) }]
    );

  const onFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      try {
        setUploading(`${file.name} …`);
        add(await uploadMaterial(file, (p) => setUploading(`${file.name}: ${p} %`)));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Upload fehlgeschlagen.');
      }
    }
    setUploading(null);
  };

  const clipSeconds = selected
    .filter((s) => s.mediaType === 'video')
    .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  const trees = videoAiTreeUnits(clipSeconds) / 100;
  const hasFootage = selected.some((s) => s.role === 'footage');
  const preset = PLATFORMS[platform];

  const start = useMutation({
    mutationFn: () =>
      createProject({
        brief: {
          title: title.trim() || topic.trim().slice(0, 60) || 'KI-Schnitt',
          topic: topic.trim(),
          format: preset.format,
          style,
          target: { minSeconds: preset.min, maxSeconds: preset.max },
          person: personName.trim() ? { name: personName.trim(), role: personRole.trim() } : null,
          keyterms: keyterms
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length >= 2)
            .slice(0, 20),
          hints: hints.trim() || null,
        },
        inputs: selected.map((s) => ({ mediaId: s.mediaId, role: s.role })),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void navigate(`/studio/ki-schnitt/${created.slugSuffix}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageContainer maxWidth="md" gradient={false}>
      <h1 className="text-2xl font-semibold text-foreground-heading">KI-Schnitt</h1>
      <p className="mt-xs text-grey-500">
        Lade dein Rohmaterial hoch. Die KI wählt die besten Takes, schneidet Versprecher und Pausen
        raus und setzt Untertitel und Einblendungen. Danach kannst du korrigieren und im
        Video-Editor weiterarbeiten.
      </p>

      <section aria-labelledby={`${id}-material`} className="mt-lg space-y-sm">
        <h2 id={`${id}-material`} className="text-lg font-semibold text-foreground-heading">
          1. Material
        </h2>
        {selected.length > 0 && (
          <ul className="space-y-xs">
            {selected.map((s) => (
              <li
                key={s.mediaId}
                className="flex flex-wrap items-center gap-sm rounded-lg border border-grey-200 p-xs dark:border-grey-700"
              >
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <label className="sr-only" htmlFor={`${id}-role-${s.mediaId}`}>
                  Rolle von {s.title}
                </label>
                <select
                  id={`${id}-role-${s.mediaId}`}
                  value={s.role}
                  onChange={(e) =>
                    setSelected((list) =>
                      list.map((x) =>
                        x.mediaId === s.mediaId
                          ? { ...x, role: e.target.value as VideoAiInputRole }
                          : x
                      )
                    )
                  }
                  className="rounded-md border border-grey-300 bg-transparent px-xs py-1 text-sm dark:border-grey-600"
                >
                  {rolesFor(s.mediaType).map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${s.title} entfernen`}
                  onClick={() => setSelected((list) => list.filter((x) => x.mediaId !== s.mediaId))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-sm">
          <label className="inline-flex cursor-pointer items-center gap-xs rounded-md border border-grey-300 px-sm py-xs text-sm font-medium hover:bg-grey-50 dark:border-grey-600 dark:hover:bg-grey-800">
            <Upload className="h-4 w-4" aria-hidden />
            Dateien hochladen
            <input
              type="file"
              multiple
              accept="video/mp4,video/quicktime,video/webm,image/*,audio/*"
              className="sr-only"
              onChange={(e) => void onFiles(e.target.files)}
            />
          </label>
          {uploading && (
            <span role="status" className="inline-flex items-center gap-xs text-sm text-grey-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {uploading}
            </span>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Aus der Mediathek wählen</summary>
          <div className="mt-sm">
            <MaterialPicker onAdd={add} chosen={new Set(selected.map((s) => s.mediaId))} />
          </div>
        </details>
        <p className="text-xs text-grey-500">
          Bis {VIDEO_AI_LIMITS.maxClips} Videos und {VIDEO_AI_LIMITS.maxFootageSeconds / 60} Minuten
          Rohmaterial. Wer im Video zu sehen ist, sollte einverstanden sein; Musik nur mit Rechten.
        </p>
      </section>

      <section aria-labelledby={`${id}-brief`} className="mt-lg space-y-sm">
        <h2 id={`${id}-brief`} className="text-lg font-semibold text-foreground-heading">
          2. Briefing
        </h2>
        <div className="space-y-1">
          <Label htmlFor={`${id}-topic`}>Worum geht es?</Label>
          <Textarea
            id={`${id}-topic`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Zum Beispiel: Radweg an der Sauerlacher Straße, sicherer Schulweg"
          />
        </div>
        <div className="grid gap-sm sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-title`}>Titel (optional)</Label>
            <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-platform`}>Plattform</Label>
            <select
              id={`${id}-platform`}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-md border border-grey-300 bg-transparent px-sm py-xs dark:border-grey-600"
            >
              {Object.entries(PLATFORMS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}, {p.min}–{p.max} s
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-style`}>Stil</Label>
            <select
              id={`${id}-style`}
              value={style}
              onChange={(e) => setStyle(e.target.value as VideoAiStyle)}
              className="w-full rounded-md border border-grey-300 bg-transparent px-sm py-xs dark:border-grey-600"
            >
              {Object.entries(STYLES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-terms`}>Namen und Fachbegriffe (mit Komma)</Label>
            <Input
              id={`${id}-terms`}
              value={keyterms}
              onChange={(e) => setKeyterms(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>Name für die Bauchbinde</Label>
            <Input
              id={`${id}-name`}
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-role`}>Funktion</Label>
            <Input
              id={`${id}-role`}
              value={personRole}
              onChange={(e) => setPersonRole(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-hints`}>Hinweise für den Schnitt (optional)</Label>
          <Textarea id={`${id}-hints`} value={hints} onChange={(e) => setHints(e.target.value)} />
        </div>
      </section>

      <div className="mt-lg flex flex-wrap items-center gap-md">
        <Button
          onClick={() => start.mutate()}
          disabled={!hasFootage || topic.trim().length < 3 || start.isPending || uploading !== null}
        >
          {start.isPending && <Loader2 className="mr-xs h-4 w-4 animate-spin" aria-hidden />}
          KI-Schnitt starten
        </Button>
        <p className="text-sm text-grey-500">
          {hasFootage
            ? `Kostet ${trees.toLocaleString('de-DE')} ${trees === 1 ? 'Baum' : 'Bäume'}. Du bekommst eine Benachrichtigung, wenn er fertig ist.`
            : 'Wähle mindestens ein Hauptvideo und beschreibe das Thema.'}
        </p>
      </div>

      <EarlierProjects />
    </PageContainer>
  );
}
