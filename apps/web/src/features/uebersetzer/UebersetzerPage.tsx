import {
  Alert,
  AlertDescription,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { PiFileText, PiTextAa } from 'react-icons/pi';

import PageContainer from '../../components/common/PageContainer';

import { DocumentTranslator } from './components/DocumentTranslator';
import { TextTranslator } from './components/TextTranslator';
import { TranslationNotConfiguredError, useTranslationLanguages } from './hooks/useTranslation';

/** Inactive = outline pill, active = the brand pill (Button's two brand variants). */
const TAB_CLS =
  'h-9 gap-xs rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground dark:border-grey-700 ' +
  'data-[state=active]:border-transparent data-[state=active]:bg-secondary-600 data-[state=active]:text-white data-[state=active]:shadow-none';

/**
 * Übersetzer — DeepL text and document translation with the account glossary.
 * Language pickers come from DeepL's own list (cached server-side); nothing is
 * hardcoded here, so a new DeepL language shows up without a deploy.
 */
const UebersetzerPage = () => {
  const languages = useTranslationLanguages();

  return (
    <PageContainer
      maxWidth="lg"
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
          {/* The design's pill pair, but still a real Radix tablist — two bare
              buttons would drop the tab/tabpanel wiring the page has today. */}
          <TabsList className="mb-lg h-auto gap-xs bg-transparent p-0">
            <TabsTrigger value="text" className={TAB_CLS}>
              <PiTextAa aria-hidden="true" />
              Text
            </TabsTrigger>
            <TabsTrigger value="dokument" className={TAB_CLS}>
              <PiFileText aria-hidden="true" />
              Dokument
            </TabsTrigger>
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
