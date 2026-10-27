import { useSkillFavoritesStore } from '@gruenerator/chat';
import { agentKey, agentRef, agenturaMetaLine, getAgentSlug } from '@gruenerator/shared/agents';
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDeleteUserAgent, type ForeignAgent } from '../../agents/api';
import { useTrashUndoToast } from '../../trash/trashUndoToast';
import { MarketCard } from '../components/MarketCard';
import { RecurringTaskCard } from '../components/RecurringTaskCard';
import { hasKnowledge, toolCount } from '../lib/capabilities';
import { SKILL_CATEGORY_LABELS } from '../lib/categories';
import { isLandesverbandIdentifier, landesverbandLabel } from '../lib/lookups';
import {
  AgentIcon,
  libraryRefOf,
  type AgentEntry,
  type MarketItem,
  type RecipeEntry,
} from '../lib/marketItems';

import { useDuplicateAgent } from './useDuplicateAgent';
import { useUserLibrary } from './useUserLibrary';

import type { Agent } from '@gruenerator/shared/agents';

import useAgentFavoritesStore from '@/stores/agentFavoritesStore';

/** „Agent · 5 Tools · Wissen" — die Zeile, die den Typ-Badge ersetzt. */
function agentMeta(agent: ForeignAgent): string {
  const tools = toolCount(agent);
  return agenturaMetaLine([
    'Agent',
    tools > 0 && `${tools} Tools`,
    hasKnowledge(agent) && 'Wissen',
    isLandesverbandIdentifier(agent.identifier) && landesverbandLabel(agent.identifier),
  ]);
}

/** Für Rezepte gibt es keine Schrittzahl im Datenmodell — die Herkunft ist
 *  die ehrlichere Auskunft: Kategorie, Projekt oder Basis. */
function recipeMeta(entry: RecipeEntry): string {
  return agenturaMetaLine([
    'Rezept',
    entry.shareLabel ?? (entry.skillCategory && SKILL_CATEGORY_LABELS[entry.skillCategory]),
  ]);
}

/**
 * Kachel-Bau für die Übersicht: aus Einträgen werden `MarketItem`s
 * (Favoritenstatus eingerechnet), aus `MarketItem`s Kacheln samt Aktionen.
 */
export function useMarketCards() {
  const navigate = useNavigate();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);
  const agentFavorites = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFavorite = useAgentFavoritesStore((s) => s.toggle);
  const deleteUserAgent = useDeleteUserAgent();
  const showTrashUndo = useTrashUndoToast();
  const { duplicate: duplicateAgent } = useDuplicateAgent();
  const library = useUserLibrary();

  const toAgentItems = (entries: AgentEntry[]): MarketItem[] =>
    entries.map((entry) => ({
      kind: 'agent' as const,
      isFavorite: agentFavorites.includes(agentRef(entry.agent, entry.isUser)),
      entry,
    }));
  const toRecipeItems = (entries: RecipeEntry[]): MarketItem[] =>
    entries.map((entry) => ({
      kind: 'recipe' as const,
      isFavorite: favorites.includes(entry.mention.toLowerCase()),
      entry,
    }));

  const handleSelectRecipe = (mention: string) => {
    void navigate(`/agentura/rezept/${encodeURIComponent(mention)}`);
  };
  const handleSelectAgent = (entry: AgentEntry) => {
    const ref = agentRef(entry.agent, entry.isUser);
    void navigate(`/agentura/agent/${encodeURIComponent(getAgentSlug(ref))}`);
  };
  const handleEditAgent = (agent: Agent) => {
    void navigate(`/agents/${agent.identifier}/edit`);
  };
  const handleDeleteAgent = (agent: Agent) => {
    deleteUserAgent.mutate(agent.identifier, {
      onSuccess: () => {
        // The trash addresses the row uuid; DELETE takes the identifier.
        if (agent.id) showTrashUndo({ kind: 'user_agent', id: agent.id, title: agent.title });
      },
    });
  };

  const removeFromLibrary = (item: MarketItem) => {
    if (item.kind === 'task' || !item.fromLibrary) return null;
    const kind = item.kind;
    const ref = libraryRefOf(item);
    return ref ? () => library.remove(kind, ref) : null;
  };

  const agentCard = (item: MarketItem & { kind: 'agent' }): ReactNode => {
    const entry = item.entry;
    const isFavorite = item.isFavorite;
    return (
      <MarketCard
        key={`a-${agentKey(entry.agent)}`}
        icon={<AgentIcon agent={entry.agent} isUser={entry.isUser} />}
        title={entry.agent.title}
        meta={agentMeta(entry.agent)}
        headingLevel={3}
        description={entry.agent.description}
        onSelect={() => handleSelectAgent(entry)}
        isFavorite={isFavorite}
        onToggleFavorite={() =>
          toggleAgentFavorite(agentRef(entry.agent, entry.isUser), entry.agent.title)
        }
        onEdit={entry.editable ? () => handleEditAgent(entry.agent) : undefined}
        onDuplicate={
          entry.editable
            ? () => {
                void duplicateAgent(entry.agent);
              }
            : undefined
        }
        onDelete={entry.editable ? () => handleDeleteAgent(entry.agent) : undefined}
        onRemoveFromLibrary={removeFromLibrary(item)}
      />
    );
  };

  /** One card renderer for every recipe, catalogue or user's own/shared/public. */
  const recipeCard = (item: MarketItem & { kind: 'recipe' }): ReactNode => {
    const entry = item.entry;
    const isFavorite = item.isFavorite;
    return (
      <MarketCard
        key={`s-${entry.id ?? entry.mention}`}
        icon={entry.icon}
        title={entry.title}
        meta={recipeMeta(entry)}
        headingLevel={3}
        description={entry.description}
        onSelect={() => handleSelectRecipe(entry.mention)}
        isFavorite={isFavorite}
        onToggleFavorite={() => toggleFavorite(entry.mention)}
        onEdit={
          entry.editable
            ? () => navigate(`/agentura/rezept/${encodeURIComponent(entry.mention)}/bearbeiten`)
            : undefined
        }
        onDelete={entry.onDelete}
        onRemoveFromLibrary={removeFromLibrary(item)}
      />
    );
  };

  /** Die Union wird nicht destrukturiert — jeder Zweig verengt über `item.kind`. */
  const renderItem = (item: MarketItem): ReactNode => {
    if (item.kind === 'agent') return agentCard(item);
    if (item.kind === 'recipe') return recipeCard(item);
    return <RecurringTaskCard key={`r-${item.task.id}`} task={item.task} />;
  };

  /** Nimmt Einträge aus „Meine Grüneratoren" auf — ihre Karten können sich selbst wieder entfernen. */
  const asLibrary = (items: MarketItem[]): MarketItem[] =>
    items.map((item) => (item.kind === 'task' ? item : { ...item, fromLibrary: true }));

  return { toAgentItems, toRecipeItems, renderItem, asLibrary };
}
