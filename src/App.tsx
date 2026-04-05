import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { PermissionsProvider, usePermissions, ModuleName } from "@/contexts/PermissionsContext";
import React, { Suspense } from "react";

// Eagerly loaded
import Home from "./pages/Home";
import Login from "./pages/Login";

// Lazy loaded
const AgendarOnline               = React.lazy(() => import("./pages/AgendarOnline"));
const PortalPaciente              = React.lazy(() => import("./pages/PortalPaciente"));
const PainelLayout                = React.lazy(() => import("./components/PainelLayout"));
const Dashboard                   = React.lazy(() => import("./pages/painel/Dashboard"));
const Agenda                      = React.lazy(() => import("./pages/painel/Agenda"));
const FilaEspera                  = React.lazy(() => import("./pages/painel/FilaEspera"));
const Pacientes                   = React.lazy(() => import("./pages/painel/Pacientes"));
const Atendimentos                = React.lazy(() => import("./pages/painel/Atendimentos"));
const Relatorios                  = React.lazy(() => import("./pages/painel/Relatorios"));
const Funcionarios                = React.lazy(() => import("./pages/painel/Funcionarios"));
const UnidadesSalas               = React.lazy(() => import("./pages/painel/UnidadesSalas"));
const Disponibilidade             = React.lazy(() => import("./pages/painel/Disponibilidade"));
const Configuracoes               = React.lazy(() => import("./pages/painel/Configuracoes"));
const Prontuario                  = React.lazy(() => import("./pages/painel/Prontuario"));
const Auditoria                   = React.lazy(() => import("./pages/painel/Auditoria"));
const Triagem                     = React.lazy(() => import("./pages/painel/Triagem"));
const Bloqueios                   = React.lazy(() => import("./pages/painel/Bloqueios"));
const Tratamentos                 = React.lazy(() => import("./pages/painel/Tratamentos"));
const Regulacao                   = React.lazy(() => import("./pages/painel/Regulacao"));
const AvaliacaoEnfermagem         = React.lazy(() => import("./pages/painel/AvaliacaoEnfermagem"));
const AvaliacaoMultiprofissional  = React.lazy(() => import("./pages/painel/AvaliacaoMultiprofissional"));
const PTSPage                     = React.lazy(() => import("./pages/painel/PTS"));
const Permissoes                  = React.lazy(() => import("./pages/painel/Permissoes"));
const NotFound                    = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1, // 1 minute — avoids repeated requests but stays fresh
      gcTime: 1000 * 60 * 10,   // 10 minutes garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Export for use in hooks/contexts that need to invalidate queries
export { queryClient };

// ─── LOADERS ──────────────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const AccessDenied = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
    <div className="text-5xl">🔒</div>
    <h2 className="text-xl font-bold text-gray-800">Acesso não autorizado</h2>
    <p className="text-gray-500 text-sm max-w-xs">
      Você não tem permissão para acessar esta página. Fale com o administrador.
    </p>
    <button
      onClick={() => window.history.back()}
      className="mt-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90"
    >
      Voltar
    </button>
  </div>
);

// ─── GUARDS ───────────────────────────────────────────────────────────────────
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const LoginRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/painel" replace />;
  return <Login />;
};

// Guard por módulo — bloqueia acesso direto pela URL
const ModuleRoute: React.FC<{
  children: React.ReactNode;
  modulo: ModuleName;
  masterOnly?: boolean;
}> = ({ children, modulo, masterOnly = false }) => {
  const { user } = useAuth();
  const { can, loading } = usePermissions();

  // Aguarda permissões carregarem antes de decidir
  if (loading) return <PageLoader />;

  const isMaster = user?.role?.toLowerCase().trim() === 'master';

  if (masterOnly && !isMaster) return <AccessDenied />;
  if (!isMaster && !can(modulo, 'can_view')) return <AccessDenied />;

  return <>{children}</>;
};

// ─── APP ──────────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <DataProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<LoginRedirect />} />
                  <Route path="/agendar" element={<AgendarOnline />} />
                  <Route path="/portal" element={<PortalPaciente />} />

                  <Route
                    path="/painel"
                    element={
                      <ProtectedRoute>
                        <PainelLayout />
                      </ProtectedRoute>
                    }
                  >
                    {/* Dashboard — visível para todos autenticados */}
                    <Route index element={<Dashboard />} />

                    {/* Rotas protegidas por módulo */}
                    <Route path="agenda" element={
                      <ModuleRoute modulo="agenda">
                        <Agenda />
                      </ModuleRoute>
                    } />
                    <Route path="fila" element={
                      <ModuleRoute modulo="fila">
                        <FilaEspera />
                      </ModuleRoute>
                    } />
                    <Route path="pacientes" element={
                      <ModuleRoute modulo="pacientes">
                        <Pacientes />
                      </ModuleRoute>
                    } />
                    <Route path="atendimentos" element={
                      <ModuleRoute modulo="atendimento">
                        <Atendimentos />
                      </ModuleRoute>
                    } />
                    <Route path="relatorios" element={
                      <ModuleRoute modulo="relatorios">
                        <Relatorios />
                      </ModuleRoute>
                    } />
                    <Route path="funcionarios" element={
                      <ModuleRoute modulo="usuarios">
                        <Funcionarios />
                      </ModuleRoute>
                    } />
                    <Route path="unidades" element={
                      <ModuleRoute modulo="usuarios">
                        <UnidadesSalas />
                      </ModuleRoute>
                    } />
                    <Route path="disponibilidade" element={
                      <ModuleRoute modulo="usuarios">
                        <Disponibilidade />
                      </ModuleRoute>
                    } />
                    <Route path="prontuario" element={
                      <ModuleRoute modulo="prontuario">
                        <Prontuario />
                      </ModuleRoute>
                    } />
                    <Route path="auditoria" element={
                      <ModuleRoute modulo="relatorios">
                        <Auditoria />
                      </ModuleRoute>
                    } />
                    <Route path="triagem" element={
                      <ModuleRoute modulo="triagem">
                        <Triagem />
                      </ModuleRoute>
                    } />
                    <Route path="bloqueios" element={
                      <ModuleRoute modulo="agenda">
                        <Bloqueios />
                      </ModuleRoute>
                    } />
                    <Route path="tratamentos" element={
                      <ModuleRoute modulo="tratamento">
                        <Tratamentos />
                      </ModuleRoute>
                    } />
                    <Route path="regulacao" element={
                      <ModuleRoute modulo="encaminhamento">
                        <Regulacao />
                      </ModuleRoute>
                    } />
                    <Route path="enfermagem" element={
                      <ModuleRoute modulo="enfermagem">
                        <AvaliacaoEnfermagem />
                      </ModuleRoute>
                    } />
                    <Route path="pts" element={
                      <ModuleRoute modulo="prontuario">
                        <PTSPage />
                      </ModuleRoute>
                    } />
                    <Route path="multiprofissional" element={
                      <ModuleRoute modulo="atendimento">
                        <AvaliacaoMultiprofissional />
                      </ModuleRoute>
                    } />

                    {/* Rotas exclusivas master */}
                    <Route path="configuracoes" element={
                      <ModuleRoute modulo="usuarios" masterOnly>
                        <Configuracoes />
                      </ModuleRoute>
                    } />
                    <Route path="permissoes" element={
                      <ModuleRoute modulo="usuarios" masterOnly>
                        <Permissoes />
                      </ModuleRoute>
                    } />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </DataProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
