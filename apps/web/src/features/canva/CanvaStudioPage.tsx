import { type CanvaAutofillSource } from '@gruenerator/contracts';
import { Button, Input, Label, Textarea, ToggleGroup, ToggleGroupItem, cn } from '@gruenerator/ui';
import { type JSX, useEffect, useRef, useState } from 'react';
import { FiCheck, FiExternalLink, FiLoader } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';

import PageContainer from '../../components/common/PageContainer';
import { getToolGradient } from '../../config/toolTheme';
import RequireAdmin from '../admin/components/RequireAdmin';
import { dropTabPayload, readTabPayload } from '../image-studio/tabHandoff';
import { useSettingsDialogStore } from '../settings/settingsDialogStore';

import { type CanvaStudioHandoff } from './canvaStudioHandoff';
import { CANVA_BUTTON_BORDER, CanvaLogo, PoweredByCanva } from './components/CanvaLogo';
import {
  useCanvaAutofillFields,
  useCanvaAutofillSources,
  useCanvaDesigns,
  useCanvaStatus,
  useCreateCanvaAutofill,
  useSuggestCanvaAutofill,
} from './hooks/useCanva';

type SourceKind = CanvaAutofillSource['kind'];

function readHandoff(search: string, state: unknown): string {
  const payload = readTabPayload(search) ?? state;
  const prompt = (payload as Partial<CanvaStudioHandoff> | null)?.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

/**
 * „/studio/canva": a Canva design with data fields, or a brand template of the
 * team, filled from what someone wrote in the Studio — like Sharepics and
 * KI-Bilder, the request comes from the Studio composer. The AI proposes the
 * text fields, the person checks them, and Canva creates a NEW design (the
 * template stays as it is).
 *
 * Instance admins only until Canva has reviewed the app.
 */
function CanvaStudioContent(): JSX.Element {
  const location = useLocation();
  const [prompt, setPrompt] = useState(() => readHandoff(location.search, location.state));
  useEffect(() => dropTabPayload(location.search), [location.search]);

  const status = useCanvaStatus();
  const ready = status.data?.connected === true && !status.data.needsReconnect;
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  const sources = useCanvaAutofillSources(ready);
  const designs = useCanvaDesigns(ready);
  const [kind, setKind] = useState<SourceKind>('design');
  const [source, setSource] = useState<CanvaAutofillSource | null>(null);
  const fields = useCanvaAutofillFields(source);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const suggest = useSuggestCanvaAutofill();
  const create = useCreateCanvaAutofill();

  const textFields = fields.data?.fields.filter((f) => f.supported) ?? [];
  const keptFields = fields.data?.fields.filter((f) => !f.supported) ?? [];
  const filled = textFields.some((f) => (texts[f.name] ?? '').trim() !== '');

  const runSuggest = (target: CanvaAutofillSource) => {
    if (!prompt.trim()) return;
    suggest.mutate(
      { source: target, prompt: prompt.trim() },
      { onSuccess: ({ texts: proposed }) => setTexts(proposed) }
    );
  };

  // A newly picked template with text fields gets its proposal right away, once.
  const proposedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!source || textFields.length === 0) return;
    const key = `${source.kind}:${source.id}`;
    if (proposedFor.current === key) return;
    proposedFor.current = key;
    setTexts({});
    create.reset();
    runSuggest(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per picked source
  }, [source?.kind, source?.id, textFields.length]);

  const options =
    kind === 'design'
      ? (designs.data?.pages.flatMap((p) => p.designs) ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          thumbnailUrl: d.thumbnailUrl,
        }))
      : (sources.data?.brandTemplates ?? []);
  const loadingOptions = kind === 'design' ? designs.isPending : sources.isPending;

  const submit = () => {
    if (!source) return;
    create.mutate({
      source,
      ...(title.trim() ? { title: title.trim() } : {}),
      texts: Object.fromEntries(textFields.map((f) => [f.name, texts[f.name] ?? ''])),
    });
  };

  return (
    <PageContainer
      maxWidth="md"
      title="Canva-Vorlage befüllen"
      subtitle="Beschreibe, was du brauchst – Canva legt daraus ein neues Design an"
      bgClassName={getToolGradient('canvas')}
    >
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-1">
          <Label htmlFor="canva-prompt">Was soll auf das Design?</Label>
          <Textarea
            id="canva-prompt"
            rows={3}
            value={prompt}
            placeholder="z. B. Plakat für unseren Infostand am 3. November, 10–14 Uhr, Marktplatz"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {status.isPending ? (
          <p className="m-0 flex items-center gap-2 text-sm text-foreground-muted">
            <FiLoader className="animate-spin" aria-hidden /> Lade Canva-Verbindung …
          </p>
        ) : !ready ? (
          <div className="flex flex-col items-start gap-sm rounded-lg border border-grey-500 p-md">
            <p className="m-0 text-sm text-foreground">
              {status.data?.needsReconnect
                ? 'Canva braucht eine neue Berechtigung. Verbinde Canva bitte neu.'
                : 'Verbinde zuerst dein Canva-Konto.'}
            </p>
            <Button
              variant="outline"
              className={cn('gap-2', CANVA_BUTTON_BORDER)}
              onClick={() => openSettings('konnektoren')}
            >
              <CanvaLogo size={16} variant="icon" decorative />
              Canva verbinden
            </Button>
          </div>
        ) : (
          <>
            {sources.data && !sources.data.canAutofill && (
              <p className="m-0 rounded-md border border-grey-500 p-sm text-sm text-foreground">
                Dein Canva-Plan enthält Autofill nicht. Canva erlaubt dann höchstens ein paar
                Testnutzungen; dauerhaft braucht es Canva Pro, Teams oder Enterprise.
              </p>
            )}

            <section aria-labelledby="canva-vorlage" className="flex flex-col gap-sm">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <h2
                  id="canva-vorlage"
                  className="m-0 text-lg font-semibold text-foreground-heading"
                >
                  Vorlage wählen
                </h2>
                <ToggleGroup
                  type="single"
                  value={kind}
                  onValueChange={(v) => {
                    if (v === 'design' || v === 'brand_template') {
                      setKind(v);
                      setSource(null);
                    }
                  }}
                  aria-label="Art der Vorlage"
                >
                  <ToggleGroupItem value="design">Meine Designs</ToggleGroupItem>
                  <ToggleGroupItem
                    value="brand_template"
                    disabled={!sources.data?.canUseBrandTemplates}
                  >
                    Markenvorlagen
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {loadingOptions ? (
                <p className="m-0 flex items-center gap-2 text-sm text-foreground-muted">
                  <FiLoader className="animate-spin" aria-hidden /> Lade Vorlagen …
                </p>
              ) : options.length === 0 ? (
                <p className="m-0 text-sm text-foreground-muted">
                  {kind === 'design'
                    ? 'Keine Designs gefunden.'
                    : 'Keine Markenvorlage mit Feldern gefunden.'}
                </p>
              ) : (
                <ul
                  aria-label={kind === 'design' ? 'Meine Designs' : 'Markenvorlagen'}
                  className="m-0 grid list-none grid-cols-2 gap-sm p-0 sm:grid-cols-4"
                >
                  {options.map((o) => {
                    const selected = source?.kind === kind && source.id === o.id;
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSource({ kind, id: o.id })}
                          className={cn(
                            'flex w-full flex-col overflow-hidden rounded-md border bg-background-pure text-left',
                            selected
                              ? 'border-2 border-foreground'
                              : 'border-grey-500 hover:bg-hover-alt'
                          )}
                        >
                          <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-background-alt">
                            {o.thumbnailUrl && (
                              <img
                                src={o.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            )}
                          </span>
                          <span className="flex items-center gap-1 px-sm py-1 text-xs text-foreground">
                            {selected && <FiCheck aria-hidden className="shrink-0" />}
                            <span className="truncate">{o.title}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {source && fields.isPending && (
              <p className="m-0 flex items-center gap-2 text-sm text-foreground-muted">
                <FiLoader className="animate-spin" aria-hidden /> Lese Felder …
              </p>
            )}
            {source && fields.isError && (
              <p className="m-0 text-sm text-foreground">
                Die Felder konnten nicht gelesen werden.
              </p>
            )}
            {source && fields.data && textFields.length === 0 && (
              <p className="m-0 text-sm text-foreground">
                Diese Vorlage hat keine Textfelder. In Canva markierst du Felder über Apps → Bulk
                Create → Labels.
              </p>
            )}

            {textFields.length > 0 && (
              <section aria-labelledby="canva-felder" className="flex flex-col gap-sm">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <h2
                    id="canva-felder"
                    className="m-0 text-lg font-semibold text-foreground-heading"
                  >
                    Felder
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className={CANVA_BUTTON_BORDER}
                    disabled={!prompt.trim() || suggest.isPending || !source}
                    onClick={() => source && runSuggest(source)}
                  >
                    {suggest.isPending ? <FiLoader className="animate-spin" aria-hidden /> : null}
                    Neu vorschlagen
                  </Button>
                </div>
                {suggest.isPending && (
                  <p role="status" className="m-0 text-sm text-foreground-muted">
                    Die Felder werden aus deiner Beschreibung gefüllt …
                  </p>
                )}
                {suggest.isError && (
                  <p role="alert" className="m-0 text-sm text-foreground">
                    Der Vorschlag hat nicht geklappt. Du kannst die Felder selbst ausfüllen.
                  </p>
                )}
                {textFields.map((f) => {
                  const id = `canva-field-${f.name}`;
                  return (
                    <div key={f.name} className="flex flex-col gap-1">
                      <Label htmlFor={id}>{f.name}</Label>
                      <Textarea
                        id={id}
                        rows={2}
                        value={texts[f.name] ?? ''}
                        onChange={(e) => setTexts((t) => ({ ...t, [f.name]: e.target.value }))}
                      />
                    </div>
                  );
                })}
                {keptFields.length > 0 && (
                  <p className="m-0 text-xs text-foreground-muted">
                    Bleibt wie in der Vorlage: {keptFields.map((f) => f.name).join(', ')}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  <Label htmlFor="canva-autofill-title">Titel des neuen Designs (optional)</Label>
                  <Input
                    id="canva-autofill-title"
                    value={title}
                    maxLength={255}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </section>
            )}

            {create.data && (
              <div role="status" className="flex flex-col gap-1 text-sm text-foreground">
                <span className="flex items-center gap-1 font-medium">
                  <FiCheck aria-hidden /> Design „{create.data.design.title ?? 'Ohne Titel'}“
                  angelegt.
                </span>
                <a
                  href={create.data.design.editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  In Canva öffnen <FiExternalLink aria-hidden />
                </a>
                {create.data.trial && (
                  <span className="text-foreground-muted">
                    Noch {create.data.trial.usesRemaining} Testnutzungen von Autofill.
                  </span>
                )}
              </div>
            )}
            {create.isError && (
              <p role="alert" className="m-0 text-sm text-foreground">
                Das Design konnte nicht erstellt werden.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-sm">
              <PoweredByCanva />
              <Button
                variant="outline"
                className={cn('gap-2', CANVA_BUTTON_BORDER)}
                disabled={!filled || create.isPending}
                onClick={submit}
              >
                {create.isPending ? (
                  <FiLoader className="animate-spin" aria-hidden />
                ) : (
                  <CanvaLogo size={16} variant="icon" decorative />
                )}
                {create.isPending ? 'Wird in Canva erstellt …' : 'In Canva erstellen'}
              </Button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}

const CanvaStudioPage = () => (
  <RequireAdmin type="instanceAdmin">
    <CanvaStudioContent />
  </RequireAdmin>
);

export default CanvaStudioPage;
