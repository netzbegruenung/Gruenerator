import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { GenerationProgress } from '../components/common/GenerationProgress';
import { CreateSiteScreen } from '../components/CreateSiteScreen';
import { EditorSkeleton } from '../editor/EditorSkeleton';
import { SiteGenerationError, type SiteGenerationInput } from '../generation/siteGenerationStream';
import { useCreateSite, useSiteList, type GeneratedSiteData } from '../hooks/useSite';
import { useSiteGeneration } from '../hooks/useSiteGeneration';
import { useSiteProjects } from '../hooks/useSiteSharing';
import { useToast } from '../hooks/useToast';
import { useAuth, useSitesPaths } from '../SitesContext';
import { handleApiError, SitesApiError } from '../utils/errorHandler';
import { nameToSubdomain } from '../utils/sanitization';
import { validators } from '../utils/validation';

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
  const [failure, setFailure] = useState<{ message: string; retry: (() => void) | null } | null>(
    null
  );

  const [subdomainInput, setSubdomainInput] = useState<string | null>(null);
  const subdomain =
    subdomainInput ?? (user?.display_name ? nameToSubdomain(user.display_name) : '');
  const contactEmail = user?.email ?? '';
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  // Only projects the person administers can own a site (the server checks it again).
  const adminProjects = (useSiteProjects().data ?? []).filter((g) => g.isAdmin);
  // With the personal quota used up only a project site is left, so the personal option goes.
  const { sites, limit } = useSiteList();
  const personalFull =
    (sites ?? []).filter((site) => site.group === null && site.is_creator).length >= limit;
  const groupId = projectId || (personalFull ? (adminProjects[0]?.id ?? '') : '');

  // The generated content goes straight into a new site, and its editor opens.
  // A failed create keeps the content in the retry, so a second click does not regenerate it.
  const createFromGenerated = async (data: GeneratedSiteData) => {
    setFailure(null);
    const handle = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    try {
      const site = await createSite({
        subdomain: handle,
        site_title: data.site_title,
        tagline: data.tagline,
        contact_email: data.contact_email || contactEmail,
        sections: data.sections,
        ...(groupId ? { group_id: groupId } : {}),
      });
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
      setFailure({
        message: 'Die Seite konnte nicht angelegt werden.',
        retry: () => void createFromGenerated(data),
      });
    }
  };

  const runGeneration = async (input: SiteGenerationInput) => {
    setFailure(null);
    try {
      const result = await generate(input, contactEmail);
      await createFromGenerated(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Generate failed:', err);
      if (err instanceof SiteGenerationError) {
        setFailure({
          message: err.message,
          retry: err.retryable ? () => void runGeneration(input) : null,
        });
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

  if (isCreating) {
    return <EditorSkeleton label="Seite wird angelegt" />;
  }

  // The form stays mounted while a run is going, so its step and inputs survive a cancel.
  return (
    <>
      {isGenerating && (
        <EditorSkeleton label="Seite wird generiert">
          <GenerationProgress
            message={isFlyer ? 'Flyer wird analysiert …' : 'KI generiert deine Seite …'}
            steps={steps}
            current={current}
            onCancel={cancel}
          />
        </EditorSkeleton>
      )}
      <div hidden={isGenerating}>
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
          projects={adminProjects}
          projectId={groupId}
          allowPersonal={!personalFull}
          onProjectChange={setProjectId}
        />
        {failure && (
          <div role="alert" className="mx-auto max-w-xl p-md text-center">
            <p className="text-foreground mb-sm">{failure.message}</p>
            {failure.retry && <Button onClick={failure.retry}>Noch einmal versuchen</Button>}
          </div>
        )}
      </div>
    </>
  );
}
