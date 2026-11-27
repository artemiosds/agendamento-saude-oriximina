import React from 'react';
import { Activity, Building2, CheckCircle2, ChevronRight, ClipboardList, FileText, MessageSquare, Monitor, Network, Search, Settings as SettingsIcon, ShieldAlert, Stamp, Stethoscope, Users, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CONFIG_GROUPS, searchConfigSections, visibleConfigSections, type ConfigTabId } from '@/lib/configNavigation';

const icons = { prontuario: FileText, medicamentos: Stethoscope, impressao: Stamp, especialidades: ClipboardList, campos: SettingsIcon, fluxo: Activity, carencia: ShieldAlert, usuarios: Users, whatsapp: MessageSquare, integracoes: Network, unidades: Building2, sistema: Monitor };

interface Props {
  activeTab: ConfigTabId;
  onSelect: (id: ConfigTabId) => void;
  isGlobalMaster: boolean;
}

export default function ConfigNavigation({ activeTab, onSelect, isGlobalMaster }: Props) {
  const [query, setQuery] = React.useState('');
  const results = searchConfigSections(query, isGlobalMaster);
  const total = visibleConfigSections(isGlobalMaster).length;
  return (
    <nav aria-label="Seções de configurações" className="min-w-0 lg:w-[17rem] lg:shrink-0">
      <div className="rounded-2xl border bg-card shadow-sm lg:sticky lg:top-4">
        <div className="border-b p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navegação</span>
            <span className="text-xs tabular-nums text-muted-foreground">{total} seções</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar configurações" placeholder="Buscar configurações..." className="h-9 pl-9 pr-9 text-sm" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground"><XCircle className="w-4 h-4" /></button>}
          </div>
          {query.trim() && <p role="status" className="mt-2 text-xs text-muted-foreground">{results.length} de {total} seções encontradas</p>}
        </div>
        <div className="p-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {CONFIG_GROUPS.map(group => {
            const entries = results.filter(section => section.group === group.id);
            if (!entries.length) return null;
            return <div key={group.id} className="min-w-0 space-y-0.5">
              <h2 className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
              {entries.map(section => {
                const Icon = icons[section.id];
                const active = activeTab === section.id;
                return <button key={section.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => { onSelect(section.id); setQuery(''); }}
                  className={cn('group w-full min-w-0 flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'border-primary/20 bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted group-hover:bg-background')}><Icon className="w-4 h-4" aria-hidden="true" /></span>
                  <span className="flex-1 min-w-0 leading-tight break-words">{section.label}</span>
                  {active ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" aria-hidden="true" />}
                </button>;
              })}
            </div>;
          })}
          {!results.length && <p className="px-3 py-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-1">Nenhuma seção encontrada. Tente outro termo, como SOAP ou triagem.</p>}
        </div>
      </div>
    </nav>
  );
}
