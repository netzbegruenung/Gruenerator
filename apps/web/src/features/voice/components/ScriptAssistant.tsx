import {
  SPEECH_MAX_TEXT_CHARS,
  type DraftScriptBody,
  type SpeechPreset,
} from '@gruenerator/contracts';
import {
  Button,
  CollapsibleSection,
  Input,
  Label,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import Spinner from '../../../components/common/Spinner';
import { useDraftScript } from '../hooks/useDraftScript';

/**
 * Drafts the spoken text, so nobody has to start at a blank page.
 *
 * Deliberately a step BEFORE synthesis, not part of it: the draft lands in the
 * editor and the person reads and corrects it there. A greeting that names the
 * wrong office must never reach the answering machine because the model was
 * confident — and a draft nobody accepts costs no provider seconds.
 */
export interface ScriptAssistantProps {
  preset: SpeechPreset;
  /** Fills the editor. The person edits from there; nothing is sent yet. */
  onDraft: (script: string) => void;
}

/** Empty optional fields travel as null, per the contract's `.nullish()`. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const ScriptAssistant = ({ preset, onDraft }: ScriptAssistantProps) => {
  const [organisation, setOrganisation] = useState('');
  const [person, setPerson] = useState('');
  const [reachability, setReachability] = useState('');
  const [alternative, setAlternative] = useState('');
  const [tone, setTone] = useState<'freundlich' | 'sachlich'>('freundlich');
  const [sourceText, setSourceText] = useState('');
  const [visualDescription, setVisualDescription] = useState('');
  const [context, setContext] = useState('');

  const draft = useDraftScript();

  const body = (): DraftScriptBody | null => {
    if (preset === 'mailbox') {
      if (organisation.trim() === '') return null;
      return {
        preset: 'mailbox',
        organisation: organisation.trim(),
        person: orNull(person),
        reachability: orNull(reachability),
        alternative: orNull(alternative),
        tone,
      };
    }
    if (preset === 'vorlesefassung') {
      if (sourceText.trim() === '') return null;
      return { preset: 'vorlesefassung', sourceText: sourceText.trim() };
    }
    if (visualDescription.trim() === '') return null;
    return {
      preset: 'audiodeskription',
      visualDescription: visualDescription.trim(),
      context: orNull(context),
    };
  };

  const ready = body() !== null;

  const submit = () => {
    const payload = body();
    if (!payload) return;
    draft.mutate(payload, { onSuccess: (result) => onDraft(result.script) });
  };

  return (
    <CollapsibleSection
      bordered
      title={
        <>
          <Sparkles className="size-4" aria-hidden="true" />
          Text mit KI entwerfen
        </>
      }
    >
      <div className="flex flex-col gap-md pt-sm">
        {preset === 'mailbox' ? (
          <>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-organisation">Wen erreicht man?</Label>
              <Input
                id="script-organisation"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="Grünes Büro Musterstadt"
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-person">Name der Person (optional)</Label>
              <Input
                id="script-person"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Alex Muster"
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-reachability">Erreichbarkeit (optional)</Label>
              <Input
                id="script-reachability"
                value={reachability}
                onChange={(e) => setReachability(e.target.value)}
                placeholder="Montag bis Donnerstag, 9 bis 16 Uhr"
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-alternative">Alternative in der Zwischenzeit (optional)</Label>
              <Input
                id="script-alternative"
                value={alternative}
                onChange={(e) => setAlternative(e.target.value)}
                placeholder="Schreibt uns gern eine Nachricht"
                maxLength={300}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <span id="script-tone-label" className="text-sm font-medium text-foreground">
                Ton
              </span>
              <ToggleGroup
                type="single"
                value={tone}
                onValueChange={(value) => {
                  if (value === 'freundlich' || value === 'sachlich') setTone(value);
                }}
                aria-labelledby="script-tone-label"
                className="justify-start"
              >
                <ToggleGroupItem value="freundlich">Freundlich</ToggleGroupItem>
                <ToggleGroupItem value="sachlich">Sachlich</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </>
        ) : null}

        {preset === 'vorlesefassung' ? (
          <div className="flex flex-col gap-xxs">
            <Label htmlFor="script-source">Geschriebener Text</Label>
            <p id="script-source-hint" className="m-0 text-sm text-muted-foreground">
              Der Inhalt bleibt vollständig – er wird nur zum Hören umformuliert.
            </p>
            <Textarea
              id="script-source"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Antrag, Pressemitteilung oder Beschluss einfügen …"
              rows={8}
              // Same cap as the schema: a longer paste would come back as a 400
              // whose body carries no message a person could act on.
              maxLength={SPEECH_MAX_TEXT_CHARS}
              aria-describedby="script-source-hint"
            />
          </div>
        ) : null}

        {preset === 'audiodeskription' ? (
          <>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-visual">Was ist zu sehen?</Label>
              <Textarea
                id="script-visual"
                value={visualDescription}
                onChange={(e) => setVisualDescription(e.target.value)}
                placeholder="Stichworte genügen: Bildaufbau, Personen, Text im Bild …"
                rows={5}
                maxLength={4000}
              />
            </div>
            <div className="flex flex-col gap-xxs">
              <Label htmlFor="script-context">Wo erscheint das Material? (optional)</Label>
              <Input
                id="script-context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Instagram-Post zur Verkehrswende"
                maxLength={500}
              />
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-sm">
          <Button
            type="button"
            variant="outline"
            onClick={submit}
            disabled={!ready || draft.isPending}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Entwurf erstellen
          </Button>
          {draft.isPending ? (
            <span role="status" aria-live="polite" className="flex items-center gap-xs text-sm">
              <Spinner />
              Entwurf wird geschrieben …
            </span>
          ) : null}
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          Der Entwurf landet im Textfeld darunter. Lies ihn durch und ändere ihn, bevor du ihn
          vertonst.
        </p>
        {draft.error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {draft.error.message}
          </p>
        ) : null}
      </div>
    </CollapsibleSection>
  );
};

export default ScriptAssistant;
