import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),dup:vi.fn(),audit:vi.fn(),insert:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from}}));
vi.mock('@/lib/paciente-duplicity',()=>({checkPatientDuplicity:mocks.dup}));
vi.mock('./auditService',()=>({auditService:{auditCreate:mocks.audit}}));
import { patientService } from './patientService';
const actor={id:'staff',nome:'RECEPÇÃO',usuario:'recep',role:'recepcao',unidadeId:'u'};
export const valid:any={nome:'PACIENTE TESTE',nomeMae:'MAE TESTE',dataNascimento:'2000-01-01',cns:'700000000000001',cpf:'',telefone:'93999990000',naturalidade:'ORIXIMINA',municipio:'ORIXIMINA',sexo:'F',customData:{cep:'68270000',tipoLogradouro:'RUA',logradouro:'TESTE',bairro:'CENTRO',uf:'PA',nacionalidade:'brasileiro',racaCor:'parda'}};
beforeEach(()=>{vi.clearAllMocks();mocks.dup.mockResolvedValue({isDuplicate:false});mocks.audit.mockResolvedValue(undefined);
 mocks.insert.mockReturnValue({select:()=>({single:async()=>({data:{id:'request',nome:'PACIENTE TESTE',unidade_id:'u'},error:null})})});
 mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})}),insert:mocks.insert});});
it('returns the saved row and structured SUS fields without loading a patient list',async()=>{
 const row=await patientService.createPaciente(valid,actor,'u','request');expect(row.id).toBe('request');
 expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({nome_mae:'MAE TESTE',unidade_id:'u',sexo:'feminino',telefone:'5593999990000',custom_data:expect.objectContaining({racaCor:'parda',logradouro:'TESTE',numero:'S/N',motivo_alteracao:'Cadastro via Novo Agendamento',criado_por:'staff'})}));
 expect(mocks.dup).toHaveBeenCalledWith(expect.anything(),{strict:true});expect(mocks.audit).toHaveBeenCalledOnce();
});
it('keeps duplicate detection before insertion',async()=>{mocks.dup.mockResolvedValue({isDuplicate:true,message:'CPF já cadastrado'});await expect(patientService.createPaciente(valid,actor,'u','request')).rejects.toThrow('CPF já cadastrado');expect(mocks.insert).not.toHaveBeenCalled();});
it('fails closed on duplicate lookup errors',async()=>{mocks.dup.mockRejectedValue(new Error('offline'));await expect(patientService.createPaciente(valid,actor,'u','request')).rejects.toThrow('offline');expect(mocks.insert).not.toHaveBeenCalled();});
it('does not insert incomplete or out-of-unit registrations',async()=>{await expect(patientService.createPaciente({...valid,nomeMae:''},actor,'u','request')).rejects.toThrow('Nome da mãe');await expect(patientService.createPaciente(valid,actor,'other','request')).rejects.toThrow('unidade');expect(mocks.insert).not.toHaveBeenCalled();});
it('recovers an already saved request after an uncertain response without a second insert',async()=>{
 mocks.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'request',unidade_id:'u',custom_data:{cadastro_request_id:'request',criado_por:'staff'}},error:null})})}),insert:mocks.insert});
 expect((await patientService.createPaciente(valid,actor,'u','request')).id).toBe('request');expect(mocks.insert).not.toHaveBeenCalled();
});
