import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, Calendar, Users, ClipboardList, FileText, 
  Settings, Building2, UserCog, ListOrdered, LogOut, Menu, X,
  Activity, CalendarClock, Stethoscope
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logoSms from '@/assets/logo-sms.jpeg';

const menuItems = [
  { to: '/painel', label: 'Dashboard', icon: LayoutDashboard, roles: ['master', 'coordenador', 'gestao'] },
  { to: '/painel/agenda', label: 'Agenda', icon: Calendar, roles: ['master', 'coordenador', 'recepcao', 'profissional'] },
  { to: '/painel/agenda-google', label: 'Agenda Google', icon: CalendarClock, roles: ['master', 'coordenador'] },
  { to: '/painel/fila', label: 'Fila de Espera', icon: ListOrdered, roles: ['master', 'coordenador', 'recepcao'] },
  { to: '/painel/pacientes', label: 'Pacientes', icon: Users, roles: ['master', 'coordenador', 'recepcao', 'profissional'] },
  { to: '/painel/atendimentos', label: 'Atendimentos', icon: ClipboardList, roles: ['master', 'coordenador', 'recepcao', 'profissional'] },
  { to: '/painel/prontuario', label: 'Prontuário', icon: Stethoscope, roles: ['master', 'coordenador', 'profissional'] },
  { to: '/painel/relatorios', label: 'Relatórios', icon: FileText, roles: ['master', 'coordenador', 'gestao'] },
  { to: '/painel/funcionarios', label: 'Funcionários', icon: UserCog, roles: ['master', 'coordenador'] },
  { to: '/painel/unidades', label: 'Unidades/Salas', icon: Building2, roles: ['master', 'coordenador'] },
  { to: '/painel/disponibilidade', label: 'Disponibilidade', icon: Activity, roles: ['master', 'coordenador'] },
  { to: '/painel/configuracoes', label: 'Configurações', icon: Settings, roles: ['master'] },
];

const PainelLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredMenu = menuItems.filter(item => 
    hasPermission(item.roles as any[])
  );

  const roleLabels: Record<string, string> = {
    master: 'Master',
    coordenador: 'Coordenador',
    recepcao: 'Recepção',
    profissional: 'Profissional',
    gestao: 'Gestão',
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-5 border-b border-sidebar-border">
          <h2 className="text-lg font-bold font-display text-sidebar-foreground">SMS Oriximiná</h2>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">Secretaria Municipal de Saúde</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredMenu.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/painel'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.nome}</p>
            <p className="text-xs text-sidebar-foreground/50">{roleLabels[user?.role || '']}</p>
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
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.setor} • {user?.cargo}
          </span>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default PainelLayout;
