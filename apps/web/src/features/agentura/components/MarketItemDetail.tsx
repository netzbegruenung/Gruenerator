import { agentRef, getAgentSlug } from '@gruenerator/shared/agents';
import { Button } from '@gruenerator/ui';
import { PiArrowLeft, PiArrowSquareOut, PiChatCircleText } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { AgentIcon, libraryRefOf, type MarketItem } from '../lib/marketItems';

import { AddToLibraryButton } from './AddToLibraryButton';
import { CapabilityTags } from './CapabilityTags';

/**
 * Ein Agent oder Rezept im Agentura-Popup: worum es geht, und die drei Wege
 * weiter — auf die eigene Übersicht holen, im Chat ausprobieren, oder die volle
 * Detailseite. Aufgaben kommen hier nicht an; die stehen nicht im Shop.
 */
export function MarketItemDetail({
  item,
  onBack,
}: {
  item: MarketItem & { kind: 'agent' | 'recipe' };
  onBack: () => void;
}) {
  const detail =
    item.kind === 'agent'
      ? (() => {
          const ref = agentRef(item.entry.agent, item.entry.isUser);
          const slug = encodeURIComponent(getAgentSlug(ref));
          return {
            icon: <AgentIcon agent={item.entry.agent} isUser={item.entry.isUser} />,
            title: item.entry.agent.title,
            kindLabel: 'Agent',
            author: item.entry.agent.author,
            description: item.entry.agent.description,
            chatPath: `/agents/${slug}`,
            detailPath: `/agentura/agent/${slug}`,
            ownedByUser: item.entry.isUser,
          };
        })()
      : {
          icon: item.entry.icon,
          title: item.entry.title,
          kindLabel: 'Rezept',
          author: item.entry.shareLabel,
          description: item.entry.description,
          // Ein Nutzer-Rezept braucht seine Zeile, sonst nimmt der Chat den
          // mitgelieferten Rumpf eines gleichnamigen Katalog-Rezepts.
          chatPath: item.entry.id
            ? `/chat?rezept=${encodeURIComponent(item.entry.mention)}&rezeptId=${encodeURIComponent(item.entry.id)}`
            : `/chat?skill=${encodeURIComponent(item.entry.mention)}`,
          detailPath: `/agentura/rezept/${encodeURIComponent(item.entry.mention)}`,
          ownedByUser: item.entry.editable,
        };

  const libraryRef = libraryRefOf(item);

  return (
    <div className="flex flex-col gap-lg">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-xs text-sm font-semibold text-foreground-muted transition-colors hover:text-primary-700 dark:hover:text-primary-300"
      >
        <PiArrowLeft aria-hidden className="h-4 w-4" />
        Zurück zur Agentura
      </button>

      <header className="flex items-center gap-md">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background-alt text-3xl text-foreground-heading">
          {detail.icon}
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-2xl leading-tight font-bold tracking-tight text-foreground-heading">
            {detail.title}
          </h3>
          <p className="m-0 mt-1 text-sm text-foreground-muted">
            {detail.kindLabel}
            {detail.author ? ` · ${detail.author}` : ''}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-sm">
        {!detail.ownedByUser && libraryRef && (
          <AddToLibraryButton kind={item.kind} itemRef={libraryRef} />
        )}
        <Button asChild variant="outline">
          <Link to={detail.chatPath}>
            <PiChatCircleText aria-hidden />
            Im Chat ausprobieren
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to={detail.detailPath}>
            <PiArrowSquareOut aria-hidden />
            Alle Details
          </Link>
        </Button>
      </div>

      {detail.description && (
        <p className="m-0 max-w-[60ch] text-base leading-relaxed text-foreground">
          {detail.description}
        </p>
      )}

      {item.kind === 'agent' && <CapabilityTags agent={item.entry.agent} showTags />}
    </div>
  );
}
