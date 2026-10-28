import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SigtapProcedurePicker from '@/components/documents/SigtapProcedurePicker';
import type { ApacClinicalData, ApacProcedure } from '@/lib/apacClinicalData';

export default function ApacClinicalForm({value,onChange}:{value:ApacClinicalData;onChange:(v:ApacClinicalData)=>void}) {
  const patch=(p:Partial<ApacClinicalData>)=>onChange({...value,...p});
  const field=(key:'estabelecimento'|'cnes'|'diagnostico'|'cidPrincipal'|'cidSecundario'|'cidAssociado'|'solicitante'|'dataSolicitacao'|'documento',label:string,maxLength:number,type='text')=>(
    <div><Label htmlFor={`apac-${key}`}>{label}</Label><Input id={`apac-${key}`} type={type} maxLength={maxLength} value={value[key]} onChange={e=>patch({[key]: key.startsWith('cid')?e.target.value.toUpperCase():e.target.value})}/></div>
  );
  const procedure=(p:ApacProcedure,update:(v:ApacProcedure)=>void)=>(<div className="grid grid-cols-[1fr_85px] gap-2">
    <SigtapProcedurePicker value={p.codigo?{codigo:p.codigo,nome:p.nome}:null} onChange={v=>update({...p,codigo:v?.codigo||'',nome:v?.nome||''})}/>
    <div><Label>Quantidade</Label><Input aria-label={`Quantidade ${p.nome||'do procedimento'}`} type="number" min={1} max={999} step={1} value={p.quantidade} onChange={e=>update({...p,quantidade:Number(e.target.value)})}/></div>
  </div>);
  return <div className="space-y-4 p-4">
    <p className="text-sm text-muted-foreground">Preenchimento opcional para este laudo. Confira os dados antes de emitir. A seleção no catálogo não comprova autorização ou compatibilidade para APAC.</p>
    <div className="grid gap-3 sm:grid-cols-2">{field('estabelecimento','1 — Estabelecimento solicitante',85)}{field('cnes','2 — CNES',7)}</div>
    <section className="space-y-2"><h3 className="font-semibold">18–20 — Procedimento principal</h3>{procedure(value.principal,principal=>patch({principal}))}</section>
    <section className="space-y-2"><h3 className="font-semibold">21–35 — Procedimentos secundários</h3>
      {value.secundarios.map((p,i)=><div key={i} className="space-y-2 rounded border p-2">{procedure(p,next=>patch({secundarios:value.secundarios.map((x,j)=>j===i?next:x)}))}<Button type="button" variant="outline" size="sm" onClick={()=>patch({secundarios:value.secundarios.filter((_,j)=>j!==i)})}>Remover secundário {i+1}</Button></div>)}
      <Button type="button" variant="outline" disabled={value.secundarios.length>=5} onClick={()=>patch({secundarios:[...value.secundarios,{codigo:'',nome:'',quantidade:1}]})}>Adicionar procedimento secundário</Button>
    </section>
    {field('diagnostico','36 — Descrição do diagnóstico',100)}
    <div className="grid gap-3 sm:grid-cols-3">{field('cidPrincipal','37 — CID principal',5)}{field('cidSecundario','38 — CID secundário',5)}{field('cidAssociado','39 — CID causas associadas',5)}</div>
    <div><Label htmlFor="apac-observacoes">40 — Observações / justificativa</Label><Textarea id="apac-observacoes" rows={5} maxLength={650} value={value.observacoes} onChange={e=>patch({observacoes:e.target.value})}/><p className="text-xs text-muted-foreground">{value.observacoes.length}/650 caracteres. Confira o texto na prévia.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{field('solicitante','41 — Profissional solicitante',65)}{field('dataSolicitacao','42 — Data da solicitação',10,'date')}</div>
    <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="apac-document-type">43 — Tipo de documento</Label><select id="apac-document-type" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.tipoDocumento} onChange={e=>patch({tipoDocumento:e.target.value as ApacClinicalData['tipoDocumento'],documento:''})}><option value="">Não preencher</option><option value="CPF">CPF</option><option value="CNS">CNS</option></select></div>{field('documento','44 — Documento do solicitante',15)}</div>
    <p className="text-xs text-muted-foreground">Assinatura, carimbo e autorização não são preenchidos automaticamente. Os dados desta edição não são gravados no prontuário ou enviados ao BPA.</p>
  </div>;
}
