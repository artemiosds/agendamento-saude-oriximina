"use client";

import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import PainelLayout from "@/components/PainelLayout";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import AgendarOnline from "@/pages/AgendarOnline";
import PortalPaciente from "@/pages/PortalPaciente";
import NotFound from "@/pages/NotFound";

// Painel pages
import Dashboard from "@/pages/painel/Dashboard";
import { Agenda } from "@/pages/painel/Agenda";
import FilaEspera from "@/pages/painel/FilaEspera";
import Pacientes from "@/pages/painel/Pacientes";
import Atendimentos from "@/pages/painel/Atendimentos";
import Triagem from "@/pages/painel/Triagem";
import ProntuarioPage from "@/pages/painel/Prontuario";
import Configuracoes from "@/pages/painel/Configuracoes";
import Relatorios from "@/pages/painel/Relatorios";
import Funcionarios from "@/pages/painel/Funcionarios";
import UnidadesSalas from "@/pages/painel/UnidadesSalas";
import Disponibilidade from "@/pages/painel/Disponibilidade";
import Bloqueios from "@/pages/painel/Bloqueios";
import Auditoria from "@/pages/painel/Auditoria";
import Permissoes from "@/pages/painel/Permissoes";
import Tratamentos from "@/pages/painel/Tratamentos";
import Regulacao from "@/pages/painel/Regulacao";
import AvaliacaoEnfermagem from "@/pages/painel/AvaliacaoEnfermagem";
import AvaliacaoMultiprofissional from "@/pages/painel/AvaliacaoMultiprofissional";
import PTS from "@/pages/painel/PTS";
import AgendaGoogle from "@/pages/painel/AgendaGoogle";

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/agendar" element={<AgendarOnline />} />
            <Route path="/portal" element={<PortalPaciente />} />

            {/* Painel routes with layout */}
            <Route path="/painel" element={<PainelLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="fila" element={<FilaEspera />} />
              <Route path="pacientes" element={<Pacientes />} />
              <Route path="atendimentos" element={<Atendimentos />} />
              <Route path="triagem" element={<Triagem />} />
              <Route path="prontuario" element={<ProntuarioPage />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="funcionarios" element={<Funcionarios />} />
              <Route path="unidades" element={<UnidadesSalas />} />
              <Route path="disponibilidade" element={<Disponibilidade />} />
              <Route path="bloqueios" element={<Bloqueios />} />
              <Route path="auditoria" element={<Auditoria />} />
              <Route path="permissoes" element={<Permissoes />} />
              <Route path="tratamentos" element={<Tratamentos />} />
              <Route path="regulacao" element={<Regulacao />} />
              <Route path="enfermagem" element={<AvaliacaoEnfermagem />} />
              <Route path="multiprofissional" element={<AvaliacaoMultiprofissional />} />
              <Route path="pts" element={<PTS />} />
              <Route path="agenda-google" element={<AgendaGoogle />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </Router>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;