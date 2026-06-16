// CircuitBreakerCard — Fase 3 hardening (cont.)
// Mostra estado do circuit breaker (Normal/Pausado), permite Pausar/Retomar
// e expõe toggle "Envio humanizado" (sendPresence + delays grandes) lido
// pelo queue-processor via system_config.configuracoes.whatsapp_humanizado.
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Activity, Pause, Play, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export const CircuitBreakerCard: React.FC = () => {
  const [paused, setPaused] = useState<{ ate: string; motivo: string | null } | null>(null);
  const [humanized, setHumanized] = useState(true);
  const [horaIni, setHoraIni] = useState('07:00');
  const [horaFim, setHoraFim] = useState('21:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: conn } = await supabase
        .from('whatsapp_connection_status')
        .select('fila_pausada_ate, fila_pausada_motivo')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conn?.fila_pausada_ate && new Date(conn.fila_pausada_ate).getTime() > Date.now()) {
        setPaused({ ate: conn.fila_pausada_ate, motivo: conn.fila_pausada_motivo });
      } else setPaused(null);

      const { data: cfg } = await supabase
        .from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const wh = (cfg?.configuracoes as any)?.whatsapp_humanizado || {};
      setHumanized(wh.enabled !== false);
      setHoraIni(wh.hora_inicio || '07:00');
      setHoraFim(wh.hora_fim || '21:00');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePause = async () => {
    if (paused) {
      await supabase.from('whatsapp_connection_status')
        .update({ fila_pausada_ate: null, fila_pausada_motivo: null })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      toast.success('Fila retomada');
    } else {
      const ate = new Date(Date.now() + 30 * 60_000).toISOString();
      await supabase.from('whatsapp_connection_status')
        .update({ fila_pausada_ate: ate, fila_pausada_motivo: 'Pausado manualmente (Master)' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      toast.success('Fila pausada por 30 min');
    }
    load();
  };

  const saveHumanized = async () => {
    setSaving(true);
    try {
      const { data: cur } = await supabase
        .from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const next = { ...(cur?.configuracoes as any || {}), whatsapp_humanizado: {
        enabled: humanized, hora_inicio: horaIni, hora_fim: horaFim, tz: 'America/Belem',
      }};
      const { error } = await supabase.from('system_config')
        .upsert({ id: 'default', configuracoes: next }, { onConflict: 'id' });
      if (error) throw error;
      toast.success('Configuração de humanização salva');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paused ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Circuit Breaker</h3>
              <p className="text-xs text-muted-foreground">
                {paused
                  ? <>Pausada até <b>{new Date(paused.ate).toLocaleString('pt-BR')}</b> · {paused.motivo || '—'}</>
                  : 'Estado normal — fila ativa'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={paused ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}>
              {paused ? 'PAUSADO' : 'NORMAL'}
            </Badge>
            <Button size="sm" variant={paused ? 'destructive' : 'secondary'} onClick={togglePause}>
              {paused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
              {paused ? 'Retomar fila' : 'Pausar fila'}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <Label htmlFor="humanizado" className="font-medium cursor-pointer">Envio humanizado (sendPresence + delays)</Label>
            </div>
            <Switch id="humanizado" checked={humanized} onCheckedChange={setHumanized} />
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativado: o sistema simula digitação (composing → typing → paused) e aplica delays determinísticos
            por paciente/data (3-12s antes, 2-8s durante, 5-30s após). Recomendado deixar SEMPRE ATIVO em produção.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <Label className="text-xs">Janela comercial — início</Label>
              <input type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Janela comercial — fim</Label>
              <input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Fuso: America/Belem (UTC-3, horário de Brasília). Envios fora dessa janela são adiados para o próximo início.</p>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveHumanized} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Salvar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
export default CircuitBreakerCard;
