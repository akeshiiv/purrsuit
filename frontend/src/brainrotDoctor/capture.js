export function computeCaptureSize(srcW, srcH, maxEdge) {
  const longest = Math.max(srcW, srcH);
  const scale = Math.min(1, maxEdge / longest);
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

const MAX_EDGE = 1024;

// Wraps a getDisplayMedia stream: retains it for the session, grabs a single
// downscaled ImageBitmap on demand, and reports when the user stops sharing.
// Browser-only glue (no unit test); computeCaptureSize above is the tested part.
export function createCaptureController({ getDisplayMedia = (c) => navigator.mediaDevices.getDisplayMedia(c) } = {}) {
  let stream = null;
  let video = null;
  let endedCb = null;

  const controller = {
    // Owns its own cleanup on a failed start. Everything after getDisplayMedia
    // can throw — most realistically `video.play()`, which rejects in browsers
    // that consider the user gesture spent by the time the async picker resolves
    // (Safari NotAllowedError, Chrome AbortError). The stream is live by then,
    // and the only caller publishes its handle to the hook's refs *after* start
    // resolves, so the hook's own cleanup had nothing to stop: the browser kept
    // showing "Purrsuit is sharing your screen" and went on capturing until the
    // tab was closed. Stopping here rather than relying on the caller keeps that
    // true for any future caller too.
    async start() {
      stream = await getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      try {
        const [track] = stream.getVideoTracks();
        track.addEventListener('ended', () => endedCb && endedCb());
        video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
      } catch (err) {
        controller.stop();
        throw err;
      }
    },
    onEnded(cb) { endedCb = cb; },
    // Returns a downscaled ImageBitmap. Caller MUST call bitmap.close() after use.
    async grabFrame() {
      if (!video) throw new Error('capture not started');
      const { videoWidth: w, videoHeight: h } = video;
      const size = computeCaptureSize(w || MAX_EDGE, h || MAX_EDGE, MAX_EDGE);
      const canvas = new OffscreenCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, size.width, size.height);
      return canvas.transferToImageBitmap();
    },
    stop() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (video) { video.srcObject = null; video = null; }
      stream = null;
    },
  };

  return controller;
}
