import { describeRecurrence } from '@gruenerator/shared/grueneratoren';
import { PiClockCounterClockwise, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { useRecurringTasks } from '../../recurring-tasks/api';
import { useScheduledTasksEnabled } from '../../recurring-tasks/useScheduledTasksEnabled';

const SHOWN = 3;

/**
 * „Geplant": die wiederkehrenden Aufgaben der Person in diesem Projekt (die
 * Aufgabe gehört der Person, nicht dem Projekt — andere Mitglieder sehen ihre
 * eigenen). „+ Aufgabe" öffnet den Editor mit vorgewähltem Projekt.
 */
/**
 * `archived`: ein archiviertes Projekt nimmt nichts Neues an, also keine neue
 * Aufgabe; seine Aufgaben ruhen (der Scheduler überspringt sie, #5951).
 */
export function ProjectTasksCard({ groupId, archived }: { groupId: string; archived: boolean }) {
  const { data: tasks = [] } = useRecurringTasks();
  const own = tasks.filter((t) => t.groupId === groupId);
  // Experimental feature, off by default (Settings → Allgemein → Experimentell).
  if (!useScheduledTasksEnabled()) return null;

  return (
    <section
      aria-labelledby="projekt-geplant-titel"
      className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
    >
      <div className="flex items-center gap-sm">
        <PiClockCounterClockwise aria-hidden className="size-5 shrink-0 text-primary-600" />
        <h2 id="projekt-geplant-titel" className="m-0 min-w-0 flex-1 text-[15px] font-semibold">
          Geplant
        </h2>
        {!archived && (
          <Link
            to={`/wiederkehrend/neu?projekt=${groupId}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary-600 hover:bg-muted"
          >
            <PiPlus aria-hidden className="size-4" />
            Aufgabe
          </Link>
        )}
      </div>
      {archived && own.length > 0 && (
        <p className="m-0 text-xs text-muted-foreground">
          Pausiert, solange das Projekt archiviert ist.
        </p>
      )}
      {own.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          Lass den Grünerator regelmäßig etwas für dieses Projekt tun.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-xs p-0">
          {own.slice(0, SHOWN).map((task) => (
            <li key={task.id}>
              <Link
                to={`/wiederkehrend?task=${task.id}`}
                className="flex flex-col rounded-md px-1 py-1 hover:bg-muted"
              >
                <span className="truncate text-sm font-medium">{task.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {describeRecurrence(task.recurrence)}
                  {task.enabled && !archived ? '' : ' · pausiert'}
                </span>
              </Link>
            </li>
          ))}
          {own.length > SHOWN && (
            <li>
              <Link to="/wiederkehrend" className="px-1 text-xs text-muted-foreground underline">
                Alle {own.length} Aufgaben
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
