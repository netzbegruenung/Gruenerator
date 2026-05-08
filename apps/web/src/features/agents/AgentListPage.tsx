import { Link, useNavigate } from 'react-router-dom';

import { useDeleteUserAgent, useUserAgents } from './api';

export default function AgentListPage() {
  const navigate = useNavigate();
  const { data: agents = [], isLoading, error } = useUserAgents();
  const deleteMutation = useDeleteUserAgent();

  const handleDelete = (identifier: string, title: string) => {
    if (!confirm(`Möchtest du "${title}" wirklich löschen?`)) return;
    deleteMutation.mutate(identifier);
  };

  return (
    <div className="mx-auto max-w-4xl p-md">
      <div className="mb-lg flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meine Agent*innen</h1>
        <Link
          to="/agents/new"
          className="rounded bg-primary-600 px-md py-sm text-white hover:bg-primary-700"
        >
          + Neue*r Agent*in
        </Link>
      </div>

      {isLoading && <p>Lade…</p>}
      {error && <p className="text-red-600">Fehler beim Laden.</p>}

      {!isLoading && agents.length === 0 && (
        <div className="rounded border border-dashed border-grey-300 p-lg text-center">
          <p className="mb-md text-foreground-muted">
            Du hast noch keine eigenen Agent*innen erstellt.
          </p>
          <Link to="/agents/new" className="text-primary-600 underline hover:text-primary-700">
            Erstelle deine*n erste*n Agent*in
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-sm">
        {agents.map((agent) => (
          <li
            key={agent.identifier}
            className="flex items-center gap-md rounded border border-grey-200 p-md hover:bg-hover-alt dark:border-grey-700"
          >
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-2xl"
              style={{ backgroundColor: agent.backgroundColor }}
            >
              {agent.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{agent.title}</div>
              <div className="truncate text-sm text-foreground-muted">{agent.description}</div>
            </div>
            <button
              type="button"
              className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
              onClick={() => void navigate(`/chat?agent=${agent.identifier}`)}
            >
              Chatten
            </button>
            <button
              type="button"
              className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
              onClick={() => void navigate(`/agents/${agent.identifier}/edit`)}
            >
              Bearbeiten
            </button>
            <button
              type="button"
              className="rounded px-sm py-xs text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => handleDelete(agent.identifier, agent.title)}
              disabled={deleteMutation.isPending}
            >
              Löschen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
