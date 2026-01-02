import SiteForm from './SiteForm';

interface SiteCreatorProps {
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
}

const SiteCreator = ({ onSubmit, onCancel }: SiteCreatorProps): React.ReactElement => {
    return <SiteForm isCreating={true} onSubmit={onSubmit} onCancel={onCancel} />;
};

export default SiteCreator;
