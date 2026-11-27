import {Globe,MapPin,Network,Monitor,Navigation,ShieldCheck} from 'lucide-react';
import {parseAuditOrigin,auditOriginLocation,auditOriginSource,auditRouteLabel} from '@/lib/auditOrigin';
import {auditSafeText} from '@/lib/auditSecurity';

type Props={event:{ip?:string;origem?:string;rota?:string;detalhes?:Record<string,unknown>};device:string;confirmed:boolean};
const clock=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'});
export default function AuditOriginPanel({event,device,confirmed}:Props){
  const origin=confirmed&&event.ip?parseAuditOrigin(event.detalhes?.contexto_rede,event.ip):null;
  const route=auditSafeText(String(event.rota||event.detalhes?.rota||event.detalhes?.origin||'')).split(/[?#]/,1)[0];
  const network=origin?.network==='matched'?origin.networkLabel+' · IP cadastrado':origin?.network==='unrecognized'?'Rede sem correspondência cadastrada':'Cadastro de redes não confirmado';
  const fields=[
    {Icon:Globe,label:'Endereço IP registrado',value:event.ip||'Não registrado'},
    {Icon:MapPin,label:'Localização estimada da rede',value:auditOriginLocation(origin)},
    {Icon:Network,label:'Rede institucional',value:network},
    {Icon:Monitor,label:'Navegador / dispositivo',value:device},
    {Icon:Navigation,label:'Página utilizada',value:auditRouteLabel(route)},
    {Icon:ShieldCheck,label:'Origem tecnológica',value:auditOriginSource(event.origem)},
  ];
  return <section className="space-y-3 rounded-xl border border-border p-3 sm:p-4" aria-label="Origem e localização do acesso">
    <div className="flex items-center gap-2"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Globe className="h-5 w-5"/></span><div><h3 className="font-semibold text-sm">Origem e localização do acesso</h3><p className="text-xs text-muted-foreground">Contexto da rede e da operação registrada</p></div></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{fields.map(({Icon,label,value})=><div key={label} className="min-w-0 rounded-lg border border-border bg-muted/20 p-3"><div className="flex gap-1.5 items-center text-muted-foreground"><Icon className="h-4 w-4 shrink-0"/><p className="text-xs">{label}</p></div><p className="mt-1 text-sm font-medium break-words">{value||'Não registrado'}</p></div>)}</div>
    {route&&<p className="text-xs text-muted-foreground break-all">Rota técnica: {route}</p>}
    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
      {!confirmed?<p>Consultando evento completo.</p>:origin?<><p><strong>Fonte:</strong> {origin.source==='vercel_geoip'?'GeoIP da infraestrutura Vercel, registrado pela aplicação':'IP público consultado pelo navegador, sem localização'}</p><p><strong>Captura:</strong> {clock.format(new Date(origin.capturedAt))} · pode ser reutilizada por até 5 minutos.</p>{origin.source==='ipify_browser'&&<p>Serviço GeoIP indisponível ou não confirmado na captura; o IP foi preservado sem estimar o município.</p>}{origin.source==='vercel_geoip'&&!origin.city&&<p>A infraestrutura não forneceu município para este IP. A informação não será presumida.</p>}</>:<p>Evento sem contexto geográfico registrado. Eventos anteriores à ativação ou gravados por rotinas sem captura não recebem localização retroativa. Para validar a captura, confira um novo login de conta interna na versão atualizada.</p>}
      <p>O município é estimado pelo IP de saída da rede. VPN, proxy ou rede compartilhada podem alterar o resultado. O registro não comprova presença física, identidade ou endereço exato.</p>
    </div>
  </section>;
}
