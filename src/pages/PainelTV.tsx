import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { canalPainel, type ChamadaPaciente } from "@/lib/painelChamadas";
import { useAuth } from "@/contexts/AuthContext";
import { Volume2, Mic, Maximize } from "lucide-react";

const HIST_KEY = (u: string) => `painel_tv_hist_${u}`;
const TEMPO_EXIBICAO_MS = 15000;
const INTERVALO_MS = 2000;

function tocarSino(ctx: AudioContext) {
  [880, 660].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = ctx.currentTime + i * 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1);
  });
  return new Promise((r) => setTimeout(r, 1400));
}

function escolherVoz(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis?.getVoices() || [];
  const pt = vozes.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
  return (
    pt.find((v) => /natural|neural|online/i.test(v.name) && /br/i.test(v.lang)) ||
    pt.find((v) => /google/i.test(v.name) && /br/i.test(v.lang)) ||
    pt.find((v) => /br/i.test(v.lang)) ||
    pt[0]
  );
}

function falar(texto: string) {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(texto);
    const v = escolherVoz();
    if (v) u.voice = v;
    u.lang = "pt-BR";
    u.rate = 0.9;
    let feito = false;
    const fim = () => { if (!feito) { feito = true; resolve(); } };
    u.onend = fim;
    u.onerror = fim;
    setTimeout(fim, 15000);
    window.speechSynthesis.speak(u);
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PainelTV() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const unidade = params.get("unidade") || params.get("unit_id") || user?.unidadeId || "";
  const video = params.get("video") || "";
  const debug = params.get("debug") === "true";

  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [atual, setAtual] = useState<ChamadaPaciente | null>(null);
  const [hist, setHist] = useState<ChamadaPaciente[]>([]);
  const [audioOn, setAudioOn] = useState(false);
  const [agora, setAgora] = useState(new Date());
  const [destaque, setDestaque] = useState(false);
  const [status, setStatus] = useState("conectando");
  const [logs, setLogs] = useState<string[]>([]);
  const fila = useRef<ChamadaPaciente[]>([]);
  const tocando = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef(false);

  const log = (m: string) => debug && setLogs((l) => [`${new Date().toLocaleTimeString("pt-BR")} ${m}`, ...l].slice(0, 12));

  useEffect(() => { audioRef.current = audioOn; }, [audioOn]);
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { window.speechSynthesis?.getVoices(); }, []);

  useEffect(() => {
    if (unidade) return;
    supabase.from("unidades").select("id,nome").eq("ativo", true).order("nome")
      .then(({ data }) => setUnidades((data as any) || []));
  }, [unidade]);

  const salvarHist = (c: ChamadaPaciente, h: ChamadaPaciente[]) => {
    try { localStorage.setItem(HIST_KEY(unidade), JSON.stringify([c, ...h].slice(0, 5))); } catch { /* */ }
  };

  const anunciar = async (c: ChamadaPaciente) => {
    if (!audioRef.current || !ctxRef.current) return;
    try {
      await tocarSino(ctxRef.current);
      const txt = `Atenção: ${c.pacienteNome.toLowerCase()}, dirigir-se ao ${c.local}.`;
      await falar(txt);
      await espera(700);
      await falar(txt);
    } catch { /* silencioso */ }
  };

  const processar = async () => {
    if (tocando.current) return;
    tocando.current = true;
    while (fila.current.length) {
      const c = fila.current.shift()!;
      log(`exibindo ${c.pacienteNome} → ${c.local}`);
      setAtual((prev) => {
        setHist((h) => {
          const n = prev ? [prev, ...h.filter((x) => x.id !== prev.id)].slice(0, 4) : h;
          salvarHist(c, n);
          return n;
        });
        return c;
      });
      setDestaque(true);
      const inicio = Date.now();
      await anunciar(c);
      const resto = TEMPO_EXIBICAO_MS - (Date.now() - inicio);
      if (resto > 0) await espera(resto);
      setDestaque(false);
      await espera(INTERVALO_MS);
    }
    tocando.current = false;
  };

  useEffect(() => {
    if (!unidade) return;
    try {
      const salvo: ChamadaPaciente[] = JSON.parse(localStorage.getItem(HIST_KEY(unidade)) || "[]");
      setAtual(salvo[0] || null);
      setHist(salvo.slice(1, 5));
    } catch { /* */ }
    const channel = supabase
      .channel(canalPainel(unidade))
      .on("broadcast", { event: "chamada" }, ({ payload }) => {
        log(`recebida chamada ${(payload as ChamadaPaciente)?.pacienteNome}`);
        fila.current.push(payload as ChamadaPaciente);
        processar();
      })
      .subscribe((s) => { setStatus(s); log(`canal: ${s}`); });
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  const ativarAudio = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      ctxRef.current.resume();
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(" "));
    } catch { /* */ }
    audioRef.current = true;
    setAudioOn(true);
  };

  const testarVoz = async () => {
    if (!audioRef.current) ativarAudio();
    if (ctxRef.current) await tocarSino(ctxRef.current);
    await falar("Teste de voz do painel de chamadas.");
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

  const mostrarVideo = !!video && !destaque;

  return (
    <div className="min-h-screen bg-primary text-primary-foreground flex flex-col select-none">
      <header className="flex items-center justify-between px-10 py-5 border-b border-primary-foreground/20">
        <h1 className="text-3xl font-bold tracking-wide">Painel de Chamadas</h1>
        <div className="flex items-center gap-6">
          <div className="flex gap-2 opacity-60 hover:opacity-100 transition-opacity">
            <button onClick={ativarAudio} title="Ativar som" className="rounded-lg bg-primary-foreground/10 p-2"><Volume2 className="w-5 h-5" /></button>
            <button onClick={testarVoz} title="Testar voz" className="rounded-lg bg-primary-foreground/10 p-2"><Mic className="w-5 h-5" /></button>
            <button onClick={telaCheia} title="Tela cheia" className="rounded-lg bg-primary-foreground/10 p-2"><Maximize className="w-5 h-5" /></button>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-lg opacity-80 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[7fr_3fr]">
        <section className={`relative flex flex-col items-center justify-center p-10 text-center transition-colors duration-500 ${destaque ? "bg-primary-foreground/15" : ""}`}>
          {mostrarVideo ? (
            <video src={video} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-contain bg-foreground" />
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
          <div>unidade: {unidade} | canal: {status} | som: {audioOn ? "on" : "off"} | fila: {fila.current.length}</div>
          <div>voz: {escolherVoz()?.name || "nenhuma pt-BR"}</div>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {!audioOn && (
        <button
          onClick={() => { ativarAudio(); telaCheia(); }}
          className="fixed inset-0 bg-foreground/70 flex flex-col items-center justify-center gap-4 text-background text-4xl font-bold"
        >
          <Volume2 className="w-24 h-24" />
          Clique para ativar o áudio
        </button>
      )}
    </div>
  );
}
