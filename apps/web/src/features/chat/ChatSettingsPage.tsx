import { useAgentStore } from '@gruenerator/chat';
import {
  Button,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  MultiStepForm,
  SelectCard,
  Input,
} from '@gruenerator/ui';
import { motion } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';

const MAX_PROMPT_LENGTH = 4000;

const TOOL_LABELS: Array<{ key: string; label: string; description: string }> = [
  { key: 'search', label: 'Dokumentensuche', description: 'Grüne Positionen & Programme' },
  { key: 'web', label: 'Websuche', description: 'Aktuelle Nachrichten & Infos' },
  { key: 'research', label: 'Recherche', description: 'Mehrstufige Analyse' },
  { key: 'examples', label: 'Beispiele', description: 'Social-Media-Vorlagen' },
  { key: 'image', label: 'Bildgenerierung', description: 'KI-Bilder erstellen' },
  { key: 'image_edit', label: 'Bildbearbeitung', description: 'Grüne Transformation' },
];

// --- Step 1: Ebene ---

type Ebene = 'europa' | 'bund' | 'land' | 'kreisverband' | 'ortsverband';

const EBENEN: Array<{ id: Ebene; label: string; icon: string }> = [
  { id: 'europa', label: 'Europa', icon: '🇪🇺' },
  { id: 'bund', label: 'Bund', icon: '🏛️' },
  { id: 'land', label: 'Land', icon: '🏠' },
  { id: 'kreisverband', label: 'Kreisverband', icon: '📍' },
  { id: 'ortsverband', label: 'Ortsverband', icon: '🏘️' },
];

// --- Step 2: Rolle (per Ebene) ---

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

// --- Step 3: Aufgabenbereich (broad categories, same for all) ---

type Aufgabenbereich = 'presse' | 'reden' | 'organisation' | 'buerger' | 'wahlkampf';

const AUFGABENBEREICHE: Array<{ id: Aufgabenbereich; label: string; icon: string }> = [
  { id: 'presse', label: 'Presse & Social Media', icon: '📰' },
  { id: 'reden', label: 'Reden & Anträge', icon: '🎤' },
  { id: 'organisation', label: 'Organisation & Verwaltung', icon: '📋' },
  { id: 'buerger', label: 'Bürger*innen-Kommunikation', icon: '💬' },
  { id: 'wahlkampf', label: 'Wahlkampf', icon: '🗳️' },
];

// --- Step 4: Konkret (specific formats per Aufgabenbereich) ---

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

// --- Component ---

function ChatSettingsPage() {
  const threadId = useAgentStore((s) => s.currentThreadId);
  const customSystemPrompt = useAgentStore((s) => s.customSystemPrompt);
  const customEnabledTools = useAgentStore((s) => s.customEnabledTools);
  const setCustomSystemPrompt = useAgentStore((s) => s.setCustomSystemPrompt);
  const setCustomEnabledTools = useAgentStore((s) => s.setCustomEnabledTools);

  const [promptText, setPromptText] = useState(customSystemPrompt || '');
  const [toolToggles, setToolToggles] = useState<Record<string, boolean>>(customEnabledTools || {});
  const [manualMode, setManualMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Multi-step state
  const [step, setStep] = useState(0);
  const [selectedEbene, setSelectedEbene] = useState<Ebene | null>(null);
  const [selectedRolle, setSelectedRolle] = useState<string | null>(null);
  const [customRolle, setCustomRolle] = useState('');
  const [selectedBereich, setSelectedBereich] = useState<Aufgabenbereich | null>(null);
  const [customKonkret, setCustomKonkret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setPromptText(customSystemPrompt || '');
    setToolToggles(customEnabledTools || {});
    if (customSystemPrompt) setManualMode(true);
  }, [customSystemPrompt, customEnabledTools]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newPrompt = promptText.trim() || null;
      const newTools = Object.keys(toolToggles).length > 0 ? toolToggles : null;

      setCustomSystemPrompt(newPrompt);
      setCustomEnabledTools(newTools);

      if (threadId) {
        await fetch(`/api/chat-service/threads/${threadId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            customSystemPrompt: newPrompt,
            customEnabledTools: newTools,
          }),
        });
      }

      setSuccessMessage('Einstellungen gespeichert');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  }, [promptText, toolToggles, threadId, setCustomSystemPrompt, setCustomEnabledTools]);

  const handleSelectEbene = useCallback((ebene: Ebene) => {
    setSelectedEbene(ebene);
    setSelectedRolle(null);
    setCustomRolle('');
    setSelectedBereich(null);
    setStep(1);
  }, []);

  const handleSelectRolle = useCallback((rolle: string) => {
    setSelectedRolle(rolle);
    setSelectedBereich(null);
    setStep(2);
  }, []);

  const handleCustomRolleSubmit = useCallback(() => {
    if (customRolle.trim()) {
      handleSelectRolle(customRolle.trim());
    }
  }, [customRolle, handleSelectRolle]);

  const handleSelectBereich = useCallback((bereich: Aufgabenbereich) => {
    setSelectedBereich(bereich);
    setStep(3);
  }, []);

  const handleSelectKonkret = useCallback(
    async (konkret: string) => {
      setGenerating(true);

      const ebeneLabel = selectedEbene ? EBENEN.find((e) => e.id === selectedEbene)?.label : '';
      const rolle = selectedRolle === 'custom' ? customRolle : selectedRolle;
      const bereichLabel = selectedBereich
        ? AUFGABENBEREICHE.find((b) => b.id === selectedBereich)?.label
        : '';

      const description = [
        `Ebene: ${ebeneLabel}`,
        `Rolle: ${rolle}`,
        `Aufgabenbereich: ${bereichLabel}`,
        `Konkrete Aufgabe: ${konkret}`,
      ].join('\n');

      try {
        const response = await fetch('/api/chat-service/generate-system-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ description }),
        });

        if (!response.ok) throw new Error('Generation failed');

        const data = await response.json();
        if (data.systemPrompt) {
          setPromptText(data.systemPrompt);
          setManualMode(true);
        }
      } catch (error) {
        console.error('Failed to generate system prompt:', error);
      } finally {
        setGenerating(false);
      }
    },
    [selectedEbene, selectedRolle, customRolle, selectedBereich]
  );

  const toggleTool = useCallback((key: string) => {
    setToolToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetWizard = useCallback(() => {
    setManualMode(false);
    setStep(0);
    setSelectedEbene(null);
    setSelectedRolle(null);
    setCustomRolle('');
    setSelectedBereich(null);
    setCustomKonkret(null);
  }, []);

  const hasChanges =
    promptText !== (customSystemPrompt || '') ||
    JSON.stringify(toolToggles) !== JSON.stringify(customEnabledTools || {});

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <div className="mx-auto max-w-[820px] px-md py-lg">
        <div className="flex flex-col gap-xl">
          {/* Header */}
          <div>
            <Link
              to="/chat"
              className="mb-md inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors"
            >
              <HiOutlineArrowLeft className="size-4" />
              Zurück zum Chat
            </Link>
            <h1 className="text-2xl font-semibold text-foreground-heading">Eigener Chat</h1>
            <p className="mt-xs text-sm text-grey-500">
              Erstelle einen eigenen Assistenten — wähle deine Ebene, Rolle und Aufgabe, oder
              schreibe den System-Prompt selbst.
            </p>
          </div>

          {successMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 p-md text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {/* Mode toggle + content */}
          <Tabs
            value={manualMode ? 'manual' : 'ai'}
            onValueChange={(v) => setManualMode(v === 'manual')}
          >
            <TabsList>
              <TabsTrigger value="ai">KI-generiert</TabsTrigger>
              <TabsTrigger value="manual">Manuell</TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="mt-lg">
              {generating ? (
                <div className="flex flex-col items-center gap-md py-xl">
                  <div className="size-8 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                  <p className="text-sm text-grey-500">System-Prompt wird generiert…</p>
                </div>
              ) : (
                <MultiStepForm currentStep={step} onBack={() => setStep((s) => Math.max(0, s - 1))}>
                  {/* Step 1: Ebene */}
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
                  </MultiStepForm.Step>

                  {/* Step 2: Rolle */}
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
                  </MultiStepForm.Step>

                  {/* Step 3: Aufgabenbereich */}
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

                  {/* Step 4: Konkret */}
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
                            if (e.key === 'Enter' && customKonkret.trim()) {
                              handleSelectKonkret(customKonkret.trim());
                            }
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
              )}
            </TabsContent>

            <TabsContent value="manual" className="mt-lg">
              <textarea
                value={promptText}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_PROMPT_LENGTH) {
                    setPromptText(e.target.value);
                  }
                }}
                placeholder="Du bist ein hilfreicher Assistent, der..."
                className="w-full rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground resize-vertical placeholder:text-grey-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:border-grey-600"
                rows={10}
              />
              {promptText.length > 3000 && (
                <div className="mt-xs text-right text-xs text-grey-400">
                  {promptText.length}/{MAX_PROMPT_LENGTH}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Advanced: Tools */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-grey-500 hover:text-foreground transition-colors"
            >
              {showAdvanced ? '▾ Erweiterte Einstellungen' : '▸ Erweiterte Einstellungen'}
            </button>

            {showAdvanced && (
              <div className="mt-md">
                <h2 className="mb-xs text-sm font-medium text-foreground">Werkzeuge</h2>
                <p className="mb-md text-sm text-grey-500">
                  Welche Werkzeuge darf dein Assistent verwenden?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  {TOOL_LABELS.map(({ key, label, description }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md p-sm transition-colors hover:bg-background-alt"
                    >
                      <div>
                        <div className="text-sm text-foreground">{label}</div>
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
              </div>
            )}
          </div>

          {/* Actions */}
          {hasChanges && (
            <div className="flex items-center gap-sm justify-end">
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
