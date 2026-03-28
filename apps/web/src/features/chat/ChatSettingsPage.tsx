import { useAgentStore } from '@gruenerator/chat';
import {
  Button,
  SelectCard,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from '@gruenerator/ui';
import { useState, useCallback, useMemo, useRef, memo } from 'react';
import { HiOutlineArrowLeft } from 'react-icons/hi2';

import { useAuthStore } from '../../stores/authStore';
import { useUserDefaultsStore } from '../../stores/userDefaultsStore';

import { searchMdBs } from './grueneMdBs';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';

type Ebene = string;

interface EbeneConfig {
  id: string;
  label: string;
  icon: string;
}

interface BundeslandConfig {
  label: string;
  notebookId?: string;
}

const DE_EBENEN: EbeneConfig[] = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'kreisverband', label: 'Kreisverband', icon: '📍' },
  { id: 'ortsverband', label: 'Ortsverband', icon: '🏘️' },
];

const AT_EBENEN: EbeneConfig[] = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'bezirk', label: 'Bezirk', icon: '📍' },
  { id: 'gemeinde', label: 'Gemeinde', icon: '🏘️' },
];

const DE_ROLLEN: Record<string, string[]> = {
  europa: ['EU-Abgeordnete*r', 'Mitarbeiter*in EU-Abgeordnete*r', 'Mitarbeiter*in Europagruppe'],
  bund: [
    'Mitarbeiter*in Bundesgeschäftsstelle',
    'Mitarbeiter*in Bundestagsfraktion',
    'Mitarbeiter*in MdB-Büro',
  ],
  land: [
    'Mitarbeiter*in Landesgeschäftsstelle',
    'Mitarbeiter*in Landtagsfraktion',
    'Mitarbeiter*in MdL-Büro',
  ],
  kreisverband: [
    'Mitarbeiter*in Kreisverband',
    'Mitarbeiter*in Kreistagsfraktion',
    'Ratsmitglied',
    'Presse & Social-Media',
  ],
  ortsverband: [
    'Mitarbeiter*in Ortsverband',
    'Mitarbeiter*in Ratsfraktion',
    'Ratsmitglied',
    'Presse & Social-Media',
  ],
};

const AT_ROLLEN: Record<string, string[]> = {
  europa: ['EU-Abgeordnete*r', 'Mitarbeiter*in EU-Abgeordnete*r', 'Mitarbeiter*in Europagruppe'],
  bund: [
    'Mitarbeiter*in Bundespartei',
    'Mitarbeiter*in Grüner Klub (Nationalrat)',
    'Mitarbeiter*in NR-Abgeordnetenbüro',
  ],
  land: [
    'Mitarbeiter*in Landesorganisation',
    'Mitarbeiter*in Landtagsklub',
    'Mitarbeiter*in LT-Abgeordnetenbüro',
  ],
  bezirk: ['Mitarbeiter*in Bezirksorganisation', 'Bezirksrät*in', 'Presse & Social-Media'],
  gemeinde: ['Mitarbeiter*in Gemeindegruppe', 'Gemeinderät*in', 'Presse & Social-Media'],
};

const DE_BUNDESLAENDER: BundeslandConfig[] = [
  { label: 'Baden-Württemberg' },
  { label: 'Bayern', notebookId: 'bayern-notebook' },
  { label: 'Berlin', notebookId: 'berlin-notebook' },
  { label: 'Brandenburg', notebookId: 'brandenburg-notebook' },
  { label: 'Bremen' },
  { label: 'Hamburg', notebookId: 'hamburg-notebook' },
  { label: 'Hessen' },
  { label: 'Mecklenburg-Vorpommern', notebookId: 'mecklenburg-vorpommern-notebook' },
  { label: 'Niedersachsen' },
  { label: 'Nordrhein-Westfalen' },
  { label: 'Rheinland-Pfalz' },
  { label: 'Saarland' },
  { label: 'Sachsen' },
  { label: 'Sachsen-Anhalt' },
  { label: 'Schleswig-Holstein', notebookId: 'schleswig-holstein-notebook' },
  { label: 'Thüringen', notebookId: 'thueringen-notebook' },
];

const AT_BUNDESLAENDER: BundeslandConfig[] = [
  { label: 'Wien' },
  { label: 'Niederösterreich' },
  { label: 'Oberösterreich' },
  { label: 'Steiermark' },
  { label: 'Kärnten' },
  { label: 'Salzburg' },
  { label: 'Tirol' },
  { label: 'Vorarlberg' },
  { label: 'Burgenland' },
];

const NEEDS_BUNDESLAND = new Set(['land', 'kreisverband', 'ortsverband', 'bezirk', 'gemeinde']);
const NEEDS_LOCAL_NAME = new Set(['kreisverband', 'ortsverband', 'bezirk', 'gemeinde']);

const LOCAL_NAME_LABELS: Record<string, string> = {
  kreisverband: 'Name des Kreisverbands',
  ortsverband: 'Name des Ortsverbands',
  bezirk: 'Name des Bezirks',
  gemeinde: 'Name der Gemeinde',
};

const LOCAL_NAME_PLACEHOLDERS: Record<string, string> = {
  kreisverband: 'z.B. KV Köln',
  ortsverband: 'z.B. OV Ehrenfeld',
  bezirk: 'z.B. Innsbruck-Land',
  gemeinde: 'z.B. Innsbruck',
};

function needsAbgeordneteName(rolle: string) {
  const lower = rolle.toLowerCase();
  return (
    lower.includes('abgeordnete') || lower.includes('mdb-büro') || lower.includes('nr-abgeordneten')
  );
}

const MdBSuggestions = memo(function MdBSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (name: string) => void;
}) {
  const results = searchMdBs(query);
  if (results.length === 0) return null;
  return (
    <ul className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-grey-200 bg-background shadow-lg dark:border-grey-700">
      {results.map((mdb) => (
        <li key={mdb.name}>
          <button
            type="button"
            className="flex w-full items-center gap-sm px-md py-sm text-left text-sm hover:bg-background-alt transition-colors"
            onClick={() => onSelect(mdb.name)}
          >
            <span className="font-medium text-foreground">{mdb.name}</span>
            <span className="text-xs text-grey-500">{mdb.bundesland}</span>
          </button>
        </li>
      ))}
    </ul>
  );
});

function ChatSettingsPage() {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const customSystemPrompt = useAgentStore((s) => s.customSystemPrompt);
  const setCustomSystemPrompt = useAgentStore((s) => s.setCustomSystemPrompt);
  const locale = useAuthStore((s) => s.locale);
  const isAustrian = locale === 'de-AT';
  const getDefault = useUserDefaultsStore((s) => s.getDefault);
  const setDefault = useUserDefaultsStore((s) => s.setDefault);

  const ebenen = isAustrian ? AT_EBENEN : DE_EBENEN;
  const rollen = isAustrian ? AT_ROLLEN : DE_ROLLEN;
  const bundeslaender = isAustrian ? AT_BUNDESLAENDER : DE_BUNDESLAENDER;

  const [promptText, setPromptText] = useState(customSystemPrompt || '');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWizard, setShowWizard] = useState(!customSystemPrompt);

  type WizardStep = 'ebene' | 'bundesland' | 'gliederung' | 'rolle';
  const [step, setStep] = useState<WizardStep>('ebene');
  const [selectedEbene, setSelectedEbene] = useState<Ebene | null>(
    () => getDefault<string>('profile', 'ebene') || null
  );
  const [selectedBundesland, setSelectedBundesland] = useState<string | null>(
    () => getDefault<string>('profile', 'bundesland') || null
  );
  const [selectedRolle, setSelectedRolle] = useState<string | null>(
    () => getDefault<string>('profile', 'rolle') || null
  );
  const [customRolle, setCustomRolle] = useState('');
  const [localGroupName, setLocalGroupName] = useState(
    () => getDefault<string>('profile', 'gliederung') || ''
  );
  const [abgeordneteName, setAbgeordneteName] = useState(
    () => getDefault<string>('profile', 'abgeordnete') || ''
  );
  const [generating, setGenerating] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newPrompt = promptText.trim() || null;

      setCustomSystemPrompt(newPrompt);

      if (newPrompt) {
        useAgentStore.getState().setThreadMode('eigener');
      }

      if (selectedBundesland) {
        const bl = bundeslaender.find((b) => b.label === selectedBundesland);
        if (bl?.notebookId) {
          useAgentStore.getState().setSelectedNotebook(bl.notebookId);
        }
      }

      if (threadId) {
        const res = await fetch(`/api/chat-service/threads/${threadId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ customSystemPrompt: newPrompt }),
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`Save failed: ${res.status}`);
        }
      }

      setShowWizard(false);
      setSuccessMessage('Einstellungen gespeichert');
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save chat settings:', error);
      setSuccessMessage(null);
    } finally {
      setSaving(false);
    }
  }, [promptText, threadId, selectedBundesland, bundeslaender, setCustomSystemPrompt]);

  const handleSelectEbene = useCallback((ebene: string) => {
    setSelectedEbene(ebene);
    setSelectedBundesland(null);
    setSelectedRolle(null);
    setCustomRolle('');
    setAbgeordneteName('');
    setLocalGroupName('');
    if (NEEDS_BUNDESLAND.has(ebene)) {
      setStep('bundesland');
    } else {
      setStep('rolle');
    }
  }, []);

  const handleSelectBundesland = useCallback(
    (bundesland: string) => {
      setSelectedBundesland(bundesland);
      if (selectedEbene && NEEDS_LOCAL_NAME.has(selectedEbene)) {
        setStep('gliederung');
      } else {
        setStep('rolle');
      }
    },
    [selectedEbene]
  );

  const handleLocalNameSubmit = useCallback(() => {
    if (localGroupName.trim()) setStep('rolle');
  }, [localGroupName]);

  const handleStepBack = useCallback(() => {
    if (step === 'rolle') {
      if (selectedEbene && NEEDS_LOCAL_NAME.has(selectedEbene)) setStep('gliederung');
      else if (selectedEbene && NEEDS_BUNDESLAND.has(selectedEbene)) setStep('bundesland');
      else setStep('ebene');
    } else if (step === 'gliederung') {
      setStep('bundesland');
    } else if (step === 'bundesland') {
      setStep('ebene');
    }
  }, [step, selectedEbene]);

  const handleGeneratePrompt = useCallback(async () => {
    const ebeneLabel = selectedEbene ? ebenen.find((e) => e.id === selectedEbene)?.label || '' : '';
    const rolle = selectedRolle === 'custom' ? customRolle : selectedRolle || '';

    // Persist profile fields individually
    if (selectedEbene) void setDefault('profile', 'ebene', selectedEbene);
    if (rolle) void setDefault('profile', 'rolle', rolle);
    if (selectedBundesland) void setDefault('profile', 'bundesland', selectedBundesland);
    if (localGroupName.trim()) void setDefault('profile', 'gliederung', localGroupName.trim());
    if (abgeordneteName.trim()) void setDefault('profile', 'abgeordnete', abgeordneteName.trim());

    setGenerating(true);

    const lines = [`Ebene: ${ebeneLabel}`, `Rolle: ${rolle}`];
    if (selectedBundesland) lines.push(`Bundesland: ${selectedBundesland}`);
    if (localGroupName.trim()) lines.push(`${ebeneLabel}: ${localGroupName.trim()}`);
    if (abgeordneteName.trim()) lines.push(`Abgeordnete*r: ${abgeordneteName.trim()}`);
    if (isAustrian) lines.push('Land: Österreich (Die Grünen – Die Grüne Alternative)');

    try {
      const response = await fetch('/api/chat-service/generate-system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description: lines.join('\n') }),
      });
      if (!response.ok) throw new Error('Generation failed');
      const data = await response.json();
      if (data.systemPrompt) {
        setPromptText(data.systemPrompt);
        setShowWizard(false);
      }
    } catch (error) {
      console.error('Failed to generate system prompt:', error);
    } finally {
      setGenerating(false);
    }
  }, [
    selectedEbene,
    selectedRolle,
    customRolle,
    selectedBundesland,
    localGroupName,
    abgeordneteName,
    isAustrian,
    ebenen,
    setDefault,
  ]);

  const handleSelectRolle = useCallback((rolle: string) => {
    setSelectedRolle(rolle);
    setAbgeordneteName('');
    if (!needsAbgeordneteName(rolle)) {
      // Directly trigger prompt generation — no more steps
      setSelectedRolle(rolle);
    }
  }, []);

  const handleCustomRolleSubmit = useCallback(() => {
    if (customRolle.trim()) handleSelectRolle(customRolle.trim());
  }, [customRolle, handleSelectRolle]);

  const resetWizard = useCallback(() => {
    setShowWizard(true);
    setPromptText('');
    setStep('ebene');
    setSelectedEbene(null);
    setSelectedBundesland(null);
    setSelectedRolle(null);
    setCustomRolle('');
    setAbgeordneteName('');
    setLocalGroupName('');
  }, []);

  const hasChanges = useMemo(
    () => promptText !== (customSystemPrompt || ''),
    [promptText, customSystemPrompt]
  );

  const profileSummary = useMemo(
    () =>
      [
        selectedEbene && ebenen.find((e) => e.id === selectedEbene)?.label,
        selectedBundesland,
        localGroupName || null,
        selectedRolle && selectedRolle !== 'custom' ? selectedRolle : customRolle || null,
      ].filter(Boolean) as string[],
    [selectedEbene, selectedBundesland, localGroupName, selectedRolle, customRolle, ebenen]
  );

  const canGenerate = useMemo(() => {
    if (!selectedRolle) return false;
    if (selectedRolle === 'custom' && !customRolle.trim()) return false;
    if (needsAbgeordneteName(selectedRolle || '') && !abgeordneteName.trim()) return false;
    return true;
  }, [selectedRolle, customRolle, abgeordneteName]);

  return (
    <ErrorBoundary>
      <PageContainer
        maxWidth="md"
        title="Dein Grünerator"
        subtitle="Personalisiere deinen Grünerator"
      >
        <div className="flex flex-col gap-lg">
          {successMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-lg py-md text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {showWizard ? (
            generating ? (
              <div className="flex flex-col items-center gap-md py-2xl">
                <div className="size-8 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                <p className="text-sm text-grey-500">System-Prompt wird generiert…</p>
              </div>
            ) : step === 'ebene' ? (
              <>
                <h2 className="text-lg font-semibold text-foreground-heading">
                  Auf welcher Ebene bist du aktiv?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  {ebenen.map((e) => (
                    <SelectCard
                      key={e.id}
                      icon={e.icon}
                      label={e.label}
                      selected={selectedEbene === e.id}
                      onClick={() => handleSelectEbene(e.id)}
                    />
                  ))}
                </div>
              </>
            ) : step === 'bundesland' ? (
              <>
                <button
                  type="button"
                  onClick={handleStepBack}
                  className="inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors self-start"
                >
                  <HiOutlineArrowLeft className="size-4" />
                  Zurück
                </button>
                <h2 className="text-lg font-semibold text-foreground-heading">
                  In welchem Bundesland?
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
                  {bundeslaender.map((bl) => (
                    <button
                      key={bl.label}
                      type="button"
                      onClick={() => handleSelectBundesland(bl.label)}
                      className={`rounded-md px-md py-sm text-sm text-left transition-colors ${
                        selectedBundesland === bl.label
                          ? 'bg-primary-500/10 text-primary-700 dark:text-primary-400'
                          : 'hover:bg-background-alt text-foreground'
                      }`}
                    >
                      {bl.label}
                      {bl.notebookId && (
                        <span className="ml-1 text-[10px] text-secondary-600">●</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : step === 'gliederung' ? (
              <>
                <button
                  type="button"
                  onClick={handleStepBack}
                  className="inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors self-start"
                >
                  <HiOutlineArrowLeft className="size-4" />
                  Zurück
                </button>
                <h2 className="text-lg font-semibold text-foreground-heading">
                  {LOCAL_NAME_LABELS[selectedEbene || ''] || 'Name deiner Gliederung'}
                </h2>
                <p className="text-sm text-grey-500 -mt-md">{selectedBundesland}</p>
                <div className="flex gap-sm">
                  <Input
                    value={localGroupName}
                    onChange={(e) => setLocalGroupName(e.target.value)}
                    placeholder={LOCAL_NAME_PLACEHOLDERS[selectedEbene || ''] || ''}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLocalNameSubmit();
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={handleLocalNameSubmit}
                    disabled={!localGroupName.trim()}
                    size="sm"
                  >
                    Weiter
                  </Button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStepBack}
                  className="inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors self-start"
                >
                  <HiOutlineArrowLeft className="size-4" />
                  Zurück
                </button>

                <h2 className="text-lg font-semibold text-foreground-heading">
                  Was ist deine Rolle?
                </h2>
                {selectedEbene && (
                  <p className="text-sm text-grey-500 -mt-md">
                    Auf {ebenen.find((e) => e.id === selectedEbene)?.label}-Ebene
                    {selectedBundesland ? ` · ${selectedBundesland}` : ''}
                    {localGroupName ? ` · ${localGroupName}` : ''}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  {selectedEbene &&
                    (rollen[selectedEbene] || []).map((rolle) => (
                      <SelectCard
                        key={rolle}
                        label={rolle}
                        selected={selectedRolle === rolle}
                        onClick={() => handleSelectRolle(rolle)}
                      />
                    ))}
                  <SelectCard
                    label="Sonstige"
                    description="Eigene Rolle eingeben"
                    selected={selectedRolle === 'custom'}
                    onClick={() => setSelectedRolle('custom')}
                  />
                </div>

                {selectedRolle === 'custom' && (
                  <div className="mt-md flex gap-sm">
                    <Input
                      value={customRolle}
                      onChange={(e) => setCustomRolle(e.target.value)}
                      placeholder="z.B. Fraktionsgeschäftsführer*in"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCustomRolleSubmit();
                      }}
                    />
                  </div>
                )}

                {selectedRolle &&
                  selectedRolle !== 'custom' &&
                  needsAbgeordneteName(selectedRolle) && (
                    <div className="mt-md">
                      <p className="mb-sm text-xs text-grey-500">
                        Für welche*n Abgeordnete*n arbeitest du?
                      </p>
                      <div className="relative flex gap-sm">
                        <div className="relative flex-1">
                          <Input
                            value={abgeordneteName}
                            onChange={(e) => setAbgeordneteName(e.target.value)}
                            placeholder={isAustrian ? 'z.B. Sigrid Maurer' : 'z.B. Lisa Badum'}
                            className="w-full"
                            autoComplete="off"
                          />
                          {!isAustrian && (
                            <MdBSuggestions query={abgeordneteName} onSelect={setAbgeordneteName} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                {canGenerate && (
                  <div className="mt-md">
                    <Button onClick={handleGeneratePrompt}>Assistenten erstellen</Button>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              {profileSummary.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Profil</CardTitle>
                      <Button variant="ghost" size="sm" onClick={resetWizard}>
                        Ändern
                      </Button>
                    </div>
                    <CardDescription>Dein gewähltes Profil für den Assistenten</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-sm">
                      {profileSummary.map((label) => (
                        <Badge key={label} variant="secondary" className="text-sm px-md py-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>System-Prompt</CardTitle>
                    <Button variant="ghost" size="sm" onClick={resetWizard}>
                      Neu erstellen
                    </Button>
                  </div>
                  <CardDescription>
                    Der Prompt bestimmt das Verhalten deines Assistenten
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="w-full rounded-lg border border-grey-200 bg-input-bg p-md text-sm leading-relaxed text-foreground resize-vertical placeholder:text-grey-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:border-grey-700"
                    rows={16}
                    placeholder="System-Prompt eingeben oder über den Wizard erstellen…"
                  />
                </CardContent>
              </Card>
            </>
          )}

          {hasChanges && (
            <div className="flex items-center gap-md justify-end pb-lg">
              <Button
                variant="outline"
                onClick={() => {
                  setPromptText(customSystemPrompt || '');
                  if (!customSystemPrompt) resetWizard();
                }}
              >
                Verwerfen
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Speichert…' : 'Speichern'}
              </Button>
            </div>
          )}
        </div>
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(ChatSettingsPage, {
  title: 'Dein Grünerator',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
