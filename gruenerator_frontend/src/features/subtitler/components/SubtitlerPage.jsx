import React, { useState, useCallback } from 'react';
import VideoUploader from './VideoUploader';
import SubtitleEditor from './SubtitleEditor';
import SuccessScreen from './SuccessScreen';
import apiClient from '../../../components/utils/apiClient';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { FaVideo, FaFileVideo, FaRuler, FaClock } from 'react-icons/fa';
import ErrorBoundary from '../../../components/ErrorBoundary';
const SubtitlerPage = () => {
  const [step, setStep] = useState('upload'); // upload, edit, success
  const [videoFile, setVideoFile] = useState(null);
  const [subtitles, setSubtitles] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { socialText, isGenerating, error: socialError, generateSocialText, reset: resetSocialText } = useSocialTextGenerator();

  const handleVideoSelect = (file) => {
    setVideoFile(file);
    setStep('confirm');
  };

  const handleVideoConfirm = async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      if (videoFile.size > 95 * 1024 * 1024) {
        throw new Error('Das Video ist zu groß. Die maximale Größe beträgt 95MB.');
      }

      const formData = new FormData();
      formData.append('video', videoFile);
      if (videoFile.metadata) {
        formData.append('metadata', JSON.stringify(videoFile.metadata));
      }

      const response = await apiClient.post('/subtitler/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setSubtitles(response.data.subtitles);
        setStep('edit');
      } else {
        throw new Error(response.data.error || 'Fehler bei der Verarbeitung');
      }
    } catch (error) {
      setError(error.response?.data?.error || error.message || 'Ein unerwarteter Fehler ist aufgetreten');
      setSubtitles(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await generateSocialText(subtitles);
      setStep('success');
    } catch (err) {
      setError('Fehler beim Generieren des Beitragstextes');
    }
  }, [generateSocialText, subtitles]);

  const handleExportComplete = useCallback(() => {
    setIsExporting(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setStep('upload');
      setVideoFile(null);
      setSubtitles(null);
      setError(null);
      setIsExiting(false);
      setIsExporting(false);
      resetSocialText();
    }, 300);
  }, [resetSocialText]);

  return (
    <ErrorBoundary>
      <div className="subtitler-container container with-header">
        {(step === 'upload' || step === 'confirm') && (
          <h1 className="subtitler-title">Reel-Grünerator</h1>
        )}
        
        {error && (
          <div className="error-message">
            {error}
            <button className="btn-secondary" onClick={() => setError(null)}>
              Schließen
            </button>
          </div>
        )}

        <div className="subtitler-content">
          {step === 'upload' && (
            <VideoUploader 
              onUpload={handleVideoSelect} 
              isProcessing={isProcessing} 
            />
          )}

          {step === 'confirm' && (
            <div className={`confirm-section ${isExiting ? 'exit' : ''}`}>
              <h3>
                <FaVideo />
                Dein ausgewähltes Video
              </h3>
              <div className="video-info">
                <p data-label="Name">
                  <FaFileVideo />
                  <span className="info-content">{videoFile.name}</span>
                </p>
                <p data-label="Größe">
                  <FaRuler />
                  <span className="info-content">{(videoFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </p>
                {videoFile.metadata && (
                  <>
                    <p data-label="Länge">
                      <FaClock />
                      <span className="info-content">{Math.round(videoFile.metadata.duration)} Sekunden</span>
                    </p>
                    <p data-label="Auflösung">
                      <FaRuler />
                      <span className="info-content">{videoFile.metadata.width}x{videoFile.metadata.height}</span>
                    </p>
                  </>
                )}
              </div>
              <p className="ai-notice">
                Die Verarbeitung erfolgt mit OpenAI in den USA. Bitte beachte unsere <a href="/datenschutz">Datenschutzerklärung</a> bezüglich der Verarbeitung deiner Daten.
              </p>
              <div className="confirm-buttons">
                <button 
                  className="btn-primary"
                  onClick={handleVideoConfirm}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <div className="button-loading-content">
                      <div className="button-spinner" />
                      <span>Verarbeite...</span>
                    </div>
                  ) : (
                    'Video verarbeiten'
                  )}
                </button>
                <button 
                  className="btn-secondary"
                  onClick={handleReset}
                  disabled={isProcessing}
                >
                  Anderes Video auswählen
                </button>
              </div>
            </div>
          )}

          {step === 'edit' && (
            <SubtitleEditor
              videoFile={videoFile}
              subtitles={subtitles}
              onExportSuccess={handleExport}
              onExportComplete={handleExportComplete}
              isExporting={isExporting || isGenerating}
            />
          )}

          {step === 'success' && (
            <SuccessScreen 
              onReset={handleReset}
              isLoading={isExporting}
              socialText={socialText}
              isGeneratingSocial={isGenerating}
              socialError={socialError}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SubtitlerPage; 