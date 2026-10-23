import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { canalPainel, chamadaValida, type ChamadaPaciente } from "@/lib/painelChamadas";
import { PainelCallQueue, aguardarPainel, limitarPainel } from '@/lib/painelCallQueue';
import { playlistPainel, videoSeguro } from '@/lib/painelVideo';
import { useAuth } from "@/contexts/AuthContext";
import { Volume2, Mic, Maximize } from "lucide-react";

import { carregarVozPainel, escolherVozPainel, textoChamadaPainel } from "@/lib/painelVoice";

const HIST_KEY = (u: string) => `painel_tv_hist_${u}`;

async function tocarSino(ctx: AudioContext, signal: AbortSignal) {
  const oscillators: OscillatorNode[] = [];
  [880, 660].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = ctx.currentTime + i * 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1);
    oscillators.push(o);
  });
  const stop = () => oscillators.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
  signal.addEventListener('abort', stop, { once: true });
  try { await aguardarPainel(1400, signal); }
  finally { signal.removeEventListener('abort', stop); stop(); }
}

async function falar(texto: string, signal: AbortSignal) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Voz indisponível neste navegador');
  const voz = await carregarVozPainel(window.speechSynthesis, signal);
  return new Promise<void>((resolve, reject) => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === 'undefined') return reject(new Error('Voz indisponível neste navegador'));
    const synth = window.speechSynthesis;
    try { synth.cancel(); } catch { /* */ }
    const u = new SpeechSynthesisUtterance(texto);
    if (voz) u.voice = voz;
    u.lang = "pt-BR";
    u.volume = 1;
    u.pitch = 1;
    u.rate = 1;
    let feito = false;
    // Chrome/Smart TV: síntese longa pode "congelar"; resume periódico evita travamento.
    const keep = setInterval(() => { try { synth.resume(); } catch { /* */ } }, 5000);
    const limite = setTimeout(() => finish(new Error('A voz excedeu o tempo limite')), Math.min(15000, 3000 + texto.length * 120));
    const abort = () => finish(new DOMException('Áudio cancelado', 'AbortError'));
    function finish(error?: Error) {
      if (feito) return;
      feito = true; clearInterval(keep); clearTimeout(limite); signal.removeEventListener('abort', abort);
      u.onend = null; u.onerror = null;
      if (error) { try { synth.cancel(); } catch { /* */ } reject(error); } else resolve();
    }
    signal.addEventListener('abort', abort, { once: true });
    u.onend = () => finish();
    u.onerror = () => finish(new Error('Falha na reprodução de voz'));
    if (signal.aborted) return abort();
    try { synth.speak(u); } catch { finish(new Error('Não foi possível iniciar a voz')); }
  });
}

export default function PainelTV() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const unidade = params.get("unidade") || params.get("unit_id") || user?.unidadeId || "";
  const [videoCad, setVideoCad] = useState<string[]>([]);
  const videoParam = params.get('video') || '';
  const playlist = videoSeguro(videoParam) ? [videoParam] : videoCad;
  const [videoError, setVideoError] = useState('');
  const [videoFailed, setVideoFailed] = useState(false);
  const failedVideos = useRef(new Set<string>());
  const videoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoIdx, setVideoIdx] = useState(0);
  const video = playlist.length ? playlist[videoIdx % playlist.length] : "";
  const proximoVideo = () => setVideoIdx((i) => (playlist.length ? (i + 1) % playlist.length : 0));
  useEffect(() => {
    setVideoCad([]); setVideoIdx(0); setVideoError(''); setVideoFailed(false); failedVideos.current.clear();
    if (videoTimer.current) clearTimeout(videoTimer.current);
    const controller = new AbortController();
    if (unidade && !videoSeguro(videoParam)) {
      void Promise.all([
        supabase.from('unidades').select('custom_data').eq('id', unidade).abortSignal(controller.signal).maybeSingle(),
        supabase.from('system_config').select('configuracoes').eq('id', 'default').abortSignal(controller.signal).maybeSingle(),
      ]).then(([unit, legacy]) => {
        if (controller.signal.aborted) return;
        const fallback = (legacy.data?.configuracoes as any)?.painel_tv?.videos?.[unidade];
        setVideoCad(playlistPainel((unit.data?.custom_data as any) || {}, fallback));
        if (unit.error && legacy.error) setVideoError('Vídeo indisponível. O painel de chamadas continua funcionando.');
      }).catch(() => { if (!controller.signal.aborted) setVideoError('Vídeo indisponível.'); });
    }
    return () => { controller.abort(); if (videoTimer.current) clearTimeout(videoTimer.current); };
  }, [unidade, videoParam]);
  const falhaVideo = () => {
    failedVideos.current.add(video);
    const next = playlist.findIndex(url => !failedVideos.current.has(url));
    if (next < 0) { setVideoFailed(true); setVideoError('Os vídeos não puderam ser reproduzidos. O painel continua disponível.'); return; }
    if (videoTimer.current) clearTimeout(videoTimer.current);
    videoTimer.current = setTimeout(() => setVideoIdx(next), 2000);
  };
  const debug = params.get("debug") === "true";

  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [atual, setAtual] = useState<ChamadaPaciente | null>(null);
  const [hist, setHist] = useState<ChamadaPaciente[]>([]);
  const [audioOn, setAudioOn] = useState(false);
  const [iniciou, setIniciou] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [pendentes, setPendentes] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [agora, setAgora] = useState(new Date());
  const [destaque, setDestaque] = useState(false);
  const [status, setStatus] = useState("conectando");
  const [logs, setLogs] = useState<string[]>([]);
  const queueRef = useRef<PainelCallQueue | null>(null);
  const displayRef = useRef<ChamadaPaciente[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef(false);
  const startedRef = useRef(false);
  const testandoRef = useRef(false);
  const audioWork = useRef<AbortController | null>(null);
  const audioScope = useRef(unidade); audioScope.current = unidade;

  const log = (m: string) => debug && setLogs((l) => [`${new Date().toLocaleTimeString("pt-BR")} ${m}`, ...l].slice(0, 12));

  useEffect(() => { audioRef.current = audioOn; }, [audioOn]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setAgora(new Date()); timer = setTimeout(tick, 60000 - Date.now() % 60000); };
    timer = setTimeout(tick, 60000 - Date.now() % 60000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { window.speechSynthesis?.getVoices(); }, []);

  useEffect(() => {
    if (unidade) return;
    supabase.from("unidades").select("id,nome").eq("ativo", true).order("nome")
      .then(({ data }) => setUnidades((data as any) || []));
  }, [unidade]);

  const stopAudio = () => {
    audioWork.current?.abort();
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported browser */ }
  };
  const anunciar = async (c: ChamadaPaciente, parent: AbortSignal, repeat: () => boolean) => {
    if (!audioRef.current || !ctxRef.current) return;
    const controller = new AbortController(); audioWork.current = controller;
    const abort = () => controller.abort();
    parent.addEventListener('abort', abort, { once: true });
    if (parent.aborted) controller.abort();
    const signal = controller.signal;
    try {
      if (ctxRef.current.state !== 'running') await limitarPainel(ctxRef.current.resume(), 2000, signal);
      if (ctxRef.current.state !== 'running') throw new Error('Áudio suspenso');
      await tocarSino(ctxRef.current, signal);
      const txt = textoChamadaPainel(c.pacienteNome, c.local);
      await falar(txt, signal);
      // Recheck the queue after speaking: do not repeat while another patient waits.
      if (repeat()) { await aguardarPainel(700, signal); if (repeat()) await falar(txt, signal); }
    } finally {
      parent.removeEventListener('abort', abort);
      if (audioWork.current === controller) audioWork.current = null;
    }
  };

  useEffect(() => {
    if (!unidade) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const channels = new Set<ReturnType<typeof supabase.channel>>();
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    setAtual(null); setHist([]); setDestaque(false); setPendentes(0); setOcupado(false);
    displayRef.current = [];
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(HIST_KEY(unidade)) || '[]');
      if (Array.isArray(saved)) {
        const valid = saved.filter(c => chamadaValida(c, unidade, false)).slice(0, 5);
        displayRef.current = valid;
        setAtual(valid[0] || null); setHist(valid.slice(1));
      }
    } catch { /* A damaged history cannot stop new calls. */ }
    const queue = new PainelCallQueue({
      display: c => {
        if (!active) return;
        const history = [c, ...displayRef.current.filter(x => x.id !== c.id)].slice(0, 5);
        displayRef.current = history;
        setAtual(c); setHist(history.slice(1)); setDestaque(true);
        try { localStorage.setItem(HIST_KEY(unidade), JSON.stringify(history)); } catch { /* storage may be disabled */ }
      },
      announce: anunciar,
      stopAudio,
      changed: (pending, busy) => {
        if (!active) return;
        setPendentes(pending); setOcupado(busy);
        if (!busy) setDestaque(false);
      },
      error: () => {
        if (!active) return;
        audioRef.current = false; setAudioOn(false);
        setAudioError('Falha no áudio. As chamadas continuam na tela. Ative o som e faça o teste de voz.');
      },
    });
    queueRef.current = queue;
    if (startedRef.current) queue.resume();
    const remove = (ch: ReturnType<typeof supabase.channel>) => {
      try { void supabase.removeChannel(ch).catch(() => {}).finally(() => channels.delete(ch)); } catch { channels.delete(ch); }
    };
    const connect = () => {
      if (!active) return;
      setStatus('conectando');
      const ch = supabase.channel(canalPainel(unidade));
      channel = ch; channels.add(ch);
      ch.on('broadcast', { event: 'chamada' }, ({ payload }) => {
        if (!active || channel !== ch || !chamadaValida(payload, unidade)) return;
        const accepted = queue.accept(payload);
        const status = accepted === 'ocupado' ? 'ocupado' : audioRef.current ? 'recebida' : 'recebida_sem_audio';
        // Reception acknowledgement is distinct from the server transport ACK.
        void ch.send({ type: 'broadcast', event: 'chamada_status', payload: { id: payload.id, unidadeId: unidade, status } }, { timeout: 2000 }).catch(() => {});
        if (accepted === 'ocupado') setAudioError('Fila do painel cheia. Novas chamadas estão sendo recusadas com aviso ao profissional.');
      });
      ch.subscribe(status => {
        if (!active || channel !== ch) return;
        setStatus(status); log(`canal: ${status}`);
        if (status === 'SUBSCRIBED') { failures = 0; return; }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          channel = null; remove(ch);
          if (retry) clearTimeout(retry);
          retry = setTimeout(connect, Math.min(10000, 1000 * 2 ** failures++));
        }
      });
    };
    connect();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      queue.dispose();
      if (queueRef.current === queue) queueRef.current = null;
      channels.forEach(remove);
    };
    // Stable callbacks use refs; a clock/audio rerender must not recreate the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  useEffect(() => () => {
    stopAudio();
    try { void ctxRef.current?.close().catch(() => {}); } catch { /* already closed */ }
  }, []);

  const ativarAudio = async () => {
    const scope = unidade;
    const controller = new AbortController();
    stopAudio(); audioWork.current = controller;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Áudio não suportado');
      if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new Ctx();
      await limitarPainel(ctxRef.current!.resume(), 2000, controller.signal);
      if (controller.signal.aborted || audioScope.current !== scope) return false;
      if (ctxRef.current!.state !== 'running') throw new Error('Áudio suspenso');
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
      audioRef.current = true; startedRef.current = true;
      setAudioOn(true); setIniciou(true); setAudioError('');
      if (!testandoRef.current) queueRef.current?.resume();
      return true;
    } catch {
      if (audioScope.current !== scope || controller.signal.aborted) return false;
      audioRef.current = false; setAudioOn(false);
      setAudioError('Não foi possível ativar o áudio. Verifique o navegador e o volume da TV.');
      return false;
    } finally { if (audioWork.current === controller) audioWork.current = null; }
  };

  const testarVoz = async () => {
    if (queueRef.current?.busy || testandoRef.current) return;
    testandoRef.current = true; queueRef.current?.pause();
    const controller = new AbortController();
    try {
      if (!audioRef.current && !(await ativarAudio())) return;
      queueRef.current?.pause(); audioWork.current = controller;
      if (ctxRef.current) await tocarSino(ctxRef.current, controller.signal);
      await falar('Teste de voz do painel de chamadas.', controller.signal);
    } catch {
      if (!controller.signal.aborted) { audioRef.current = false; setAudioOn(false); setAudioError('Teste de voz falhou. Confira o áudio da TV.'); }
    } finally {
      testandoRef.current = false;
      if (audioWork.current === controller) audioWork.current = null;
      if (startedRef.current) queueRef.current?.resume();
    }
  };

  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (!unidade) {
    return (
      <div className="min-h-screen bg-primary text-primary-foreground flex flex-col items-center justify-center gap-6 p-10">
        <h1 className="text-4xl font-bold">Painel de Chamadas</h1>
        <p className="text-xl opacity-80">Selecione a unidade desta TV</p>
        <div className="grid gap-3 w-full max-w-xl">
          {unidades.map((u) => (
            <button key={u.id} onClick={() => { params.set("unidade", u.id); setParams(params); }}
              className="rounded-xl bg-primary-foreground/10 hover:bg-primary-foreground/20 p-5 text-2xl font-semibold text-left">
              {u.nome}
            </button>
          ))}
          {!unidades.length && <p className="opacity-70 text-center">Carregando unidades...</p>}
        </div>
      </div>
    );
  }

  const mostrarVideo = !!video && !videoFailed && !destaque;

  return (
    <div className="min-h-screen bg-primary text-primary-foreground flex flex-col select-none">
      <header className="flex items-center justify-between px-10 py-5 border-b border-primary-foreground/20">
        <h1 className="text-3xl font-bold tracking-wide">Painel de Chamadas</h1>
        <div className="flex items-center gap-6">
          <div className="flex gap-2 opacity-60 hover:opacity-100 transition-opacity">
            <button onClick={() => void ativarAudio()} disabled={ocupado} title="Ativar som" className="rounded-lg bg-primary-foreground/10 p-2 disabled:opacity-40"><Volume2 className="w-5 h-5" /></button>
            <button onClick={testarVoz} disabled={ocupado} title="Testar voz" className="rounded-lg bg-primary-foreground/10 p-2 disabled:opacity-40"><Mic className="w-5 h-5" /></button>
            <button onClick={telaCheia} title="Tela cheia" className="rounded-lg bg-primary-foreground/10 p-2"><Maximize className="w-5 h-5" /></button>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-lg opacity-80 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
          </div>
        </div>
      </header>
      <div role="status" className="flex flex-wrap justify-between gap-2 px-10 py-2 text-sm border-b border-primary-foreground/20">
        <span>{status === 'SUBSCRIBED' ? 'Painel conectado' : 'Painel desconectado — tentando reconectar. Novas chamadas podem não chegar.'}</span>
        <span>{audioOn ? 'Som ativado' : 'Som inativo'} · {pendentes} chamada(s) aguardando</span>
      </div>
      {audioError && <p role="alert" className="px-10 py-2 bg-amber-100 text-amber-950">{audioError}</p>}
      {videoError && <p className="px-10 py-1 text-sm">{videoError}</p>}

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[7fr_3fr]">
        <section className={`relative flex flex-col items-center justify-center p-10 text-center transition-colors duration-500 ${destaque ? "bg-primary-foreground/15" : ""}`}>
          {mostrarVideo ? (
            <video key={video + videoIdx} src={video} autoPlay muted loop={playlist.length <= 1} playsInline onEnded={proximoVideo} onError={falhaVideo} className="absolute inset-0 w-full h-full object-contain bg-foreground" />
          ) : atual ? (
            <>
              <p className="text-3xl uppercase opacity-80 mb-6">Paciente</p>
              <p className={`text-7xl xl:text-8xl font-extrabold leading-tight break-words ${destaque ? "animate-pulse" : ""}`}>{atual.pacienteNome}</p>
              <p className="text-3xl uppercase opacity-80 mt-12 mb-3">Dirija-se ao</p>
              <p className="text-6xl font-bold">{atual.local}</p>
              {atual.profissionalNome && <p className="text-2xl opacity-80 mt-6">{atual.profissionalNome}</p>}
            </>
          ) : (
            <p className="text-4xl opacity-70">Aguardando chamadas...</p>
          )}
        </section>
        <aside className="bg-primary-foreground/10 p-8 border-l border-primary-foreground/20">
          <h2 className="text-2xl font-semibold uppercase mb-6 opacity-90">Últimas chamadas</h2>
          <ul className="space-y-4">
            {(mostrarVideo && atual ? [atual, ...hist] : hist).slice(0, 4).map((c) => (
              <li key={c.id} className="rounded-xl bg-primary-foreground/10 p-4">
                <p className="text-2xl font-bold truncate">{c.pacienteNome}</p>
                <p className="text-xl opacity-80">{c.local}</p>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      {debug && (
        <div className="fixed bottom-2 left-2 max-w-md rounded-lg bg-foreground/80 text-background text-xs p-3 font-mono space-y-0.5">
          <div>unidade: {unidade} | canal: {status} | som: {audioOn ? "on" : "off"} | fila: {pendentes}</div>
          <div>voz: {escolherVozPainel(window.speechSynthesis?.getVoices() || [])?.name || "nenhuma pt-BR"}</div>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {!iniciou && (
        <div
          className="fixed inset-0 bg-foreground/70 flex flex-col items-center justify-center gap-4 text-background text-4xl font-bold"
        >
          <Volume2 className="w-24 h-24" />
          <button onClick={() => { void ativarAudio(); telaCheia(); }} className="rounded-xl border px-6 py-4">Clique para ativar o áudio</button>
          {audioError && <p className="max-w-xl text-center text-lg">{audioError}</p>}
          <button className="text-lg underline" onClick={() => {
            startedRef.current = true; setIniciou(true); queueRef.current?.resume();
          }}>Continuar sem áudio (somente exibição)</button>
        </div>
      )}
    </div>
  );
}
