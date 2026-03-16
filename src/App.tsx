import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import React, { Suspense } from "react";

// Eagerly loaded (landing + login)
import Home from "./pages/Home";
import Login from "./pages/Login";

// Lazy loaded pages (code splitting)
const AgendarOnline = React.lazy(() => import("./pages/AgendarOnline"));
const PortalPaciente = React.lazy(() => import("./pages/PortalPaciente"));
const PainelLayout = React.lazy(() => import("./components/PainelLayout"));
const Dashboard = React.lazy(() => import("./pages/painel/Dashboard"));
const Agenda = React.lazy(() => import("./pages/painel/Agenda"));
const FilaEspera = React.lazy(() => import("./pages/painel/FilaEspera"));
const Pacientes = React.lazy(() => import("./pages/painel/Pacientes"));
const Atendimentos = React.lazy(() => import("./pages/painel/Atendimentos"));
const Relatorios = React.lazy(() => import("./pages/painel/Relatorios"));
const Funcionarios = React.lazy(() => import("./pages/painel/Funcionarios"));
const UnidadesSalas = React.lazy(() => import("./pages/painel/UnidadesSalas"));
const Disponibilidade = React.lazy(() => import("./pages/painel/Disponibilidade"));
const Configuracoes = React.lazy(() => import("./pages/painel/Configuracoes"));
const Prontuario = React.lazy(() => import("./pages/painel/Prontuario"));
const Auditoria = React.lazy(() => import("./pages/painel/Auditoria"));
const Triagem = React.lazy(() => import("./pages/painel/Triagem"));
const Bloqueios = React.lazy(() => import("./pages/painel/Bloqueios"));
const Tratamentos = React.lazy(() => import("./pages/painel/Tratamentos"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<LoginRedirect />} />
                <Route path="/agendar" element={<AgendarOnline />} />
                <Route path="/portal" element={<PortalPaciente />} />
                <Route path="/painel" element={<ProtectedRoute><PainelLayout /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="agenda" element={<Agenda />} />
                  <Route path="fila" element={<FilaEspera />} />
                  <Route path="pacientes" element={<Pacientes />} />
                  <Route path="atendimentos" element={<Atendimentos />} />
                  <Route path="relatorios" element={<Relatorios />} />
                  <Route path="funcionarios" element={<Funcionarios />} />
                  <Route path="unidades" element={<UnidadesSalas />} />
                  <Route path="disponibilidade" element={<Disponibilidade />} />
                  <Route path="configuracoes" element={<Configuracoes />} />
                  <Route path="prontuario" element={<Prontuario />} />
                  <Route path="auditoria" element={<Auditoria />} />
                  <Route path="triagem" element={<Triagem />} />
                  <Route path="bloqueios" element={<Bloqueios />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
