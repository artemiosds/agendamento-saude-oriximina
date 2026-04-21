import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { PermissionsProvider, usePermissions, ModuleName } from "@/contexts/PermissionsContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import React, { Suspense } from "react";

// Helper: retry dynamic import once, then force full reload to bust stale chunks
function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory().catch(() => {
      // If the chunk 404'd, the deploy changed — reload from server once
      const key = 'chunk_reload';
      const last = sessionStorage.getItem(key);
      const now = String(Date.now());
      if (!last || Number(now) - Number(last) > 10_000) {
        sessionStorage.setItem(key, now);
        window.location.reload();
      }
      // fallback: re-throw so ErrorBoundary catches it
      return factory();
    }),
  );
}

// Eagerly loaded
import Home from "./pages/Home";
import Login from "./pages/Login";

// Lazy loaded with retry
const AgendarOnline               = lazyRetry(() => import("./pages/AgendarOnline"));
const PortalPaciente              = lazyRetry(() => import("./pages/PortalPaciente"));
const PainelLayout                = lazyRetry(() => import("./components/PainelLayout"));
const Dashboard                   = lazyRetry(() => import("./pages/painel/Dashboard"));
const Agenda                      = lazyRetry(() => import("./pages/painel/Agenda"));
const FilaEspera                  = lazyRetry(() => import("./pages/painel/FilaEspera"));
const Pacientes                   = lazyRetry(() => import("./pages/painel/Pacientes"));
const Atendimentos                = lazyRetry(() => import("./pages/painel/Atendimentos"));
const Relatorios                  = lazyRetry(() => import("./pages/painel/Relatorios"));
const Funcionarios                = lazyRetry(() => import("./pages/painel/Funcionarios"));
const UnidadesSalas               = lazyRetry(() => import("./pages/painel/UnidadesSalas"));
const Disponibilidade             = lazyRetry(() => import("./pages/painel/Disponibilidade"));
const Configuracoes               = lazyRetry(() => import("./pages/painel/Configuracoes"));
const Prontuario                  = lazyRetry(() => import("./pages/painel/Prontuario"));
const Auditoria                   = lazyRetry(() => import("./pages/painel/Auditoria"));
const Triagem                     = lazyRetry(() => import("./pages/painel/Triagem"));
const Bloqueios                   = lazyRetry(() => import("./pages/painel/Bloqueios"));
const Tratamentos                 = lazyRetry(() => import("./pages/painel/Tratamentos"));
const Regulacao                   = lazyRetry(() => import("./pages/painel/Regulacao"));
const AvaliacaoEnfermagem         = lazyRetry(() => import("./pages/painel/AvaliacaoEnfermagem"));
const AvaliacaoMultiprofissional  = lazyRetry(() => import("./pages/painel/AvaliacaoMultiprofissional"));
const PTSPage                     = lazyRetry(() => import("./pages/painel/PTS"));
const Permissoes                  = lazyRetry(() => import("./pages/painel/Permissoes"));
const HistoricoTriagem            = lazyRetry(() => import("./pages/painel/HistoricoTriagem"));
const RelatorioAlta               = lazyRetry(() => import("./pages/painel/RelatorioAlta"));
const Encaminhamentos             = lazyRetry(() => import("./pages/painel/Encaminhamentos"));
const ConfiguracoesAvancadas      = lazyRetry(() => import("./pages/painel/ConfiguracoesAvancadas"));
const MeuProntuario               = lazyRetry(() => import("./pages/painel/MeuProntuario"));
const BpaProducao                 = lazyRetry(() => import("./pages/painel/BpaProducao"));

const LoginExterno                = lazyRetry(() => import("./pages/LoginExterno"));
const AgendamentoExterno          = lazyRetry(() => import("./pages/AgendamentoExterno"));
const NotFound                    = lazyRetry(() => import("./pages/NotFound"));

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
    <h2 className="text-xl font-bold text-foreground">Acesso não autorizado</h2>
    <p className="text-muted-foreground text-sm max-w-xs">
      Você não tem permissão para acessar esta página. Fale com o administrador.
    </p>
    <button
      onClick={() => window.history.back()}
      className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
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
    <ThemeProvider>
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
                  <Route path="/agendar" element={<Suspense fallback={<PageLoader />}><AgendarOnline /></Suspense>} />
                  <Route path="/portal" element={<Suspense fallback={<PageLoader />}><PortalPaciente /></Suspense>} />
                  <Route path="/externo" element={<Suspense fallback={<PageLoader />}><LoginExterno /></Suspense>} />
                  <Route path="/externo/agendar" element={<Suspense fallback={<PageLoader />}><AgendamentoExterno /></Suspense>} />

                  {/* PainelLayout has its own internal Suspense for child routes */}
                  <Route
                    path="/painel"
                    element={
                      <ProtectedRoute>
                        <PainelLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="agenda" element={<ModuleRoute modulo="agenda"><Agenda /></ModuleRoute>} />
                    <Route path="fila" element={<ModuleRoute modulo="fila"><FilaEspera /></ModuleRoute>} />
                    <Route path="pacientes" element={<ModuleRoute modulo="pacientes"><Pacientes /></ModuleRoute>} />
                    <Route path="atendimentos" element={<ModuleRoute modulo="atendimento"><Atendimentos /></ModuleRoute>} />
                    <Route path="relatorios" element={<ModuleRoute modulo="relatorios"><Relatorios /></ModuleRoute>} />
                    <Route path="funcionarios" element={<ModuleRoute modulo="usuarios"><Funcionarios /></ModuleRoute>} />
                    
                    <Route path="unidades" element={<ModuleRoute modulo="usuarios"><UnidadesSalas /></ModuleRoute>} />
                    <Route path="disponibilidade" element={<ModuleRoute modulo="usuarios"><Disponibilidade /></ModuleRoute>} />
                    <Route path="prontuario" element={<ModuleRoute modulo="prontuario"><Prontuario /></ModuleRoute>} />
                    <Route path="auditoria" element={<ModuleRoute modulo="relatorios"><Auditoria /></ModuleRoute>} />
                    <Route path="triagem" element={<ModuleRoute modulo="triagem"><Triagem /></ModuleRoute>} />
                    <Route path="historico-triagem" element={<ModuleRoute modulo="triagem"><HistoricoTriagem /></ModuleRoute>} />
                    <Route path="bloqueios" element={<ModuleRoute modulo="agenda"><Bloqueios /></ModuleRoute>} />
                    <Route path="tratamentos" element={<ModuleRoute modulo="tratamento"><Tratamentos /></ModuleRoute>} />
                    <Route path="regulacao" element={<ModuleRoute modulo="encaminhamento"><Regulacao /></ModuleRoute>} />
                    <Route path="enfermagem" element={<ModuleRoute modulo="enfermagem"><AvaliacaoEnfermagem /></ModuleRoute>} />
                    <Route path="pts" element={<ModuleRoute modulo="prontuario"><PTSPage /></ModuleRoute>} />
                    <Route path="multiprofissional" element={<ModuleRoute modulo="atendimento"><AvaliacaoMultiprofissional /></ModuleRoute>} />
                    <Route path="configuracoes" element={<ModuleRoute modulo="usuarios" masterOnly><Configuracoes /></ModuleRoute>} />
                    <Route path="permissoes" element={<ModuleRoute modulo="usuarios" masterOnly><Permissoes /></ModuleRoute>} />
                    <Route path="configuracoes-avancadas" element={<ModuleRoute modulo="usuarios" masterOnly><ConfiguracoesAvancadas /></ModuleRoute>} />
                    <Route path="alta" element={<ModuleRoute modulo="prontuario"><RelatorioAlta /></ModuleRoute>} />
                    <Route path="encaminhamentos" element={<ModuleRoute modulo="encaminhamento"><Encaminhamentos /></ModuleRoute>} />
                    <Route path="meu-prontuario" element={<ModuleRoute modulo="prontuario"><MeuProntuario /></ModuleRoute>} />
                    <Route path="bpa-producao" element={<ModuleRoute modulo="relatorios"><BpaProducao /></ModuleRoute>} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </DataProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
  </QueryClientProvider>
);

export default App;
