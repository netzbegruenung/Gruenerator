import { LoadErrorState } from '../components/common/LoadErrorState';
import { CreateFlow } from '../create/CreateFlow';
import { SiteEditor } from '../editor/SiteEditor';
import { useSite } from '../hooks/useSite';

export function EditPage() {
  const { site, isLoading, error, refetch } = useSite();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4 text-grey-600 dark:text-grey-400">
        <div className="w-10 h-10 border-[3px] border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
        <p>Seite wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return <LoadErrorState onRetry={() => void refetch()} />;
  }

  if (site) {
    return <SiteEditor key={site.id} site={site} />;
  }

  return <CreateFlow />;
}
