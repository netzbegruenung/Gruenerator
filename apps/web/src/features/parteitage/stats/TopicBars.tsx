import { TEXT_CLASS } from './shared';

export function TopicBars({
  counts,
  active,
  onTopic,
}: {
  counts: [string, number][];
  active: string | null;
  onTopic: (topic: string | null) => void;
}) {
  if (counts.length === 0) return null;
  const max = Math.max(...counts.map(([, n]) => n));
  return (
    <section aria-labelledby="pt-topics" className="flex flex-col gap-xs">
      <h3 id="pt-topics" className="m-0 text-sm font-medium text-grey-800 dark:text-grey-100">
        Themen
      </h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {counts.map(([topic, n]) => (
          <li key={topic}>
            <button
              type="button"
              aria-pressed={active === topic}
              onClick={() => onTopic(active === topic ? null : topic)}
              className={`flex w-full items-center gap-2 rounded border-0 bg-transparent p-1 text-left text-sm ${TEXT_CLASS} ${active === topic ? 'ring-2 ring-primary-600' : ''}`}
            >
              <span className="w-32 shrink-0 truncate">{topic}</span>
              <span className="h-3 flex-1 rounded bg-grey-100 dark:bg-grey-800" aria-hidden="true">
                <span
                  className="block h-full rounded bg-primary-500"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right tabular-nums">{n}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
