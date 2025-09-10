import React from 'react';
import { useParams } from 'react-router-dom';
import PageView from './PageView';
import { getPageById } from '../data/examplePages';

// Pages Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/pages/page-view.css';
import '../../../assets/styles/features/pages/page-header.css';
import '../../../assets/styles/features/pages/page-blocks.css';

const DynamicPageView = () => {
    const { pageId } = useParams();
    const pageData = getPageById(pageId);
    
    if (!pageData) {
        return (
            <PageView 
                error={`Die Seite "${pageId}" wurde nicht gefunden.`}
            />
        );
    }
    
    return <PageView pageData={pageData} />;
};

export default DynamicPageView;