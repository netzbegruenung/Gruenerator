import { LoadErrorState } from '../components/common/LoadErrorState';
import { CreateFlow } from '../create/CreateFlow';
import { EditorSkeleton } from '../editor/EditorSkeleton';
import { SiteEditor } from '../editor/SiteEditor';
import { useSite } from '../hooks/useSite';

interface EditPageProps {
  /** Leaves the editor; the host decides where to (the page the person came from). */
  onBack?: () => void;
}

export function EditPage({ onBack }: EditPageProps) {
  const { site, isLoading, error, refetch } = useSite();

  if (isLoading) {
    return <EditorSkeleton label="Seite wird geladen" />;
  }

  if (error) {
    return <LoadErrorState onRetry={() => void refetch()} />;
  }

  if (site) {
    return <SiteEditor key={site.id} site={site} onBack={onBack} />;
  }

  return <CreateFlow onBack={onBack} />;
}
