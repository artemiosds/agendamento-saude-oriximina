import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import AgendarOnline from "./pages/AgendarOnline";
import PortalPaciente from "./pages/PortalPaciente";
import PainelLayout from "./components/PainelLayout";
import Dashboard from "./pages/painel/Dashboard";
import Agenda from "./pages/painel/Agenda";
import AgendaGoogle from "./pages/painel/AgendaGoogle";
import FilaEspera from "./pages/painel/FilaEspera";
import Pacientes from "./pages/painel/Pacientes";
import Atendimentos from "./pages/painel/Atendimentos";
import Relatorios from "./pages/painel/Relatorios";
import Funcionarios from "./pages/painel/Funcionarios";
import UnidadesSalas from "./pages/painel/UnidadesSalas";
import Disponibilidade from "./pages/painel/Disponibilidade";
import Configuracoes from "./pages/painel/Configuracoes";
import Prontuario from "./pages/painel/Prontuario";
import Auditoria from "./pages/painel/Auditoria";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const LoginRedirect: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
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
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<LoginRedirect />} />
              <Route path="/agendar" element={<AgendarOnline />} />
              <Route path="/portal" element={<PortalPaciente />} />
              <Route path="/painel" element={<ProtectedRoute><PainelLayout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="agenda-google" element={<AgendaGoogle />} />
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
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
