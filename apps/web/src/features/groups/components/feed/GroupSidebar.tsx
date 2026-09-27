import { groupFeedByKind, type GroupFeedItem, type GroupMember } from '@gruenerator/shared/groups';
import { PiLink } from 'react-icons/pi';

import { FEED_KIND_ICONS, personInitials } from '../../config/groupFeedPresentation';

interface GroupSidebarProps {
  description: string | null;
  isPersonal: boolean;
  members: GroupMember[];
  items: GroupFeedItem[];
  linkCount: number;
  onShowMembers: () => void;
  /** Wechselt nach „Alle" und springt zum Abschnitt. */
  onJumpToSection: (anchorId: string) => void;
}

const MEMBER_PREVIEW = 4;

const cardCls = 'flex flex-col gap-sm rounded-[20px] bg-card p-md shadow-sm';

export function GroupSidebar({
  description,
  isPersonal,
  members,
  items,
  linkCount,
  onShowMembers,
  onJumpToSection,
}: GroupSidebarProps) {
  const sections = groupFeedByKind(items);

  return (
    <aside
      aria-label={isPersonal ? 'Über das Projekt' : 'Über die Gruppe'}
      className="flex flex-col gap-md"
    >
      {description && (
        <section className={cardCls}>
          <h2 className="m-0 text-[17px] font-semibold">
            {isPersonal ? 'Über das Projekt' : 'Über die Gruppe'}
          </h2>
          <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </section>
      )}

      {!isPersonal && members.length > 0 && (
        <section className={cardCls}>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[17px] font-semibold">Mitglieder</h2>
            <span className="text-sm text-muted-foreground">{members.length}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-sm p-0">
            {members.slice(0, MEMBER_PREVIEW).map((m) => {
              const name = m.display_name || m.first_name || 'Mitglied';
              return (
                <li key={m.user_id} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-xs font-bold text-secondary-800 dark:bg-secondary-800 dark:text-secondary-100"
                  >
                    {personInitials(name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{name}</span>
                  {m.role === 'admin' && (
                    <span className="text-[13px] text-muted-foreground">Admin</span>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onShowMembers}
            className="cursor-pointer self-start border-none bg-transparent p-0 text-sm font-bold text-primary-700 hover:underline dark:text-primary-300"
          >
            {members.length > MEMBER_PREVIEW
              ? `Alle ${members.length} anzeigen`
              : 'Mitglieder verwalten'}
          </button>
        </section>
      )}

      {(sections.length > 0 || linkCount > 0) && (
        <nav aria-label="Inhalte nach Art" className="rounded-[20px] bg-card p-xs shadow-sm">
          <h2 className="m-0 px-sm pb-1.5 pt-sm text-[17px] font-semibold">Inhalte</h2>
          <ul className="m-0 list-none p-0">
            {sections.map((section) => {
              const Icon = FEED_KIND_ICONS[section.id];
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToSection(`abschnitt-${section.id}`)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-sm py-2 text-left text-foreground hover:bg-background-alt"
                  >
                    <Icon
                      aria-hidden
                      className="size-[18px] text-primary-600 dark:text-primary-400"
                    />
                    <span className="flex-1 text-[15px]">{section.plural}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {section.items.length}
                    </span>
                  </button>
                </li>
              );
            })}
            {linkCount > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => onJumpToSection('abschnitt-links')}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-sm py-2 text-left text-foreground hover:bg-background-alt"
                >
                  <PiLink
                    aria-hidden
                    className="size-[18px] text-primary-600 dark:text-primary-400"
                  />
                  <span className="flex-1 text-[15px]">Links</span>
                  <span className="text-[13px] text-muted-foreground">{linkCount}</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </aside>
  );
}
