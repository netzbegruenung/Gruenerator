import { personInitials, type GroupMember } from '@gruenerator/shared/groups';

const MEMBER_PREVIEW = 4;

interface ProjectMembersCardProps {
  members: GroupMember[];
  onShowMembers: () => void;
}

/** Nur für Gruppen mit mehr als einer Person — allein wäre die Karte Rauschen. */
export function ProjectMembersCard({ members, onShowMembers }: ProjectMembersCardProps) {
  if (members.length < 2) return null;
  return (
    <section
      aria-labelledby="projekt-mitglieder-titel"
      className="flex flex-col gap-sm rounded-[20px] bg-card p-md shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="projekt-mitglieder-titel" className="m-0 text-[17px] font-semibold">
          Mitglieder
        </h2>
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
  );
}
