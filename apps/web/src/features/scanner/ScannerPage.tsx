/**
 * Scanner Page - Document Scanner with OCR text extraction
 */

import { useState } from 'react';

import DotGrid from './DotGrid';
import ScannerTab from './tabs/ScannerTab';
import '../../assets/styles/pages/scanner.css';

const FILE_TYPE_BADGES = ['PDF', 'Bilder', 'DOCX', 'PPTX'] as const;

const ScannerPageHeader = () => (
  <div className="scanner-page-header">
    <h1 className="scanner-zen-title">Scanner</h1>
    <p className="scanner-zen-subtitle">
      Dokumente digitalisieren und Texte automatisch extrahieren
    </p>
    <div className="scanner-badges">
      {FILE_TYPE_BADGES.map((type) => (
        <span key={type} className="scanner-badge">
          {type}
        </span>
      ))}
      <span className="scanner-badge">bis 50 MB</span>
    </div>
  </div>
);

const ScannerPage = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <div className="scanner-page scanner-zen">
      <DotGrid isProcessing={isProcessing} />
      <div className="scanner-layout">
        <ScannerPageHeader />
        <ScannerTab onProcessingChange={setIsProcessing} />
      </div>
    </div>
  );
};

export default ScannerPage;
