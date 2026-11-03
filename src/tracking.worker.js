import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const vision = await FilesetResolver.forVisionTasks(data.wasmRoot);
      // CPU inference in a worker leaves the GPU and main thread for the artwork.
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .65, minHandPresenceConfidence: .65, minTrackingConfidence: .65,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: error?.message || String(error) }); }
  } else if (data.type === 'frame') {
    if (!landmarker) { data.frame?.close(); return; }
    try {
      const start = performance.now();
      const result = landmarker.detectForVideo(data.frame, data.timestamp);
      self.postMessage({ type: 'result', landmarks: result.landmarks[0] ?? null, world: result.worldLandmarks[0] ?? null, elapsed: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'frame-error', message: error?.message || String(error) }); }
    finally { data.frame.close(); }
  }
};
