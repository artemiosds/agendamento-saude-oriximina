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
    <nav aria-label="Seções de configurações" className="config-admin-nav min-w-0 lg:w-[15.5rem] lg:shrink-0">
      <div className="clinical-premium config-admin-nav-panel">
        <div className="config-admin-nav-top border-b p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="config-admin-eyebrow text-[11px] font-semibold uppercase tracking-wide">Navegação</span>
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
              <h2 className="config-admin-eyebrow px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide">{group.label}</h2>
              {entries.map(section => {
                const Icon = icons[section.id];
                const active = activeTab === section.id;
                return <button key={section.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => { onSelect(section.id); setQuery(''); }}
                  className={cn('config-admin-nav-item group w-full min-w-0 flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs sm:text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'config-admin-nav-active' : '')}>
                  <span className={cn('clinical-dock-icon config-admin-nav-icon', group.id === 'clinica' ? 'clinical-tone-blue' : group.id === 'operacao' ? 'clinical-tone-teal' : 'clinical-tone-slate')}><Icon className="w-4 h-4" aria-hidden="true" /></span>
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
