import { useRef, useCallback } from 'react';

// Live camera capture via getUserMedia, with a callback ref for the <video>
// element rather than a plain useRef. Callers typically only mount the
// <video> once they flip into a "camera" UI step — which happens *after*
// start() has already resolved — so a plain ref was still null when the
// stream was ready, silently dropping it and leaving the camera view
// permanently blank. The callback ref attaches the stream the instant the
// element actually mounts, whatever order that happens in (also covers a
// "retake" flow where the element unmounts and remounts).
export function useCamera() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  const attachIfReady = () => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  };

  const setVideoRef = useCallback((el) => {
    videoRef.current = el;
    attachIfReady();
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
    streamRef.current = stream;
    attachIfReady();
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => new Promise((resolve) => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  }), []);

  return { setVideoRef, start, stop, capture };
}
