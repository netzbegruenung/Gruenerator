import {
  type MarketplaceKind,
  type StudioAssetItem,
  type StudioAssetKind,
  type TextForm,
} from '@gruenerator/contracts';
import { type Agent } from '@gruenerator/shared/agents';
import {
  useAddAgentGroupShare,
  useAgentGroupShares,
  useAgentShareSettings,
  useOwnRecipes,
  usePublicUserAgents,
  useRemoveAgentGroupShare,
  useSetAgentIsPublic,
  useSetAgentShareMode,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
  useShareRecipeWithGroup,
  useUnshareRecipeFromGroup,
  useUserAgents,
} from '@gruenerator/shared/grueneratoren';
import { useStudioAssetMutations, useStudioAssets } from '@gruenerator/shared/studio-assets';
import { LoadingSection } from '@gruenerator/ui';
import { useMemo, type JSX, type ReactNode } from 'react';
import { PiFileText, PiImage, PiLayout, PiNotebook, PiSparkle, PiSticker } from 'react-icons/pi';

import { type NotebookCollection } from '../../../types/notebook';
import { useNotebookCollections, useUserTemplates } from '../../auth/hooks/useProfileData';
import { type UserTemplate } from '../../auth/services/profileApiService';
import {
  useAddNotebookGroupShare,
  useNotebookGroupShares,
  useNotebookShareSettings,
  useRemoveNotebookGroupShare,
  useSetNotebookIsPublic,
  useSetNotebookShareMode,
} from '../../notebook/hooks/useNotebookSharing';

import { OwnItemPicker, type OwnItem, type OwnItemBadge } from './OwnItemPicker';
import { applySharing, sharingVisibility, type SharingState } from './sharing';
import { VisibilityStep, type Visibility } from './VisibilityStep';

/** What „Fertig" hands back: where the item now stands, and the sentence for the toast. */
export interface AddResult {
  /** Set when the item is live in the Marktplatz — the dialog then opens it there. */
  marketplaceItem: { kind: MarketplaceKind; ref: string } | null;
  message: string;
}

interface StepProps {
  onBack: () => void;
  onDone: (result: AddResult) => void;
}

/** One chosen item; it renders its own step ③, so the frame never sees its type. */
export interface AddSelection {
  key: string;
  title: string;
  renderVisibility: (props: StepProps) => JSX.Element;
}

export interface AddKind {
  kind: MarketplaceKind;
  label: string;
  pluralLabel: string;
  hint: string;
  icon: ReactNode;
  Picker: (props: { onSelect: (selection: AddSelection) => void }) => JSX.Element;
}

interface KindDefinition<T> extends Omit<AddKind, 'Picker'> {
  create: { href: string; label: string };
  useItems: () => { items: OwnItem<T>[]; loading: boolean; error: boolean };
  Visibility: (props: StepProps & { item: T }) => JSX.Element;
}

/** Captures `T` in the closure so a list of kinds with different item types stays one array. */
function defineKind<T>(def: KindDefinition<T>): AddKind {
  const { Visibility } = def;
  function Picker({ onSelect }: { onSelect: (selection: AddSelection) => void }) {
    const { items, loading, error } = def.useItems();
    return (
      <OwnItemPicker
        items={items}
        loading={loading}
        error={error}
        pluralLabel={def.pluralLabel}
        create={def.create}
        onSelect={(item) =>
          onSelect({
            key: item.key,
            title: item.title,
            renderVisibility: (props) => <Visibility {...props} item={item.value} />,
          })
        }
      />
    );
  }
  return {
    kind: def.kind,
    label: def.label,
    pluralLabel: def.pluralLabel,
    hint: def.hint,
    icon: def.icon,
    Picker,
  };
}

const RESULT_MESSAGE: Record<Visibility, (title: string) => string> = {
  private: (title) => `„${title}“ ist jetzt privat.`,
  project: (title) => `„${title}“ ist jetzt in deinen Projekten geteilt.`,
  public: (title) => `„${title}“ ist jetzt öffentlich im Marktplatz.`,
};

const Loading = () => <LoadingSection role="status" label="Wird geladen …" />;

function LoadFailed() {
  return (
    <p role="alert" className="m-0 text-sm text-grey-500">
      Die Freigabe konnte nicht geladen werden.
    </p>
  );
}

// ── Agents ───────────────────────────────────────────────────────────────────

function useOwnAgents() {
  const own = useUserAgents(true);
  const listed = usePublicUserAgents(true);
  const items = useMemo<OwnItem<Agent>[]>(() => {
    const publicIds = new Set((listed.data ?? []).map((a) => a.id));
    return (own.data ?? [])
      .filter((a) => a.id !== undefined)
      .map((a) => ({
        key: a.identifier,
        title: a.title,
        description: a.description || null,
        badge: publicIds.has(a.id) ? 'public' : null,
        value: a,
      }));
  }, [own.data, listed.data]);
  return { items, loading: own.isPending, error: own.isError };
}

function AgentVisibility({ item, onBack, onDone }: StepProps & { item: Agent }) {
  const { identifier } = item;
  const settings = useAgentShareSettings(identifier, true);
  const shares = useAgentGroupShares(identifier, true);
  const setMode = useSetAgentShareMode(identifier);
  const setPublic = useSetAgentIsPublic(identifier);
  const addGroup = useAddAgentGroupShare(identifier);
  const removeGroup = useRemoveAgentGroupShare(identifier);

  if (settings.isPending || shares.isPending) return <Loading />;
  if (settings.isError || shares.isError) return <LoadFailed />;

  const state: SharingState = {
    shareMode: settings.data.share_mode,
    isPublic: settings.data.is_public,
    groupIds: shares.data.map((s) => s.group_id),
  };
  return (
    <VisibilityStep
      current={sharingVisibility(state)}
      currentGroupIds={state.groupIds}
      projectUnavailable={null}
      publicRequirement="ownership"
      initialOwnership={settings.data.public_ownership}
      onBack={onBack}
      onApply={async (choice) => {
        await applySharing(choice, state, {
          setMode: setMode.mutateAsync,
          setPublic: setPublic.mutateAsync,
          addGroup: addGroup.mutateAsync,
          removeGroup: removeGroup.mutateAsync,
        });
        onDone({
          marketplaceItem:
            choice.choice === 'public' && item.id ? { kind: 'agent', ref: item.id } : null,
          message: RESULT_MESSAGE[choice.choice](item.title),
        });
      }}
    />
  );
}

// ── Rezepte ──────────────────────────────────────────────────────────────────

const recipeState = (form: TextForm): SharingState => ({
  shareMode: form.shareMode,
  isPublic: form.isPublic,
  groupIds: form.sharedWithGroups.map((g) => g.groupId),
});

function useOwnRecipeItems() {
  const own = useOwnRecipes(true);
  const items = useMemo<OwnItem<TextForm>[]>(
    () =>
      (own.data ?? [])
        // Only the person's own recipes can be shared — not adapted system ones
        // (`preset`), not those that reached them through a project.
        .filter((form) => form.kind === 'custom' && form.sharedFromGroup === null)
        .map((form) => ({
          key: form.mention,
          title: form.title,
          description: form.description,
          badge: sharingVisibility(recipeState(form)),
          value: form,
        })),
    [own.data]
  );
  return { items, loading: own.isPending, error: own.isError };
}

function RecipeVisibility({ item, onBack, onDone }: StepProps & { item: TextForm }) {
  const { mention } = item;
  const setMode = useSetRecipeShareMode(mention);
  const setPublic = useSetRecipeIsPublic(mention);
  const share = useShareRecipeWithGroup();
  const unshare = useUnshareRecipeFromGroup();
  const state = recipeState(item);
  return (
    <VisibilityStep
      current={sharingVisibility(state)}
      currentGroupIds={state.groupIds}
      projectUnavailable={null}
      publicRequirement="ownership"
      initialOwnership={item.publicOwnership}
      onBack={onBack}
      onApply={async (choice) => {
        await applySharing(choice, state, {
          setMode: setMode.mutateAsync,
          setPublic: setPublic.mutateAsync,
          addGroup: (groupId) => share.mutateAsync({ mention, groupId }),
          removeGroup: (groupId) => unshare.mutateAsync({ mention, groupId }),
        });
        onDone({
          marketplaceItem: choice.choice === 'public' ? { kind: 'recipe', ref: item.id } : null,
          message: RESULT_MESSAGE[choice.choice](item.title),
        });
      }}
    />
  );
}

// ── Vorlagen ─────────────────────────────────────────────────────────────────

function templateBadge(template: UserTemplate): OwnItemBadge {
  if (template.status === 'pending_review') return 'review';
  return template.status === 'published' && template.is_private === false ? 'public' : 'private';
}

function useOwnTemplates() {
  const { query } = useUserTemplates({ isActive: true });
  const items = useMemo<OwnItem<UserTemplate>[]>(
    () =>
      (query.data ?? []).map((template) => ({
        key: String(template.id),
        title: template.title,
        description: typeof template.description === 'string' ? template.description : null,
        badge: templateBadge(template),
        value: template,
      })),
    [query.data]
  );
  return { items, loading: query.isPending, error: query.isError };
}

function TemplateVisibility({ item, onBack, onDone }: StepProps & { item: UserTemplate }) {
  const { updateTemplateVisibility } = useUserTemplates({ isActive: false });
  const badge = templateBadge(item);
  return (
    <VisibilityStep
      // Submitted counts as public here: the choice is made, only the review is pending.
      current={badge === 'private' ? 'private' : 'public'}
      currentGroupIds={[]}
      projectUnavailable="Vorlagen lassen sich noch nicht in Projekte teilen."
      publicRequirement="review"
      onBack={onBack}
      onApply={async (choice) => {
        await updateTemplateVisibility(item.id, choice.choice !== 'public');
        onDone({
          marketplaceItem: null,
          message:
            choice.choice === 'public'
              ? `„${item.title}“ ist zur Prüfung eingereicht.`
              : RESULT_MESSAGE.private(item.title),
        });
      }}
    />
  );
}

// ── Sticker & Hintergründe ───────────────────────────────────────────────────

function useOwnAssets(kind: StudioAssetKind) {
  const mine = useStudioAssets({ kind, scope: 'mine', q: '', sort: 'new' });
  const items = useMemo<OwnItem<StudioAssetItem>[]>(
    () =>
      mine.items.map((asset) => ({
        key: asset.id,
        title: asset.title,
        description: null,
        badge: asset.visibility === 'public' ? 'public' : 'private',
        value: asset,
      })),
    [mine.items]
  );
  return { items, loading: mine.isPending, error: mine.isError };
}

const useOwnStickers = () => useOwnAssets('sticker');
const useOwnBackgrounds = () => useOwnAssets('background');

function AssetVisibility({ item, onBack, onDone }: StepProps & { item: StudioAssetItem }) {
  const { update } = useStudioAssetMutations();
  return (
    <VisibilityStep
      current={item.visibility === 'public' ? 'public' : 'private'}
      currentGroupIds={[]}
      projectUnavailable="Sticker und Hintergründe lassen sich noch nicht in Projekte teilen."
      publicRequirement="rights"
      initialAudience={item.audience}
      onBack={onBack}
      onApply={async (choice) => {
        const updated = await update.mutateAsync({
          id: item.id,
          body:
            choice.choice === 'public'
              ? { visibility: 'public', rightsConfirmed: true, audience: choice.audience }
              : { visibility: 'private' },
        });
        const live = updated.visibility === 'public' && updated.moderation === 'ok';
        onDone({
          marketplaceItem: live ? { kind: item.kind, ref: item.id } : null,
          message: RESULT_MESSAGE[choice.choice === 'public' ? 'public' : 'private'](item.title),
        });
      }}
    />
  );
}

// ── Notebooks ────────────────────────────────────────────────────────────────

function useOwnNotebooks() {
  const { query } = useNotebookCollections({ isActive: true });
  const items = useMemo<OwnItem<NotebookCollection>[]>(
    () =>
      (query.data ?? [])
        // Shared and public notebooks of others come in the same list.
        .filter((n) => n.access_source == null || n.access_source === 'owned')
        .map((n) => ({
          key: n.id,
          title: n.name,
          description: n.description,
          badge: sharingVisibility({
            shareMode: n.share_mode ?? 'private',
            isPublic: n.is_public === true,
            groupIds: [],
          }),
          value: n,
        })),
    [query.data]
  );
  return { items, loading: query.isPending, error: query.isError };
}

function NotebookVisibility({ item, onBack, onDone }: StepProps & { item: NotebookCollection }) {
  const settings = useNotebookShareSettings(item.id, true);
  const shares = useNotebookGroupShares(item.id, true);
  const setMode = useSetNotebookShareMode(item.id);
  const setPublic = useSetNotebookIsPublic(item.id);
  const addGroup = useAddNotebookGroupShare(item.id);
  const removeGroup = useRemoveNotebookGroupShare(item.id);

  if (settings.isPending || shares.isPending) return <Loading />;
  if (settings.isError || shares.isError) return <LoadFailed />;

  const state: SharingState = {
    shareMode: settings.data.share_mode,
    isPublic: settings.data.is_public,
    groupIds: shares.data.map((s) => s.group_id),
  };
  return (
    <VisibilityStep
      current={sharingVisibility(state)}
      currentGroupIds={state.groupIds}
      projectUnavailable={null}
      publicRequirement="ownership"
      initialOwnership={settings.data.public_ownership}
      onBack={onBack}
      onApply={async (choice) => {
        await applySharing(choice, state, {
          setMode: setMode.mutateAsync,
          setPublic: setPublic.mutateAsync,
          addGroup: addGroup.mutateAsync,
          removeGroup: removeGroup.mutateAsync,
        });
        onDone({
          marketplaceItem: choice.choice === 'public' ? { kind: 'notebook', ref: item.id } : null,
          message: RESULT_MESSAGE[choice.choice](item.name),
        });
      }}
    />
  );
}

/** The kinds „Element hinzufügen" offers, in the order of the Marktplatz tabs. */
export const ADD_KINDS: readonly AddKind[] = [
  defineKind({
    kind: 'agent',
    label: 'Agent',
    pluralLabel: 'Agents',
    hint: 'Eine KI-Persönlichkeit mit Rolle und Wissen',
    icon: <PiSparkle aria-hidden />,
    create: { href: '/agents/new', label: 'Agent erstellen' },
    useItems: useOwnAgents,
    Visibility: AgentVisibility,
  }),
  defineKind({
    kind: 'recipe',
    label: 'Rezept',
    pluralLabel: 'Rezepte',
    hint: 'Eine Anleitung für eine Textsorte',
    icon: <PiFileText aria-hidden />,
    create: { href: '/agentura/rezept/neu', label: 'Rezept erstellen' },
    useItems: useOwnRecipeItems,
    Visibility: RecipeVisibility,
  }),
  defineKind({
    kind: 'template',
    label: 'Vorlage',
    pluralLabel: 'Vorlagen',
    hint: 'Eine Canva- oder Datei-Vorlage',
    icon: <PiLayout aria-hidden />,
    create: { href: '/vorlagen', label: 'Zu den Vorlagen' },
    useItems: useOwnTemplates,
    Visibility: TemplateVisibility,
  }),
  defineKind({
    kind: 'sticker',
    label: 'Sticker',
    pluralLabel: 'Sticker',
    hint: 'Ein freigestelltes Bild oder Text-Badge',
    icon: <PiSticker aria-hidden />,
    create: { href: '/studio/sticker/neu', label: 'Sticker erstellen' },
    useItems: useOwnStickers,
    Visibility: AssetVisibility,
  }),
  defineKind({
    kind: 'background',
    label: 'Hintergrund',
    pluralLabel: 'Hintergründe',
    hint: 'Ein Bild für Profilbild und Sharepic',
    icon: <PiImage aria-hidden />,
    create: { href: '/studio/sticker', label: 'Zu Sticker & Hintergründe' },
    useItems: useOwnBackgrounds,
    Visibility: AssetVisibility,
  }),
  defineKind({
    kind: 'notebook',
    label: 'Notebook',
    pluralLabel: 'Notebooks',
    hint: 'Gesammelte Quellen zum Nachfragen',
    icon: <PiNotebook aria-hidden />,
    create: { href: '/notebooks/neu', label: 'Notebook erstellen' },
    useItems: useOwnNotebooks,
    Visibility: NotebookVisibility,
  }),
];
