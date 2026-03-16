/**
 * Scanner Page - Document Scanner with OCR text extraction
 */

import { Particles } from '@gruenerator/ui';

import ScannerTab from './tabs/ScannerTab';

// Keep CSS import for parent-targeting rules that can't be expressed in Tailwind:
// .content-wrapper:has(.scanner-page), .app-content:has(.scanner-page) .footer,
// .scanner-layout:has(.scanner-results-state) hiding rules
import '../../assets/styles/pages/scanner.css';

const FILE_TYPE_BADGES = ['PDF', 'Bilder', 'DOCX', 'PPTX'] as const;

const ScannerPageHeader = () => (
  <div className="scanner-page-header flex w-full flex-col items-center gap-xs pb-lg text-center">
    <h1 className="m-0 text-[2.2rem] font-semibold text-foreground max-md:text-[1.8rem] max-[480px]:text-[1.5rem]">
      Scanner
    </h1>
    <p className="m-0 text-base font-normal leading-relaxed text-foreground max-md:text-[0.9375rem]">
      Dokumente digitalisieren und Texte automatisch extrahieren
    </p>
    <div className="mt-sm flex flex-wrap justify-center gap-sm">
      {FILE_TYPE_BADGES.map((type) => (
        <span
          key={type}
          className="inline-block whitespace-nowrap rounded-2xl border border-grey-300 bg-transparent px-3 py-1 text-xs font-medium tracking-[0.02em] text-foreground dark:border-grey-600"
        >
          {type}
        </span>
      ))}
      <span className="inline-block whitespace-nowrap rounded-2xl border border-grey-300 bg-transparent px-3 py-1 text-xs font-medium tracking-[0.02em] text-foreground dark:border-grey-600">
        bis 50 MB
      </span>
    </div>
  </div>
);

const ScannerPage = () => {
  return (
    <div className="scanner-page relative h-full w-full overflow-clip">
      <Particles
        className="absolute inset-0 h-full w-full"
        quantity={80}
        color="#5F8575"
        size={0.6}
        staticity={40}
        ease={60}
      />
      <div className="scanner-layout relative z-[1] flex h-full min-h-0 flex-col justify-start overflow-x-clip">
        <ScannerPageHeader />
        <ScannerTab />
      </div>
    </div>
  );
};

export default ScannerPage;
