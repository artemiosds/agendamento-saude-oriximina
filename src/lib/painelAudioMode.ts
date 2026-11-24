export type PainelAudioMode = 'navegador' | 'mp3';
export const PAINEL_MP3_WORKER = '/painel-audio/mp3-worker-v1.js';
export const PAINEL_MP3_UNLOCK = '/painel-audio/activate-v1.mp3';
export const PAINEL_VOICE_TEST = 'Teste de voz do painel de chamadas.';

export function modoAudioPainel(value: unknown): PainelAudioMode {
  return value === 'mp3' ? 'mp3' : 'navegador';
}

export function preferenciaAudioPainel(unit: string, requested: string | null): PainelAudioMode {
  if (requested !== null) return modoAudioPainel(requested);
  try { return modoAudioPainel(localStorage.getItem(`painel_audio_mode_${unit}`)); }
  catch { return 'navegador'; }
}

export function salvarModoAudioPainel(unit: string, mode: PainelAudioMode) {
  try { localStorage.setItem(`painel_audio_mode_${unit}`, mode); } catch { /* storage is optional */ }
}
