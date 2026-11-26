import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, History, Printer, FileText, ClipboardList, Send, Users, Activity, FolderOpen } from "lucide-react";
import { patientInitials } from "@/components/PacienteDetalheModal";

export type ClinicalHubSection = "records" | "history" | "documents";
interface Props {
  name: string;
  loaded: number;
  hasMore: boolean;
  loading: boolean;
  canEdit: boolean;
  printing: boolean;
  outputBusy: boolean;
  section: ClinicalHubSection;
  onSection: (section: ClinicalHubSection) => void;
  onBack: () => void;
  onNew: () => void;
  onHistory: () => void;
  onPrint: () => void;
  onDocument: () => void;
  onDeclaration: () => void;
  onReferral: () => void;
  onTeam: () => void;
}
export default function ClinicalPatientHubHeader(props: Props) {
  const actions = [
    {label:"Histórico completo", Icon:History, tone:"blue", run:props.onHistory},
    {label:props.printing?"Preparando histórico…":"Imprimir histórico", Icon:Printer, tone:"slate", run:props.onPrint, disabled:props.printing||props.outputBusy},
    {label:"Gerar documento", Icon:FileText, tone:"violet", run:props.onDocument},
    {label:"Declaração rápida", Icon:ClipboardList, tone:"blue", run:props.onDeclaration},
    {label:"Encaminhar paciente", Icon:Send, tone:"teal", run:props.onReferral},
    {label:"Avaliação em equipe", Icon:Users, tone:"teal", run:props.onTeam},
  ];
  const sections = [
    {id:"records",label:"Prontuários",Icon:ClipboardList},
    {id:"history",label:"Histórico clínico",Icon:Activity},
    {id:"documents",label:"Documentos emitidos",Icon:FolderOpen},
  ] as const;
  return (
    <header className="clinical-hub space-y-3 min-w-0">
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground px-1 gap-2" onClick={props.onBack}><ArrowLeft className="w-4 h-4"/>Todos os prontuários</Button>
      <div className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="clinical-patient-avatar flex items-center justify-center shrink-0 font-bold text-lg">{patientInitials(props.name)}</span>
        <div className="flex-1 min-w-[8rem]">
          <p className="clinical-hub-eyebrow">Central clínica individual</p>
          <h1 className="clinical-hub-name font-display font-bold text-lg sm:text-xl leading-snug [overflow-wrap:anywhere]">{props.name||"Paciente"}</h1>
          <p className="clinical-patient-sub text-xs mt-1" aria-live="polite">{props.loading?"Carregando registros…":props.loaded+" registro(s) carregado(s)"+(props.hasMore?" · há mais resultados":"")}</p>
        </div>
        {props.canEdit&&<Button type="button" size="sm" className="clinical-hub-new gap-1.5 shrink-0" onClick={props.onNew}><Plus className="w-4 h-4"/>Novo Prontuário</Button>}
      </div>
      <nav aria-label="Ações assistenciais" className="clinical-hub-dock clinical-premium">
        {actions.map(({label,Icon,tone,run,disabled})=><Button key={tone+label} type="button" variant="ghost" className="clinical-hub-tile clinical-dock-action whitespace-normal" disabled={disabled} onClick={run}><span aria-hidden="true" className={"clinical-dock-icon clinical-tone-"+tone}><Icon className="w-4 h-4"/></span><span className="[overflow-wrap:anywhere]">{label}</span></Button>)}
      </nav>
      <nav aria-label="Seções da central clínica" className="clinical-hub-tabs">
        {sections.map(({id,label,Icon})=><Button key={id} type="button" variant="ghost" className="clinical-hub-tab" aria-pressed={props.section===id} aria-controls={"clinical-hub-"+id} onClick={()=>props.onSection(id)}><Icon className="w-4 h-4"/>{label}</Button>)}
      </nav>
    </header>
  );
}
