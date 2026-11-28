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
import {useAdministrativeConfigSection} from '@/hooks/useProntuarioSettings';
import {configObject} from '@/lib/configSectionGuard';

export const CircuitBreakerCard: React.FC = () => {
  const [paused, setPaused] = useState<{ ate: string; motivo: string | null } | null>(null);
  const [humanized, setHumanized] = useState(true);
  const [horaIni, setHoraIni] = useState('07:00');
  const [horaFim, setHoraFim] = useState('21:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed,setFailed]=useState(false);
  const {load:loadSection,save:writeSection}=useAdministrativeConfigSection('whatsapp_humanizado');

  const load = useCallback(async () => {
    setLoading(true);setFailed(false);
    try {
      const { data: conn,error:connError } = await supabase
        .from('whatsapp_connection_status')
        .select('fila_pausada_ate, fila_pausada_motivo')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if(connError)throw connError;
      if (conn?.fila_pausada_ate && new Date(conn.fila_pausada_ate).getTime() > Date.now()) {
        setPaused({ ate: conn.fila_pausada_ate, motivo: conn.fila_pausada_motivo });
      } else setPaused(null);

      const raw=await loadSection();const wh=raw===undefined?{}:configObject(raw);
      setHumanized(wh.enabled !== false);
      setHoraIni(typeof wh.hora_inicio==='string'?wh.hora_inicio:'07:00');
      setHoraFim(typeof wh.hora_fim==='string'?wh.hora_fim:'21:00');
    } catch{setFailed(true);} finally { setLoading(false); }
  }, [loadSection]);

  useEffect(() => { load(); }, [load]);

  const togglePause=async()=>{
    if(saving||failed||!window.confirm(paused?'Retomar fila de envios?':'Pausar a fila por 30 minutos?'))return;setSaving(true);
    try{
      const ate=paused?null:new Date(Date.now()+30*60_000).toISOString();
      const {data,error}=await supabase.from('whatsapp_connection_status').update({fila_pausada_ate:ate,fila_pausada_motivo:paused?null:'Pausado manualmente (Master)'}).neq('id','00000000-0000-0000-0000-000000000000').select('id');
      if(error||!data?.length)throw Error('Operação não confirmada.');
      toast.success(paused?'Retomada confirmada.':'Pausa confirmada.');await load();
    }catch{setFailed(true);toast.error('Operação não confirmada. Recarregue.');}finally{setSaving(false);}
  };
  const saveHumanized=async()=>{
    if(saving||failed)return;setSaving(true);
    try{if(!await writeSection(previous=>({...previous===undefined?{}:configObject(previous),enabled:humanized,hora_inicio:horaIni,hora_fim:horaFim,tz:'America/Belem'})))throw Error('Gravação não confirmada.');toast.success('Configuração confirmada.');}
    catch{setFailed(true);toast.error('Gravação não confirmada. Recarregue.');}finally{setSaving(false);}
  };
  if(failed)return <Card><CardContent className="p-4 space-y-2"><p role="alert">Configuração não confirmada.</p><Button onClick={()=>void load()}>Recarregar</Button></CardContent></Card>;

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
            <Button size="sm" variant={paused ? 'destructive' : 'secondary'} disabled={saving} onClick={togglePause}>
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
