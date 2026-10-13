import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";

const CONFIG_KEY = "painel_tv";
const DOMINIO_OFICIAL = "https://agendamento-saude-sms-oriximina.site";

export default function PainelChamadasConfig() {
  const { user, isGlobalAdmin } = useAuth();
  const restrito = !!user?.unidadeId && !isGlobalAdmin;
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [unidade, setUnidade] = useState(user?.unidadeId || "");
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [video, setVideo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const isMaster = user?.role === "master";

  useEffect(() => {
    supabase.from("unidades").select("id,nome").eq("ativo", true).order("nome").then(({ data }) => {
      const lista = ((data as any) || []) as { id: string; nome: string }[];
      setUnidades(restrito ? lista.filter((u) => u.id === user?.unidadeId) : lista);
      if (!unidade && lista[0]) setUnidade(lista[0].id);
    });
    supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle().then(({ data }) => {
      setVideos(((data?.configuracoes as any)?.[CONFIG_KEY]?.videos) || {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setVideo(videos[unidade] || ""); }, [unidade, videos]);

  const link = useMemo(() => {
    const base = window.location.hostname.includes("lovable") || window.location.hostname === "localhost"
      ? window.location.origin : DOMINIO_OFICIAL;
    const p = new URLSearchParams({ unidade });
    if (videos[unidade]) p.set("video", videos[unidade]);
    return `${base}/painel-tv?${p.toString()}`;
  }, [unidade, videos]);

  const salvar = async () => {
    const v = video.trim();
    if (v && !/^https:\/\/.+/i.test(v)) { toast.error("Informe um endereço https:// de vídeo MP4."); return; }
    setSalvando(true);
    try {
      const { data: cur } = await supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle();
      const cfg = (cur?.configuracoes as any) || {};
      const novos = { ...(cfg[CONFIG_KEY]?.videos || {}), [unidade]: v };
      if (!v) delete novos[unidade];
      const { error } = await supabase.from("system_config")
        .update({ configuracoes: { ...cfg, [CONFIG_KEY]: { ...(cfg[CONFIG_KEY] || {}), videos: novos } }, updated_at: new Date().toISOString() } as any)
        .eq("id", "default");
      if (error) throw error;
      setVideos(novos);
      toast.success("Vídeo de espera salvo. Atualize o link na TV.");
    } catch {
      toast.error("Não foi possível salvar o vídeo.");
    } finally { setSalvando(false); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); }
    catch { toast.error("Copie o link manualmente."); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Painel de Chamadas (TV)" subtitle="Gere o link da TV da recepção e configure o vídeo de espera." />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <Label>Unidade</Label>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} disabled={restrito}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Vídeo de espera (endereço MP4, opcional)</Label>
            <div className="flex gap-2">
              <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://.../video.mp4" disabled={!isMaster} />
              {isMaster && <Button onClick={salvar} disabled={salvando || !unidade}><Save className="w-4 h-4 mr-1" />Salvar</Button>}
            </div>
            <p className="text-xs text-muted-foreground">O vídeo toca sem som enquanto não há chamada. Somente o Master altera.</p>
          </div>

          <div className="space-y-2">
            <Label>Link da TV</Label>
            <div className="flex gap-2">
              <Input readOnly value={unidade ? link : ""} />
              <Button variant="outline" onClick={copiar} disabled={!unidade}><Copy className="w-4 h-4 mr-1" />Copiar</Button>
              <Button variant="outline" onClick={() => window.open(link, "_blank")} disabled={!unidade}><ExternalLink className="w-4 h-4 mr-1" />Abrir</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Na TV Samsung: abra o navegador, cole o link, salve como favorito e toque em "Clique para ativar o áudio".
              Para diagnóstico, acrescente <code>&amp;debug=true</code> ao final do link.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
