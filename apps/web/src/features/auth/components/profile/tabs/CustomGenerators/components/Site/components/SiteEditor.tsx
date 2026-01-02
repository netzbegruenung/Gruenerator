import SiteForm from './SiteForm';

interface Site {
    id: string;
    site_title?: string;
    subdomain?: string;
    is_published?: boolean;
    tagline?: string;
    bio?: string;
    contact_email?: string;
    social_links?: Record<string, string>;
    visit_count?: number;
    last_published?: string;
}

interface SiteEditorProps {
    site: Site | null;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
}

const SiteEditor = ({ site, onSubmit, onCancel }: SiteEditorProps): React.ReactElement => {
    return <SiteForm initialData={site} isCreating={false} onSubmit={onSubmit} onCancel={onCancel} />;
};

export default SiteEditor;
