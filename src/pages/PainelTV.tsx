import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { canalPainel, type ChamadaPaciente } from "@/lib/painelChamadas";
import { Volume2 } from "lucide-react";

const HIST_KEY = (u: string) => `painel_tv_hist_${u}`;

function tocarSino(ctx: AudioContext) {
  const notas = [880, 660];
  notas.forEach((f, i) => {
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
    u.onend = () => resolve();
    u.onerror = () => resolve();
    setTimeout(resolve, 15000);
    window.speechSynthesis.speak(u);
  });
}

export default function PainelTV() {
  const [params] = useSearchParams();
  const unidade = params.get("unidade") || "";
  const [atual, setAtual] = useState<ChamadaPaciente | null>(null);
  const [hist, setHist] = useState<ChamadaPaciente[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIST_KEY(unidade)) || "[]"); } catch { return []; }
  });
  const [audioOn, setAudioOn] = useState(false);
  const [agora, setAgora] = useState(new Date());
  const [destaque, setDestaque] = useState(false);
  const fila = useRef<ChamadaPaciente[]>([]);
  const tocando = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef(false);

  useEffect(() => { audioRef.current = audioOn; }, [audioOn]);
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { window.speechSynthesis?.getVoices(); }, []);

  const processar = async () => {
    if (tocando.current) return;
    tocando.current = true;
    while (fila.current.length) {
      const c = fila.current.shift()!;
      setAtual((prev) => {
        if (prev) setHist((h) => {
          const n = [prev, ...h.filter((x) => x.id !== prev.id)].slice(0, 5);
          try { localStorage.setItem(HIST_KEY(unidade), JSON.stringify([c, ...n].slice(0, 6))); } catch { /* */ }
          return n;
        });
        return c;
      });
      setDestaque(true);
      if (audioRef.current && ctxRef.current) {
        try {
          await tocarSino(ctxRef.current);
          const txt = `Atenção: ${c.pacienteNome.toLowerCase()}, dirigir-se ao ${c.local}.`;
          await falar(txt);
          await new Promise((r) => setTimeout(r, 700));
          await falar(txt);
        } catch { /* silencioso */ }
      } else {
        await new Promise((r) => setTimeout(r, 4000));
      }
      setDestaque(false);
      await new Promise((r) => setTimeout(r, 800));
    }
    tocando.current = false;
  };

  useEffect(() => {
    // Restaura última chamada exibida
    try {
      const salvo: ChamadaPaciente[] = JSON.parse(localStorage.getItem(HIST_KEY(unidade)) || "[]");
      if (salvo[0]) { setAtual(salvo[0]); setHist(salvo.slice(1, 6)); }
    } catch { /* */ }
    const channel = supabase
      .channel(canalPainel(unidade))
      .on("broadcast", { event: "chamada" }, ({ payload }) => {
        fila.current.push(payload as ChamadaPaciente);
        processar();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  const ativarAudio = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
      ctxRef.current.resume();
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(" "));
    } catch { /* */ }
    setAudioOn(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="min-h-screen bg-primary text-primary-foreground flex flex-col select-none">
      <header className="flex items-center justify-between px-10 py-5 border-b border-primary-foreground/20">
        <h1 className="text-3xl font-bold tracking-wide">Painel de Chamadas</h1>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-lg opacity-80 capitalize">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[7fr_3fr]">
        <section className={`flex flex-col items-center justify-center p-10 text-center transition-colors duration-500 ${destaque ? "bg-primary-foreground/15" : ""}`}>
          {atual ? (
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
            {hist.slice(0, 5).map((c) => (
              <li key={c.id} className="rounded-xl bg-primary-foreground/10 p-4">
                <p className="text-2xl font-bold truncate">{c.pacienteNome}</p>
                <p className="text-xl opacity-80">{c.local}</p>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      {!audioOn && (
        <button
          onClick={ativarAudio}
          className="fixed inset-0 bg-foreground/70 flex flex-col items-center justify-center gap-4 text-background text-4xl font-bold"
        >
          <Volume2 className="w-24 h-24" />
          Clique para ativar o áudio
          {!unidade && <span className="text-xl font-normal">Atenção: link sem unidade (?unidade=...)</span>}
        </button>
      )}
    </div>
  );
}
