/**
 * Scanner Page - Document Scanner with Protokollizer
 * Uses TabbedLayout to provide OCR text extraction and meeting protocol generation
 */

import { PiScan, PiFileText } from 'react-icons/pi';

import { TabbedLayout, useTabManager, type TabConfig } from '../../components/common/TabbedLayout';

import ProtokollTab from './tabs/ProtokollTab';
import ScannerTab from './tabs/ScannerTab';
import '../../assets/styles/pages/scanner.css';

type ScannerTabId = 'scanner' | 'protokollizer';

const SCANNER_TABS: TabConfig<ScannerTabId>[] = [
  {
    id: 'scanner',
    label: 'Scanner',
    shortLabel: 'Scan',
    icon: <PiScan />,
  },
  {
    id: 'protokollizer',
    label: 'Protokollizer',
    shortLabel: 'Proto',
    icon: <PiFileText />,
  },
];

const ScannerPageHeader = () => (
  <div className="scanner-page-header">
    <h1 className="scanner-zen-title">Scanner</h1>
    <p className="scanner-zen-subtitle">
      Extrahiere Text aus Dokumenten und erstelle Sitzungsprotokolle
    </p>
  </div>
);

const ScannerPage = () => {
  const { activeTab, setActiveTab } = useTabManager({
    defaultTab: 'scanner',
    validTabs: ['scanner', 'protokollizer'] as const,
    urlParam: 'tab',
  });

  return (
    <div className="scanner-page scanner-zen">
      <TabbedLayout
        tabs={SCANNER_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        header={<ScannerPageHeader />}
        ariaLabel="Scanner Funktionen"
      >
        {{
          scanner: <ScannerTab />,
          protokollizer: <ProtokollTab />,
        }}
      </TabbedLayout>
    </div>
  );
};

export default ScannerPage;
