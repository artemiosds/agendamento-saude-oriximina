import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LifeBuoy, ChevronDown, UserPlus } from 'lucide-react';
import { ASSISTANCE_GUIDANCE, canContinueAssistedCreate, type AssistanceRoute } from '@/lib/portalAssistance';
import PortalPublicGuide from './PortalPublicGuide';

export default function PortalAssistedAccess({ route, busy, onCreate }: { route: AssistanceRoute; busy: boolean; onCreate: () => void }) {
  const [open,setOpen] = useState(false);
  const [checks,setChecks] = useState({identified:false,ownEmail:false,agreed:false});
  const [showGuide,setShowGuide] = useState(false);
  const info = ASSISTANCE_GUIDANCE[route];
  return <section className="rounded-xl border p-4 space-y-3">
    <button type="button" className="w-full flex items-center gap-2 text-start font-semibold" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setChecks({identified:false,ownEmail:false,agreed:false});setShowGuide(false);}}>
      <LifeBuoy className="h-5 w-5 text-primary shrink-0"/><span className="flex-1">Atendimento assistido</span><ChevronDown className={'h-4 w-4 '+(open?'rotate-180':'')} aria-hidden="true"/>
    </button>
    <p className="text-sm font-medium">{info.title}</p>
    {open && <>
      <p className="text-sm text-muted-foreground">{info.description}</p>
      {(route==='legacy'||route==='first') && <div className="rounded-lg border p-3 space-y-3">
        <p className="text-sm font-semibold">Criação administrativa assistida (quando necessária)</p>
        <p className="text-xs text-muted-foreground">Prefira a ativação pelo próprio paciente quando disponível. Faça as conferências presencialmente antes de continuar.</p>
        {([{key:'identified',label:'Conferi a identidade do paciente e a ficha existente.'},{key:'ownEmail',label:'Confirmei com o paciente que o e-mail cadastrado é próprio e acessível.'},{key:'agreed',label:'O paciente está presente e concorda com a criação do acesso.'}] as const).map(item=><label key={item.key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={checks[item.key]} disabled={busy} onChange={e=>setChecks(v=>({...v,[item.key]:e.target.checked}))}/><span>{item.label}</span></label>)}
        <Button className="w-full whitespace-normal h-auto min-h-10" disabled={busy||!canContinueAssistedCreate(route,checks)} onClick={onCreate}><UserPlus className="h-4 w-4 mr-2 shrink-0"/>Continuar para criar acesso</Button>
        <p className="text-xs text-muted-foreground">A conferência acima é local, não cria conta nem comprova identidade no servidor. O formulário existente ainda exige senha, motivo e confirmação.</p>
      </div>}
      <Button type="button" variant="outline" className="w-full" aria-expanded={showGuide} onClick={()=>setShowGuide(v=>!v)}>{showGuide?'Recolher guia':'Ver guia e QR Code do portal'}</Button>
      {showGuide&&<PortalPublicGuide/>}
    </>}
  </section>;
}
