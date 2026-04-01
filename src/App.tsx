"use client";

import React, { lazy, Suspense, ComponentType } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";

// Note: Navbar, Sidebar, Footer were removed as they are usually integrated in PainelLayout or specific pages.

const LoadingScreenComponent = () => {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" ></div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <div className="flex h-screen bg-gray-50">
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-auto">
                <Suspense fallback={<LoadingScreenComponent />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/agenda" element={<Agenda />} />
                    <Route path="/fila-espera" element={<FilaEspera />} />
                    <Route path="/pacientes" element={<Pacientes />} />
                    <Route path="/atendimentos" element={<Atendimentos />} />
                    <Route path="/triagem" element={<Triagem />} />
                    <Route path="/prontuarios" element={<Prontuario />} />
                    <Route path="/configuracoes" element={<Configuracoes />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/usuarios" element={<Usuarios />} />
                    <Route path="/unidades" element={<UnidadesSalas />} />
                    <Route path="/relatorio-atendimentos" element={<RelatorioAtendimentos />} />
                    <Route path="/relatorio-fila-espera" element={<RelatorioFilaEspera />} />
                    <Route path="/relatorio-agendamentos" element={<RelatorioAgendamentos />} />
                    <Route path="/relatorio-pacientes" element={<RelatorioPacientes />} />
                    <Route path="/relatorio-financeiro" element={<RelatorioFinanceiro />} />
                    <Route path="/relatorio-triagem" element={<RelatorioTriagem />} />
                    <Route path="/relatorio-prontuarios" element={<RelatorioProntuario />} />
                    <Route path="/relatorio-usuarios" element={<RelatorioFuncionarios />} />
                    <Route path="/relatorio-unidades" element={<RelatorioUnidadesSalas />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          </div>
        </Router>
        <Toaster />
      </DataProvider>
    </AuthProvider>
  );
}

export default App;