import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { Footer } from "@/components/Footer";
import { LoadingScreen } from "@/components/LoadingScreen";

const Dashboard                   = React.lazy(() => import("./pages/painel/Dashboard"));
const Agenda                      = React.lazy(() => import("./pages/painel/Agenda"));
const FilaEspera                  = React.lazy(() => import("./pages/painel/FilaEspera"));
const Pacientes                   = React.lazy(() => import("./pages/painel/Pacientes"));
const Atendimentos                = React.lazy(() => import("./pages/painel/Atendimentos"));
const Triagem                     = React.lazy(() => import("./pages/painel/Triagem"));
const Prontuarios                 = React.lazy(() => import("./pages/painel/Prontuarios"));
const Configuracoes               = React.lazy(() => import("./pages/painel/Configuracoes"));
const Relatorios                  = React.lazy(() => import("./pages/painel/Relatorios"));
const Usuarios                    = React.lazy(() => import("./pages/painel/Usuarios"));
const Unidades                    = React.lazy(() => import("./pages/painel/Unidades"));
const RelatorioAtendimentos       = React.lazy(() => import("./pages/painel/RelatorioAtendimentos"));
const RelatorioFilaEspera         = React.lazy(() => import("./pages/painel/RelatorioFilaEspera"));
const RelatorioAgendamentos       = React.lazy(() => import("./pages/painel/RelatorioAgendamentos"));
const RelatorioPacientes          = React.lazy(() => import("./pages/painel/RelatorioPacientes"));
const RelatorioFinanceiro         = React.lazy(() => import("./pages/painel/RelatorioFinanceiro"));
const RelatorioTriagem            = React.lazy(() => import("./pages/painel/RelatorioTriagem"));
const RelatorioProntuarios        = React.lazy(() => import("./pages/painel/RelatorioProntuarios"));
const RelatorioUsuarios           = React.lazy(() => import("./pages/painel/RelatorioUsuarios"));
const RelatorioUnidades           = React.lazy(() => import("./pages/painel/RelatorioUnidades"));

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <div className="flex h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col">
              <Navbar />
              <div className="flex-1 overflow-auto">
                <Suspense fallback={<LoadingScreen />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/agenda" element={<Agenda />} />
                    <Route path="/fila-espera" element={<FilaEspera />} />
                    <Route path="/pacientes" element={<Pacientes />} />
                    <Route path="/atendimentos" element={<Atendimentos />} />
                    <Route path="/triagem" element={<Triagem />} />
                    <Route path="/prontuarios" element={<Prontuarios />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/usuarios" element={<Usuarios />} />
                    <Route path="/unidades" element={<Unidades />} />
                    <Route path="/relatorio-atendimentos" element={<RelatorioAtendimentos />} />
                    <Route path="/relatorio-fila-espera" element={<RelatorioFilaEspera />} />
                    <Route path="/relatorio-agendamentos" element={<RelatorioAgendamentos />} />
                    <Route path="/relatorio-pacientes" element={<RelatorioPacientes />} />
                    <Route path="/relatorio-financeiro" element={<RelatorioFinanceiro />} />
                    <Route path="/relatorio-triagem" element={<RelatorioTriagem />} />
                    <Route path="/relatorio-prontuarios" element={<RelatorioProntuarios />} />
                    <Route path="/relatorio-usuarios" element={<RelatorioUsuarios />} />
                    <Route path="/relatorio-unidades" element={<RelatorioUnidades />} />
                  </Routes>
                </Suspense>
              </div>
              <Footer />
            </div>
          </div>
        </Router>
        <Toaster />
      </DataProvider>
    </AuthProvider>
  );
}

export default App;