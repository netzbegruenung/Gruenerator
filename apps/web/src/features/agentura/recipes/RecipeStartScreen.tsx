import { AIPromptInput, type AIPromptInputExample, Button, SectionHeader } from '@gruenerator/ui';
import { useVoxtralDictation } from '@gruenerator/voice';
import { useNavigate } from 'react-router-dom';

import { PhosphorIcon } from '../../agents/icons/PhosphorIcon';
import { MarketCard } from '../components/MarketCard';

import { useOwnRecipes } from './api';

import PageContainer from '@/components/common/PageContainer';

interface RecipeStartScreenProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  error?: string | null;
  /** Skip the AI draft and open the wizard straight on the Anleitung tab, where the examples option lives. */
  onLearnFromExamples: () => void;
  /** Skip the AI draft and open an empty wizard. */
  onManual: () => void;
}

const EXAMPLE_PROMPTS: AIPromptInputExample[] = [
  {
    label: '📨 Einladung',
    text: 'Ein Rezept für Einladungen zur Mitgliederversammlung: förmlicher Ton, mit Tagesordnung und Anmeldehinweis.',
  },
  {
    label: '✉️ Bürger*innen-Mails',
    text: 'Ein Rezept für Antworten auf Bürger*innen-Mails: persönlich, verständlich, mit einer kurzen Zusammenfassung am Anfang.',
  },
  {
    label: '💼 LinkedIn-Post',
    text: 'Ein Rezept für LinkedIn-Posts des Kreisverbands: professioneller Ton, kurze Absätze, endet mit einer Frage an die Leser*innen.',
  },
];

/**
 * Entry screen of the guided recipe creator: describe the recipe in one
 * brief, the AI drafts it, and a card grid of the user's own recipes lives
 * below. Mirrors `agents/AgentStartScreen.tsx`.
 */
function RecipeStartScreen({
  description,
  onDescriptionChange,
  onGenerate,
  isLoading,
  error,
  onLearnFromExamples,
  onManual,
}: RecipeStartScreenProps) {
  const navigate = useNavigate();
  const { data: recipes = [] } = useOwnRecipes(true);
  // Presets and Landesverbands-Rezept overrides already have a row elsewhere
  // (`TexteAnlernenTab`'s convention) and a group share isn't authored by this
  // user — only a user's own custom recipes belong in "Meine Rezepte".
  const ownRecipes = recipes.filter((r) => r.kind === 'custom' && !r.sharedFromGroup);

  return (
    <PageContainer
      maxWidth="md"
      title="Welches Rezept möchtest du anlegen?"
      subtitle="Ein Rezept ist eine Schreibvorgabe für Aufbau, Ton und Länge, die du im Chat per @mention aufrufst. Beschreibe es kurz — daraus entsteht ein Entwurf, den du vor dem Anlegen noch anpassen kannst."
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-sm">
        <AIPromptInput
          useDictation={useVoxtralDictation}
          value={description}
          onChange={onDescriptionChange}
          onSubmit={onGenerate}
          placeholder="Beschreibe dein neues Rezept..."
          isLoading={isLoading}
          error={error}
          examples={EXAMPLE_PROMPTS}
          rows={2}
        />
        <div className="flex justify-center gap-sm">
          <Button variant="link" size="sm" onClick={onLearnFromExamples}>
            Aus Beispielen anlernen
          </Button>
          <Button variant="link" size="sm" onClick={onManual}>
            Lieber manuell anlegen?
          </Button>
        </div>
      </div>

      {ownRecipes.length > 0 && (
        <section className="mx-auto mt-xl w-full max-w-3xl">
          <SectionHeader title="Meine Rezepte" />
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            {ownRecipes.map((recipe) => (
              <MarketCard
                key={recipe.id}
                icon={<PhosphorIcon name={recipe.iconKey ?? 'PiSparkle'} />}
                title={recipe.title}
                headingLevel={3}
                meta="Rezept"
                description={recipe.description ?? ''}
                onSelect={() =>
                  void navigate(`/agentura/rezept/${encodeURIComponent(recipe.mention)}`)
                }
              />
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}

export default RecipeStartScreen;
