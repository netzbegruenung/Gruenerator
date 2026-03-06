import { type CandidateData } from '@gruenerator/sites-design';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FiLogOut, FiExternalLink, FiEye } from 'react-icons/fi';

import { CandidatePage } from '../CandidatePage';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { CreateSiteScreen } from '../components/CreateSiteScreen';
import {
  EditorLayout,
  EditorSidebar,
  InteractivePreview,
  SectionNavigation,
} from '../components/editor';
import { useAuth } from '../hooks/useAuth';
import { useLoadingProgress } from '../hooks/useLoadingProgress';
import { useSite, type GeneratedSiteData } from '../hooks/useSite';
import { useToast } from '../hooks/useToast';
import { cn } from '../utils/cn';
import { handleApiError } from '../utils/errorHandler';
import { nameToSubdomain, sanitizeSubdomain } from '../utils/sanitization';
import { validators } from '../utils/validation';

export function EditPage() {
  const { user, logout } = useAuth();
  const {
    site,
    isLoading,
    createSite,
    updateSite,
    togglePublish,
    generateSite,
    generateFromFlyer,
    isCreating,
    isUpdating,
    isPublishing,
    isGenerating,
    isGeneratingFromFlyer,
  } = useSite();
  const toast = useToast();
  const isAnyGenerating = isGenerating || isGeneratingFromFlyer;
  const generationProgress = useLoadingProgress(isAnyGenerating, 45000);

  const previewScrollRef = useRef<HTMLDivElement>(null);

  // AI generation form state (when no site exists)
  const [subdomain, setSubdomain] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  // Pre-fill subdomain from user's display name
  useEffect(() => {
    if (user?.display_name && !subdomain) {
      setSubdomain(nameToSubdomain(user.display_name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when display_name loads
  }, [user?.display_name]);

  // Preview state (before creating site)
  const [previewData, setPreviewData] = useState<GeneratedSiteData | null>(null);

  // Regenerate state (temporarily unused - feature in progress)
  const [regenerateDescription, setRegenerateDescription] = useState('');
  const [_showRegenerateForm, _setShowRegenerateForm] = useState(false);

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
    const subdomainError = validators.subdomain(subdomain);
    if (subdomainError) {
      toast.error('Subdomain ungültig', subdomainError);
      return;
    }

    const descriptionError = validators.description(description);
    if (descriptionError) {
      toast.error('Beschreibung ungültig', descriptionError);
      return;
    }

    const emailError = validators.email(contactEmail);
    if (emailError) {
      toast.error('E-Mail ungültig', emailError);
      return;
    }

    try {
      const generated = await generateSite({
        description,
        email: contactEmail || undefined,
      });
      setPreviewData(generated);
      toast.success('Seite generiert', 'Deine Seite wurde erfolgreich generiert');
    } catch (err) {
      console.error('Generate failed:', err);
      handleApiError(err, toast);
    }
  };

  const handleFlyerUpload = async (file: File) => {
    const subdomainError = validators.subdomain(subdomain);
    if (subdomainError) {
      toast.error('Subdomain ungültig', subdomainError);
      return;
    }

    try {
      const generated = await generateFromFlyer({
        file,
        email: contactEmail || undefined,
      });
      setPreviewData(generated);
      toast.success('Seite generiert', 'Deine Seite wurde aus dem Flyer generiert');
    } catch (err) {
      console.error('Flyer generation failed:', err);
      handleApiError(err, toast);
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
      toast.success('Seite erstellt', 'Deine Seite wurde erfolgreich erstellt');
    } catch (err) {
      console.error('Create failed:', err);
      handleApiError(err, toast);
    }
  };

  const handleDiscardPreview = () => {
    setPreviewData(null);
  };

  const handleUpdateCandidateData = useCallback((updates: Partial<CandidateData>) => {
    setCandidateData((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const handleSave = async () => {
    if (!site || !candidateData) return;

    try {
      const socialLinks = Object.fromEntries(
        Object.entries(candidateData.hero.socialLinks).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>;

      await updateSite({
        id: site.id,
        data: {
          site_title: candidateData.hero.name,
          tagline: candidateData.hero.tagline,
          bio: candidateData.about.content,
          contact_email: candidateData.contact.email,
          social_links: socialLinks,
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
      toast.success('Gespeichert', 'Deine Änderungen wurden gespeichert');
    } catch (err) {
      console.error('Update failed:', err);
      handleApiError(err, toast);
    }
  };

  const handlePublish = async () => {
    if (!site) return;
    try {
      await togglePublish(site.id);
      const action = site.is_published ? 'depubliziert' : 'veröffentlicht';
      toast.success(
        site.is_published ? 'Depubliziert' : 'Veröffentlicht',
        `Deine Seite wurde ${action}`
      );
    } catch (err) {
      console.error('Publish failed:', err);
      handleApiError(err, toast);
    }
  };

  const _handleRegenerate = async () => {
    if (!site) return;
    if (!regenerateDescription.trim()) {
      toast.error('Beschreibung fehlt', 'Bitte gib eine Beschreibung ein.');
      return;
    }

    const confirmed = window.confirm(
      'Achtung: Alle aktuellen Inhalte werden durch neue KI-generierte Inhalte ersetzt. Fortfahren?'
    );

    if (!confirmed) return;

    try {
      const generated = await generateSite({
        description: regenerateDescription,
        email: site.contact_email || undefined,
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

      _setShowRegenerateForm(false);
      setRegenerateDescription('');
      toast.success('Seite neu generiert', 'Deine Seite wurde erfolgreich neu generiert');
    } catch (err) {
      console.error('Regenerate failed:', err);
      handleApiError(err, toast);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-grey-100">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-grey-600">
          <div className="w-10 h-10 border-[3px] border-grey-200 border-t-primary-600 rounded-full animate-[spin_1s_linear_infinite]" />
          <p>Seite wird geladen...</p>
        </div>
      </div>
    );
  }

  // Build preview data for post-generation review flow
  const previewCandidateData: CandidateData | null = previewData
    ? {
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
      }
    : null;

  const isProcessing = isGenerating || isGeneratingFromFlyer || isCreating;

  // If site exists and we have candidate data, show the new editor
  if (site && candidateData) {
    return (
      <div className="min-h-screen flex flex-col bg-grey-100">
        <header className="flex flex-row items-center gap-sm py-sm px-md bg-white border-b border-grey-200 min-h-14">
          <div className="flex items-center gap-sm shrink-0">
            <h1 className="text-base text-primary-600 m-0 whitespace-nowrap">Grünerator Sites</h1>
          </div>
          <div className="flex-1 hidden lg:block overflow-x-auto">
            <SectionNavigation />
          </div>
          <div className="flex items-center gap-xs shrink-0">
            <button
              className="inline-flex items-center gap-1.5 bg-primary-600 text-white border-none py-xs px-sm text-sm font-medium rounded-sm cursor-pointer transition-colors hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:w-4 [&_svg]:h-4"
              onClick={() => setIsPreviewMode(true)}
              title="Vorschau"
            >
              <FiEye />
              <span className="hidden md:inline">Vorschau</span>
            </button>
            <button
              className="inline-flex items-center gap-1.5 bg-primary-600 text-white border-none py-xs px-sm text-sm font-medium rounded-sm cursor-pointer transition-colors hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:w-4 [&_svg]:h-4"
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
                className="flex items-center justify-center w-9 h-9 bg-transparent border border-grey-200 rounded-sm text-grey-600 cursor-pointer transition-colors no-underline hover:bg-grey-100 hover:text-grey-800 hover:border-grey-400 [&_svg]:w-[18px] [&_svg]:h-[18px]"
                title="Live-Seite öffnen"
              >
                <FiExternalLink />
              </a>
            )}
            <button
              className="flex items-center justify-center w-9 h-9 bg-transparent border border-grey-200 rounded-sm text-grey-600 cursor-pointer transition-colors no-underline hover:bg-grey-100 hover:text-grey-800 hover:border-grey-400 [&_svg]:w-[18px] [&_svg]:h-[18px]"
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
            <InteractivePreview candidateData={candidateData} containerRef={previewScrollRef} />
          }
        />

        {/* Fullscreen Preview Mode */}
        {isPreviewMode && (
          <div className="fixed inset-0 z-[1000] bg-white flex flex-col">
            <div className="flex flex-wrap justify-between items-center py-sm px-md bg-primary-600 text-white shadow-md shrink-0 gap-sm md:px-lg">
              <div className="flex items-center gap-sm">
                <span className="font-semibold text-sm md:text-base">Vorschau</span>
                <span className="hidden md:block opacity-80 text-xs">
                  {site.subdomain}.grsites.de
                </span>
              </div>
              <div className="flex gap-xs">
                <button
                  className={cn(
                    'bg-white/10 border-none py-xs px-sm rounded-sm cursor-pointer text-base text-white transition-colors hover:bg-white/20',
                    previewDevice === 'desktop' && 'bg-white/30'
                  )}
                  onClick={() => setPreviewDevice('desktop')}
                  title="Desktop"
                >
                  Desktop
                </button>
                <button
                  className={cn(
                    'bg-white/10 border-none py-xs px-sm rounded-sm cursor-pointer text-base text-white transition-colors hover:bg-white/20',
                    previewDevice === 'tablet' && 'bg-white/30'
                  )}
                  onClick={() => setPreviewDevice('tablet')}
                  title="Tablet"
                >
                  Tablet
                </button>
                <button
                  className={cn(
                    'bg-white/10 border-none py-xs px-sm rounded-sm cursor-pointer text-base text-white transition-colors hover:bg-white/20',
                    previewDevice === 'phone' && 'bg-white/30'
                  )}
                  onClick={() => setPreviewDevice('phone')}
                  title="Handy"
                >
                  Handy
                </button>
              </div>
              <div className="flex items-center gap-xs">
                <button
                  className="bg-white/20 text-white border-none py-xs px-md rounded-sm cursor-pointer text-sm transition-colors hover:bg-white/30"
                  onClick={() => setIsPreviewMode(false)}
                >
                  Schließen
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-grey-200 flex justify-center p-0">
              <div
                className={cn(
                  'bg-white h-full overflow-y-auto transition-[width] duration-300',
                  previewDevice === 'desktop' && 'w-full',
                  previewDevice === 'tablet' && 'w-[768px] max-w-full shadow-lg',
                  previewDevice === 'phone' && 'w-[375px] max-w-full shadow-lg'
                )}
                style={{ containerType: 'inline-size', containerName: 'preview' }}
              >
                <CandidatePage candidate={candidateData} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // No site, no preview — show the beautiful start screen
  if (!previewCandidateData) {
    return (
      <>
        <CreateSiteScreen
          subdomain={subdomain}
          onSubdomainChange={(v) => setSubdomain(sanitizeSubdomain(v))}
          contactEmail={contactEmail}
          onContactEmailChange={setContactEmail}
          description={description}
          onDescriptionChange={setDescription}
          onGenerate={handleGenerate}
          onFlyerUpload={handleFlyerUpload}
          isProcessing={isProcessing}
          isGenerating={isGenerating}
          isGeneratingFromFlyer={isGeneratingFromFlyer}
          onLogout={logout}
          userEmail={user?.email}
        />
        <LoadingOverlay
          isLoading={isAnyGenerating}
          message={
            isGeneratingFromFlyer ? 'Flyer wird analysiert...' : 'KI generiert deine Seite...'
          }
          progress={generationProgress}
          submessage={
            isGeneratingFromFlyer
              ? generationProgress < 20
                ? 'Text wird aus dem Flyer extrahiert...'
                : generationProgress < 45
                  ? 'Inhalte werden analysiert...'
                  : generationProgress < 70
                    ? 'Website wird generiert...'
                    : 'Bilder werden ausgewählt...'
              : generationProgress < 30
                ? 'Analysiere deine Beschreibung...'
                : generationProgress < 60
                  ? 'Erstelle Inhalte...'
                  : 'Fast fertig...'
          }
        />
      </>
    );
  }

  // Preview exists — show sidebar controls + generated preview
  return (
    <div className="min-h-screen flex flex-col bg-grey-100">
      <header className="flex flex-row items-center gap-sm py-sm px-md bg-white border-b border-grey-200 min-h-14">
        <div className="flex items-center gap-sm shrink-0">
          <h1 className="text-base text-primary-600 m-0 whitespace-nowrap">Grünerator Sites</h1>
          {user && <span>{user.email}</span>}
        </div>
        <div className="flex items-center gap-xs shrink-0 ml-auto">
          <button
            className="inline-flex items-center gap-1.5 bg-grey-200 text-grey-800 border-none py-xs px-sm text-sm font-medium rounded-sm cursor-pointer transition-colors hover:bg-grey-400 disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:w-4 [&_svg]:h-4"
            onClick={logout}
          >
            Abmelden
          </button>
        </div>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 bg-white p-[var(--spacing-lg-r)] overflow-y-auto border-b border-grey-200 max-h-[60vh] md:p-[var(--spacing-xl-r)] md:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r lg:border-grey-200 xl:w-[450px]">
          <h2 className="text-lg text-grey-800 mb-lg">Vorschau</h2>
          <p className="text-grey-600 text-base leading-relaxed mb-lg">
            So wird deine Seite aussehen. Prüfe die Inhalte und erstelle die Seite oder generiere
            neu.
          </p>
          <p className="text-grey-600 text-base leading-relaxed mb-lg">
            <strong className="text-primary-600 font-semibold">{subdomain}.grsites.de</strong>
          </p>

          <div className="bg-grey-100 rounded-sm p-md mb-lg">
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-400 uppercase tracking-wider">
                Name:
              </span>
              <span className="text-sm text-grey-800 leading-snug">{previewData!.site_title}</span>
            </div>
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-400 uppercase tracking-wider">
                Tagline:
              </span>
              <span className="text-sm text-grey-800 leading-snug">{previewData!.tagline}</span>
            </div>
            <div className="flex flex-col gap-xs">
              <span className="text-xs font-semibold text-grey-400 uppercase tracking-wider">
                Themen:
              </span>
              <span className="text-sm text-grey-800 leading-snug">
                {previewData!.sections.themes.map((t) => t.title).join(', ')}
              </span>
            </div>
          </div>

          <div className="mt-xl">
            <button
              className="inline-flex items-center justify-center gap-xs bg-gradient-to-br from-primary-600 to-primary-700 text-white border-none py-sm px-lg text-base font-semibold rounded-sm cursor-pointer transition-all w-full hover:translate-y-[-1px] hover:shadow-[0_4px_12px_rgba(70,150,43,0.3)] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              onClick={handleConfirmCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <span className="w-4 h-4 border-2 border-grey-200 border-t-primary-600 rounded-full animate-[spin_1s_linear_infinite]" />
                  Wird erstellt...
                </>
              ) : (
                'Seite erstellen'
              )}
            </button>
            <button
              className="inline-flex items-center justify-center gap-xs bg-grey-100 bg-none text-grey-600 border-none py-sm px-lg text-base font-semibold rounded-sm cursor-pointer transition-all w-full hover:bg-grey-200 hover:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              onClick={handleDiscardPreview}
              disabled={isCreating}
            >
              Verwerfen
            </button>
            <button
              className="w-full p-sm bg-grey-100 border border-dashed border-grey-400 rounded-sm text-grey-600 text-sm cursor-pointer transition-colors hover:bg-grey-200 hover:border-grey-400 hover:text-grey-800 disabled:opacity-50 disabled:cursor-not-allowed mt-xs"
              onClick={handleGenerate}
              disabled={isGenerating || isCreating}
            >
              {isGenerating ? 'Generiert...' : 'Neu generieren'}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-h-[40vh] lg:min-h-0">
          <div className="py-md px-lg bg-white border-b border-grey-200">
            <h3 className="m-0 text-base text-grey-600">Vorschau</h3>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            <CandidatePage candidate={previewCandidateData} />
          </div>
        </main>
      </div>

      <LoadingOverlay
        isLoading={isAnyGenerating}
        message={isGeneratingFromFlyer ? 'Flyer wird analysiert...' : 'KI generiert deine Seite...'}
        progress={generationProgress}
        submessage={
          isGeneratingFromFlyer
            ? generationProgress < 20
              ? 'Text wird aus dem Flyer extrahiert...'
              : generationProgress < 45
                ? 'Inhalte werden analysiert...'
                : generationProgress < 70
                  ? 'Website wird generiert...'
                  : 'Bilder werden ausgewählt...'
            : generationProgress < 30
              ? 'Analysiere deine Beschreibung...'
              : generationProgress < 60
                ? 'Erstelle Inhalte...'
                : 'Fast fertig...'
        }
      />
    </div>
  );
}
