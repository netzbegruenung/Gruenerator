import { memo } from 'react';
import { Clapperboard, Check } from 'lucide-react';
import { useReelLiveStore } from '../../stores/reelLiveStore';
import type { ReelPickerData } from '../../types/messageMetadata';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  return date.toLocaleDateString('de-DE');
}

/**
 * Project picker streamed when a reel-edit instruction arrives without an
 * attached reel. Picking is pure client-side: it marks the project as the
 * thread's active reel (sent as `currentReel` with the next message) and
 * opens the docked ReelArtifactPanel.
 */
export const ReelPickerCard = memo(function ReelPickerCard({ data }: { data: ReelPickerData }) {
  const activeReel = useReelLiveStore((s) => s.activeReel);

  return (
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="mb-2 text-xs font-medium text-foreground-muted">Deine Reels</p>
      <div className="flex flex-col gap-1.5">
        {data.projects.map((project) => {
          const isActive = activeReel?.projectId === project.projectId;
          const disabled = !project.hasSubtitles;
          return (
            <button
              key={project.projectId}
              type="button"
              disabled={disabled}
              onClick={() => {
                const store = useReelLiveStore.getState();
                store.upsertEntry(project.projectId, { title: project.title });
                store.setActiveReel({ projectId: project.projectId, title: project.title });
              }}
              className={`flex items-center gap-2.5 rounded-md border p-2 text-left transition-colors ${
                isActive
                  ? 'border-primary bg-primary/10'
                  : disabled
                    ? 'border-transparent opacity-50 cursor-not-allowed'
                    : 'border-transparent hover:border-primary/30 hover:bg-primary/10'
              }`}
            >
              {project.thumbnailUrl ? (
                <img
                  src={project.thumbnailUrl}
                  alt=""
                  className="h-12 w-8 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-8 flex-shrink-0 items-center justify-center rounded bg-primary/10">
                  <Clapperboard className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{project.title}</p>
                <p className="text-xs text-foreground-muted">
                  {disabled ? 'Noch keine Untertitel' : formatRelativeDate(project.updatedAt)}
                </p>
              </div>
              {isActive && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
});
