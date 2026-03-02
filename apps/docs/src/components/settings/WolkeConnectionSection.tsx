import { Alert, Button, Loader, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AxiosError } from 'axios';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiCloud, FiPlus } from 'react-icons/fi';

import { addShareLink, fetchShareLinks, validateShareLink } from '../../lib/wolkeApi';

import { WolkeConnectionCard } from './WolkeConnectionCard';

export function WolkeConnectionSection() {
  const queryClient = useQueryClient();

  const [linkUrl, setLinkUrl] = useState('');
  const [label, setLabel] = useState('');
  const [linkError, setLinkError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5000);
  };

  const {
    data: shareLinks,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['wolke-share-links'],
    queryFn: fetchShareLinks,
  });

  const addMutation = useMutation({
    mutationFn: ({ url, lbl }: { url: string; lbl?: string }) => addShareLink(url, lbl),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['wolke-share-links'] });
      setLinkUrl('');
      setLabel('');
      setLinkError('');
      const testMsg = data.connectionTest?.success
        ? ' Verbindung erfolgreich getestet.'
        : ' Verbindungstest fehlgeschlagen — bitte prüfe den Link.';
      showFeedback(
        data.connectionTest?.success ? 'success' : 'error',
        'Share-Link hinzugefügt.' + testMsg
      );
    },
    onError: (error: AxiosError) => {
      if (error.response?.status === 409) {
        showFeedback('error', 'Dieser Share-Link ist bereits vorhanden.');
      } else {
        showFeedback('error', 'Share-Link konnte nicht hinzugefügt werden.');
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateShareLink(linkUrl);
    if (!validation.valid) {
      setLinkError(validation.error || 'Ungültiger Link.');
      return;
    }
    setLinkError('');
    addMutation.mutate({ url: linkUrl, lbl: label });
  };

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-icon">
          <FiCloud size={20} />
        </div>
        <div>
          <h2 className="settings-section-title">Wolke-Verbindungen</h2>
          <p className="settings-section-description">
            Verbinde deine Nextcloud (Grüne Wolke), um Dokumente direkt dorthin zu exportieren.
          </p>
        </div>
      </div>

      {feedback && (
        <Alert
          color={feedback.type === 'success' ? 'green' : 'red'}
          icon={
            feedback.type === 'success' ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />
          }
          withCloseButton
          onClose={() => setFeedback(null)}
          className="settings-alert"
        >
          {feedback.message}
        </Alert>
      )}

      <div className="settings-card">
        <form onSubmit={handleSubmit} className="wolke-add-form">
          <TextInput
            label="Share-Link"
            placeholder="https://wolke.netzbegruenung.de/s/AbCdEf123"
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.currentTarget.value);
              if (linkError) setLinkError('');
            }}
            error={linkError}
            required
          />
          <TextInput
            label="Bezeichnung"
            placeholder="z.B. Ortsverband, Mein Ordner…"
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
          />
          <Button
            type="submit"
            color="var(--primary-600)"
            leftSection={<FiPlus size={16} />}
            loading={addMutation.isPending}
          >
            Verbindung hinzufügen
          </Button>
        </form>
      </div>

      <div className="settings-card">
        {isLoading && (
          <div className="wolke-empty-state">
            <Loader size="sm" color="var(--primary-600)" />
          </div>
        )}

        {queryError && (
          <div className="wolke-empty-state">
            <FiAlertCircle size={24} className="wolke-empty-icon" />
            <p>Verbindungen konnten nicht geladen werden.</p>
          </div>
        )}

        {!isLoading && !queryError && shareLinks?.length === 0 && (
          <div className="wolke-empty-state">
            <FiCloud size={24} className="wolke-empty-icon" />
            <p>Noch keine Wolke-Verbindungen vorhanden.</p>
            <p className="wolke-empty-hint">
              Füge einen Nextcloud Share-Link hinzu, um Dokumente zu exportieren.
            </p>
          </div>
        )}

        {!isLoading &&
          !queryError &&
          shareLinks &&
          shareLinks.length > 0 &&
          shareLinks.map((link) => (
            <WolkeConnectionCard
              key={link.id}
              link={link}
              onError={(msg) => showFeedback('error', msg)}
              onSuccess={(msg) => showFeedback('success', msg)}
            />
          ))}
      </div>
    </section>
  );
}
