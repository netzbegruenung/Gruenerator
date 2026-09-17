import {
  Alert,
  AlertDescription,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';

import PageContainer from '../../components/common/PageContainer';

import { DocumentTranslator } from './components/DocumentTranslator';
import { TextTranslator } from './components/TextTranslator';
import { TranslationNotConfiguredError, useTranslationLanguages } from './hooks/useTranslation';

/**
 * Übersetzer — DeepL text and document translation with the account glossary.
 * Language pickers come from DeepL's own list (cached server-side); nothing is
 * hardcoded here, so a new DeepL language shows up without a deploy.
 */
const UebersetzerPage = () => {
  const languages = useTranslationLanguages();

  return (
    <PageContainer
      maxWidth="md"
      title="Übersetzer"
      subtitle="Texte und Dokumente mit DeepL übersetzen — das Grünen-Glossar wird automatisch angewendet."
    >
      {languages.isPending ? (
        <div className="flex flex-col gap-md" aria-busy="true" aria-label="Lade Sprachen">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : languages.isError ? (
        <Alert
          variant={
            languages.error instanceof TranslationNotConfiguredError ? 'default' : 'destructive'
          }
          role={languages.error instanceof TranslationNotConfiguredError ? 'status' : 'alert'}
        >
          <AlertDescription>{languages.error.message}</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="text">
          <TabsList className="mb-md">
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="dokument">Dokument</TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <TextTranslator data={languages.data} />
          </TabsContent>
          <TabsContent value="dokument">
            <DocumentTranslator data={languages.data} />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
};

export default UebersetzerPage;
