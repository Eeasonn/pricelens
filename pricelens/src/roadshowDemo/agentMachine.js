const TRANSITIONS = {
  'agent-fullscreen-empty': { START_VOICE: 'agent-fullscreen-listening' },
  'agent-fullscreen-listening': { TRANSCRIPT_READY: 'transcript-confirmed' },
  'transcript-confirmed': { PREVIEW_READY: 'filter-preview-ready' },
  'filter-preview-ready': { APPLY: 'user-applies' },
  'user-applies': { TRANSITION_COMPLETE: 'split-view-ready' },
};

export function transitionAgent(state, event) {
  return TRANSITIONS[state]?.[event] ?? state;
}

export function canApplyFilters(state) {
  return state === 'filter-preview-ready';
}
