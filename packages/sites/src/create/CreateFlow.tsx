import { Button } from '@gruenerator/ui';
import { useState } from 'react';

import { GenerationProgress } from '../components/common/GenerationProgress';
import { CreateSiteScreen } from '../components/CreateSiteScreen';
import { EditorSkeleton } from '../editor/EditorSkeleton';
import { SiteGenerationError, type SiteGenerationInput } from '../generation/siteGenerationStream';
import { useSite, type GeneratedSiteData } from '../hooks/useSite';
import { useSiteGeneration } from '../hooks/useSiteGeneration';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../SitesContext';
import { handleApiError, SitesApiError } from '../utils/errorHandler';
import { nameToSubdomain } from '../utils/sanitization';
import { validators } from '../utils/validation';

export function CreateFlow({ onBack }: { onBack?: () => void }) {
  const { user } = useAuth();
  const { publicOrigin, createSite, isCreating, refetch } = useSite();
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

  // The generated content goes straight into a new site; once it exists, EditPage opens the editor.
  // A failed create keeps the content in the retry, so a second click does not regenerate it.
  const createFromGenerated = async (data: GeneratedSiteData) => {
    setFailure(null);
    try {
      await createSite({
        subdomain: subdomain.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        site_title: data.site_title,
        tagline: data.tagline,
        contact_email: data.contact_email || contactEmail,
        sections: data.sections,
      });
      toast.success('Seite erstellt', 'Deine Seite wurde erfolgreich erstellt');
    } catch (err) {
      console.error('Create failed:', err);
      handleApiError(err, toast);
      // A first attempt can have stored the site before failing; reload it so the editor opens.
      if (
        err instanceof SitesApiError &&
        err.status === 400 &&
        /bereits eine Website/.test(err.message)
      ) {
        void refetch();
        return;
      }
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
