import { useState, useEffect, useRef } from 'react';

const OPENCV_CDN_URL = 'https://docs.opencv.org/4.7.0/opencv.js';

const useOpenCV = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const t0 = performance.now();
    console.log(
      `[useOpenCV] Effect running. window.cv exists:`,
      !!(window as any).cv,
      `window.cv.Mat exists:`,
      !!(window as any).cv?.Mat
    );

    if ((window as any).cv?.Mat) {
      console.log(`[useOpenCV] OpenCV already available on window (cached). Setting isLoaded=true`);
      setIsLoaded(true);
      return;
    }

    if (loadingRef.current) {
      console.log(`[useOpenCV] Already loading (loadingRef=true). Skipping duplicate load.`);
      return;
    }
    loadingRef.current = true;

    const existingScript = document.querySelector(`script[src="${OPENCV_CDN_URL}"]`);
    if (existingScript) {
      console.log(`[useOpenCV] Found existing <script> tag for OpenCV. Polling for cv.Mat...`);
      let pollCount = 0;
      const waitForCv = () => {
        pollCount++;
        const cv = (window as any).cv;
        if (cv?.Mat) {
          console.log(
            `[useOpenCV] Polling succeeded after ${pollCount} attempts (${(performance.now() - t0).toFixed(0)}ms). cv.Mat available.`
          );
          setIsLoaded(true);
        } else {
          if (pollCount % 50 === 0) {
            console.warn(
              `[useOpenCV] Still polling for cv.Mat (attempt ${pollCount}, ${(performance.now() - t0).toFixed(0)}ms). cv type:`,
              typeof cv,
              `cv keys:`,
              cv ? Object.keys(cv).slice(0, 10) : 'N/A'
            );
          }
          if (pollCount > 300) {
            console.error(
              `[useOpenCV] Polling timed out after ${pollCount} attempts (${(performance.now() - t0).toFixed(0)}ms). OpenCV never initialized.`
            );
            setError('OpenCV konnte nicht geladen werden (Timeout).');
            loadingRef.current = false;
            return;
          }
          setTimeout(waitForCv, 100);
        }
      };
      waitForCv();
      return;
    }

    console.log(`[useOpenCV] No existing script tag. Creating new <script> for ${OPENCV_CDN_URL}`);
    const script = document.createElement('script');
    script.src = OPENCV_CDN_URL;
    script.async = true;

    script.onload = () => {
      const elapsed = (performance.now() - t0).toFixed(0);
      const cv = (window as any).cv;
      console.log(
        `[useOpenCV] Script onload fired (${elapsed}ms). cv type:`,
        typeof cv,
        `cv.Mat exists:`,
        !!cv?.Mat
      );

      if (cv?.Mat) {
        console.log(`[useOpenCV] cv.Mat available immediately. Setting isLoaded=true`);
        setIsLoaded(true);
        return;
      }

      if (cv && typeof cv.onRuntimeInitialized !== 'undefined') {
        console.log(`[useOpenCV] Waiting for cv.onRuntimeInitialized callback...`);
        cv.onRuntimeInitialized = () => {
          console.log(`[useOpenCV] cv.onRuntimeInitialized fired. Setting isLoaded=true`);
          setIsLoaded(true);
        };
        return;
      }

      // OpenCV 4.7.0 WASM: cv exists with HEAP arrays but Mat not yet ready.
      // Poll until WASM initialization completes and cv.Mat becomes available.
      console.log(`[useOpenCV] cv loaded but Mat not ready yet. Polling for WASM init...`);
      let pollCount = 0;
      const poll = () => {
        pollCount++;
        if ((window as any).cv?.Mat) {
          console.log(
            `[useOpenCV] Polling after onload succeeded (${pollCount} attempts, ${(performance.now() - t0).toFixed(0)}ms). Setting isLoaded=true`
          );
          setIsLoaded(true);
        } else if (pollCount > 300) {
          console.error(`[useOpenCV] Polling timed out after ${pollCount} attempts.`);
          setError('OpenCV konnte nicht initialisiert werden (Timeout).');
          loadingRef.current = false;
        } else {
          if (pollCount % 50 === 0) {
            console.warn(`[useOpenCV] Still polling (attempt ${pollCount})...`);
          }
          setTimeout(poll, 100);
        }
      };
      poll();
    };

    script.onerror = (e) => {
      console.error(
        `[useOpenCV] Script onerror fired (${(performance.now() - t0).toFixed(0)}ms). Error:`,
        e
      );
      setError('OpenCV konnte nicht geladen werden.');
      loadingRef.current = false;
    };

    document.head.appendChild(script);
    console.log(`[useOpenCV] Script tag appended to <head>. Waiting for load...`);
  }, []);

  return { isLoaded, error };
};

export default useOpenCV;
