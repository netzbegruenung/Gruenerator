import React, { useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import type { SharepicDataItem } from '../../../components/common/ImageDisplay';
import Spinner from '../../../components/common/Spinner';
import { useCanvasEditorStore } from '../../../stores/canvasEditorStore';
import { ControllableCanvasWrapper } from '../../image-studio/canvas-editor/ControllableCanvasWrapper';
import './SharepicEditorModal.css';

// Lazy load DreizeilenCanvas (kept as special case)
const DreizeilenCanvas = lazy(() => import('../../image-studio/canvas-editor/composed/DreizeilenCanvas').then(m => ({ default: m.DreizeilenCanvas })));

interface DreizeilenAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
}

type SharepicType = 'dreizeilen' | 'headline' | 'zitat' | 'zitat_pure' | 'info' | 'veranstaltung';

interface SharepicEditorModalProps {
  sharepic: SharepicDataItem;
  isOpen: boolean;
  onExport: (base64Image: string) => void;
  onCancel: () => void;
}

function parseLines(text: string | undefined): string[] {
  if (!text) return ['', '', ''];
  return text.split('\n').filter(line => line.trim());
}

function parseQuote(text: string | undefined): { quote: string; name: string } {
  if (!text) return { quote: '', name: '' };

  const quotedMatch = text.match(/^"(.*)"\\s*[-–—]\\s*(.*)$/s);
  if (quotedMatch) {
    return { quote: quotedMatch[1], name: quotedMatch[2] };
  }

  const lastDash = text.lastIndexOf(' - ');
  if (lastDash !== -1) {
    return {
      quote: text.substring(0, lastDash),
      name: text.substring(lastDash + 3)
    };
  }

  const lastEnDash = text.lastIndexOf(' – ');
  if (lastEnDash !== -1) {
    return {
      quote: text.substring(0, lastEnDash),
      name: text.substring(lastEnDash + 3)
    };
  }

  return { quote: text, name: '' };
}

function parseInfoLines(text: string | undefined): { header: string; subheader: string; body: string } {
  const lines = parseLines(text);
  return {
    header: lines[0] || '',
    subheader: lines[1] || '',
    body: lines.slice(2).join('\n') || ''
  };
}

const SharepicEditorModal: React.FC<SharepicEditorModalProps> = ({
  sharepic,
  isOpen,
  onExport,
  onCancel,
}) => {
  const resetStore = useCanvasEditorStore(state => state.resetStore);

  useEffect(() => {
    if (isOpen) {
      resetStore();
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
      resetStore();
    };
  }, [isOpen, resetStore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  const handleExport = useCallback((base64: string) => {
    onExport(base64);
  }, [onExport]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const imageSrc = useMemo(() => {
    return sharepic.originalImage as string || sharepic.image || '';
  }, [sharepic.originalImage, sharepic.image]);

  const renderCanvas = useCallback(() => {
    const type = (sharepic.type || 'dreizeilen') as SharepicType;

    switch (type) {
      case 'dreizeilen':
      case 'headline': {
        const lines = parseLines(sharepic.text);
        const alternatives = (sharepic.alternatives as DreizeilenAlternative[]) || [];
        return (
          <DreizeilenCanvas
            line1={sharepic.line1 as string || lines[0] || ''}
            line2={sharepic.line2 as string || lines[1] || ''}
            line3={sharepic.line3 as string || lines[2] || ''}
            imageSrc={imageSrc}
            alternatives={alternatives}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }

      case 'zitat': {
        const { quote, name } = parseQuote(sharepic.text);
        const alternatives = (sharepic.alternatives as string[]) || [];
        return (
          <ControllableCanvasWrapper
            type="zitat"
            initialState={{
              quote: sharepic.quote as string || quote,
              name: sharepic.name as string || sharepic.zitatAuthor as string || name,
              alternatives: alternatives,
            }}
            imageSrc={imageSrc}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }

      case 'zitat_pure': {
        const { quote, name } = parseQuote(sharepic.text);
        const alternatives = (sharepic.alternatives as string[]) || [];
        return (
          <ControllableCanvasWrapper
            type="zitat-pure"
            initialState={{
              quote: sharepic.quote as string || quote,
              name: sharepic.name as string || sharepic.zitatAuthor as string || name,
              alternatives: alternatives,
            }}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }

      case 'info': {
        const { header, body } = parseInfoLines(sharepic.text);
        const alternatives = (sharepic.alternatives as Array<{ header?: string; subheader?: string; body?: string }>) || [];
        return (
          <ControllableCanvasWrapper
            type="info"
            initialState={{
              header: sharepic.header as string || header,
              body: sharepic.body as string || body,
              alternatives: alternatives,
            }}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }

      case 'veranstaltung': {
        const alternatives = (sharepic.alternatives as Array<{
          eventTitle?: string;
          beschreibung?: string;
          weekday?: string;
          date?: string;
          time?: string;
          locationName?: string;
          address?: string;
        }>) || [];
        return (
          <ControllableCanvasWrapper
            type="veranstaltung"
            initialState={{
              eventTitle: sharepic.eventTitle as string || '',
              beschreibung: sharepic.beschreibung as string || '',
              weekday: sharepic.weekday as string || '',
              date: sharepic.date as string || '',
              time: sharepic.time as string || '',
              locationName: sharepic.locationName as string || '',
              address: sharepic.address as string || '',
              alternatives: alternatives,
            }}
            imageSrc={imageSrc}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }

      default: {
        const lines = parseLines(sharepic.text);
        return (
          <DreizeilenCanvas
            line1={lines[0] || ''}
            line2={lines[1] || ''}
            line3={lines[2] || ''}
            imageSrc={imageSrc}
            alternatives={[]}
            onExport={handleExport}
            onCancel={handleCancel}
          />
        );
      }
    }
  }, [sharepic, imageSrc, handleExport, handleCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="sharepic-editor-modal-overlay">
      <div className="sharepic-editor-modal">
        <Suspense fallback={
          <div className="canvas-loading">
            <Spinner size="large" />
            <span>Canvas wird geladen...</span>
          </div>
        }>
          {renderCanvas()}
        </Suspense>
      </div>
    </div>
  );
};

export default SharepicEditorModal;
