import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClinicalPatientHubHeader from "./ClinicalPatientHubHeader";
afterEach(cleanup);
function props(){return {name:"Paciente demonstrativo",loaded:15,hasMore:false,loading:false,canEdit:true,printing:false,outputBusy:false,section:"records" as const,onSection:vi.fn(),onBack:vi.fn(),onNew:vi.fn(),onHistory:vi.fn(),onPrint:vi.fn(),onDocument:vi.fn(),onDeclaration:vi.fn(),onReferral:vi.fn(),onTeam:vi.fn()};}
describe("Central clínica individual",()=>{
 it("mantém os oito atalhos operacionais e distingue as três seções",()=>{
  const p=props();render(<ClinicalPatientHubHeader {...p}/>);
  expect(screen.getByRole("heading",{name:p.name})).toBeInTheDocument();
  for(const [label,fn] of [["Todos os prontuários",p.onBack],["Novo Prontuário",p.onNew],["Histórico completo",p.onHistory],["Imprimir histórico",p.onPrint],["Gerar documento",p.onDocument],["Declaração rápida",p.onDeclaration],["Encaminhar paciente",p.onReferral],["Avaliação em equipe",p.onTeam]] as const){
   fireEvent.click(screen.getByRole("button",{name:label}));expect(fn).toHaveBeenCalledTimes(1);
  }
  for(const [label,section] of [["Prontuários","records"],["Histórico clínico","history"],["Documentos emitidos","documents"]] as const){fireEvent.click(screen.getByRole("button",{name:label,exact:true}));expect(p.onSection).toHaveBeenLastCalledWith(section);}
 });
 it("não oferece criação sem permissão e impede nova impressão durante processamento",()=>{
  const p=props();render(<ClinicalPatientHubHeader {...p} canEdit={false} printing section="documents"/>);
  expect(screen.queryByRole("button",{name:"Novo Prontuário"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Preparando histórico…"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Documentos emitidos"})).toHaveAttribute("aria-pressed","true");
 });
});