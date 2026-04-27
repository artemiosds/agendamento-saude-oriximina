import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
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

// ---------- Sub-components ----------

const EMPTY = <span className="italic text-muted-foreground/70">—</span>;

const hasValue = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

export const PCampo: React.FC<{ label: string; valor?: React.ReactNode | string | number | null }> = ({ label, valor }) => {
  const display = hasValue(valor) ? valor : EMPTY;
  return (
    <div
      className="grid items-start gap-2 py-1.5"
      style={{ gridTemplateColumns: '110px 1fr' }}
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
  <section className={cn('rounded-xl border border-border/70 bg-card/50 p-3', className)}>
    <h3
      className="mb-2 text-[10px] font-semibold uppercase text-primary"
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
  children: React.ReactNode;
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
  footer,
}) => {
  const idade = calcularIdadeAnos(dataNascimento);
  const dataFmt = formatarDataBR(dataNascimento);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 flex flex-col border-0 bg-background overflow-hidden [&>button.absolute]:hidden"
        style={{
          width: '95vw',
          maxWidth: '480px',
          maxHeight: '90vh',
          borderRadius: '20px',
          boxSizing: 'border-box',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Zona 1 - Header */}
        <div className="relative border-b border-border/70" style={{ padding: '20px' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="absolute flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            style={{ top: '12px', right: '12px', width: '32px', height: '32px' }}
          >
            <X className="w-4 h-4" />
          </button>

          <DialogTitle asChild>
            <h2
              className="text-foreground pr-10"
              style={{
                fontWeight: 700,
                fontSize: '18px',
                lineHeight: 1.25,
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                overflow: 'visible',
              }}
            >
              {nome || EMPTY}
            </h2>
          </DialogTitle>
          <DialogDescription className="sr-only">Detalhes do paciente {nome}</DialogDescription>

          {hasValue(prontuarioNumero) && (
            <div className="mt-1 text-[12px] text-muted-foreground" style={{ wordBreak: 'break-word' }}>
              Prontuário Nº {prontuarioNumero}
            </div>
          )}

          {(hasValue(idade) || hasValue(dataFmt)) && (
            <div className="mt-1 text-[12px] text-muted-foreground" style={{ wordBreak: 'break-word' }}>
              {hasValue(idade) ? idade : '—'}
              {hasValue(dataFmt) ? ` • ${dataFmt}` : ''}
            </div>
          )}

          {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
        </div>

        {/* Zona 2 - Body */}
        <div
          className="flex-1 flex flex-col gap-3"
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
          }}
        >
          {children}
        </div>

        {/* Zona 3 - Footer */}
        {footer && (
          <div
            className="border-t border-border/70 bg-background"
            style={{ padding: '16px 20px' }}
          >
            {footer}
          </div>
        )}
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
