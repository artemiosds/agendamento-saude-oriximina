import {beforeEach,describe,expect,it,vi} from 'vitest';
const fake=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),update:vi.fn(),insert:vi.fn(),write:vi.fn(),conditions:[] as [string,unknown][]}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:fake.session},from:()=>({
 select:()=>({eq:()=>({maybeSingle:fake.read})}),
 update:(payload:unknown)=>{fake.update(payload);const builder={eq:(key:string,value:unknown)=>{fake.conditions.push([key,value]);return builder;},select:()=>({maybeSingle:fake.write})};return builder;},
 insert:(payload:unknown)=>{fake.insert(payload);return {select:()=>({maybeSingle:fake.write})};}
})}}));
import {saveSystemConfigPatch} from './systemConfigWriter';
const version='2026-11-01T00:00:00.000Z';
const stored={portal:{ativo:true},prontuario:{version:1}};
const auth=(id='auth1')=>({data:{session:{user:{id}}},error:null});
beforeEach(()=>{vi.resetAllMocks();fake.conditions.length=0;fake.session.mockResolvedValue(auth());fake.read.mockResolvedValue({data:{configuracoes:stored,updated_at:version},error:null});fake.write.mockResolvedValue({data:{id:'default'},error:null});});
describe('integração simulada do gravador administrativo',()=>{
 it('preserva outras seções, aplica versão observada e confirma retorno do banco',async()=>{const result=await saveSystemConfigPatch({prontuario:{version:2}},'auth1',{key:'prontuario',value:{version:1}});expect(result).toEqual({...stored,prontuario:{version:2}});expect(fake.conditions).toEqual([['id','default'],['updated_at',version]]);expect(fake.update).toHaveBeenCalledWith(expect.objectContaining({configuracoes:result}));expect(fake.insert).not.toHaveBeenCalled();});
 it('bloqueia sessão diferente antes da leitura',async()=>{fake.session.mockResolvedValue(auth('auth2'));await expect(saveSystemConfigPatch({x:1},'auth1')).rejects.toThrow('Sessão');expect(fake.read).not.toHaveBeenCalled();expect(fake.update).not.toHaveBeenCalled();});
 it('bloqueia sessão expirada depois da leitura e antes da escrita',async()=>{fake.session.mockResolvedValueOnce(auth()).mockResolvedValueOnce({data:{session:null},error:null});await expect(saveSystemConfigPatch({x:1},'auth1')).rejects.toThrow('Sessão');expect(fake.update).not.toHaveBeenCalled();expect(fake.insert).not.toHaveBeenCalled();});
 it('não grava seção alterada por outro administrador',async()=>{await expect(saveSystemConfigPatch({prontuario:{version:3}},'auth1',{key:'prontuario',value:{version:0}})).rejects.toThrow('mudou');expect(fake.update).not.toHaveBeenCalled();});
 it('não insere após atualização sem linha confirmada',async()=>{fake.write.mockResolvedValue({data:null,error:null});await expect(saveSystemConfigPatch({x:1},'auth1')).rejects.toThrow('Recarregue');expect(fake.insert).not.toHaveBeenCalled();});
 it('não confunde falha de leitura com ausência',async()=>{fake.read.mockResolvedValue({data:null,error:{message:'negado'}});await expect(saveSystemConfigPatch({x:1},'auth1')).rejects.toThrow('ler');expect(fake.insert).not.toHaveBeenCalled();expect(fake.update).not.toHaveBeenCalled();});
 it('só insere se ausência for confirmada e não houver baseline anterior',async()=>{fake.read.mockResolvedValue({data:null,error:null});await expect(saveSystemConfigPatch({x:1},'auth1',{key:'x',value:undefined})).rejects.toThrow();expect(fake.insert).not.toHaveBeenCalled();await expect(saveSystemConfigPatch({x:1},'auth1')).resolves.toEqual({x:1});expect(fake.insert).toHaveBeenCalledTimes(1);});
});
