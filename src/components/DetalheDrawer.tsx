import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// === Helper utilities ===

export const calcularIdade = (dataNascimento: string): string => {
  if (!dataNascimento) return '—';
  const parts = dataNascimento.includes('/') ? dataNascimento.split('/').reverse().join('-') : dataNascimento;
  const birth = new Date(parts + 'T12:00:00');
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
};

export const formatarData = (data: string): string => {
  if (!data) return '—';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return data;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return data;
  }
};

export const formatarDataHora = (data: string): string => {
  if (!data) return '—';
  try {
    const d = new Date(data);
    if (isNaN(d.getTime())) return data;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return data;
  }
};

// === Reusable sub-components ===

export const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{titulo}</h3>
    <div className="space-y-1.5">{children}</div>
  </div>
);

export const Campo: React.FC<{ label: string; valor?: string | number | null; hide?: boolean }> = ({ label, valor, hide }) => {
  const display = valor !== undefined && valor !== null && valor !== '' ? String(valor) : '—';
  if (hide && display === '—') return null;
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right break-words max-w-[60%]">{display}</span>
    </div>
  );
};

export const StatusBadge: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <Badge variant="outline" className={cn('text-xs', className)}>{label}</Badge>
);

// === Main drawer component ===

interface DetalheDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  children: React.ReactNode;
}

const DetalheDrawer: React.FC<DetalheDrawerProps> = ({ open, onOpenChange, titulo, children }) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="font-display text-lg">{titulo}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes de {titulo}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-5 pb-6">
            {children}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default DetalheDrawer;
