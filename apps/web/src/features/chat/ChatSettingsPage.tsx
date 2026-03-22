import { useAgentStore } from '@gruenerator/chat';
import {
  Button,
  Switch,
  MultiStepForm,
  SelectCard,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { PROMPT_TEMPLATES, fillTemplate } from './customChatTemplates';
import { searchMdBs, type MdB } from './grueneMdBs';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';

const TOOL_LABELS: Array<{ key: string; label: string; description: string }> = [
  { key: 'search', label: 'Dokumentensuche', description: 'Grüne Positionen & Programme' },
  { key: 'web', label: 'Websuche', description: 'Aktuelle Nachrichten & Infos' },
  { key: 'research', label: 'Recherche', description: 'Mehrstufige Analyse' },
  { key: 'examples', label: 'Beispiele', description: 'Social-Media-Vorlagen' },
  { key: 'image', label: 'Bildgenerierung', description: 'KI-Bilder erstellen' },
  { key: 'image_edit', label: 'Bildbearbeitung', description: 'Grüne Transformation' },
];

type Ebene = 'europa' | 'bund' | 'land' | 'kreisverband' | 'ortsverband';

const EBENEN: Array<{ id: Ebene; label: string; icon: string }> = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'kreisverband', label: 'Kreisverband', icon: '📍' },
  { id: 'ortsverband', label: 'Ortsverband', icon: '🏘️' },
];

const BUNDESLAENDER: Array<{ label: string; notebookId?: string }> = [
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

const ROLLEN: Record<Ebene, string[]> = {
  europa: [
    'Mitarbeiter*in EU-Abgeordnete*r',
    'Referent*in Europapolitik',
    'Pressesprecher*in EU-Delegation',
  ],
  bund: [
    'Mitarbeiter*in Bundestagsbüro',
    'Referent*in Bundesgeschäftsstelle',
    'Pressesprecher*in',
    'Wahlkampfmanager*in',
    'Referent*in Bundestagsfraktion',
  ],
  land: [
    'Mitarbeiter*in Landesgeschäftsstelle',
    'Referent*in Landtagsfraktion',
    'Pressesprecher*in Landesverband',
    'Wahlkreismitarbeiter*in',
  ],
  kreisverband: ['Kreisvorstand', 'Geschäftsführer*in Kreisverband', 'Pressesprecher*in'],
  ortsverband: ['Ortsvorstand', 'Mitglied Ortsverband'],
};

type Aufgabenbereich = 'presse' | 'reden' | 'organisation' | 'buerger' | 'wahlkampf';

const AUFGABENBEREICHE: Array<{ id: Aufgabenbereich; label: string; icon: string }> = [
  { id: 'presse', label: 'Presse & Social Media', icon: '📰' },
  { id: 'reden', label: 'Reden & Anträge', icon: '🎤' },
  { id: 'organisation', label: 'Organisation & Verwaltung', icon: '📋' },
  { id: 'buerger', label: 'Bürger*innen-Kommunikation', icon: '💬' },
  { id: 'wahlkampf', label: 'Wahlkampf', icon: '🗳️' },
];

const KONKRET: Record<Aufgabenbereich, string[]> = {
  presse: [
    'Pressemitteilungen',
    'Social-Media-Posts',
    'Newsletter',
    'Medienanfragen beantworten',
    'Kommunikationsstrategie',
  ],
  reden: [
    'Reden schreiben',
    'Anträge formulieren',
    'Briefings erstellen',
    'Stellungnahmen verfassen',
  ],
  organisation: [
    'Sitzungen vorbereiten',
    'Einladungen schreiben',
    'Protokolle erstellen',
    'Veranstaltungen planen',
  ],
  buerger: [
    'Bürger*innen-Anfragen beantworten',
    'Leserbriefe verfassen',
    'Informationsmaterial erstellen',
  ],
  wahlkampf: ['Wahlkampfstrategie', 'Flyer-Texte', 'Social-Media-Kampagnen', 'Wahlprogramm-Texte'],
};

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

function needsAbgeordneteName(rolle: string) {
  const lower = rolle.toLowerCase();
  return lower.includes('abgeordnete') || lower.includes('bundestagsbüro');
}

function ChatSettingsPage() {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const customSystemPrompt = useAgentStore((s) => s.customSystemPrompt);
  const customEnabledTools = useAgentStore((s) => s.customEnabledTools);
  const setCustomSystemPrompt = useAgentStore((s) => s.setCustomSystemPrompt);
  const setCustomEnabledTools = useAgentStore((s) => s.setCustomEnabledTools);

  const [promptText, setPromptText] = useState(customSystemPrompt || '');
  const [toolToggles, setToolToggles] = useState<Record<string, boolean>>(customEnabledTools || {});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [showWizard, setShowWizard] = useState(!customSystemPrompt);

  // Multi-step state
  const [step, setStep] = useState(0);
  const [selectedEbene, setSelectedEbene] = useState<Ebene | null>(null);
  const [selectedBundesland, setSelectedBundesland] = useState<string | null>(null);
  const [selectedRolle, setSelectedRolle] = useState<string | null>(null);
  const [customRolle, setCustomRolle] = useState('');
  const [selectedBereich, setSelectedBereich] = useState<Aufgabenbereich | null>(null);
  const [customKonkret, setCustomKonkret] = useState<string | null>(null);
  const [abgeordneteName, setAbgeordneteName] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setPromptText(customSystemPrompt || '');
    setToolToggles(customEnabledTools || {});
    setShowWizard(!customSystemPrompt);
  }, [customSystemPrompt, customEnabledTools]);

  useEffect(() => () => clearTimeout(successTimerRef.current), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newPrompt = promptText.trim() || null;
      const newTools = Object.keys(toolToggles).length > 0 ? toolToggles : null;

      setCustomSystemPrompt(newPrompt);
      setCustomEnabledTools(newTools);

      if (newPrompt) {
        useAgentStore.getState().setThreadMode('eigener');
      }

      if (selectedBundesland) {
        const bl = BUNDESLAENDER.find((b) => b.label === selectedBundesland);
        if (bl?.notebookId) {
          useAgentStore.getState().setSelectedNotebook(bl.notebookId);
        }
      }

      if (threadId) {
        const res = await fetch(`/api/chat-service/threads/${threadId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            customSystemPrompt: newPrompt,
            customEnabledTools: newTools,
          }),
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`Save failed: ${res.status}`);
        }
      }

      setShowWizard(false);
      setSuccessMessage('Einstellungen gespeichert');
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save chat settings:', error);
      setSuccessMessage(null);
    } finally {
      setSaving(false);
    }
  }, [
    promptText,
    toolToggles,
    threadId,
    selectedBundesland,
    setCustomSystemPrompt,
    setCustomEnabledTools,
  ]);

  const handleSelectEbene = useCallback((ebene: Ebene) => {
    setSelectedEbene(ebene);
    setSelectedBundesland(null);
    setSelectedRolle(null);
    setCustomRolle('');
    setAbgeordneteName('');
    setSelectedBereich(null);
    if (ebene !== 'land') setStep(1);
  }, []);

  const handleSelectBundesland = useCallback((bundesland: string) => {
    setSelectedBundesland(bundesland);
    setStep(1);
  }, []);

  const handleSelectRolle = useCallback((rolle: string) => {
    setSelectedRolle(rolle);
    setAbgeordneteName('');
    setSelectedBereich(null);
    if (!needsAbgeordneteName(rolle)) setStep(2);
  }, []);

  const handleAbgeordneteSubmit = useCallback(() => {
    if (abgeordneteName.trim()) setStep(2);
  }, [abgeordneteName]);

  const handleCustomRolleSubmit = useCallback(() => {
    if (customRolle.trim()) handleSelectRolle(customRolle.trim());
  }, [customRolle, handleSelectRolle]);

  const handleSelectBereich = useCallback((bereich: Aufgabenbereich) => {
    setSelectedBereich(bereich);
    setStep(3);
  }, []);

  const handleSelectKonkret = useCallback(
    async (konkret: string) => {
      const ebeneLabel = selectedEbene
        ? EBENEN.find((e) => e.id === selectedEbene)?.label || ''
        : '';
      const rolle = selectedRolle === 'custom' ? customRolle : selectedRolle || '';

      const template = PROMPT_TEMPLATES[konkret];
      if (template) {
        setPromptText(
          fillTemplate(
            template,
            ebeneLabel,
            rolle,
            abgeordneteName.trim() || undefined,
            selectedBundesland || undefined
          )
        );
        setShowWizard(false);
        return;
      }

      setGenerating(true);
      const bereichLabel = selectedBereich
        ? AUFGABENBEREICHE.find((b) => b.id === selectedBereich)?.label
        : '';

      const lines = [
        `Ebene: ${ebeneLabel}`,
        `Rolle: ${rolle}`,
        `Aufgabenbereich: ${bereichLabel}`,
        `Konkrete Aufgabe: ${konkret}`,
      ];
      if (abgeordneteName.trim()) lines.push(`Abgeordnete*r: ${abgeordneteName.trim()}`);
      if (selectedBundesland) lines.push(`Bundesland: ${selectedBundesland}`);

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
    },
    [
      selectedEbene,
      selectedRolle,
      customRolle,
      selectedBereich,
      abgeordneteName,
      selectedBundesland,
    ]
  );

  const toggleTool = useCallback((key: string) => {
    setToolToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetWizard = useCallback(() => {
    setShowWizard(true);
    setPromptText('');
    setStep(0);
    setSelectedEbene(null);
    setSelectedBundesland(null);
    setSelectedRolle(null);
    setCustomRolle('');
    setAbgeordneteName('');
    setSelectedBereich(null);
    setCustomKonkret(null);
  }, []);

  const hasChanges = useMemo(
    () =>
      promptText !== (customSystemPrompt || '') ||
      JSON.stringify(toolToggles) !== JSON.stringify(customEnabledTools || {}),
    [promptText, customSystemPrompt, toolToggles, customEnabledTools]
  );

  const profileSummary = useMemo(
    () =>
      [
        selectedEbene && EBENEN.find((e) => e.id === selectedEbene)?.label,
        selectedBundesland,
        selectedRolle && selectedRolle !== 'custom' ? selectedRolle : customRolle || null,
        selectedBereich && AUFGABENBEREICHE.find((b) => b.id === selectedBereich)?.label,
      ].filter(Boolean) as string[],
    [selectedEbene, selectedBundesland, selectedRolle, customRolle, selectedBereich]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full overflow-y-auto"
    >
      <div className="mx-auto max-w-[960px] px-lg py-xl">
        <div className="flex flex-col gap-lg">
          {/* Header */}
          <div>
            <Link
              to="/chat"
              className="mb-lg inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors"
            >
              <HiOutlineArrowLeft className="size-4" />
              Zurück zum Chat
            </Link>
            <h1 className="text-3xl font-semibold text-foreground-heading">Eigener Chat</h1>
            <p className="mt-sm text-base text-grey-500">
              Erstelle einen eigenen Assistenten — wähle deine Ebene, Rolle und Aufgabe.
            </p>
          </div>

          {successMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-lg py-md text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {/* Wizard (first-time creation) or Overview (editing existing) */}
          {showWizard ? (
            generating ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-md py-2xl">
                  <div className="size-8 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                  <p className="text-sm text-grey-500">System-Prompt wird generiert…</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-lg">
                  <MultiStepForm
                    currentStep={step}
                    onBack={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    <MultiStepForm.Step title="Auf welcher Ebene bist du aktiv?">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                        {EBENEN.map((e) => (
                          <SelectCard
                            key={e.id}
                            icon={e.icon}
                            label={e.label}
                            selected={selectedEbene === e.id}
                            onClick={() => handleSelectEbene(e.id)}
                          />
                        ))}
                      </div>
                      {selectedEbene === 'land' && (
                        <div className="mt-lg">
                          <p className="mb-sm text-xs text-grey-500">In welchem Bundesland?</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-xs">
                            {BUNDESLAENDER.map((bl) => (
                              <button
                                key={bl.label}
                                type="button"
                                onClick={() => handleSelectBundesland(bl.label)}
                                className={`rounded-md px-2.5 py-1.5 text-xs text-left transition-colors ${
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
                        </div>
                      )}
                    </MultiStepForm.Step>

                    <MultiStepForm.Step
                      title="Was ist deine Rolle?"
                      subtitle={
                        selectedEbene
                          ? `Auf ${EBENEN.find((e) => e.id === selectedEbene)?.label}-Ebene`
                          : undefined
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                        {selectedEbene &&
                          ROLLEN[selectedEbene].map((rolle) => (
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
                          <Button
                            onClick={handleCustomRolleSubmit}
                            disabled={!customRolle.trim()}
                            size="sm"
                          >
                            Weiter
                          </Button>
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
                                  placeholder="z.B. Lisa Badum"
                                  className="w-full"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAbgeordneteSubmit();
                                  }}
                                  autoComplete="off"
                                />
                                <MdBSuggestions
                                  query={abgeordneteName}
                                  onSelect={(name) => {
                                    setAbgeordneteName(name);
                                    setStep(2);
                                  }}
                                />
                              </div>
                              <Button
                                onClick={handleAbgeordneteSubmit}
                                disabled={!abgeordneteName.trim()}
                                size="sm"
                              >
                                Weiter
                              </Button>
                            </div>
                          </div>
                        )}
                    </MultiStepForm.Step>

                    <MultiStepForm.Step
                      title="In welchem Bereich brauchst du Unterstützung?"
                      subtitle={
                        selectedRolle && selectedRolle !== 'custom'
                          ? selectedRolle
                          : customRolle || undefined
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                        {AUFGABENBEREICHE.map((b) => (
                          <SelectCard
                            key={b.id}
                            icon={b.icon}
                            label={b.label}
                            selected={selectedBereich === b.id}
                            onClick={() => handleSelectBereich(b.id)}
                          />
                        ))}
                      </div>
                    </MultiStepForm.Step>

                    <MultiStepForm.Step
                      title="Was genau?"
                      subtitle={
                        selectedBereich
                          ? AUFGABENBEREICHE.find((b) => b.id === selectedBereich)?.label
                          : undefined
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                        {selectedBereich &&
                          KONKRET[selectedBereich].map((k) => (
                            <SelectCard key={k} label={k} onClick={() => handleSelectKonkret(k)} />
                          ))}
                        <SelectCard
                          label="Sonstige"
                          description="Eigene Aufgabe eingeben"
                          selected={customKonkret !== null}
                          onClick={() => setCustomKonkret('')}
                        />
                      </div>
                      {customKonkret !== null && (
                        <div className="mt-md flex gap-sm">
                          <Input
                            value={customKonkret}
                            onChange={(e) => setCustomKonkret(e.target.value)}
                            placeholder="z.B. Wahlprogramme erstellen"
                            className="flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customKonkret.trim())
                                handleSelectKonkret(customKonkret.trim());
                            }}
                          />
                          <Button
                            onClick={() =>
                              customKonkret.trim() && handleSelectKonkret(customKonkret.trim())
                            }
                            disabled={!customKonkret.trim()}
                            size="sm"
                          >
                            Erstellen
                          </Button>
                        </div>
                      )}
                    </MultiStepForm.Step>
                  </MultiStepForm>
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {/* Profile Summary */}
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

              {/* System Prompt */}
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

              {/* Tools */}
              <Card>
                <CardHeader>
                  <CardTitle>Werkzeuge</CardTitle>
                  <CardDescription>Welche Werkzeuge darf dein Assistent verwenden?</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    {TOOL_LABELS.map(({ key, label, description }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg p-md transition-colors hover:bg-background-alt"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{label}</div>
                          <div className="text-xs text-grey-500">{description}</div>
                        </div>
                        <Switch
                          size="sm"
                          checked={toolToggles[key] !== false}
                          onCheckedChange={() => toggleTool(key)}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Actions */}
          {hasChanges && (
            <div className="flex items-center gap-md justify-end pb-lg">
              <Button
                variant="outline"
                onClick={() => {
                  setPromptText(customSystemPrompt || '');
                  setToolToggles(customEnabledTools || {});
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
      </div>
    </motion.div>
  );
}

export default withAuthRequired(ChatSettingsPage, {
  title: 'Chat-Einstellungen',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
