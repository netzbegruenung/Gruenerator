import { useParams } from 'react-router-dom';

import { getPageById } from '../data/examplePages';

import PageView from './PageView';

const DynamicPageView = () => {
  const { pageId } = useParams();
  const pageData = getPageById(pageId);

  if (!pageData) {
    return <PageView error={`Die Seite "${pageId}" wurde nicht gefunden.`} />;
  }

  return <PageView pageData={pageData} />;
};

export default DynamicPageView;
