import SiteForm from './SiteForm';

const SiteCreator = ({ onSubmit, onCancel }) => {
    return <SiteForm isCreating={true} onSubmit={onSubmit} onCancel={onCancel} />;
};

export default SiteCreator;
