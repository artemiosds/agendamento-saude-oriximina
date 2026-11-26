import {describe,it,expect} from "vitest";
import {resolveLinkedSoap,canShowLinkedSoap} from "./linkedTreatmentSoap";
const s={id:"s",appointment_id:"a",patient_id:"p",professional_id:"f",scheduled_date:"2026-11-25",status:"realizada",clinical_notes:'{"tipo":"soap","subjetivo":"","objetivo":"","avaliacao":"","plano":""}'};
const p={id:"r",agendamento_id:"a",paciente_id:"p",profissional_id:"f",unidade_id:"u",data_atendimento:"2026-11-25",soap_subjetivo:"texto fictício"};
describe("SOAP vinculado de sessão",()=>{
 it("recupera exclusivamente prontuário correspondente",()=>expect(resolveLinkedSoap(s,"u",[p],1)?.soap.subjetivo).toBe("texto fictício"));
 it("rejeita duplicidades e vínculos divergentes",()=>{expect(resolveLinkedSoap(s,"u",[p,p],1)).toBeNull();expect(resolveLinkedSoap(s,"u",[p],2)).toBeNull();for(const patch of [{agendamento_id:"b"},{paciente_id:"x"},{profissional_id:"x"},{unidade_id:"x"},{data_atendimento:"2026-11-26"}])expect(resolveLinkedSoap(s,"u",[{...p,...patch}],1)).toBeNull();});
 it("não sobrescreve SOAP ou notas existentes nem sessões não realizadas",()=>{expect(canShowLinkedSoap({...s,clinical_notes:"texto antigo"})).toBe(false);expect(canShowLinkedSoap({...s,clinical_notes:'{"tipo":"soap","plano":"existente"}'})).toBe(false);expect(canShowLinkedSoap({...s,status:"agendada"})).toBe(false);});
});