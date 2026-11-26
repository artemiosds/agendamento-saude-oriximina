import { describe, it, expect } from "vitest";
import { selectAltaSources, recordedProcedures, type AltaSourceBundle, type AltaNote, type AltaCycle, type AltaSession, type AltaPts } from "./altaSources";
import { collectAltaEvolution, readAltaEvolution, altaSeries, altaOfficialBody, type AltaEvolutionSnapshot } from "./altaEvolution";

const cycle: AltaCycle = {id:"c1",patient_id:"p1",professional_id:"f1",unit_id:"u1",specialty:"Fisioterapia",treatment_type:null,start_date:"2026-01-01",status:"em_andamento",pts_id:"pts1"};
const note = (id:string, patch:Partial<AltaNote>={}):AltaNote => ({id,paciente_id:"p1",profissional_id:"f1",profissional_nome:"Teste",unidade_id:"u1",data_atendimento:"2026-01-10",tipo_registro:"sessao",status:"finalizado",hipotese:null,procedimentos_texto:"Procedimento A",queixa_principal:null,evolucao:null,agendamento_id:"a1",custom_data:{treatment_cycle_id:"c1",clinical_metrics_cycle_id:"c1",clinical_metrics:{eva:4}},...patch});
const session=(id:string,patch:Partial<AltaSession>={}):AltaSession=>({id,cycle_id:"c1",patient_id:"p1",professional_id:"f1",appointment_id:"a1",scheduled_date:"2026-01-10",status:"realizada",procedure_done:"Procedimento B",...patch});
const pts:AltaPts={id:"pts1",patient_id:"p1",unit_id:"u1",professional_id:"f1",status:"ativo",updated_at:null,diagnostico_funcional:null,objetivos_terapeuticos:null,objetivo_geral:null,motivo_encaminhamento:null,barreiras:null,potencialidades:null,rede_apoio:null};
const bundle:AltaSourceBundle={patientId:"p1",unitId:"u1",professionalId:"f1",through:"2026-01-31",patientCid:"",cycles:[cycle,{...cycle,id:"c2",unit_id:"u2"},{...cycle,id:"c3",professional_id:"f2"}],notes:[note("n1"),note("n2",{unidade_id:"u2"}),note("n3",{tipo_registro:"alta_individual"}),note("n4",{status:"rascunho"}),note("n5",{data_atendimento:"2026-02-01"}),note("n6",{profissional_id:"f2"}),note("n7",{custom_data:{treatment_cycle_id:"c9"}})],sessions:[session("s1"),session("s1"),session("s2",{status:"falta"}),session("s3",{status:"paciente_faltou"}),session("s4",{status:"agendada",procedure_done:"Não realizado"}),session("s5",{scheduled_date:null}),session("s6",{cycle_id:"c2"}),session("s7",{professional_id:"f2"}),session("s8",{scheduled_date:"2026-02-01"})],pts:[pts,{...pts,id:"pts2",unit_id:"u2"}],goals:[{id:"g1",pts_id:"pts1",titulo:"Meta A",status:"pendente",responsavel_id:"f1"},{id:"g2",pts_id:"pts1",titulo:"Meta B",status:"pendente",responsavel_id:"f2"}]};
const scope={patientId:"p1",unitId:"u1",professionalId:"f1",cycleId:"c1",through:"2026-01-31",from:"2026-01-01",to:"2026-01-31"};

describe("Alta — fontes clínicas",()=>{
  it("conta somente sessões realizadas, deduplica e reconhece os dois tipos de falta",()=>{
    const r=selectAltaSources(bundle,"c1","pts1",bundle.through);
    expect(r.meta.performed).toBe(1);expect(r.meta.absences).toBe(2);expect(r.meta.undated).toBe(1);
  });
  it("exclui outros profissionais, unidades, datas, rascunhos e altas anteriores",()=>{
    const r=selectAltaSources(bundle,"c1","pts1",bundle.through);
    expect(r.notes.map(n=>n.id)).toEqual(["n1"]);expect(r.goals.map(g=>g.id)).toEqual(["g1"]);
  });
  it("não transforma procedimentos planejados em realizados",()=>{
    const r=selectAltaSources(bundle,"c1","",bundle.through);
    expect(recordedProcedures(r.notes,r.sessions)).toBe("Procedimento A\nProcedimento B");
  });
  it("rejeita ciclo e PTS de outra unidade",()=>{
    expect(()=>selectAltaSources(bundle,"c2","",bundle.through)).toThrow();
    expect(()=>selectAltaSources(bundle,"c1","pts2",bundle.through)).toThrow();
  });
  it("reconta no período informado e rejeita intervalo invertido",()=>{
    expect(selectAltaSources(bundle,"c1","",bundle.through,"2026-01-11","2026-01-31").meta.performed).toBe(0);
    expect(()=>selectAltaSources(bundle,"c1","",bundle.through,"2026-01-31","2026-01-10")).toThrow();
  });
  it("não soma prontuários quando não há sessões realizadas",()=>{
    expect(selectAltaSources({...bundle,sessions:[]},"c1","",bundle.through).meta.performed).toBe(0);
  });
});
describe("Alta — evolução e impressão",()=>{
  it("restringe medidas a paciente, unidade, profissional e ciclo explícito",()=>{
    const sections=collectAltaEvolution(bundle.cycles,bundle.notes,scope);
    expect(sections).toHaveLength(1);expect(sections[0].entries.map(e=>e.id)).toEqual(["n1"]);
  });
  it("não inventa melhora com uma única medida ou valor inválido",()=>{
    const sections=collectAltaEvolution([cycle],[note("n1"),note("n2",{custom_data:{clinical_metrics_cycle_id:"c1",clinical_metrics:{eva:false,berg:99,mrc:3}}})],scope);
    expect(sections[0].entries).toHaveLength(1);expect(altaSeries(sections[0])[0].delta).toBeNull();
  });
  it("separa contextos musculares e calcula apenas variações comparáveis",()=>{
    const rows=[note("a",{custom_data:{clinical_metrics_cycle_id:"c1",clinical_metrics:{mrc:2},clinical_metrics_context:{mrc:"D"}}}),note("b",{custom_data:{clinical_metrics_cycle_id:"c1",clinical_metrics:{mrc:4},clinical_metrics_context:{mrc:"E"}}})];
    expect(altaSeries(collectAltaEvolution([cycle],rows,scope)[0])).toHaveLength(2);
  });
  it("preserva as medidas consolidadas e não acrescenta gráficos a versões antigas",()=>{
    const snapshot:AltaEvolutionSnapshot={schema:1,state:"recorded",sections:collectAltaEvolution([cycle],[note("n1")],scope)};
    expect(readAltaEvolution(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(altaOfficialBody('<div class="signature">assinatura</div>',null,1)).not.toContain("<polyline");
    expect(altaOfficialBody('<div class="signature">assinatura</div>',snapshot,2)).toContain("padding-top:32mm");
  });
});
