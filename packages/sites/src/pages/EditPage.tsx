import { emptyRichTextDoc } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { type CandidateData } from '@gruenerator/sites-design';
import { useState, useRef, useCallback } from 'react';
import { FiExternalLink, FiEye } from 'react-icons/fi';

import { CandidatePage } from '../CandidatePage';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { CreateSiteScreen } from '../components/CreateSiteScreen';
import {
  EditorLayout,
  EditorSidebar,
  InteractivePreview,
  SectionNavigation,
} from '../components/editor';
import { useLoadingProgress } from '../hooks/useLoadingProgress';
import { useSite, type GeneratedSiteData, type SiteData } from '../hooks/useSite';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../SitesContext';
import { handleApiError } from '../utils/errorHandler';
import { nameToSubdomain, sanitizeSubdomain } from '../utils/sanitization';
import { validators } from '../utils/validation';

function buildCandidateDataFromSite(site: SiteData): CandidateData {
  return {
    id: site.id,
    slug: site.subdomain,
    hero: {
      imageUrl: site.profile_image || '',
      name: site.site_title,
      tagline: site.tagline || '',
      socialLinks: site.social_links || {},
    },
    about: site.sections?.about ?? {
      title: 'Wer ich bin',
      content: emptyRichTextDoc(),
    },
    heroImage: site.sections?.heroImage || {
      imageUrl: '',
      title: 'Gemeinsam für eine nachhaltige Zukunft!',
      subtitle: '',
    },
    themes: {
      title: 'Meine Themen',
      themes: (site.sections?.themes || []).map((theme) => ({
        ...theme,
        _key: crypto.randomUUID(),
      })),
    },
    actions: {
      actions: (site.sections?.actions || []).map((action) => ({
        ...action,
        _key: crypto.randomUUID(),
      })),
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
  };
}

interface SiteEditorProps {
  site: SiteData;
}

/**
 * Editor for an existing site. Mounted with key={site.id} so the draft state
 * lazily initializes from the server object once and survives re-renders;
 * a different site remounts the editor with fresh data.
 */
function SiteEditor({ site }: SiteEditorProps) {
  const { updateSite, togglePublish, isUpdating, isPublishing } = useSite();
  const toast = useToast();

  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [candidateData, setCandidateData] = useState<CandidateData>(() =>
    buildCandidateDataFromSite(site)
  );
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop');

  const handleUpdateCandidateData = useCallback((updates: Partial<CandidateData>) => {
    setCandidateData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleSave = async () => {
    try {
      const socialLinks = Object.fromEntries(
        Object.entries(candidateData.hero.socialLinks).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>;

      await updateSite({
        id: site.id,
        data: {
          site_title: candidateData.hero.name,
          tagline: candidateData.hero.tagline,
          contact_email: candidateData.contact.email,
          social_links: socialLinks,
          sections: {
            about: candidateData.about,
            heroImage: candidateData.heroImage,
            themes: candidateData.themes.themes.map(({ _key, ...theme }) => theme),
            actions: candidateData.actions.actions.map(({ _key, ...action }) => action),
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
    try {
      await togglePublish({ id: site.id, publish: !site.is_published });
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

  return (
    <div className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800">
      <header className="flex flex-row items-center gap-sm py-sm pl-14 pr-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
        <div className="flex items-center gap-sm shrink-0">
          <h1 className="text-base text-primary-600 dark:text-primary-400 m-0 whitespace-nowrap">
            Grünerator Sites
          </h1>
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
              className="flex items-center justify-center w-9 h-9 bg-transparent border border-grey-200 dark:border-grey-700 rounded-sm text-grey-600 dark:text-grey-400 cursor-pointer transition-colors no-underline hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground hover:border-grey-400 dark:hover:border-grey-600 [&_svg]:w-[18px] [&_svg]:h-[18px]"
              title="Live-Seite öffnen"
            >
              <FiExternalLink />
            </a>
          )}
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
        <div className="fixed inset-y-0 right-0 left-[var(--sidebar-collapsed-width)] z-[1000] bg-background-pure flex flex-col">
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
          <div className="flex-1 overflow-y-auto bg-grey-200 dark:bg-grey-700 flex justify-center p-0">
            <div
              className={cn(
                'bg-background-pure h-full overflow-y-auto transition-[width] duration-300',
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

export function EditPage() {
  const { user } = useAuth();
  const {
    site,
    isLoading,
    createSite,
    updateSite,
    generateSite,
    generateFromFlyer,
    isCreating,
    isGenerating,
    isGeneratingFromFlyer,
  } = useSite();
  const toast = useToast();
  const isAnyGenerating = isGenerating || isGeneratingFromFlyer;
  const generationProgress = useLoadingProgress(isAnyGenerating, 45000);

  // AI generation form state (when no site exists). Subdomain derives from the
  // user's display name until they touch the field; the contact email comes
  // straight from the profile (editable later in the Contact section).
  const [subdomainInput, setSubdomainInput] = useState<string | null>(null);
  const subdomain =
    subdomainInput ?? (user?.display_name ? nameToSubdomain(user.display_name) : '');
  const contactEmail = user?.email ?? '';
  const [description, setDescription] = useState('');

  // Preview state (before creating site)
  const [previewData, setPreviewData] = useState<GeneratedSiteData | null>(null);

  // Regenerate state (temporarily unused - feature in progress)
  const [regenerateDescription, setRegenerateDescription] = useState('');
  const [_showRegenerateForm, _setShowRegenerateForm] = useState(false);

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
      const result = await generateSite({
        description,
        email: contactEmail || undefined,
      });
      setPreviewData(result.transformed);
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
      const result = await generateFromFlyer({
        file,
        email: contactEmail || undefined,
      });
      setPreviewData(result.transformed);
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
        contact_email: previewData.contact_email || contactEmail,
        sections: previewData.sections,
      });

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
      const result = await generateSite({
        description: regenerateDescription,
        email: site.contact_email || undefined,
      });

      await updateSite({
        id: site.id,
        data: {
          site_title: result.transformed.site_title,
          tagline: result.transformed.tagline,
          contact_email: result.transformed.contact_email || site.contact_email || '',
          sections: result.transformed.sections,
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
      <div className="flex flex-col items-center justify-center min-h-full gap-4 text-grey-600 dark:text-grey-400">
        <div className="w-10 h-10 border-[3px] border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
        <p>Seite wird geladen...</p>
      </div>
    );
  }

  // If a site exists, show the editor (keyed so a different site resets the draft)
  if (site) {
    return <SiteEditor key={site.id} site={site} />;
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
        about: previewData.sections.about,
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

  // No site, no preview — show the start screen
  if (!previewCandidateData) {
    return (
      <>
        <CreateSiteScreen
          subdomain={subdomain}
          onSubdomainChange={(v) => setSubdomainInput(sanitizeSubdomain(v))}
          description={description}
          onDescriptionChange={setDescription}
          onGenerate={handleGenerate}
          onFlyerUpload={handleFlyerUpload}
          isProcessing={isProcessing}
          isGenerating={isGenerating}
          isGeneratingFromFlyer={isGeneratingFromFlyer}
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
    <div className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800">
      <header className="flex flex-row items-center gap-sm py-sm pl-14 pr-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
        <h1 className="text-base text-primary-600 dark:text-primary-400 m-0 whitespace-nowrap">
          Grünerator Sites
        </h1>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 bg-background-pure p-lg overflow-y-auto border-b border-grey-200 dark:border-grey-700 max-h-[60vh] md:p-xl md:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r lg:border-grey-200 dark:lg:border-grey-700 xl:w-[450px]">
          <h2 className="text-lg text-foreground mb-lg">Vorschau</h2>
          <p className="text-grey-600 dark:text-grey-400 text-base leading-relaxed mb-lg">
            So wird deine Seite aussehen. Prüfe die Inhalte und erstelle die Seite oder generiere
            neu.
          </p>
          <p className="text-grey-600 dark:text-grey-400 text-base leading-relaxed mb-lg">
            <strong className="text-primary-600 dark:text-primary-400 font-semibold">
              {subdomain}.grsites.de
            </strong>
          </p>

          <div className="bg-grey-100 dark:bg-grey-800 rounded-sm p-md mb-lg">
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-400 dark:text-grey-500 uppercase tracking-wider">
                Name:
              </span>
              <span className="text-sm text-foreground leading-snug">
                {previewData!.site_title}
              </span>
            </div>
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-400 dark:text-grey-500 uppercase tracking-wider">
                Tagline:
              </span>
              <span className="text-sm text-foreground leading-snug">{previewData!.tagline}</span>
            </div>
            <div className="flex flex-col gap-xs">
              <span className="text-xs font-semibold text-grey-400 dark:text-grey-500 uppercase tracking-wider">
                Themen:
              </span>
              <span className="text-sm text-foreground leading-snug">
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
                  <span className="w-4 h-4 border-2 border-grey-200 dark:border-grey-700 border-t-primary-600 rounded-full animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                'Seite erstellen'
              )}
            </button>
            <button
              className="inline-flex items-center justify-center gap-xs bg-grey-100 dark:bg-grey-800 bg-none text-grey-600 dark:text-grey-400 border-none py-sm px-lg text-base font-semibold rounded-sm cursor-pointer transition-all w-full hover:bg-grey-200 dark:hover:bg-grey-700 hover:shadow-none disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              onClick={handleDiscardPreview}
              disabled={isCreating}
            >
              Verwerfen
            </button>
            <button
              className="w-full p-sm bg-grey-100 dark:bg-grey-800 border border-dashed border-grey-400 dark:border-grey-600 rounded-sm text-grey-600 dark:text-grey-400 text-sm cursor-pointer transition-colors hover:bg-grey-200 dark:hover:bg-grey-700 hover:border-grey-400 dark:hover:border-grey-600 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed mt-xs"
              onClick={handleGenerate}
              disabled={isGenerating || isCreating}
            >
              {isGenerating ? 'Generiert...' : 'Neu generieren'}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden min-h-[40vh] lg:min-h-0">
          <div className="py-md px-lg bg-background-pure border-b border-grey-200 dark:border-grey-700">
            <h3 className="m-0 text-base text-grey-600 dark:text-grey-400">Vorschau</h3>
          </div>
          <div className="flex-1 overflow-y-auto bg-background-pure">
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
