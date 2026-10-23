export function escolherVozPainel(vozes: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const pt = vozes.filter(v => /^pt(?:[-_]|$)/i.test(v.lang));
  const br = pt.filter(v => /^pt[-_]BR$/i.test(v.lang));
  return br.find(v => /natural|neural|online/i.test(v.name))
    || br.find(v => /google/i.test(v.name))
    || br.find(v => v.default)
    || br[0]
    || pt.find(v => v.default)
    || pt[0];
}

// Chrome can initially expose an empty list and populate it asynchronously.
export function carregarVozPainel(synth: SpeechSynthesis, signal: AbortSignal): Promise<SpeechSynthesisVoice | undefined> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Áudio cancelado', 'AbortError')); };
    const changed = () => {
      const voice = escolherVozPainel(synth.getVoices());
      if (voice) { cleanup(); resolve(voice); }
    };
    const timer = setTimeout(() => { cleanup(); resolve(escolherVozPainel(synth.getVoices())); }, 1200);
    function cleanup() {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', changed);
      signal.removeEventListener('abort', abort);
    }
    synth.addEventListener('voiceschanged', changed);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    changed();
  });
}

export function textoChamadaPainel(nome: string, local: string): string {
  // Avoid spelling out upper-case room names as acronyms; retain mixed-case labels.
  const destino = local === local.toLocaleUpperCase('pt-BR') ? local.toLocaleLowerCase('pt-BR') : local;
  const artigo = /^(sala|recepção|enfermaria)\b/i.test(destino) ? 'à' : 'ao';
  return `Atenção. ${nome.toLocaleLowerCase('pt-BR')}, por favor, compareça ${artigo} ${destino}.`;
}
