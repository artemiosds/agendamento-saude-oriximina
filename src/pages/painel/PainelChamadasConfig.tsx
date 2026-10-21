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
import { linkPainelTV, playlistPainel, videoPrincipalPainel } from '@/lib/painelVideo';

const CONFIG_KEY = "painel_tv";

export default function PainelChamadasConfig() {
  const { user, isGlobalAdmin } = useAuth();
  const restrito = !!user?.unidadeId && !isGlobalAdmin;
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [unidade, setUnidade] = useState(user?.unidadeId || "");
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [video, setVideo] = useState("");
  const [playlists, setPlaylists] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const isMaster = user?.role === "master";

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("unidades").select("id,nome,custom_data").eq("ativo", true).order("nome"),
      supabase.from("system_config").select("configuracoes").eq("id", "default").maybeSingle(),
    ]).then(([{ data }, { data: config }]) => {
      if (!active) return;
      const lista = ((data as any) || []) as { id: string; nome: string }[];
      const visible = restrito ? lista.filter(u => u.id === user?.unidadeId) : lista;
      setUnidades(visible);
      if (!unidade && visible[0]) setUnidade(visible[0].id);
      const legacy = (config?.configuracoes as any)?.[CONFIG_KEY]?.videos || {};
      const lists = Object.fromEntries((data || []).map(u => [u.id, playlistPainel((u.custom_data as any) || {}, legacy[u.id])]));
      setPlaylists(lists); setVideos(Object.fromEntries(Object.entries(lists).map(([id, list]) => [id, list[0] || ''])));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setVideo(videos[unidade] || ""); }, [unidade, videos]);

  const link = useMemo(() => {
    return linkPainelTV(window.location.origin, unidade);
  }, [unidade]);

  const salvar = async () => {
    if (!isMaster || !unidade || (restrito && unidade !== user?.unidadeId)) return;
    const v = video.trim();
    if (v && !/^https:\/\/.+/i.test(v)) { toast.error("Informe um endereço https:// de vídeo MP4."); return; }
    setSalvando(true);
    try {
      const { data: cur, error: readError } = await supabase.from('unidades').select('custom_data').eq('id', unidade).single();
      if (readError) throw readError;
      const cd = (cur?.custom_data as Record<string, unknown>) || {};
      const current = playlistPainel(cd, playlists[unidade]?.[0]);
      const next = videoPrincipalPainel(current, v);
      const { error } = await supabase.from('unidades')
        .update({ custom_data: { ...cd, video_urls: next, video_url: next[0] || '' } }).eq('id', unidade).select('id').single();
      if (error) throw error;
      setPlaylists(old => ({ ...old, [unidade]: next }));
      setVideos(old => ({ ...old, [unidade]: next[0] || '' }));
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
            <Label>Vídeo principal de espera (endereço MP4, opcional)</Label>
            <div className="flex gap-2">
              <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://.../video.mp4" disabled={!isMaster} />
              {isMaster && <Button onClick={salvar} disabled={salvando || !unidade}><Save className="w-4 h-4 mr-1" />Salvar</Button>}
            </div>
            <p className="text-xs text-muted-foreground">O vídeo toca sem som. Os demais vídeos da lista são preservados; ao limpar este campo, o próximo passa a ser o principal. Gerencie a lista completa em Unidades e Salas. Somente o Master altera.</p>
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
