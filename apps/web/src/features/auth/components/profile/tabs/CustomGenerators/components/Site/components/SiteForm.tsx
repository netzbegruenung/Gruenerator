import { useState } from 'react';
import { FormInput, FormTextarea, FormSelect } from '../../../../../../../../../components/common/Form/Input';
import ProfileActionButton from '../../../../../../../../../components/profile/actions/ProfileActionButton';
import ProfileCard from '../../../../../../../../../components/common/ProfileCard';
import { useProfileStore } from '../../../../../../../../../stores/profileStore';
import { getSitesDomain } from '../utils/siteConfig';

interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  [key: string]: string | undefined;
}

interface SiteFormData {
  subdomain?: string;
  site_title?: string;
  tagline?: string;
  bio?: string;
  contact_email?: string;
  theme?: string;
  social_links?: SocialLinks;
}

interface SiteFormProps {
  initialData?: SiteFormData;
  onSubmit: (data: SiteFormData) => Promise<void>;
  onCancel: () => void;
  isCreating?: boolean;
}

const SiteForm = ({ initialData = {}, onSubmit, onCancel, isCreating = false }: SiteFormProps) => {
    // Get profile data from store to pre-populate fields
    const profile = useProfileStore(state => state.profile);

    // Generate subdomain from first_name and last_name, or display_name as fallback
    const generateSubdomain = () => {
        if (profile?.first_name && profile?.last_name) {
            const firstName = profile.first_name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const lastName = profile.last_name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return `${firstName}${lastName}`;
        }

        // Fallback to display_name or username
        const name = profile?.display_name || profile?.username || '';
        if (!name) return '';

        // Remove spaces, special chars, convert to lowercase
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const [formData, setFormData] = useState({
        subdomain: initialData.subdomain || (isCreating ? generateSubdomain() : ''),
        site_title: initialData.site_title || (isCreating && profile?.display_name ? profile.display_name : ''),
        tagline: initialData.tagline || '',
        bio: initialData.bio || '',
        contact_email: initialData.contact_email || (isCreating && profile?.email ? profile.email : ''),
        theme: initialData.theme || 'gruene',
        social_links: initialData.social_links || {}
    });

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (name: string, value: string): void => {
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(null);
    };

    const handleSocialChange = (platform: string, value: string): void => {
        setFormData(prev => ({
            ...prev,
            social_links: {
                ...prev.social_links,
                [platform]: value
            }
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();

        if (isCreating && !formData.subdomain) {
            setError('Subdomain ist erforderlich');
            return;
        }

        if (!formData.site_title) {
            setError('Titel ist erforderlich');
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            await onSubmit(formData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && (
                <div style={{
                    padding: 'var(--spacing-medium)',
                    marginBottom: 'var(--spacing-medium)',
                    background: 'var(--error-background, #fee)',
                    color: 'var(--error-color, #c33)',
                    borderRadius: 'var(--border-radius)'
                }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
                <ProfileCard title="Grundeinstellungen">
                    {isCreating && (
                        <div style={{ marginBottom: 'var(--spacing-medium)' }}>
                            <label className="form-label">Subdomain *</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xsmall)' }}>
                                <input
                                    type="text"
                                    value={formData.subdomain}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('subdomain', e.target.value.toLowerCase())}
                                    pattern="[a-z0-9-]+"
                                    required
                                    placeholder="deinname"
                                    className="form-input"
                                    style={{ flex: 1 }}
                                />
                                <span style={{ color: 'var(--font-color-muted)', whiteSpace: 'nowrap' }}>
                                    .{getSitesDomain()}
                                </span>
                            </div>
                            <small style={{ display: 'block', marginTop: 'var(--spacing-xxsmall)', color: 'var(--font-color-muted)' }}>
                                Nur Kleinbuchstaben, Zahlen und Bindestriche
                            </small>
                        </div>
                    )}

                    <FormInput
                        name="site_title"
                        label="Titel *"
                        value={formData.site_title}
                        onChange={(value) => handleChange('site_title', value)}
                        required
                        placeholder="Max Mustermann"
                    />

                    <FormInput
                        name="tagline"
                        label="Tagline"
                        value={formData.tagline}
                        onChange={(value) => handleChange('tagline', value)}
                        placeholder="Grüner Kreisverband Beispielstadt"
                    />

                    <FormTextarea
                        name="bio"
                        label="Bio"
                        value={formData.bio}
                        onChange={(value) => handleChange('bio', value)}
                        placeholder="Erzähle etwas über dich..."
                        minRows={4}
                    />
                </ProfileCard>

                <ProfileCard title="Kontaktinformationen">
                    <FormInput
                        name="contact_email"
                        label="E-Mail"
                        type="email"
                        value={formData.contact_email}
                        onChange={(value) => handleChange('contact_email', value)}
                        placeholder="email@beispiel.de"
                    />
                </ProfileCard>

                <ProfileCard title="Social Media">
                    <FormInput
                        name="social_twitter"
                        label="Twitter/X"
                        type="url"
                        value={formData.social_links?.twitter || ''}
                        onChange={(value) => handleSocialChange('twitter', value)}
                        placeholder="https://twitter.com/username"
                    />

                    <FormInput
                        name="social_facebook"
                        label="Facebook"
                        type="url"
                        value={formData.social_links?.facebook || ''}
                        onChange={(value) => handleSocialChange('facebook', value)}
                        placeholder="https://facebook.com/username"
                    />

                    <FormInput
                        name="social_instagram"
                        label="Instagram"
                        type="url"
                        value={formData.social_links?.instagram || ''}
                        onChange={(value) => handleSocialChange('instagram', value)}
                        placeholder="https://instagram.com/username"
                    />

                    <FormInput
                        name="social_linkedin"
                        label="LinkedIn"
                        type="url"
                        value={formData.social_links?.linkedin || ''}
                        onChange={(value) => handleSocialChange('linkedin', value)}
                        placeholder="https://linkedin.com/in/username"
                    />
                </ProfileCard>
            </div>

            <div style={{
                display: 'flex',
                gap: 'var(--spacing-medium)',
                justifyContent: 'flex-end',
                marginTop: 'var(--spacing-large)',
                paddingTop: 'var(--spacing-large)',
                borderTop: '1px solid var(--border-color)'
            }}>
                <ProfileActionButton
                    action="back"
                    label="Abbrechen"
                    onClick={onCancel}
                    disabled={isSaving}
                    size="m"
                />
                <button
                    type="submit"
                    className="pabtn pabtn--primary pabtn--m"
                    disabled={isSaving}
                >
                    <span className="pabtn__label">
                        {isSaving ? 'Speichert...' : (isCreating ? 'Site erstellen' : 'Änderungen speichern')}
                    </span>
                </button>
            </div>
        </form>
    );
};

export default SiteForm;
