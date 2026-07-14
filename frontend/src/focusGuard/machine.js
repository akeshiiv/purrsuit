export const CORROBORATION_THRESHOLD = 2;

export function initState() {
  return {
    status: 'awaiting-consent',
    consentGranted: false,
    framesAnalyzed: 0,
    consecutiveDistracted: 0,
    verdict: null,
  };
}

const RUNNING = new Set(['warming', 'monitoring', 'running-uncredited']);

export function transition(state, event) {
  switch (event.type) {
    case 'CONSENT_GRANTED':
      if (state.status !== 'awaiting-consent') return state;
      return { ...state, status: 'warming', consentGranted: true };
    case 'CONSENT_DENIED':
    case 'ENGINE_NONE':
      if (state.status !== 'awaiting-consent') return state;
      return { ...state, status: 'running-uncredited' };
    case 'MODEL_READY':
      if (state.status !== 'warming') return state;
      return { ...state, status: 'monitoring' };
    case 'STREAM_ENDED':
      if (!RUNNING.has(state.status)) return state;
      return { ...state, status: 'running-uncredited' };
    case 'FRAME_ANALYZED': {
      if (state.status !== 'monitoring') return state;
      const framesAnalyzed = state.framesAnalyzed + 1;
      if (!event.verdict?.distracted) {
        return { ...state, framesAnalyzed, consecutiveDistracted: 0 };
      }
      const consecutiveDistracted = state.consecutiveDistracted + 1;
      if (consecutiveDistracted >= CORROBORATION_THRESHOLD) {
        return { ...state, framesAnalyzed, consecutiveDistracted, status: 'terminated', verdict: event.verdict };
      }
      return { ...state, framesAnalyzed, consecutiveDistracted };
    }
    case 'COUNTDOWN_ZERO':
      if (state.status === 'monitoring' && state.framesAnalyzed >= 1) {
        return { ...state, status: 'done' };
      }
      if (RUNNING.has(state.status)) {
        return { ...state, status: 'uncredited' };
      }
      return state;
    default:
      return state;
  }
}

export function shouldComplete(state) {
  return state.status === 'done';
}
