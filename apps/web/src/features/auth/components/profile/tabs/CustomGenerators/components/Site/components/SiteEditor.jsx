import SiteForm from './SiteForm';

const SiteEditor = ({ site, onSubmit, onCancel }) => {
    return <SiteForm initialData={site} isCreating={false} onSubmit={onSubmit} onCancel={onCancel} />;
};

export default SiteEditor;