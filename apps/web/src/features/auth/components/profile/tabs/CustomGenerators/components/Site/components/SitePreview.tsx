import ProfileCard from '../../../../../../../../../components/common/ProfileCard';
import ProfileActionButton from '../../../../../../../../../components/profile/actions/ProfileActionButton';
import { getSiteUrl, getSitesDomain } from '../utils/siteConfig';

const SitePreview = ({ site, onEdit, onPublish }) => {
    return (
        <>
            <div className="profile-header-section">
                <div className="group-title-area">
                    <h2 className="profile-user-name large-profile-title">
                        {site.site_title}
                    </h2>
                    <a
                        href={getSiteUrl(site.subdomain)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="profile-detail-text"
                        style={{ color: 'var(--link-color)', textDecoration: 'none' }}
                    >
                        {site.subdomain}.{getSitesDomain()} ↗
                    </a>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
                    <ProfileActionButton
                        action={site.is_published ? 'delete' : 'add'}
                        label={site.is_published ? 'Unveröffentlichen' : 'Veröffentlichen'}
                        variant={site.is_published ? 'secondary' : 'primary'}
                        onClick={onPublish}
                        size="m"
                    />
                    <ProfileActionButton
                        action="edit"
                        label="Bearbeiten"
                        variant="primary"
                        onClick={onEdit}
                        size="m"
                    />
                </div>
            </div>

            {/* Site Info Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
                <ProfileCard title="Grundinformationen">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)' }}>
                        <div><strong>Titel:</strong> {site.site_title}</div>
                        {site.tagline && <div><strong>Tagline:</strong> {site.tagline}</div>}
                        {site.bio && <div><strong>Bio:</strong> {site.bio}</div>}
                    </div>
                </ProfileCard>

                {site.contact_email && (
                    <ProfileCard title="Kontakt">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)' }}>
                            <div><strong>E-Mail:</strong> {site.contact_email}</div>
                        </div>
                    </ProfileCard>
                )}

                {site.social_links && Object.keys(site.social_links).filter(k => site.social_links[k]).length > 0 && (
                    <ProfileCard title="Social Media">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)' }}>
                            {Object.entries(site.social_links).map(([platform, url]) => (
                                url && (
                                    <div key={platform}>
                                        <strong style={{ textTransform: 'capitalize' }}>{platform}:</strong>{' '}
                                        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                                    </div>
                                )
                            ))}
                        </div>
                    </ProfileCard>
                )}

                <ProfileCard title="Statistik">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small)' }}>
                        <div>
                            <strong>Status:</strong>{' '}
                            <span style={{ color: site.is_published ? 'var(--klee)' : 'var(--font-color-muted)' }}>
                                {site.is_published ? 'Veröffentlicht' : 'Entwurf'}
                            </span>
                        </div>
                        <div><strong>Aufrufe:</strong> {site.visit_count || 0}</div>
                        {site.last_published && (
                            <div>
                                <strong>Zuletzt veröffentlicht:</strong>{' '}
                                {new Date(site.last_published).toLocaleDateString('de-DE')}
                            </div>
                        )}
                    </div>
                </ProfileCard>
            </div>
        </>
    );
};

export default SitePreview;
