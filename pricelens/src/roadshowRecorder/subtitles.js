function timestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

export function toWebVtt(shots) {
  let start = 0;
  const cues = shots.map((shot, index) => {
    const end = start + shot.durationMs / 1000;
    const cue = `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${shot.narration}`;
    start = end;
    return cue;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
