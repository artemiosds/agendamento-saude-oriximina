import { describe,expect,it } from 'vitest';
import { buildCurrentStaffSchedules,reviewStaff,staffSearchText,staffDigits,type StaffSchedule } from './staffDirectoryReview';
const staff={role:'profissional',cpf:'123.456.789-00',unidade_id:'u1',auth_user_id:'auth-test',custom_data:{cbo_codigo:'223605',cns:'123456789012345'}};
const schedule:StaffSchedule={profissionalId:'p1',unidadeId:'u1',dataInicio:'2026-11-01',dataFim:'2026-11-30',diasSemana:[1]};
describe('conferência cadastral de funcionários (somente leitura)',()=>{
  it('normaliza busca com acentos e CPF formatado',()=>{
    expect(staffSearchText('  ÁGNA ')).toBe('agna');
    expect(staffDigits('123.456.789-00')).toBe('12345678900');
  });
  it('não cria pendências quando os formatos estão preenchidos',()=>expect(reviewStaff(staff)).toEqual([]));
  it('não exige CBO ou CNS de perfil administrativo',()=>expect(reviewStaff({...staff,role:'master',custom_data:{}})).toEqual([]));
  it('aponta campos clínicos incompletos sem alterar o cadastro',()=>{
    const record={...staff,custom_data:{cbo_codigo:'',cns:'123'}};
    const before=JSON.stringify(record);
    expect(reviewStaff(record)).toEqual(['cbo','cns']);
    expect(JSON.stringify(record)).toBe(before);
  });
  it('separa CPF, lotação e autenticação',()=>expect(reviewStaff({...staff,cpf:'',unidade_id:'',auth_user_id:null})).toEqual(['cpf','lotacao','acesso']));
  it('conselho parcialmente preenchido é só conferência',()=>expect(reviewStaff({...staff,tipo_conselho:'CRM'})).toEqual(['conselho']));
});
describe('vigência da grade de atendimento carregada',()=>{
  it('deduplica unidades e restringe a consulta às unidades autorizadas',()=>{
    const m=buildCurrentStaffSchedules([schedule,schedule,{...schedule,unidadeId:'u2'}],'2026-11-27',new Set(['u1']));
    expect([...m.get('p1')!]).toEqual(['u1']);
  });
  it('exclui registros expirados e ainda não iniciados',()=>{
    const m=buildCurrentStaffSchedules([{...schedule,dataFim:'2026-11-26'},{...schedule,dataInicio:'2026-11-28'}],'2026-11-27',new Set(['u1']));
    expect(m.size).toBe(0);
  });
  it('inclui início e fim na data de referência',()=>{
    expect(buildCurrentStaffSchedules([{...schedule,dataInicio:'2026-11-27',dataFim:'2026-11-27'}],'2026-11-27',new Set(['u1'])).has('p1')).toBe(true);
  });
  it('não conta grade sem dias ou unidade autorizada',()=>{
    expect(buildCurrentStaffSchedules([{...schedule,diasSemana:[]}],'2026-11-27',new Set(['u1'])).size).toBe(0);
    expect(buildCurrentStaffSchedules([schedule],'2026-11-27',new Set()).size).toBe(0);
  });
});
