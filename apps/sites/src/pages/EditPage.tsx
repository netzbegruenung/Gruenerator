import { useState, useEffect, useRef, useCallback } from 'react';
import { FiLogOut, FiExternalLink, FiEye } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { useSite, type GeneratedSiteData } from '../hooks/useSite';
import { EditorLayout, EditorSidebar, InteractivePreview, SectionNavigation } from '../components/editor';
import { CandidatePage } from '../CandidatePage';
import type { CandidateData } from '../types/candidate';
import '../styles/preview.css';

export function EditPage() {
  const { user, logout } = useAuth();
  const { site, isLoading, createSite, updateSite, togglePublish, generateSite, isCreating, isUpdating, isPublishing, isGenerating } = useSite();

  const previewScrollRef = useRef<HTMLDivElement>(null);

  // AI generation form state (when no site exists)
  const [subdomain, setSubdomain] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  // Preview state (before creating site)
  const [previewData, setPreviewData] = useState<GeneratedSiteData | null>(null);

  // Regenerate state
  const [regenerateDescription, setRegenerateDescription] = useState('');
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);

  // Fullscreen preview mode
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop');

  // Candidate data for editing
  const [candidateData, setCandidateData] = useState<CandidateData | null>(null);

  // Initialize candidate data from site
  useEffect(() => {
    if (site) {
      setCandidateData({
        id: site.id,
        slug: site.subdomain,
        hero: {
          imageUrl: site.profile_image || '',
          name: site.site_title,
          tagline: site.tagline || '',
          socialLinks: site.social_links || {},
        },
        about: {
          title: 'Wer ich bin',
          content: site.bio || '',
        },
        heroImage: site.sections?.heroImage || {
          imageUrl: '',
          title: 'Gemeinsam für eine nachhaltige Zukunft!',
          subtitle: '',
        },
        themes: {
          title: 'Meine Themen',
          themes: site.sections?.themes || [],
        },
        actions: {
          actions: site.sections?.actions || [],
        },
        contact: {
          title: site.sections?.contact?.title || 'Kontakt',
          backgroundImageUrl: site.sections?.contact?.backgroundImageUrl || '',
          email: site.contact_email || '',
          phone: '',
          address: '',
          socialMedia: [],
        },
        socialFeed: site.sections?.socialFeed || {
          title: 'Instagram',
          instagramUsername: '',
          showFeed: false,
        },
      });
    }
  }, [site]);

  const handleGenerate = async () => {
    if (!subdomain.trim()) {
      alert('Bitte gib eine Subdomain ein.');
      return;
    }
    if (!description.trim()) {
      alert('Bitte beschreibe dich kurz, damit die KI Inhalte generieren kann.');
      return;
    }

    try {
      const generated = await generateSite({
        description,
        email: contactEmail || undefined
      });
      setPreviewData(generated);
    } catch (err) {
      console.error('Generate failed:', err);
      alert('Fehler bei der KI-Generierung. Bitte versuche es erneut.');
    }
  };

  const handleConfirmCreate = async () => {
    if (!previewData) return;

    try {
      await createSite({
        subdomain: subdomain.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        site_title: previewData.site_title,
        tagline: previewData.tagline,
        bio: previewData.bio,
        contact_email: previewData.contact_email || contactEmail,
        sections: previewData.sections,
      } as Parameters<typeof createSite>[0]);

      setPreviewData(null);
    } catch (err) {
      console.error('Create failed:', err);
      alert('Fehler beim Erstellen der Seite.');
    }
  };

  const handleDiscardPreview = () => {
    setPreviewData(null);
  };

  const handleUpdateCandidateData = useCallback((updates: Partial<CandidateData>) => {
    setCandidateData((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  const handleSave = async () => {
    if (!site || !candidateData) return;

    try {
      await updateSite({
        id: site.id,
        data: {
          site_title: candidateData.hero.name,
          tagline: candidateData.hero.tagline,
          bio: candidateData.about.content,
          contact_email: candidateData.contact.email,
          social_links: candidateData.hero.socialLinks,
          sections: {
            heroImage: candidateData.heroImage,
            themes: candidateData.themes.themes,
            actions: candidateData.actions.actions,
            contact: {
              title: candidateData.contact.title,
              backgroundImageUrl: candidateData.contact.backgroundImageUrl,
            },
            socialFeed: candidateData.socialFeed,
          },
        },
      });
    } catch (err) {
      console.error('Update failed:', err);
      alert('Fehler beim Speichern');
    }
  };

  const handlePublish = async () => {
    if (!site) return;
    try {
      await togglePublish(site.id);
    } catch (err) {
      console.error('Publish failed:', err);
      alert('Fehler beim Veröffentlichen');
    }
  };

  const handleRegenerate = async () => {
    if (!site) return;
    if (!regenerateDescription.trim()) {
      alert('Bitte gib eine Beschreibung ein.');
      return;
    }

    const confirmed = window.confirm(
      'Achtung: Alle aktuellen Inhalte werden durch neue KI-generierte Inhalte ersetzt. Fortfahren?'
    );

    if (!confirmed) return;

    try {
      const generated = await generateSite({
        description: regenerateDescription,
        email: site.contact_email || undefined
      });

      await updateSite({
        id: site.id,
        data: {
          site_title: generated.site_title,
          tagline: generated.tagline,
          bio: generated.bio,
          contact_email: generated.contact_email || site.contact_email,
          sections: generated.sections,
        },
      });

      setShowRegenerateForm(false);
      setRegenerateDescription('');
    } catch (err) {
      console.error('Regenerate failed:', err);
      alert('Fehler bei der KI-Regenerierung. Bitte versuche es erneut.');
    }
  };

  if (isLoading) {
    return (
      <div className="edit-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Seite wird geladen...</p>
        </div>
      </div>
    );
  }

  // Build preview data for generation flow
  const previewCandidateData: CandidateData = previewData ? {
    id: 'preview',
    slug: subdomain || 'vorschau',
    hero: {
      imageUrl: '',
      name: previewData.site_title,
      tagline: previewData.tagline,
      socialLinks: {},
    },
    about: {
      title: 'Wer ich bin',
      content: previewData.bio,
    },
    heroImage: previewData.sections.heroImage,
    themes: {
      title: 'Meine Themen',
      themes: previewData.sections.themes,
    },
    actions: {
      actions: previewData.sections.actions,
    },
    contact: {
      title: previewData.sections.contact?.title || 'Kontakt',
      backgroundImageUrl: previewData.sections.contact?.backgroundImageUrl || '',
      email: previewData.contact_email || contactEmail,
      socialMedia: [],
    },
  } : {
    id: 'placeholder',
    slug: subdomain || 'dein-name',
    hero: { imageUrl: '', name: 'Dein Name', tagline: 'Dein Slogan wird hier erscheinen', socialLinks: {} },
    about: { title: 'Wer ich bin', content: 'Deine Biografie wird hier erscheinen...' },
    heroImage: { imageUrl: '', title: 'Deine Hauptbotschaft', subtitle: '' },
    themes: { title: 'Meine Themen', themes: [] },
    actions: { actions: [] },
    contact: { title: 'Kontakt', backgroundImageUrl: '', email: contactEmail || 'deine@email.de', socialMedia: [] },
  };

  const isProcessing = isGenerating || isCreating;

  // If site exists and we have candidate data, show the new editor
  if (site && candidateData) {
    return (
      <div className="edit-page">
        <header className="edit-header">
          <div className="edit-header-left">
            <h1>Grünerator Sites</h1>
          </div>
          <div className="edit-header-nav">
            <SectionNavigation />
          </div>
          <div className="edit-header-right">
            <button
              className="header-button"
              onClick={() => setIsPreviewMode(true)}
              title="Vorschau"
            >
              <FiEye />
              <span className="header-button-text">Vorschau</span>
            </button>
            <button
              className="header-button"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? '...' : site.is_published ? 'Depublizieren' : 'Veröffentlichen'}
            </button>
            {site.is_published && (
              <a
                href={`https://${site.subdomain}.grsites.de`}
                target="_blank"
                rel="noopener noreferrer"
                className="header-icon-button"
                title="Live-Seite öffnen"
              >
                <FiExternalLink />
              </a>
            )}
            <button
              className="header-icon-button"
              onClick={logout}
              title="Abmelden"
            >
              <FiLogOut />
            </button>
          </div>
        </header>

        <EditorLayout
          ref={previewScrollRef}
          sidebar={
            <EditorSidebar
              candidateData={candidateData}
              onUpdate={handleUpdateCandidateData}
              onSave={handleSave}
              isSaving={isUpdating}
            />
          }
          preview={
            <InteractivePreview
              candidateData={candidateData}
              containerRef={previewScrollRef}
            />
          }
        />

        {/* Fullscreen Preview Mode */}
        {isPreviewMode && (
          <div className="preview-fullscreen">
            <div className="preview-toolbar">
              <div className="preview-toolbar-left">
                <span className="preview-toolbar-title">Vorschau</span>
                <span className="preview-toolbar-url">{site.subdomain}.grsites.de</span>
              </div>
              <div className="preview-toolbar-center">
                <button
                  className={`device-btn ${previewDevice === 'desktop' ? 'active' : ''}`}
                  onClick={() => setPreviewDevice('desktop')}
                  title="Desktop"
                >
                  Desktop
                </button>
                <button
                  className={`device-btn ${previewDevice === 'tablet' ? 'active' : ''}`}
                  onClick={() => setPreviewDevice('tablet')}
                  title="Tablet"
                >
                  Tablet
                </button>
                <button
                  className={`device-btn ${previewDevice === 'phone' ? 'active' : ''}`}
                  onClick={() => setPreviewDevice('phone')}
                  title="Handy"
                >
                  Handy
                </button>
              </div>
              <div className="preview-toolbar-right">
                <button onClick={() => setIsPreviewMode(false)}>
                  Schließen
                </button>
              </div>
            </div>
            <div className="preview-fullscreen-content">
              <div className={`preview-device-frame preview-device-${previewDevice}`}>
                <CandidatePage candidate={candidateData} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // No site exists - show generation/creation flow
  return (
    <div className="edit-page">
      <header className="edit-header">
        <div className="edit-header-left">
          <h1>Grünerator Sites</h1>
          {user && <span className="user-email">{user.email}</span>}
        </div>
        <div className="edit-header-right">
          <button className="header-button secondary" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>

      <div className="edit-content">
        <aside className="edit-sidebar">
          {/* PREVIEW CONTROLS (when previewData exists but site doesn't) */}
          {previewData && (
            <>
              <h2>Vorschau</h2>
              <p className="sidebar-intro">
                So wird deine Seite aussehen. Prüfe die Inhalte und erstelle die Seite oder generiere neu.
              </p>
              <p className="sidebar-intro">
                <strong>{subdomain}.grsites.de</strong>
              </p>

              <div className="preview-summary">
                <div className="preview-field">
                  <span className="preview-label">Name:</span>
                  <span className="preview-value">{previewData.site_title}</span>
                </div>
                <div className="preview-field">
                  <span className="preview-label">Tagline:</span>
                  <span className="preview-value">{previewData.tagline}</span>
                </div>
                <div className="preview-field">
                  <span className="preview-label">Themen:</span>
                  <span className="preview-value">{previewData.sections.themes.map(t => t.title).join(', ')}</span>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="generate-button primary"
                  onClick={handleConfirmCreate}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <span className="loading-spinner small" />
                      Wird erstellt...
                    </>
                  ) : (
                    'Seite erstellen'
                  )}
                </button>
                <button
                  className="generate-button secondary"
                  onClick={handleDiscardPreview}
                  disabled={isCreating}
                >
                  Verwerfen
                </button>
                <button
                  className="regenerate-toggle"
                  onClick={handleGenerate}
                  disabled={isGenerating || isCreating}
                >
                  {isGenerating ? 'Generiert...' : 'Neu generieren'}
                </button>
              </div>
            </>
          )}

          {/* AI GENERATION FORM (when no site and no preview exists) */}
          {!previewData && (
            <>
              <h2>Neue Seite erstellen</h2>
              <p className="sidebar-intro">
                Beschreibe dich und deine politischen Ziele. Die KI erstellt automatisch eine professionelle Kandidat*innen-Seite für dich.
              </p>

              <div className="form-group">
                <label htmlFor="subdomain">Subdomain *</label>
                <div className="subdomain-input">
                  <input
                    id="subdomain"
                    type="text"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    placeholder="dein-name"
                    disabled={isProcessing}
                  />
                  <span>.grsites.de</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="contact_email">Kontakt E-Mail</label>
                <input
                  id="contact_email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="kontakt@example.de"
                  disabled={isProcessing}
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Beschreibung *</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ich bin Maria Müller, 42 Jahre alt, Stadträtin in Musterstadt. Ich kandidiere für den Landtag und setze mich besonders für Klimaschutz, bezahlbaren Wohnraum und bessere Bildung ein..."
                  rows={10}
                  disabled={isProcessing}
                />
                <p className="form-hint">
                  Je mehr Details du angibst, desto besser wird das Ergebnis.
                </p>
              </div>

              <div className="form-actions">
                <button
                  className="generate-button primary"
                  onClick={handleGenerate}
                  disabled={isProcessing || !subdomain.trim() || !description.trim()}
                >
                  {isProcessing ? (
                    <>
                      <span className="loading-spinner small" />
                      {isGenerating ? 'KI generiert...' : 'Wird erstellt...'}
                    </>
                  ) : (
                    'Seite generieren'
                  )}
                </button>
              </div>
            </>
          )}
        </aside>

        <main className="edit-preview">
          <div className="preview-header">
            <h3>Vorschau</h3>
          </div>
          <div className="preview-container">
            <CandidatePage candidate={previewCandidateData} />
          </div>
        </main>
      </div>
    </div>
  );
}
