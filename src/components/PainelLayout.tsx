import React, { useState, Suspense, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { usePermissions, ModuleName } from '@/contexts/PermissionsContext';
import {
  LayoutDashboard, Calendar, Users, ClipboardList, FileText,
  Settings, Building2, UserCog, ListOrdered, LogOut, Menu,
  Activity, CalendarClock, Stethoscope, ShieldCheck, HeartPulse,
  ClipboardList as ClipboardListIcon, BookOpen, Lock, History, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import logoSms from '@/assets/logo-sms.jpeg';
import WhatsappPausedBanner from '@/components/WhatsappPausedBanner';

// Mapeamento: cada item do menu exige um módulo + ação do PermissionsContext
const menuItems: {
  to: string;
  label: string;
  icon: React.ElementType;
  modulo: ModuleName | null;
  roles_master_only?: boolean;
  hide_from_master?: boolean;
}[] = [
  { to: '/painel',                  label: 'Dashboard',              icon: LayoutDashboard,    modulo: null },
  { to: '/painel/agenda',           label: 'Agenda',                 icon: Calendar,           modulo: 'agenda' },
  { to: '/painel/fila',             label: 'Fila de Espera',         icon: ListOrdered,        modulo: 'fila' },
  { to: '/painel/pacientes',        label: 'Pacientes',              icon: Users,              modulo: 'pacientes' },
  { to: '/painel/atendimentos',     label: 'Atendimentos',           icon: ClipboardList,      modulo: 'atendimento' },
  { to: '/painel/tratamentos',      label: 'Gestão de Tratamentos',  icon: Activity,           modulo: 'tratamento' },
  
  { to: '/painel/prontuario',       label: 'Prontuário',             icon: Stethoscope,        modulo: 'prontuario' },
  { to: '/painel/triagem',          label: 'Triagem',                icon: HeartPulse,         modulo: 'triagem' },
  { to: '/painel/historico-triagem', label: 'Histórico Triagem',      icon: History,            modulo: 'triagem' },
  { to: '/painel/enfermagem',       label: 'Avaliação Enfermagem',   icon: Stethoscope,        modulo: 'enfermagem' },
  { to: '/painel/pts',              label: 'PTS',                    icon: FileText,           modulo: 'prontuario' },
  { to: '/painel/multiprofissional',label: 'Avaliação Multi',        icon: BookOpen,           modulo: 'atendimento' },
  { to: '/painel/alta',              label: 'Relatório de Alta',      icon: FileText,           modulo: 'prontuario' },
  { to: '/painel/encaminhamentos',  label: 'Encaminhamentos',        icon: Send,               modulo: 'encaminhamento' },
  { to: '/painel/relatorios',       label: 'Relatórios',             icon: FileText,           modulo: 'relatorios' },
  { to: '/painel/bpa-producao',     label: 'BPA-Produção',           icon: FileText,           modulo: 'relatorios' },
  { to: '/painel/funcionarios',     label: 'Funcionários',           icon: UserCog,            modulo: 'usuarios' },
  
  { to: '/painel/unidades',         label: 'Unidades/Salas',         icon: Building2,          modulo: 'usuarios' },
  { to: '/painel/disponibilidade',  label: 'Disponibilidade',        icon: CalendarClock,      modulo: 'usuarios' },
  { to: '/painel/bloqueios',        label: 'Feriados/Bloqueios',     icon: CalendarClock,      modulo: 'agenda' },
  { to: '/painel/auditoria',        label: 'Logs & Auditoria',       icon: ShieldCheck,        modulo: 'relatorios' },
  { to: '/painel/meu-prontuario',   label: 'Meu Prontuário',         icon: Settings,           modulo: 'prontuario', hide_from_master: true },
  { to: '/painel/configuracoes',    label: 'Configurações',          icon: Settings,           modulo: null, roles_master_only: true },
  { to: '/painel/permissoes',       label: 'Permissões',             icon: Lock,               modulo: null, roles_master_only: true },
  { to: '/painel/configuracoes-avancadas', label: 'Config. Avançadas', icon: Settings,           modulo: null, roles_master_only: true },
];

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
  const { unidades } = useData();
  const { can, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isMaster = user?.role?.toLowerCase().trim() === 'master';

  // Resolve display name for the current user's unit
  const unitDisplayName = useMemo(() => {
    if (isGlobalAdmin) return 'SMS Oriximiná';
    const userUnit = unidades.find(u => u.id === user?.unidadeId);
    return userUnit?.nomeExibicao || userUnit?.nome || 'Sistema';
  }, [isGlobalAdmin, unidades, user?.unidadeId]);

  // Auto-close sidebar on route change (mobile)
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isItemVisible = (item: typeof menuItems[0]): boolean => {
    // roles_master_only: accessible by any master (global or unit)
    if (item.roles_master_only) return isMaster;
    if (item.hide_from_master && isMaster) return false;
    if (isMaster) return true;
    if (item.modulo === null) return true;
    return can(item.modulo, 'can_view');
  };

  const filteredMenu = menuItems.filter(isItemVisible);

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
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          <img src={logoSms} alt="SMS Oriximiná" className="w-10 h-10 rounded-xl object-cover ring-2 ring-sidebar-primary/20" />
          <div>
            <h2 className="text-lg font-bold font-display text-sidebar-foreground leading-tight truncate max-w-[160px]">{unitDisplayName}</h2>
            <p className="text-xs text-sidebar-foreground/60">Oriximiná</p>
          </div>
        </div>

        {/* Loading de permissões */}
        {permLoading && (
          <div className="px-4 py-2 text-xs text-sidebar-foreground/40 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse inline-block" />
            Carregando permissões...
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {filteredMenu.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/painel'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm sidebar-active-glow"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.nome}</p>
            <p className="text-xs text-sidebar-foreground/50">
              {roleLabels[user?.role?.toLowerCase().trim() || ''] || user?.role}
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
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden sm:block ml-2">
            {user?.setor && `${user.setor} • `}{user?.cargo}
          </span>
        </header>

        <WhatsappPausedBanner />

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default PainelLayout;