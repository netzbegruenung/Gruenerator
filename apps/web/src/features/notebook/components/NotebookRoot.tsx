import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { getNotebookConfig } from '../config/notebookPagesConfig';

import { NotebookGallery } from './NotebookGallery';
import { NotebookPageContent } from './NotebookPage';

function NotebookRootPage() {
  const config = getNotebookConfig('gruenerator');
  return <NotebookPageContent config={config} startpageFooter={<NotebookGallery />} />;
}

export const NotebookRoot = withAuthRequired(NotebookRootPage, {
  title: 'Notebooks',
});
