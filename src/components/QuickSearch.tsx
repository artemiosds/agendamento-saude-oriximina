import { useEffect, useState } from 'react';
import { CalendarDays, FileText, Search, Stethoscope } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseQuickSearchTerm, quickSearchCpfVariants, type QuickSearchPatient, type QuickSearchPatientLink, type QuickSearchTerm } from '@/lib/quickSearch';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Access = { directory: boolean; agenda: boolean; prontuario: boolean; sigtap: boolean };
type Procedure = { codigo: string; nome: string };
type SearchResult = { key: string; patients?: QuickSearchPatient[]; procedure?: Procedure; error?: boolean };

async function searchPatients(term: QuickSearchTerm, unitId: string | null, signal: AbortSignal): Promise<QuickSearchPatient[]> {
  let query = supabase.from('pacientes').select('id,nome').abortSignal(signal);
  if (unitId !== null) query = query.eq('unidade_id', unitId);
  if (term.kind === 'name') query = query.ilike('nome', '%'+term.name+'%');
  else if (term.kind === 'cpf') query = query.in('cpf', quickSearchCpfVariants(term.digits));
  else query = query.in('cns', [term.digits, term.digits.replace(/^(\d{3})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4')]);

  const { data, error } = await query.order('nome').order('id').limit(6);
  if (error) throw error;
  return data ?? [];
}

export default function QuickSearch({ directory, agenda, prontuario, sigtap }: Access) {
  const { user, isGlobalAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);

  const unitId = user?.unidadeId || '';
  const patientAccess = directory && (agenda || prontuario) && (isGlobalAdmin || !!unitId);
  const enabled = !!user?.id && (patientAccess || sigtap);
  const scopeKey = JSON.stringify([user?.id, user?.role, isGlobalAdmin, unitId, location.key, directory, agenda, prontuario, sigtap]);
  const open = enabled && sessionKey === scopeKey;

  const setOpen = (next: boolean) => {
    setTerm('');
    setResult(null);
    setSessionKey(next && enabled ? scopeKey : null);
  };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.shiftKey ||
          !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      // Leave the keyboard and focus untouched during an existing workflow dialog.
      if (!open && document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]')) return;
      event.preventDefault();
      setTerm('');
      setResult(null);
      setSessionKey(open ? null : scopeKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open, scopeKey]);

  const parsed = parseQuickSearchTerm(term);
  const allowed = !!parsed && (parsed.kind === 'sigtap' ? sigtap : patientAccess);
  const requestKey = JSON.stringify([scopeKey, term]);

  useEffect(() => {
    if (!open) return;
    const input = parseQuickSearchTerm(term);
    if (!input || (input.kind === 'sigtap' ? !sigtap : !patientAccess)) return;

    const controller = new AbortController();
    const { signal } = controller;
    const timer = window.setTimeout(async () => {
      try {
        if (input.kind === 'sigtap') {
          const { data, error } = await supabase.from('sigtap_procedimentos').select('codigo,nome')
            .eq('ativo', true).eq('codigo', input.digits).limit(1).abortSignal(signal).maybeSingle();
          if (error) throw error;
          if (!signal.aborted) setResult({ key: requestKey, procedure: data ?? undefined });
        } else {
          const patients = await searchPatients(input, isGlobalAdmin ? null : unitId, signal);
          if (!signal.aborted) setResult({ key: requestKey, patients });
        }
      } catch {
        if (!signal.aborted) setResult({ key: requestKey, error: true });
      }
    }, 250);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, term, requestKey, sigtap, patientAccess, isGlobalAdmin, unitId]);

  if (!enabled) return null;

  const current = allowed && result?.key === requestKey ? result : null;
  const help = patientAccess
    ? (sigtap ? 'Nome, CPF, CNS ou código SIGTAP' : 'Nome, CPF ou CNS')
    : 'Código SIGTAP';
  const status = !term.trim() ? null
    : !parsed ? (patientAccess ? 'Digite pelo menos três letras ou um código completo.' : 'Digite os dez dígitos do SIGTAP.')
    : !allowed ? 'Este tipo de busca não está disponível para seu acesso.'
    : !current ? 'Buscando…'
    : null;

  const openPatient = (patient: QuickSearchPatient, destination: 'agenda' | 'prontuario') => {
    if (!user?.id || !patientAccess || (destination === 'agenda' ? !agenda : !prontuario)) return;
    const patientLink: QuickSearchPatientLink = { id: patient.id, nome: patient.nome, userId: user.id, unitId };
    setOpen(false);
    if (destination === 'agenda') navigate('/painel/agenda', { state: { quickPatient: patientLink } });
    else navigate('/painel/prontuario?pacienteId=' + encodeURIComponent(patient.id), { state: { quickPatient: patientLink } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="mr-1 h-9 gap-2 px-2 sm:mr-3 sm:px-3"
          aria-label="Abrir busca rápida" aria-keyshortcuts="Control+K Meta+K">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden text-sm sm:inline">Buscar</span>
          <kbd aria-hidden="true" className="hidden rounded border bg-muted px-1.5 text-xs text-muted-foreground lg:inline">Ctrl K</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-3 bg-background backdrop-blur-none">
        <DialogTitle>Busca rápida</DialogTitle>
        <DialogDescription>{help}</DialogDescription>
        <Command shouldFilter={false} className="rounded-lg border">
          <CommandInput aria-label={help} placeholder={help} maxLength={100} value={term}
            onValueChange={(value) => { setTerm(value); setResult(null); }} />
          <CommandList className="max-h-[45dvh]">
            {status && <p role="status" className="px-3 py-4 text-sm text-muted-foreground">{status}</p>}
            {current?.error && <p role="alert" className="px-3 py-4 text-sm text-destructive">Falha na busca. Altere o termo para tentar novamente.</p>}
            {current && !current.error && !current.procedure && !current.patients?.length && (
              <p role="status" className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
            )}
            {current?.procedure && (
              <CommandGroup heading={current.procedure.codigo + ' · ' + current.procedure.nome}>
                <CommandItem value="sigtap" onSelect={() => {
                  setOpen(false);
                  navigate('/painel/procedimentos-sigtap', { state: { sigtapCode: current.procedure?.codigo } });
                }}>
                  <FileText className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> Consultar regras do SIGTAP
                </CommandItem>
              </CommandGroup>
            )}
            {current?.patients?.map(patient => (
              <CommandGroup key={patient.id} heading={patient.nome}>
                {prontuario && <CommandItem value={patient.id + ':prontuario'} aria-label={'Abrir prontuário de ' + patient.nome}
                  onSelect={() => openPatient(patient, 'prontuario')}>
                  <Stethoscope className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> Abrir prontuário
                </CommandItem>}
                {agenda && <CommandItem value={patient.id + ':agenda'} aria-label={'Ver agendamentos de ' + patient.nome}
                  onSelect={() => openPatient(patient, 'agenda')}>
                  <CalendarDays className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> Ver agendamentos
                </CommandItem>}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
