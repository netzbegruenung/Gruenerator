import { Badge, Button, Textarea } from '@gruenerator/ui';
import { Loader2, Play, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { platformFetch } from '../../utils/platformFetch';

interface Voice {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  quality?: string;
  description?: string;
  sampleUrl?: string;
}

interface Playing {
  voice: Voice;
  /**
   * `sample` is the provider's own clip, `text` a live synthesis of the
   * textarea, `stored` a clip of the default text generated once and checked
   * in under public/kugel-test so nobody pays for the same sentence twice.
   */
  kind: 'sample' | 'text' | 'stored';
  latencyMs?: number;
}

interface StoredClips {
  text: string;
  model: string;
  generatedAt: string;
  clips: Record<string, { file: string; durationSec: number; latencyMs: number }>;
}

const STORED_INDEX_URL = '/kugel-test/index.json';

const DEFAULT_TEXT =
  'Liebe Freundinnen und Freunde, am 14. März 2027 wählen wir. ' +
  'Wir Grüne wollen 1,5 Milliarden Euro in den Ausbau der Bahn stecken – ' +
  'für Kiel, Görlitz und Passau genauso wie für Wien.';

const GENDER_LABEL: Record<string, string> = {
  female: 'weiblich',
  male: 'männlich',
  neutral: 'neutral',
};

const AGE_LABEL: Record<string, string> = {
  young: 'jung',
  middle_age: 'mittleres Alter',
  old: 'älter',
};

type GenderFilter = 'all' | 'female' | 'male';

const KugelVoiceTestPage = () => {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [stored, setStored] = useState<StoredClips | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    platformFetch('/api/voice/tts/voices?language=de', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { voices?: Voice[] };
        return body.voices ?? [];
      })
      .then((list) => {
        if (cancelled) return;
        // High-quality voices first, then by name — the ones worth a default.
        list.sort(
          (a, b) =>
            Number(b.quality === 'high') - Number(a.quality === 'high') ||
            a.name.localeCompare(b.name, 'de')
        );
        setVoices(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Optional: a missing index just means every click synthesises live.
    fetch(STORED_INDEX_URL)
      // The SPA fallback answers an unknown path with index.html and 200.
      .then((res) =>
        res.ok && res.headers.get('content-type')?.includes('json')
          ? (res.json() as Promise<StoredClips>)
          : null
      )
      .then((index) => {
        if (!cancelled && index) setStored(index);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const play = useCallback((src: string, next: Playing) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (src.startsWith('blob:')) objectUrlRef.current = src;
    audio.src = src;
    setPlaying(next);
    setPlayError(null);
    void audio.play().catch((err: unknown) => {
      // Switching the source while a play() is pending rejects the old one
      // with AbortError — that is the user changing voices, not a failure.
      if (err instanceof Error && err.name === 'AbortError') return;
      setPlayError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const speak = useCallback(
    async (voice: Voice) => {
      setBusyId(voice.id);
      setPlayError(null);
      const started = performance.now();
      try {
        const res = await platformFetch('/api/voice/tts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text, voiceId: voice.id, language: 'de' }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        // Unmounted while the request was in flight: no player left to hand
        // the blob to, and an object URL created now would never be revoked.
        if (!audioRef.current) return;
        play(URL.createObjectURL(blob), {
          voice,
          kind: 'text',
          latencyMs: Math.round(performance.now() - started),
        });
      } catch (err: unknown) {
        setPlayError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [play, text]
  );

  const visible = voices?.filter((v) => gender === 'all' || v.gender === gender) ?? [];
  // Stored clips only stand in for the exact text they were generated from.
  const storedApplies = stored !== null && stored.text === text;
  const storedClip = (voice: Voice) => (storedApplies ? stored.clips[voice.id] : undefined);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">KugelAudio — deutsche Stimmen</h1>
        <p className="text-sm text-muted-foreground">
          Hörprobe für <code>KUGELAUDIO_DEFAULT_VOICE_ID</code>. „Hörprobe“ spielt den Clip des
          Anbieters, „Text sprechen“ synthetisiert den Text unten über unser Backend — so, wie es
          später auch im Produkt klingt.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <label htmlFor="kugel-text" className="text-sm font-semibold">
          Testtext
        </label>
        <Textarea
          id="kugel-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Zahlen, Datum, Umlaute und Ortsnamen drin lassen — daran scheitern Stimmen zuerst.
        </p>
        {stored ? (
          <p className="text-xs text-muted-foreground">
            {storedApplies ? (
              <>
                Für diesen Text liegen {Object.keys(stored.clips).length} fertige Clips vor (
                {stored.model}, erzeugt am{' '}
                {new Date(stored.generatedAt).toLocaleDateString('de-DE')}) — „Anhören“ spielt sie
                sofort.
              </>
            ) : (
              <>
                Der Text weicht vom gespeicherten ab — jeder Klick synthetisiert live.{' '}
                <button type="button" className="underline" onClick={() => setText(stored.text)}>
                  Standardtext wiederherstellen
                </button>
              </>
            )}
          </p>
        ) : null}
      </section>

      <section className="sticky top-12 z-10 space-y-2 rounded-lg border bg-card p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- synthesised test audio; the text is the textarea above */}
        <audio
          ref={audioRef}
          controls
          className="w-full"
          onError={() =>
            setPlayError(
              playing?.kind === 'sample'
                ? 'Hörprobe nicht ladbar — die Links des Anbieters gelten 15 Minuten, Seite neu laden.'
                : 'Audio konnte nicht abgespielt werden.'
            )
          }
        />
        <div className="flex min-h-5 flex-wrap items-center gap-2 text-sm">
          {playing ? (
            <>
              <span className="font-medium">{playing.voice.name}</span>
              <span className="text-muted-foreground">
                (ID {playing.voice.id}) ·{' '}
                {playing.kind === 'sample'
                  ? 'Hörprobe des Anbieters'
                  : playing.kind === 'stored'
                    ? 'gespeicherter Clip'
                    : 'unser Text'}
                {playing.latencyMs !== undefined
                  ? ` · ${playing.latencyMs} ms bis WAV komplett (das Produkt streamt)`
                  : ''}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Noch nichts abgespielt.</span>
          )}
          {playError ? <span className="text-destructive">{playError}</span> : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            Stimmen {voices ? `(${visible.length} von ${voices.length})` : ''}
          </h2>
          <div className="ml-auto flex gap-1">
            {(
              [
                ['all', 'alle'],
                ['female', 'weiblich'],
                ['male', 'männlich'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={gender === value ? 'default' : 'outline'}
                onClick={() => setGender(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">
            Stimmen konnten nicht geladen werden: {loadError}
          </p>
        ) : null}
        {!voices && !loadError ? (
          <p className="text-sm text-muted-foreground">Lade Stimmen …</p>
        ) : null}

        <ul className="space-y-2">
          {visible.map((voice) => {
            const active = playing?.voice.id === voice.id;
            return (
              <li
                key={voice.id}
                className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${
                  active ? 'border-primary bg-primary/5' : 'bg-card'
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{voice.name}</span>
                    <span className="text-xs text-muted-foreground">ID {voice.id}</span>
                    {voice.quality === 'high' ? <Badge>high</Badge> : null}
                    {voice.gender ? (
                      <Badge variant="outline">{GENDER_LABEL[voice.gender] ?? voice.gender}</Badge>
                    ) : null}
                    {voice.age ? (
                      <Badge variant="outline">{AGE_LABEL[voice.age] ?? voice.age}</Badge>
                    ) : null}
                  </div>
                  {voice.description ? (
                    <p className="text-sm text-muted-foreground">{voice.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {voice.sampleUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => play(voice.sampleUrl!, { voice, kind: 'sample' })}
                    >
                      <Volume2 className="mr-1 size-4" />
                      Hörprobe
                    </Button>
                  ) : null}
                  {storedClip(voice) ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        play(storedClip(voice)!.file, {
                          voice,
                          kind: 'stored',
                          latencyMs: storedClip(voice)!.latencyMs,
                        })
                      }
                    >
                      <Play className="mr-1 size-4" />
                      Anhören
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busyId !== null || text.trim().length === 0}
                      onClick={() => void speak(voice)}
                    >
                      {busyId === voice.id ? (
                        <Loader2 className="mr-1 size-4 animate-spin" />
                      ) : (
                        <Play className="mr-1 size-4" />
                      )}
                      Text sprechen
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default KugelVoiceTestPage;
