import { type VideoProject } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  Badge,
  CardActionsMenu,
  CardGrid,
  cn,
  DropdownMenuItem,
  InteractiveCard,
  interactiveCardControl,
  SectionHeader,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useCallback } from 'react';
import { PiFilmSlate } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { formatRelativeDate } from '../../../utils/dateFormatter';
import { showTrashUndoToast } from '../../trash/trashUndoToast';
import { useVideoProjects, VIDEO_PROJECTS_QUERY_KEY } from '../hooks/useVideoProjects';

const projectPath = (project: VideoProject) => `/studio/videoeditor/${project.slug}`;

/** Server-side video editor projects. Renders nothing while loading or when there are none. */
const VideoProjectsSection = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useVideoProjects();

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: VIDEO_PROJECTS_QUERY_KEY }),
    [queryClient]
  );

  const handleRename = useCallback(
    (project: VideoProject) => {
      const next = window.prompt('Neuer Titel:', project.title || 'Videoprojekt');
      if (next === null) return;
      const title = next.trim();
      if (!title || title === project.title) return;
      void getContractsClient()
        .videoProjects.update({ params: { id: project.id }, body: { title } })
        .then((result) => {
          if (result.status === 200) invalidate();
          else console.error('[VideoProjectsSection] rename failed', result.status);
        })
        .catch((err: unknown) => console.error('[VideoProjectsSection] rename failed', err));
    },
    [invalidate]
  );

  const handleDelete = useCallback(
    (project: VideoProject) => {
      void getContractsClient()
        .videoProjects.delete({ params: { id: project.id } })
        .then((result) => {
          if (result.status === 200) {
            invalidate();
            showTrashUndoToast(
              queryClient,
              { kind: 'collaborative_document', id: project.id, title: project.title },
              { onRestored: invalidate }
            );
          } else {
            console.error('[VideoProjectsSection] delete failed', result.status);
          }
        })
        .catch((err: unknown) => console.error('[VideoProjectsSection] delete failed', err));
    },
    [invalidate, queryClient]
  );

  if (!data || data.length === 0) return null;

  return (
    <section className="mb-xl">
      <SectionHeader title="Videoprojekte" />
      <CardGrid columns="5">
        {data.map((project) => (
          <InteractiveCard
            key={project.id}
            label={project.title || 'Videoprojekt'}
            href={projectPath(project)}
            onActivate={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              void navigate(projectPath(project));
            }}
            className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
          >
            {project.can_edit && (
              <div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                <CardActionsMenu
                  onDelete={() => handleDelete(project)}
                  className={cn(
                    interactiveCardControl,
                    '[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm'
                  )}
                >
                  <DropdownMenuItem onClick={() => handleRename(project)}>
                    <Pencil size={14} />
                    Umbenennen
                  </DropdownMenuItem>
                </CardActionsMenu>
              </div>
            )}
            <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-square">
              <PiFilmSlate className="text-4xl text-grey-400" aria-hidden="true" />
            </div>
            <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
              <span className="text-sm font-medium text-foreground-heading truncate block">
                {project.title || 'Videoprojekt'}
              </span>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-grey-600 dark:text-grey-400">
                <span className="truncate">
                  zuletzt bearbeitet {formatRelativeDate(project.updated_at).toLowerCase()}
                </span>
                <Badge variant="secondary">{project.aspect_ratio}</Badge>
              </div>
            </div>
          </InteractiveCard>
        ))}
      </CardGrid>
    </section>
  );
};

export default VideoProjectsSection;
