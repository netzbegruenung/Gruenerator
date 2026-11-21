import { type SiteDraft, type SitePublishIssue } from '@gruenerator/contracts';

import { fieldLabel } from '../../preview/fieldPaths';

interface PublishIssuesProps {
  issues: SitePublishIssue[];
  /** For the labels: which block and card a path points at. */
  draft: SiteDraft;
  onPick: (path: string) => void;
}

export function PublishIssues({ issues, draft, onPick }: PublishIssuesProps) {
  return (
    <div className="flex flex-col gap-xs" role="group" aria-labelledby="publish-issues-title">
      <p id="publish-issues-title" className="m-0 text-sm font-medium">
        Das fehlt noch, bevor du veröffentlichen kannst:
      </p>
      <ul className="m-0 flex list-none flex-col gap-xs p-0">
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}`}>
            <button
              type="button"
              onClick={() => onPick(issue.path)}
              className="w-full rounded-md px-sm py-xs text-left text-sm text-foreground hover:bg-grey-100 dark:hover:bg-grey-700"
            >
              {issue.path === 'legal' ? 'Impressum' : fieldLabel(issue.path, draft)}:{' '}
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
