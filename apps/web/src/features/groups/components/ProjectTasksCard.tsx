import { describeRecurrence } from '@gruenerator/shared/grueneratoren';
import { PiClockCounterClockwise, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { useRecurringTasks } from '../../recurring-tasks/api';

const SHOWN = 3;

/**
 * „Geplant": die wiederkehrenden Aufgaben der Person in diesem Projekt (die
 * Aufgabe gehört der Person, nicht dem Projekt — andere Mitglieder sehen ihre
 * eigenen). „+ Aufgabe" öffnet den Editor mit vorgewähltem Projekt.
 */
export function ProjectTasksCard({ groupId }: { groupId: string }) {
  const { data: tasks = [] } = useRecurringTasks();
  const own = tasks.filter((t) => t.groupId === groupId);

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
        <Link
          to={`/wiederkehrend/neu?projekt=${groupId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary-600 hover:bg-muted"
        >
          <PiPlus aria-hidden className="size-4" />
          Aufgabe
        </Link>
      </div>
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
                  {task.enabled ? '' : ' · pausiert'}
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
