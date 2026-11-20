import {
  buildSitePreviewSnapshot,
  siteDraftFromSite,
  siteDraftToSnapshotSource,
  type SiteSnapshotSource,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { BackButton } from '../components/common/BackButton';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { CreateSiteScreen } from '../components/CreateSiteScreen';
import { SiteGenerationError, type SiteGenerationInput } from '../generation/siteGenerationStream';
import { useCreateSite, type GeneratedSiteData } from '../hooks/useSite';
import { useSiteGeneration } from '../hooks/useSiteGeneration';
import { useToast } from '../hooks/useToast';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';
import { useAuth, useSitesPaths } from '../SitesContext';
import { handleApiError, SitesApiError } from '../utils/errorHandler';
import { nameToSubdomain } from '../utils/sanitization';
import { formatAddress } from '../utils/siteAddress';
import { validators } from '../utils/validation';

function generatedToSource(data: GeneratedSiteData, contactEmail: string): SiteSnapshotSource {
  return {
    site_title: data.site_title,
    tagline: data.tagline,
    profile_image: null,
    theme: null,
    contact_email: data.contact_email || contactEmail,
    contact_phone: null,
    social_links: {},
    legal: null,
    sections: data.sections,
  };
}

function GeneratedPreview({
  data,
  contactEmail,
  handle,
}: {
  data: GeneratedSiteData;
  contactEmail: string;
  handle: string;
}) {
  const { user } = useAuth();
  const locale: SupportedLocale = user?.locale ?? 'de-DE';
  const snapshot = useMemo(
    () =>
      buildSitePreviewSnapshot(
        siteDraftToSnapshotSource(siteDraftFromSite(generatedToSource(data, contactEmail)), null),
        locale
      ),
    [data, contactEmail, locale]
  );
  return (
    <SitePreviewFrame
      snapshot={snapshot}
      handle={handle}
      title="Vorschau der Website"
      className="block h-full w-full border-0"
    />
  );
}

async function isOwnSite(handle: string): Promise<boolean> {
  try {
    const res = await getContractsClient().sites.getSiteByHandle({ params: { handle } });
    return res.status === 200;
  } catch {
    return false;
  }
}

export function CreateFlow({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const { publicOrigin, createSite, isCreating } = useCreateSite();
  const navigate = useNavigate();
  const routeState: unknown = useLocation().state;
  const paths = useSitesPaths();
  const { generate, cancel, steps, current, isGenerating, isFlyer } = useSiteGeneration();
  const toast = useToast();
  const [failure, setFailure] = useState<{
    message: string;
    retryable: boolean;
    input: SiteGenerationInput;
  } | null>(null);

  const [subdomainInput, setSubdomainInput] = useState<string | null>(null);
  const subdomain =
    subdomainInput ?? (user?.display_name ? nameToSubdomain(user.display_name) : '');
  const contactEmail = user?.email ?? '';
  const [description, setDescription] = useState('');
  const [previewData, setPreviewData] = useState<GeneratedSiteData | null>(null);

  const runGeneration = async (input: SiteGenerationInput) => {
    setFailure(null);
    try {
      const result = await generate(input, contactEmail);
      setPreviewData(result);
      toast.success(
        'Seite generiert',
        'file' in input
          ? 'Deine Seite wurde aus dem Flyer generiert'
          : 'Deine Seite wurde erfolgreich generiert'
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Generate failed:', err);
      if (err instanceof SiteGenerationError) {
        setFailure({ message: err.message, retryable: err.retryable, input });
      } else if (!(err instanceof SitesApiError && err.consentRequired)) {
        handleApiError(err, toast);
      }
    }
  };

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

    await runGeneration({ description });
  };

  const handleFlyerUpload = async (file: File) => {
    const subdomainError = validators.subdomain(subdomain);
    if (subdomainError) {
      toast.error('Subdomain ungültig', subdomainError);
      return;
    }

    await runGeneration({ file });
  };

  const handleConfirmCreate = async () => {
    if (!previewData) return;

    const handle = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    try {
      const site = await createSite({
        subdomain: handle,
        site_title: previewData.site_title,
        tagline: previewData.tagline,
        contact_email: previewData.contact_email || contactEmail,
        sections: previewData.sections,
      });

      setPreviewData(null);
      toast.success('Seite erstellt', 'Deine Seite wurde erfolgreich erstellt');
      void navigate(paths.site(site.subdomain), { replace: true, state: routeState });
    } catch (err) {
      console.error('Create failed:', err);
      // A first attempt can have stored the site before failing; then the address is taken
      // by this account, and the editor opens instead.
      if (err instanceof SitesApiError && err.status === 400 && (await isOwnSite(handle))) {
        void navigate(paths.site(handle), { replace: true, state: routeState });
        return;
      }
      handleApiError(err, toast);
    }
  };

  const overlay = (
    <LoadingOverlay
      isLoading={isGenerating}
      message={isFlyer ? 'Flyer wird analysiert...' : 'KI generiert deine Seite...'}
      steps={steps}
      current={current}
      onCancel={cancel}
    />
  );

  if (!previewData) {
    return (
      <>
        <CreateSiteScreen
          subdomain={subdomain}
          publicOrigin={publicOrigin}
          onSubdomainChange={setSubdomainInput}
          description={description}
          onDescriptionChange={setDescription}
          onGenerate={handleGenerate}
          onFlyerUpload={handleFlyerUpload}
          onBack={onBack}
          isProcessing={isGenerating || isCreating}
          isGenerating={isGenerating}
          isGeneratingFromFlyer={isGenerating && isFlyer}
        />
        {failure && (
          <div role="alert" className="mx-auto max-w-xl p-md text-center">
            <p className="text-foreground mb-sm">{failure.message}</p>
            {failure.retryable && (
              <Button onClick={() => void runGeneration(failure.input)}>
                Noch einmal versuchen
              </Button>
            )}
          </div>
        )}
        {overlay}
      </>
    );
  }

  const address = formatAddress(publicOrigin, subdomain);

  return (
    <div className="min-h-full flex flex-col bg-grey-100 dark:bg-grey-800">
      <header className="flex flex-row items-center gap-sm py-sm px-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
        {onBack && <BackButton onBack={onBack} />}
        <h1 className="sr-only">Seite erstellen</h1>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 bg-background-pure p-lg overflow-y-auto border-b border-grey-200 dark:border-grey-700 max-h-[60vh] md:p-xl md:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r lg:border-grey-200 dark:lg:border-grey-700 xl:w-[450px]">
          <h2 className="text-lg text-foreground mb-lg">Prüfen und erstellen</h2>
          <p className="text-grey-600 dark:text-grey-400 text-base leading-relaxed mb-lg">
            So wird deine Seite aussehen. Prüfe die Inhalte und erstelle die Seite.
          </p>
          <p className="text-grey-600 dark:text-grey-400 text-base leading-relaxed mb-lg">
            <strong className="text-primary-600 dark:text-primary-400 font-semibold">
              {address}
            </strong>
          </p>

          <div className="bg-grey-100 dark:bg-grey-800 rounded-sm p-md mb-lg">
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-600 dark:text-grey-400 uppercase tracking-wider">
                Name:
              </span>
              <span className="text-sm text-foreground leading-snug">{previewData.site_title}</span>
            </div>
            <div className="flex flex-col gap-xs mb-sm">
              <span className="text-xs font-semibold text-grey-600 dark:text-grey-400 uppercase tracking-wider">
                Tagline:
              </span>
              <span className="text-sm text-foreground leading-snug">{previewData.tagline}</span>
            </div>
            <div className="flex flex-col gap-xs">
              <span className="text-xs font-semibold text-grey-600 dark:text-grey-400 uppercase tracking-wider">
                Themen:
              </span>
              <span className="text-sm text-foreground leading-snug">
                {previewData.sections.themes.map((t) => t.title).join(', ')}
              </span>
            </div>
          </div>

          <div className="mt-xl flex flex-col gap-xs">
            <Button className="w-full" onClick={handleConfirmCreate} disabled={isCreating}>
              {isCreating ? 'Wird erstellt...' : 'Seite erstellen'}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setPreviewData(null)}
              disabled={isCreating}
            >
              Verwerfen
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-h-[40vh] lg:min-h-0">
          <div className="py-md px-lg bg-background-pure border-b border-grey-200 dark:border-grey-700">
            <h2 className="m-0 text-base text-grey-600 dark:text-grey-400">Vorschau</h2>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden bg-background-pure">
            <GeneratedPreview
              data={previewData}
              contactEmail={contactEmail}
              handle={subdomain || 'vorschau'}
            />
          </div>
        </div>
      </div>

      {overlay}
    </div>
  );
}
