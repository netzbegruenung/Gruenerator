import {
  Button,
  SelectCard,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  SmartInput,
  type SmartInputOption,
} from '@gruenerator/ui';
import { useState, useCallback, useMemo, memo } from 'react';
import { HiOutlineArrowLeft, HiOutlineTrash, HiPlus } from 'react-icons/hi2';

import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { useUserDefaultsStore } from '../../stores/userDefaultsStore';

import { searchMdBs } from './grueneMdBs';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import PageContainer from '@/components/common/PageContainer';
import ErrorBoundary from '@/components/ErrorBoundary';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserRole {
  ebene: string;
  rolle: string;
  bundesland?: string;
  gliederung?: string;
  abgeordnete?: string;
  instructions?: string;
  systemPrompt?: string;
}

interface EbeneConfig {
  id: string;
  label: string;
  icon: string;
}

interface BundeslandConfig {
  label: string;
  notebookId?: string;
}

// ─── Config Data ─────────────────────────────────────────────────────────────

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

// ─── Prompt Generation ───────────────────────────────────────────────────────

function generateProfilePrompt(roles: UserRole[], isAustrian: boolean): string {
  if (roles.length === 0) return '';

  const partyName = isAustrian ? 'Die Grünen – Die Grüne Alternative' : 'Bündnis 90/Die Grünen';

  const roleLines = roles.map((r) => {
    const parts = [r.rolle];
    if (r.gliederung) parts.push(r.gliederung);
    if (r.bundesland) parts.push(r.bundesland);
    if (r.abgeordnete) parts.push(`(${r.abgeordnete})`);
    let line = `- ${parts.join(', ')}`;
    if (r.instructions) line += `\n  Hinweis: ${r.instructions}`;
    return line;
  });

  return `Du unterstützt eine*n Mitarbeiter*in von ${partyName} mit folgenden Rollen:\n\n${roleLines.join('\n')}\n\nPasse deine Antworten an die jeweils relevante Rolle an. Berücksichtige die Zuständigkeiten und die Ebene bei Stil, Detailtiefe und Zielgruppe.`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function RoleCard({
  role,
  ebenen,
  onDelete,
}: {
  role: UserRole;
  ebenen: EbeneConfig[];
  onDelete: () => void;
}) {
  const ebene = ebenen.find((e) => e.id === role.ebene);
  const subtitle = [role.gliederung, role.bundesland].filter(Boolean).join(' · ');

  return (
    <div className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md transition-colors">
      <span className="text-lg shrink-0">{ebene?.icon || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground-heading m-0 truncate">{role.rolle}</p>
        {subtitle && <p className="text-xs text-grey-500 m-0 truncate">{subtitle}</p>}
        {role.abgeordnete && (
          <p className="text-xs text-grey-400 m-0 truncate">{role.abgeordnete}</p>
        )}
        {role.systemPrompt && (
          <p className="text-xs text-grey-400 italic m-0 line-clamp-1">
            {role.systemPrompt.slice(0, 80)}…
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 p-1 text-grey-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 max-sm:opacity-100"
        aria-label="Rolle entfernen"
      >
        <HiOutlineTrash className="size-4" />
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type WizardStep = 'ebene' | 'bundesland' | 'gliederung' | 'rolle';

function ChatSettingsPage() {
  const locale = useAuthStore((s) => s.locale);
  const isAustrian = locale === 'de-AT';
  const getDefault = useUserDefaultsStore((s) => s.getDefault);
  const setDefault = useUserDefaultsStore((s) => s.setDefault);

  const ebenen = isAustrian ? AT_EBENEN : DE_EBENEN;
  const rollenMap = isAustrian ? AT_ROLLEN : DE_ROLLEN;
  const bundeslaender = isAustrian ? AT_BUNDESLAENDER : DE_BUNDESLAENDER;

  const bundeslandOptions: SmartInputOption[] = useMemo(
    () =>
      bundeslaender.map((bl) => ({
        value: bl.label,
        label: bl.label,
        description: bl.notebookId ? '● Notebook' : undefined,
      })),
    [bundeslaender]
  );

  const [roles, setRoles] = useState<UserRole[]>(
    () => getDefault<UserRole[]>('profile', 'roles') || []
  );

  // Wizard state for adding a new role
  const [addingRole, setAddingRole] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('ebene');
  const [wizEbene, setWizEbene] = useState<string | null>(null);
  const [wizBundesland, setWizBundesland] = useState<string | null>(null);
  const [wizBundeslandQuery, setWizBundeslandQuery] = useState('');
  const [wizGliederung, setWizGliederung] = useState('');
  const [wizRolle, setWizRolle] = useState<string | null>(null);
  const [wizCustomRolle, setWizCustomRolle] = useState('');
  const [wizAbgeordnete, setWizAbgeordnete] = useState('');
  const [wizInstructions, setWizInstructions] = useState('');

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);

  // ─── Wizard handlers ─────────────────────────────────────────────────────

  const startAddRole = useCallback(() => {
    setAddingRole(true);
    setWizardStep('ebene');
    setWizEbene(null);
    setWizBundesland(null);
    setWizBundeslandQuery('');
    setWizGliederung('');
    setWizRolle(null);
    setWizCustomRolle('');
    setWizAbgeordnete('');
    setWizInstructions('');
  }, []);

  const cancelAddRole = useCallback(() => {
    setAddingRole(false);
  }, []);

  const handleWizEbene = useCallback((ebene: string) => {
    setWizEbene(ebene);
    setWizBundesland(null);
    setWizBundeslandQuery('');
    setWizGliederung('');
    setWizRolle(null);
    setWizCustomRolle('');
    setWizAbgeordnete('');
    if (NEEDS_BUNDESLAND.has(ebene)) {
      setWizardStep('bundesland');
    } else {
      setWizardStep('rolle');
    }
  }, []);

  const handleWizBundesland = useCallback(
    (bundesland: string) => {
      setWizBundesland(bundesland);
      setWizBundeslandQuery(bundesland);
      if (wizEbene && NEEDS_LOCAL_NAME.has(wizEbene)) {
        setWizardStep('gliederung');
      } else {
        setWizardStep('rolle');
      }
    },
    [wizEbene]
  );

  const handleWizGliederungSubmit = useCallback(() => {
    if (wizGliederung.trim()) setWizardStep('rolle');
  }, [wizGliederung]);

  const handleWizStepBack = useCallback(() => {
    if (wizardStep === 'rolle') {
      if (wizEbene && NEEDS_LOCAL_NAME.has(wizEbene)) setWizardStep('gliederung');
      else if (wizEbene && NEEDS_BUNDESLAND.has(wizEbene)) setWizardStep('bundesland');
      else setWizardStep('ebene');
    } else if (wizardStep === 'gliederung') {
      setWizardStep('bundesland');
    } else if (wizardStep === 'bundesland') {
      setWizardStep('ebene');
    }
  }, [wizardStep, wizEbene]);

  const handleWizSelectRolle = useCallback((rolle: string) => {
    setWizRolle(rolle);
    setWizAbgeordnete('');
  }, []);

  const handleWizCustomRolleSubmit = useCallback(() => {
    if (wizCustomRolle.trim()) handleWizSelectRolle(wizCustomRolle.trim());
  }, [wizCustomRolle, handleWizSelectRolle]);

  const canAddRole = useMemo(() => {
    if (!wizRolle) return false;
    if (wizRolle === 'custom' && !wizCustomRolle.trim()) return false;
    if (needsAbgeordneteName(wizRolle) && !wizAbgeordnete.trim()) return false;
    return true;
  }, [wizRolle, wizCustomRolle, wizAbgeordnete]);

  const handleAddRole = useCallback(async () => {
    if (!canAddRole || !wizEbene) return;

    const ebeneLabel = ebenen.find((e) => e.id === wizEbene)?.label || '';
    const rolle = wizRolle === 'custom' ? wizCustomRolle.trim() : wizRolle!;

    // Build description for AI prompt generation
    const lines = [`Ebene: ${ebeneLabel}`, `Rolle: ${rolle}`];
    if (wizBundesland) lines.push(`Bundesland: ${wizBundesland}`);
    if (wizGliederung.trim()) lines.push(`${ebeneLabel}: ${wizGliederung.trim()}`);
    if (wizAbgeordnete.trim()) lines.push(`Abgeordnete*r: ${wizAbgeordnete.trim()}`);
    if (isAustrian) lines.push('Land: Österreich (Die Grünen – Die Grüne Alternative)');
    if (wizInstructions.trim()) lines.push(`Zusätzliche Anweisungen: ${wizInstructions.trim()}`);

    setGenerating(true);

    try {
      const response = await fetch('/api/chat-service/generate-system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description: lines.join('\n') }),
      });

      const newRole: UserRole = {
        ebene: wizEbene,
        rolle,
      };
      if (wizBundesland) newRole.bundesland = wizBundesland;
      if (wizGliederung.trim()) newRole.gliederung = wizGliederung.trim();
      if (wizAbgeordnete.trim()) newRole.abgeordnete = wizAbgeordnete.trim();
      if (wizInstructions.trim()) newRole.instructions = wizInstructions.trim();

      if (response.ok) {
        const data = await response.json();
        if (data.systemPrompt) newRole.systemPrompt = data.systemPrompt;
      }

      setRoles((prev) => [...prev, newRole]);
      setAddingRole(false);
    } catch (error) {
      console.error('Failed to generate system prompt:', error);
    } finally {
      setGenerating(false);
    }
  }, [
    canAddRole,
    wizEbene,
    wizRolle,
    wizCustomRolle,
    wizBundesland,
    wizGliederung,
    wizAbgeordnete,
    wizInstructions,
    isAustrian,
    ebenen,
  ]);

  const handleDeleteRole = useCallback((index: number) => {
    setRoles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      void setDefault('profile', 'roles', roles);

      const prompt = generateProfilePrompt(roles, isAustrian);
      await apiClient.put('/auth/profile', { custom_prompt: prompt || null });

      setSuccessMessage('Profil gespeichert');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  }, [roles, isAustrian, setDefault]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderWizardBack = (
    <button
      type="button"
      onClick={handleWizStepBack}
      className="inline-flex items-center gap-xs text-sm text-grey-500 hover:text-foreground transition-colors self-start"
    >
      <HiOutlineArrowLeft className="size-4" />
      Zurück
    </button>
  );

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

          {addingRole ? (
            // ─── Add Role Wizard ───────────────────────────────────────────
            generating ? (
              <div className="flex flex-col items-center gap-md py-2xl">
                <div className="size-8 animate-spin rounded-full border-2 border-grey-300 border-t-primary-500" />
                <p className="text-sm text-grey-500">System-Prompt wird generiert…</p>
              </div>
            ) : wizardStep === 'ebene' ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground-heading m-0">
                    Rolle hinzufügen
                  </h2>
                  <Button variant="ghost" size="sm" onClick={cancelAddRole}>
                    Abbrechen
                  </Button>
                </div>
                <p className="text-sm text-grey-500 -mt-md">Auf welcher Ebene bist du aktiv?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  {ebenen.map((e) => (
                    <SelectCard
                      key={e.id}
                      icon={e.icon}
                      label={e.label}
                      selected={wizEbene === e.id}
                      onClick={() => handleWizEbene(e.id)}
                    />
                  ))}
                </div>
              </>
            ) : wizardStep === 'bundesland' ? (
              <>
                {renderWizardBack}
                <h2 className="text-lg font-semibold text-foreground-heading">
                  In welchem Bundesland?
                </h2>
                <SmartInput
                  value={wizBundeslandQuery}
                  onValueChange={(v) => setWizBundeslandQuery(v)}
                  options={bundeslandOptions}
                  placeholder="Bundesland eingeben..."
                  emptyMessage="Kein Bundesland gefunden"
                  autoFocus
                  onSubmit={() => {
                    const match = bundeslaender.find(
                      (bl) => bl.label.toLowerCase() === wizBundeslandQuery.toLowerCase()
                    );
                    if (match) handleWizBundesland(match.label);
                  }}
                />
              </>
            ) : wizardStep === 'gliederung' ? (
              <>
                {renderWizardBack}
                <h2 className="text-lg font-semibold text-foreground-heading">
                  {LOCAL_NAME_LABELS[wizEbene || ''] || 'Name deiner Gliederung'}
                </h2>
                <p className="text-sm text-grey-500 -mt-md">{wizBundesland}</p>
                <div className="flex gap-sm">
                  <Input
                    value={wizGliederung}
                    onChange={(e) => setWizGliederung(e.target.value)}
                    placeholder={LOCAL_NAME_PLACEHOLDERS[wizEbene || ''] || ''}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleWizGliederungSubmit();
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={handleWizGliederungSubmit}
                    disabled={!wizGliederung.trim()}
                    size="sm"
                  >
                    Weiter
                  </Button>
                </div>
              </>
            ) : (
              <>
                {renderWizardBack}
                <h2 className="text-lg font-semibold text-foreground-heading">
                  Was ist deine Rolle?
                </h2>
                {wizEbene && (
                  <p className="text-sm text-grey-500 -mt-md">
                    {ebenen.find((e) => e.id === wizEbene)?.label}
                    {wizBundesland ? ` · ${wizBundesland}` : ''}
                    {wizGliederung ? ` · ${wizGliederung}` : ''}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                  {wizEbene &&
                    (rollenMap[wizEbene] || []).map((rolle) => (
                      <SelectCard
                        key={rolle}
                        label={rolle}
                        selected={wizRolle === rolle}
                        onClick={() => handleWizSelectRolle(rolle)}
                      />
                    ))}
                  <SelectCard
                    label="Sonstige"
                    description="Eigene Rolle eingeben"
                    selected={wizRolle === 'custom'}
                    onClick={() => setWizRolle('custom')}
                  />
                </div>

                {wizRolle === 'custom' && (
                  <div className="flex gap-sm">
                    <Input
                      value={wizCustomRolle}
                      onChange={(e) => setWizCustomRolle(e.target.value)}
                      placeholder="z.B. Fraktionsgeschäftsführer*in"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleWizCustomRolleSubmit();
                      }}
                    />
                  </div>
                )}

                {wizRolle && wizRolle !== 'custom' && needsAbgeordneteName(wizRolle) && (
                  <div>
                    <p className="mb-sm text-xs text-grey-500">
                      Für welche*n Abgeordnete*n arbeitest du?
                    </p>
                    <div className="relative">
                      <Input
                        value={wizAbgeordnete}
                        onChange={(e) => setWizAbgeordnete(e.target.value)}
                        placeholder={isAustrian ? 'z.B. Sigrid Maurer' : 'z.B. Lisa Badum'}
                        autoComplete="off"
                      />
                      {!isAustrian && (
                        <MdBSuggestions query={wizAbgeordnete} onSelect={setWizAbgeordnete} />
                      )}
                    </div>
                  </div>
                )}

                {canAddRole && (
                  <>
                    <div>
                      <p className="mb-sm text-xs text-grey-500">
                        Zusätzliche Anweisungen für diese Rolle (optional)
                      </p>
                      <textarea
                        value={wizInstructions}
                        onChange={(e) => setWizInstructions(e.target.value)}
                        className="w-full rounded-lg border border-grey-200 bg-input-bg p-md text-sm leading-relaxed text-foreground resize-vertical placeholder:text-grey-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:border-grey-700"
                        rows={3}
                        placeholder="z.B. Schreibe Pressemitteilungen immer mit Zitat des Fraktionsvorsitzenden."
                      />
                    </div>
                    <Button onClick={handleAddRole} disabled={generating}>
                      Rolle hinzufügen
                    </Button>
                  </>
                )}
              </>
            )
          ) : (
            // ─── Role List + Freetext ──────────────────────────────────────
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Deine Rollen</CardTitle>
                    {roles.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={startAddRole}>
                        <HiPlus className="size-4 mr-1" />
                        Hinzufügen
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    Definiere deine Rollen — der Grünerator passt sich automatisch an.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {roles.length === 0 ? (
                    <div className="text-center py-md">
                      <Button variant="outline" onClick={startAddRole}>
                        <HiPlus className="size-4 mr-1" />
                        Erste Rolle hinzufügen
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-sm">
                      {roles.map((role, i) => (
                        <RoleCard
                          key={`${role.ebene}-${role.rolle}-${i}`}
                          role={role}
                          ebenen={ebenen}
                          onDelete={() => handleDeleteRole(i)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end pb-lg">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Speichert…' : 'Speichern'}
                </Button>
              </div>
            </>
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
