import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useState, useRef, useCallback } from 'react';
import { Keyboard } from 'react-native';

/**
 * Reusable hook for speech-to-text input.
 * Only one recognizer can be active at a time (OS limitation).
 * Pass a callback via `toggle(onResult)` to route transcripts to the correct field.
 */
export function useSpeechToText() {
  const [isListening, setIsListening] = useState(false);
  const callbackRef = useRef<((text: string) => void) | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript && event.isFinal) {
      callbackRef.current?.(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
  });

  const toggle = useCallback(
    async (onResult: (transcript: string) => void) => {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        setIsListening(false);
        return;
      }

      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;

      callbackRef.current = onResult;
      Keyboard.dismiss();
      setIsListening(true);

      ExpoSpeechRecognitionModule.start({
        lang: 'de-DE',
        interimResults: false,
        continuous: false,
        addsPunctuation: true,
      });
    },
    [isListening]
  );

  return { isListening, toggle };
}

/** Helper to append transcript text with smart spacing */
export function appendTranscript(prev: string, transcript: string): string {
  const needsSpace = prev.length > 0 && !prev.endsWith(' ');
  return prev + (needsSpace ? ' ' : '') + transcript;
}
