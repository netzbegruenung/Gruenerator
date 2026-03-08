/**
 * Push-to-talk recording using browser-native MediaRecorder API.
 *
 * Records audio while the user holds the button, then converts the
 * recorded WebM/Opus blob to Float32Array PCM via AudioContext.decodeAudioData.
 * The Float32Array feeds into the same useSTT.transcribe() path as before.
 */

import { useCallback, useRef, useState } from 'react';

interface UsePushToTalkOptions {
  onRecordingComplete: (audio: Float32Array, sampleRate: number) => void;
}

export function usePushToTalk({ onRecordingComplete }: UsePushToTalkOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onCompleteRef = useRef(onRecordingComplete);
  onCompleteRef.current = onRecordingComplete;

  const acquireStream = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await acquireStream();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size === 0) return;

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioContext = new AudioContext();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const float32 = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          await audioContext.close();

          onCompleteRef.current(float32, sampleRate);
        } catch (err) {
          console.error('[PushToTalk] Failed to decode audio:', err);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('[PushToTalk] Failed to start recording:', err);
    }
  }, [acquireStream]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  return { startRecording, stopRecording, isRecording };
}
