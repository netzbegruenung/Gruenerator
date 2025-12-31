import { useState, useRef, useCallback } from 'react';

const useVoiceRecorder = (onTranscriptionComplete, options = {}) => {
  // Standardmäßig Timestamps beibehalten (removeTimestamps = false)
  const { removeTimestamps = false } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [hasTranscriptionFailed, setHasTranscriptionFailed] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Starte die Aufnahme
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setHasTranscriptionFailed(false);
      setRetryCount(0);
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Detect supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ?
        'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ?
          'audio/ogg;codecs=opus' :
          'audio/webm'; // fallback

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });

      // Store mimeType for later use
      mediaRecorderRef.current.detectedMimeType = mimeType;

      console.log('[Voice Recorder] Using MIME type:', mimeType);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const detectedMimeType = mediaRecorderRef.current.detectedMimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: detectedMimeType });
        console.log('[Voice Recorder] Audio blob created - Type:', detectedMimeType, 'Size:', audioBlob.size, 'bytes');
        setAudioBlob(audioBlob);
        
        // Stoppe alle Tracks des Streams
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setError('Mikrofon konnte nicht aktiviert werden. Bitte erlaube den Zugriff auf dein Mikrofon.');
      console.error('Fehler beim Starten der Aufnahme:', err);
    }
  }, []);

  // Stoppe die Aufnahme
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Sende die Aufnahme zur Transkription
  const sendForTranscription = useCallback(async () => {
    if (!audioBlob || hasTranscriptionFailed) return;
    
    // Maximale Anzahl von Versuchen (3)
    const MAX_RETRIES = 3;
    
    if (retryCount >= MAX_RETRIES) {
      setError(`Transkription nach ${MAX_RETRIES} Versuchen fehlgeschlagen. Bitte versuche es erneut.`);
      setHasTranscriptionFailed(true);
      setIsProcessing(false);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const formData = new FormData();

      // Determine correct file extension based on MIME type
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.includes('webm') ? 'webm' :
                        mimeType.includes('ogg') ? 'ogg' : 'webm';
      const filename = `recording.${extension}`;

      formData.append('audio', audioBlob, filename);

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const url = `${apiBaseUrl.endsWith('/api') ? apiBaseUrl : `${apiBaseUrl}/api`}/voice/transcribe${removeTimestamps ? '?removeTimestamps=true' : ''}`;

      console.log('[Voice Recorder] Sending request to:', url);
      console.log('[Voice Recorder] Audio format:', mimeType, 'File:', filename, 'Size:', audioBlob.size, 'bytes');
      console.log('[Voice Recorder] Remove timestamps:', removeTimestamps);
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Fehler bei der Transkription');
      }
      
      const data = await response.json();
      console.log('Transkription erhalten:', data);
      
      if (data.success && data.text) {
        let transcriptionText = data.text;
        
        // Zusätzliche Zeitstempel-Entfernung im Frontend, falls das Backend sie nicht entfernt hat
        if (removeTimestamps) {
          console.log('Frontend entfernt Zeitstempel aus:', transcriptionText);
          
          // Entferne Zeitstempel (Format [00:00:00.000 --> 00:00:00.000] oder [00:00.000 --> 00:00.000])
          transcriptionText = transcriptionText.replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3} --> \d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '');
          
          // Entferne andere mögliche Zeitformate
          transcriptionText = transcriptionText.replace(/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\s*/g, '');
          transcriptionText = transcriptionText.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/g, '');
          
          // Entferne Whisper-spezifische Zeitstempel (z.B. [00:00.000] oder [00:00:00.000])
          transcriptionText = transcriptionText.replace(/\[\d{2}:\d{2}(:\d{2})?\.\d{3}\]\s*/g, '');
          
          // Entferne Zeitstempel im Format (MM:SS)
          transcriptionText = transcriptionText.replace(/\(\d{2}:\d{2}\)\s*/g, '');
          
          // Entferne doppelte Leerzeichen und trimme
          transcriptionText = transcriptionText.replace(/\s+/g, ' ').trim();
          
          console.log('Frontend Ergebnis nach Zeitstempel-Entfernung:', transcriptionText);
        }
        
        onTranscriptionComplete(transcriptionText);
        setAudioBlob(null);
        setRetryCount(0);
        setHasTranscriptionFailed(false);
      } else {
        throw new Error(data.error || 'Keine Transkription erhalten');
      }
    } catch (err) {
      setError('Fehler bei der Transkription: ' + err.message);
      console.error('Transkriptionsfehler:', err);
      setRetryCount(prevCount => prevCount + 1);
      
      if (retryCount + 1 >= MAX_RETRIES) {
        setHasTranscriptionFailed(true);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [audioBlob, onTranscriptionComplete, retryCount, hasTranscriptionFailed, removeTimestamps]);

  // Sende die Aufnahme automatisch zur Transkription, wenn die Aufnahme gestoppt wurde
  const processRecording = useCallback(() => {
    if (audioBlob && !isRecording && !isProcessing && !hasTranscriptionFailed) {
      sendForTranscription();
    }
  }, [audioBlob, isRecording, isProcessing, sendForTranscription, hasTranscriptionFailed]);

  // Manuelle Wiederholung der Transkription
  const retryTranscription = useCallback(() => {
    if (audioBlob) {
      setHasTranscriptionFailed(false);
      setRetryCount(0);
      setError(null);
      sendForTranscription();
    }
  }, [audioBlob, sendForTranscription]);

  return {
    isRecording,
    isProcessing,
    error,
    hasTranscriptionFailed,
    startRecording,
    stopRecording,
    processRecording,
    retryTranscription
  };
};

export default useVoiceRecorder; 