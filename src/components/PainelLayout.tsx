import React, { useState, Suspense, useMemo } from 'react';
import { Link, matchPath, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { usePermissions, ModuleName } from '@/contexts/PermissionsContext';
import {
  LayoutDashboard, Calendar, Users, ClipboardList, FileText,
  Settings, Building2, UserCog, ListOrdered, LogOut, Menu,
  Activity, CalendarClock, Stethoscope, ShieldCheck, HeartPulse,
  ClipboardList as ClipboardListIcon, BookOpen, Lock, History, Send, ChevronDown, MonitorDot, Search, Star, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import logoSms from '@/assets/logo-sms-transparente.png';
import { useBrand } from '@/hooks/useBrand';
import { useLicense } from '@/hooks/useLicense';
import { isPathLicensed } from '@/lib/licenseModules';
import QuickSearch from '@/components/QuickSearch';
import WhatsappPausedBanner from '@/components/WhatsappPausedBanner';

// Mapeamento: cada item do menu exige um módulo + ação do PermissionsContext
type MenuItem = {
  to: string;
  search?: string;
  label: string;
  icon: React.ElementType;
  modulo: ModuleName | null;
  roles_master_only?: boolean;
  owner_only?: boolean;
  hide_from_master?: boolean;
};

type MenuGroup = {
  id: string;
  title: string | null;
  icon?: React.ElementType;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    id: 'principal',
    title: null,
    items: [
      { to: '/painel', label: 'Dashboard', icon: LayoutDashboard, modulo: null },
    ],
  },
  {
    id: 'recepcao',
    title: 'Recepção e Fluxo do Paciente',
    icon: Users,
    items: [
      { to: '/painel/agenda', label: 'Agenda Diária', icon: Calendar, modulo: 'agenda' },
      { to: '/painel/fila', label: 'Fila de Espera', icon: ListOrdered, modulo: 'fila' },
      { to: '/painel/pacientes', label: 'Pacientes', icon: Users, modulo: 'pacientes' },
      { to: '/painel/exames', label: 'Exames Diagnósticos', icon: FileText, modulo: 'agenda' },
      { to: '/painel/faltosos', label: 'Faltosos', icon: Users, modulo: 'faltosos' },
      { to: '/painel/encaminhamentos', label: 'Encaminhamentos', icon: Send, modulo: 'encaminhamento' },
    ],
  },
  {
    id: 'clinica',
    title: 'Atendimento Clínico',
    icon: Stethoscope,
    items: [
      { to: '/painel/prontuario', label: 'Prontuários', icon: Stethoscope, modulo: 'prontuario' },
      { to: '/painel/tratamentos', label: 'Gestão de Tratamentos', icon: Activity, modulo: 'tratamento' },
      { to: '/painel/triagem', label: 'Triagem', icon: HeartPulse, modulo: 'triagem' },
      { to: '/painel/atendimentos', label: 'Atendimentos', icon: ClipboardList, modulo: 'atendimento' },
      { to: '/painel/historico-triagem', label: 'Histórico da Triagem', icon: History, modulo: 'historico_triagem' },
      { to: '/painel/enfermagem', label: 'Avaliação de Enfermagem', icon: Stethoscope, modulo: 'avaliacao_enfermagem' },
      { to: '/painel/pts', label: 'PTS', icon: ClipboardListIcon, modulo: 'pts' },
      { to: '/painel/multiprofissional', label: 'Avaliação Multiprofissional', icon: BookOpen, modulo: 'avaliacao_multi' },
      { to: '/painel/alta', label: 'Relatório de Alta', icon: FileText, modulo: 'relatorio_alta' },
      { to: '/painel/meu-prontuario', label: 'Meu Prontuário', icon: Stethoscope, modulo: 'prontuario', hide_from_master: true },
    ],
  },
  {
    id: 'producao',
    title: 'Faturamento e Produção SUS',
    icon: FileText,
    items: [
      { to: '/painel/bpa-exportar', label: 'Exportação BPA', icon: FileText, modulo: 'bpa_exportar' },
      { to: '/painel/procedimentos-sigtap', label: 'Consulta SIGTAP', icon: FileText, modulo: 'prontuario' },
      { to: '/painel/relatorios', label: 'Relatórios', icon: FileText, modulo: 'relatorios' },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão e Escalas',
    icon: CalendarClock,
    items: [
      { to: '/painel/disponibilidade', search: '?aba=escala', label: 'Escala dos Profissionais', icon: Calendar, modulo: 'disponibilidade' },
      { to: '/painel/funcionarios', label: 'Funcionários', icon: UserCog, modulo: 'usuarios' },
      { to: '/painel/unidades', label: 'Unidades e Salas', icon: Building2, modulo: 'unidades_salas' },
      { to: '/painel/disponibilidade', label: 'Disponibilidade', icon: CalendarClock, modulo: 'disponibilidade' },
      { to: '/painel/bloqueios', label: 'Feriados e Bloqueios', icon: CalendarClock, modulo: 'feriados_bloqueios' },
      { to: '/painel/cockpit-ao-vivo', label: 'Cockpit ao Vivo', icon: Activity, modulo: 'cockpit_unidade' },
      { to: '/painel/portal-acessos', label: 'Acessos ao Portal', icon: UserCog, modulo: 'usuarios' },
      { to: '/painel/auditoria', label: 'Auditoria', icon: ShieldCheck, modulo: 'logs_auditoria' },
      { to: '/painel/monitoramento', label: 'Monitoramento', icon: MonitorDot, modulo: 'monitoramento_sistema' },
      { to: '/painel/configuracoes', label: 'Configurações', icon: Settings, modulo: null, roles_master_only: true },
      { to: '/painel/permissoes', label: 'Permissões', icon: Lock, modulo: null, roles_master_only: true },
      { to: '/painel/configuracoes-avancadas', label: 'Gestão Operacional e Dados', icon: Settings, modulo: null, roles_master_only: true },
    ],
  },
];

const SIDEBAR_GROUPS_STORAGE_KEY = 'sidebar-workflow-groups-v1';
const SIDEBAR_FAVORITES_STORAGE_KEY = 'sidebar-quick-access-v1';
const itemDestination = (item: MenuItem) => item.to + (item.search || '');
const normalizeModuleSearch = (value: string) =>
  value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function readSidebarFavorites(): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SIDEBAR_FAVORITES_STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, items]) =>
      Array.isArray(items) && items.every(item => typeof item === 'string')));
  } catch {
    return {};
  }
}
const defaultGroupByRole: Record<string, string> = {
  master: 'gestao', gestor: 'gestao', gestao: 'gestao', coordenador: 'gestao',
  recepcao: 'recepcao', profissional: 'clinica', tecnico: 'clinica',
  tecnico_enfermagem: 'clinica', enfermagem: 'clinica',
};

const roleLabels: Record<string, string> = {
  master:             'Master',
  gestor:             'Gestor',
  coordenador:        'Coordenador',
  recepcao:           'Recepção',
  profissional:       'Profissional de Saúde',
  gestao:             'Gestão',
  tecnico:            'Triagem',
  tecnico_enfermagem: 'Técnico de Enfermagem',
  enfermagem:         'Enfermagem',
};


const PainelLayout: React.FC = () => {
  const { user, logout, isGlobalAdmin } = useAuth();
  const { unidades } = useOperacional();
  const brand = useBrand();
  const { license, loading: licenseLoading, source: licenseSource, status: licenseStatus } = useLicense();
  const { can, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [savedFavorites, setSavedFavorites] = useState(readSidebarFavorites);

  const role = user?.role?.toLowerCase().trim() || '';
  const isMaster = role === 'master';

  // Resolve display name for the current user's unit
  const unitDisplayName = useMemo(() => {
    if (isGlobalAdmin) return brand.titulo;
    const userUnit = unidades.find(u => u.id === user?.unidadeId);
    return userUnit?.nomeExibicao || userUnit?.nome || 'Sistema';
  }, [isGlobalAdmin, unidades, user?.unidadeId, brand.titulo]);

  // Auto-close sidebar on route change (mobile)
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isItemVisible = (item: MenuItem): boolean => {
    if (licenseLoading || !isPathLicensed(item.to, license)) return false;
    if (item.owner_only) return isGlobalAdmin;
    // roles_master_only: accessible by any master (global or unit)
    if (item.roles_master_only) return isMaster;
    if (item.hide_from_master && isMaster) return false;
    if (isMaster) return true;
    if (item.modulo === null) return true;
    return can(item.modulo, 'can_view');
  };

  const filteredGroups = useMemo(
    () =>
      menuGroups
        .map(g => ({ ...g, items: g.items.filter(isItemVisible) }))
        .filter(g => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMaster, isGlobalAdmin, can, permLoading, license, licenseLoading]
  );

  const searchPaths = new Set(filteredGroups.flatMap(group => group.items.map(item => item.to)));
  const showingSchedule = new URLSearchParams(location.search).get('aba') === 'escala';
  const matchesItem = (item: MenuItem) => {
    if (!matchPath({ path: item.to, end: item.to === '/painel' }, location.pathname)) return false;
    return item.to !== '/painel/disponibilidade' || Boolean(item.search) === showingSchedule;
  };
  const currentGroup = filteredGroups.find(group => group.items.some(matchesItem));
  const activeGroup = currentGroup?.title ? currentGroup.id : undefined;
  const currentItem = currentGroup?.items.find(matchesItem);
  const defaultGroup = filteredGroups.find(group => group.id === defaultGroupByRole[role])
    ?? filteredGroups.find(group => group.title);

  const [savedGroups, setSavedGroups] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  });
  const [collapsedLocation, setCollapsedLocation] = useState<string>();
  const preferenceKey = (user?.id || 'anon') + ':' + role;
  const currentLocationKey = preferenceKey + ':' + location.key;
  React.useEffect(() => setCollapsedLocation(undefined), [currentLocationKey]);
  const favoritesKey = JSON.stringify([user?.id || '', role, user?.unidadeId || '', isGlobalAdmin]);
  React.useEffect(() => setModuleSearch(''), [favoritesKey, location.key]);

  // Search and favorites only use the existing, permission- and license-filtered menu.
  // Destinations include query strings to distinguish Escala from Disponibilidade.
  const visibleItems = filteredGroups.flatMap(group => group.items);
  const visibleByDestination = new Map(visibleItems.map(item => [itemDestination(item), item]));
  const suggestedFavorites = (defaultGroup?.items || []).slice(0, 3).map(itemDestination);
  const favoriteDestinations = Array.from(new Set(savedFavorites[favoritesKey] ?? suggestedFavorites));
  const favorites = permLoading || licenseLoading ? [] : favoriteDestinations
    .map(destination => visibleByDestination.get(destination))
    .filter((item): item is MenuItem => !!item);
  const searchTerm = normalizeModuleSearch(moduleSearch);
  const searching = !!searchTerm;
  const displayedGroups = searching
    ? filteredGroups.map(group => ({
        ...group,
        items: group.items.filter(item =>
          normalizeModuleSearch(item.label).includes(searchTerm) ||
          normalizeModuleSearch(group.title || '').includes(searchTerm)),
      })).filter(group => group.items.length > 0)
    : filteredGroups;

  const toggleFavorite = (item: MenuItem) => {
    if (!user?.id || permLoading || licenseLoading) return;
    const destination = itemDestination(item);
    if (!visibleByDestination.has(destination)) return;
    const nextDestinations = favoriteDestinations.includes(destination)
      ? favoriteDestinations.filter(value => value !== destination)
      : [...favoriteDestinations, destination];
    const next = { ...savedFavorites, [favoritesKey]: nextDestinations };
    setSavedFavorites(next);
    try { localStorage.setItem(SIDEBAR_FAVORITES_STORAGE_KEY, JSON.stringify(next)); } catch { /* Preferência local opcional. */ }
  };

  const isExpanded = (group: MenuGroup) => {
    if (!group.title) return true;
    if (group.id === activeGroup) return collapsedLocation !== currentLocationKey;
    return savedGroups[preferenceKey]?.[group.id] ?? (!activeGroup && group.id === defaultGroup?.id);
  };

  const toggleGroup = (group: MenuGroup) => {
    const open = !isExpanded(group);
    if (group.id === activeGroup) setCollapsedLocation(open ? undefined : currentLocationKey);
    const next = { ...savedGroups, [preferenceKey]: { ...savedGroups[preferenceKey], [group.id]: open } };
    setSavedGroups(next);
    try { localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY, JSON.stringify(next)); } catch { /* Preferência opcional. */ }
  };

  const renderMenuItem = (item: MenuItem) => {
    const isActive = item === currentItem;
    const destination = itemDestination(item);
    const isFavorite = favoriteDestinations.includes(destination);
    return (
      <div key={destination} className="flex items-center gap-0.5 min-w-0">
        <Link
          to={destination}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => { setSidebarOpen(false); setModuleSearch(''); }}
          className={cn(
            "relative flex min-h-10 flex-1 min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-primary",
            isActive
              ? "bg-sidebar-primary/20 font-semibold text-sidebar-foreground ring-1 ring-inset ring-sidebar-primary/50"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          <span className="min-w-0 break-words">{item.label}</span>
        </Link>
        {!permLoading && !licenseLoading && user?.id && (
          <button
            type="button"
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Remover ' + item.label + ' do acesso rápido' : 'Fixar ' + item.label + ' no acesso rápido'}
            title={isFavorite ? 'Remover do acesso rápido' : 'Fixar no acesso rápido'}
            onClick={() => toggleFavorite(item)}
            className={cn(
              "flex h-9 w-8 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary hover:bg-sidebar-accent",
              isFavorite ? "text-sidebar-primary" : "text-sidebar-foreground/55 hover:text-sidebar-foreground"
            )}
          >
            <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay — no blur, just dim */}
      <AnimatePresence>
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-foreground/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside id="painel-sidebar" className={cn(
        "fixed inset-y-0 left-0 z-50 h-dvh w-72 sm:w-64 max-w-[85vw] bg-sidebar flex flex-col transition-transform duration-300 shadow-2xl lg:sticky lg:top-0 lg:self-start lg:shadow-none",
        sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible lg:translate-x-0"
      )}>
        <div className="p-5 border-b border-sidebar-border flex shrink-0 items-center gap-3">
          <img src={brand.logoUrl} alt={brand.titulo} className="w-12 h-12 shrink-0 rounded-xl bg-white p-0.5 object-contain ring-2 ring-sidebar-primary/20" onError={(e) => { (e.currentTarget as HTMLImageElement).src = logoSms; }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold font-display text-sidebar-foreground leading-tight truncate max-w-[160px]">{unitDisplayName}</h2>
            <p className="text-xs text-sidebar-foreground/60 truncate max-w-[160px]">{isGlobalAdmin ? brand.subtitulo : brand.titulo}</p>
          </div>
        </div>

        {/* Loading de permissões */}
        {permLoading && (
          <div className="px-4 py-2 text-xs text-sidebar-foreground/40 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse inline-block" />
            Carregando permissões...
          </div>
        )}

        <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-3">
          {!permLoading && !licenseLoading && (
            <div className="space-y-2 pb-2 border-b border-sidebar-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/60 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={moduleSearch}
                  onChange={event => setModuleSearch(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Escape') setModuleSearch(''); }}
                  placeholder="Localizar módulo..."
                  aria-label="Localizar módulo"
                  className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/50 pl-8 pr-8 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary [&::-webkit-search-cancel-button]:hidden"
                />
                {moduleSearch && <button type="button" aria-label="Limpar busca de módulos" title="Limpar busca" onClick={() => setModuleSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {!searching && (
                <section aria-label="Acesso rápido" className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                    <Star className="h-3 w-3" aria-hidden="true" /> Acesso rápido
                  </div>
                  {favorites.length ? favorites.map(renderMenuItem) : <p className="px-2.5 pb-1 text-xs leading-tight text-sidebar-foreground/60">Use a estrela ao lado de um módulo para fixá-lo aqui.</p>}
                </section>
              )}
              {searching && <p role="status" className="px-2 text-xs text-sidebar-foreground/70">{displayedGroups.reduce((sum, group) => sum + group.items.length, 0)} módulo(s) encontrado(s)</p>}
            </div>
          )}
          {searching && !permLoading && !licenseLoading && displayedGroups.length === 0 && <p className="px-2.5 py-3 text-xs text-sidebar-foreground/70">Nenhum módulo encontrado. Tente outro termo.</p>}
          {displayedGroups.map(group => {
            const expanded = searching || isExpanded(group);
            const containsCurrent = group.id === activeGroup;
            const groupRegionId = 'menu-grupo-' + group.id;
            return (
              <div key={group.id} className={cn(group.title && "space-y-1", !group.title && "mb-2 border-b border-sidebar-border pb-2")}>
                {group.title && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    disabled={searching}
                    aria-expanded={expanded}
                    aria-controls={groupRegionId}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-primary",
                      containsCurrent
                        ? "bg-sidebar-primary/15 text-sidebar-foreground"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {group.icon && <group.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">{group.title}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 opacity-80 transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")}
                      aria-hidden="true"
                    />
                  </button>
                )}
                <div id={group.title ? groupRegionId : undefined} hidden={!expanded}
                  className={cn("space-y-0.5", group.title && "ml-4 border-l border-sidebar-border pl-2")}>
                  {expanded && group.items.map(renderMenuItem)}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 p-4 border-t border-sidebar-border">
          <div className="mb-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.nome}</p>
            <p className="text-xs text-sidebar-foreground/50">
              {isMaster ? (isGlobalAdmin ? 'Master Global' : 'Master de unidade') : roleLabels[role] || user?.role}
            </p>
            {user?.cargo && (
              <p className="text-xs text-sidebar-foreground/40 truncate">{user.cargo}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card/95 backdrop-blur-sm border-b border-border flex items-center px-3 sm:px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-1 h-10 w-10"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-controls="painel-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>
          {/* Título dinâmico da página atual (mobile) */}
          <div className="flex-1 min-w-0 lg:hidden">
            <p className="text-sm font-semibold text-foreground truncate">
              {currentItem?.label || (location.pathname === '/painel' ? 'Dashboard' : '')}
            </p>
          </div>
          <div className="hidden lg:block flex-1" />
          {!permLoading && <QuickSearch
            directory={searchPaths.has('/painel/pacientes')}
            agenda={searchPaths.has('/painel/agenda')}
            prontuario={searchPaths.has('/painel/prontuario')}
            sigtap={searchPaths.has('/painel/procedimentos-sigtap')}
          />}
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden md:block ml-2 truncate max-w-[240px]">
            {user?.setor && `${user.setor} • `}{user?.cargo}
          </span>
        </header>

        <WhatsappPausedBanner />
        {!licenseLoading && licenseSource !== 'local' && licenseStatus !== 'valid' && (
          <div role="alert" className="mx-3 mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            A licença central não foi validada. Os módulos licenciados permanecem bloqueados até a consulta ser regularizada.
          </div>
        )}

        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto safe-bottom">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          }>
            {licenseLoading ? (
              <div className="py-20 text-center text-muted-foreground">Validando licença e módulos autorizados…</div>
            ) : isPathLicensed(location.pathname, license) ? <Outlet /> : (
              <div className="py-20 text-center text-muted-foreground">Este módulo não está ativo nesta instalação.</div>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default PainelLayout;
