import { describe, expect, it } from 'vitest';
import { portalAccountDiagnosis, projectPortalHistory } from '../../supabase/functions/_shared/portal-patient-detail';

const patient = {id:'patient-a',email:'a@exemplo.com',auth_user_id:'account-a'};
const evidence = {patientIds:['patient-a'],staffCount:0,externalCount:0,accountEmail:'A@exemplo.com',confirmedAt:'2026-11-27T10:00:00Z',lastSignIn:'2026-11-27T11:00:00Z'};
const event = {id:'1',acao:'portal_criar_acesso',created_at:'2026-11-27T12:00:00Z',user_nome:'Operador de teste',status:'sucesso',unidade_id:'unit-a',entidade_id:'patient-a',entidade:'paciente',modulo:'portal_paciente',detalhes:{secret:'not-returned'}};
describe('diagnóstico individual do portal', () => {
  it('não confunde vínculo cadastrado com conta verificada', () => {
    expect(portalAccountDiagnosis({...patient,auth_user_id:null},null)).toEqual({state:'unlinked',emailValid:true,emailConfirmed:null,lastSignIn:null});
    expect(portalAccountDiagnosis(patient,null)).toEqual({state:'unknown',emailValid:true,emailConfirmed:null,lastSignIn:null});
  });
  it('só revela a última autenticação com vínculo exclusivo e e-mail correspondente', () => {
    expect(portalAccountDiagnosis(patient,evidence)).toEqual({state:'verified',emailValid:true,emailConfirmed:true,lastSignIn:evidence.lastSignIn});
    for (const changed of [{...evidence,patientIds:['patient-a','patient-b']},{...evidence,staffCount:1},{...evidence,externalCount:1},{...evidence,accountEmail:'outro@exemplo.com'}]) {
      expect(portalAccountDiagnosis(patient,changed)).toEqual({state:'divergent',emailValid:true,emailConfirmed:null,lastSignIn:null});
    }
  });
  it('não inventa datas de autenticação e mantém pacientes antigos', () => {
    expect(portalAccountDiagnosis(patient,{...evidence,confirmedAt:null,lastSignIn:'inválido'})).toEqual({state:'verified',emailValid:true,emailConfirmed:false,lastSignIn:null});
    expect(portalAccountDiagnosis({...patient,email:null,auth_user_id:null},null)).toEqual({state:'unlinked',emailValid:false,emailConfirmed:null,lastSignIn:null});
  });
  it('filtra paciente, módulo, ação e unidade sem retornar conteúdo livre', () => {
    const rows = [event,{...event,id:'2',unidade_id:'unit-b'},{...event,id:'3',unidade_id:''},{...event,id:'4',entidade_id:'patient-b'},{...event,id:'5',modulo:'prontuario'},{...event,id:'6',acao:'portal_alterar_regra'},{...event,id:'7',entidade:'system_config'}];
    const local = projectPortalHistory(rows,'patient-a','unit-a');
    expect(local).toEqual([{id:'1',action:'portal_criar_acesso',time:event.created_at,actor:'Operador de teste',status:'sucesso'}]);
    expect(projectPortalHistory(rows,'patient-a',null).map(r=>r.id)).toEqual(['1','2','3']);
    expect(JSON.stringify(local)).not.toContain('not-returned');
  });
  it('diferencia pedido de primeiro acesso de ativação e não inventa responsável', () => {
    expect(projectPortalHistory([{...event,acao:'portal_convite_primeiro_acesso'},{...event,id:'2',user_nome:null}],'patient-a','unit-a').map(r=>r.actor)).toEqual(['Solicitação de primeiro acesso','Responsável não registrado']);
  });
});
