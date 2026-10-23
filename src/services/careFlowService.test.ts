import {beforeEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import {confirmCareArrival,completeCareTriage} from './careFlowService';
beforeEach(()=>vi.clearAllMocks());
describe('resultado persistido das operações clínicas',()=>{
 it('uma resposta vazia não é considerada sucesso',async()=>{
  rpc.mockResolvedValue({data:null,error:null});await expect(completeCareTriage('ag1','t1',{},false)).rejects.toThrow('banco não confirmou');
 });
 it('função indisponível não usa gravações parciais como fallback',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});await expect(confirmCareArrival({id:'ag1',userId:'r1',userName:'R',unitId:'u1',arrivalTime:'08:00'})).rejects.toThrow('operação segura');expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('mantém o erro específico do servidor para correção do formulário',async()=>{
  rpc.mockResolvedValue({data:null,error:{code:'23514',message:'Peso inválido'}});await expect(completeCareTriage('ag1','t1',{},false)).rejects.toMatchObject({message:'Peso inválido',code:'23514'});
 });
 it('interrupção de conexão não informa falsamente que nada foi gravado',async()=>{
  rpc.mockRejectedValue(new TypeError('Failed to fetch'));await expect(completeCareTriage('ag1','t1',{},false)).rejects.toThrow('confere se a operação já foi concluída');
 });
});
