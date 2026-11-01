export function createTimer({ durationSeconds, onTick, onExpire }) {
  let startedAt = 0;
  let deadline = 0;
  let intervalId = null;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    onTick(remaining);
    if (remaining <= 0) {
      stop();
      onExpire();
    }
  };

  return {
    start() {
      if (intervalId !== null || stopped) return;
      startedAt = Date.now();
      deadline = startedAt + durationSeconds * 1000;
      tick();
      if (!stopped) intervalId = window.setInterval(tick, 250);
    },
    stop() {
      stopped = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      intervalId = null;
    },
    elapsedSeconds() {
      if (!startedAt) return 0;
      return Math.min(durationSeconds, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    },
    remainingSeconds() {
      if (!startedAt) return durationSeconds;
      return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    }
  };
}

export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h,m,s].map(v => String(v).padStart(2,"0")).join(":");
}
