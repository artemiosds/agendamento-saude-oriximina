import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldCheck, X, ContactRound, Phone, MapPin, Stethoscope, FolderOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCNS } from '@/lib/cnsUtils';
import { cn } from '@/lib/utils';

// ---------- Formatters ----------

export const formatCPF = (cpf?: string | null): string => {
  if (!cpf) return '';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return String(cpf);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

export { formatCNS } from "@/lib/cnsUtils";

export const formatTelefoneBR = (tel?: string | null): string => {
  if (!tel) return '';
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel);
};

export const formatarDataBR = (data?: string | null): string => {
  if (!data) return '';
  try {
    const d = new Date(String(data).length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return String(data);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(data);
  }
};

export const calcularIdadeAnos = (dataNascimento?: string | null): string => {
  if (!dataNascimento) return '';
  const parts = String(dataNascimento).includes('/')
    ? String(dataNascimento).split('/').reverse().join('-')
    : String(dataNascimento);
  const birth = new Date(parts + 'T12:00:00');
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
};

export const patientInitials = (nome?: string | null): string => {
  const parts=String(nome||'').trim().split(/\s+/).filter(Boolean);
  return parts.length ? (parts[0][0]+(parts.length>1?parts[parts.length-1][0]:'')).toLocaleUpperCase('pt-BR') : '—';
};

// ---------- Sub-components ----------

const EMPTY = <span className="italic text-muted-foreground/70">—</span>;

const hasValue = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

export const PCampo: React.FC<{ label: string; valor?: React.ReactNode | string | number | null }> = ({ label, valor }) => {
  const display = hasValue(valor) ? valor : EMPTY;
  return (
    <div
      className="grid items-start grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-2 py-1.5"
    >
      <span className="text-[12px] text-muted-foreground leading-snug">{label}</span>
      <span
        className="text-[13px] text-foreground leading-snug"
        style={{
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'visible',
          textOverflow: 'unset',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {display}
      </span>
    </div>
  );
};

export const PSecao: React.FC<{ titulo: string; children: React.ReactNode; className?: string }> = ({ titulo, children, className }) => (
  <section className={cn('min-w-0 rounded-xl border border-border/70 bg-card p-3.5', className)}>
    <h3
      className="mb-2 text-xs font-semibold uppercase text-primary"
      style={{ letterSpacing: '1.2px' }}
    >
      {titulo}
    </h3>
    <div className="flex flex-col">{children}</div>
  </section>
);

// ---------- Modal ----------

interface PacienteDetalheModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  prontuarioNumero?: string | null;
  dataNascimento?: string | null;
  badges?: React.ReactNode;
  children?: React.ReactNode;
  cpf?: string | null;
  cns?: string | null;
  sections?: { id: string; label: string; content: React.ReactNode }[];
  footer?: React.ReactNode;
}

const PacienteDetalheModal: React.FC<PacienteDetalheModalProps> = ({
  open,
  onOpenChange,
  nome,
  prontuarioNumero,
  dataNascimento,
  badges,
  children,
  cpf,cns,sections,
  footer,
}) => {
  const idade = calcularIdadeAnos(dataNascimento);
  const dataFmt = formatarDataBR(dataNascimento);
  const [tab,setTab]=React.useState('geral');
  const bodyRef=React.useRef<HTMLDivElement>(null);
  React.useEffect(()=>{if(open)setTab(sections?.[0]?.id||'geral');},[open,nome,prontuarioNumero]);
  React.useEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=0;},[tab]);
  const icons:Record<string,React.ElementType>={geral:ContactRound,contato:Phone,endereco:MapPin,clinico:Stethoscope,anexos:FolderOpen};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[900px] max-h-[92dvh] p-0 gap-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        <div className="relative shrink-0 border-b bg-background p-4 sm:p-5 space-y-3">
          <button type="button" onClick={()=>onOpenChange(false)} aria-label="Fechar" className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="w-4 h-4"/></button>
          <div className="flex items-start gap-3 pr-9">
            <div aria-hidden="true" className="flex shrink-0 h-11 w-11 sm:h-14 sm:w-14 rounded-xl bg-primary/10 text-primary items-center justify-center text-lg font-bold">{patientInitials(nome)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Identificação do paciente</p>
              <DialogTitle className="text-base sm:text-xl leading-snug break-words [overflow-wrap:anywhere]">{nome||EMPTY}</DialogTitle>
              <DialogDescription className="sr-only">Detalhes do paciente {nome}</DialogDescription>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">{hasValue(prontuarioNumero)&&<span>Prontuário Nº {prontuarioNumero}</span>}{idade&&<span>{idade}</span>}{dataFmt&&<span>Nascimento: {dataFmt}</span>}</div>
              {badges&&<div className="flex flex-wrap gap-1.5 mt-2">{badges}</div>}
            </div>
          </div>
          {sections&&<div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/25 p-3">
            <div className="min-w-0"><p className="text-xs text-muted-foreground">CPF</p><p className="text-sm font-semibold tabular-nums break-words [overflow-wrap:anywhere]">{formatCPF(cpf)||'Não informado'}</p></div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Cartão SUS — CNS</p><p className="text-sm font-semibold tabular-nums break-words [overflow-wrap:anywhere]">{formatCNS(cns||'')||'Não informado'}</p></div>
          </div>}
        </div>
        {sections?<div className="flex flex-col min-h-0 flex-1">
          <Tabs value={tab} onValueChange={setTab} className="shrink-0 px-3 sm:px-5 py-2 border-b bg-background">
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 bg-transparent p-0">{sections.map(s=>{const Icon=icons[s.id]||ContactRound;return <TabsTrigger key={s.id} value={s.id} id={'patient-tab-'+s.id} aria-controls={'patient-panel-'+s.id} className="gap-1.5 px-2.5 py-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Icon className="w-4 h-4"/>{s.label}</TabsTrigger>;})}</TabsList>
          </Tabs>
          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-3 bg-muted/10">
            {sections.map(s=><div key={s.id} id={'patient-panel-'+s.id} role="tabpanel" aria-labelledby={'patient-tab-'+s.id} hidden={tab!==s.id} tabIndex={0} className="space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{s.content}</div>)}
          </div>
        </div>:<div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">{children}</div>}
        {footer&&<div className="shrink-0 border-t bg-background px-3 sm:px-5 py-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
};

export default PacienteDetalheModal;

// ---------- Alergias section helper ----------

export const AlergiasBlock: React.FC<{ alergias?: string | string[] | null }> = ({ alergias }) => {
  const list = Array.isArray(alergias)
    ? alergias.filter(Boolean)
    : hasValue(alergias)
      ? String(alergias).split(/[;,\n]/).map((s) => s.trim()).filter(Boolean)
      : [];

  if (list.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border-l-4 border-l-success bg-success/10 p-3">
        <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
        <span className="text-[13px] text-success-foreground" style={{ wordBreak: 'break-word' }}>
          Sem alergias registradas
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border-l-4 border-l-destructive bg-destructive/10 p-3">
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {list.map((a, i) => (
          <Badge
            key={i}
            variant="outline"
            className="bg-destructive/15 text-destructive border-destructive/30 text-[11px]"
            style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}
          >
            {a}
          </Badge>
        ))}
      </div>
    </div>
  );
};
