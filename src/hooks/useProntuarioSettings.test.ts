import {renderHook,act} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fake=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),user:{role:'master',ativo:true,authUserId:'auth1'}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:fake.user})}));
vi.mock('@/hooks/useConfiguracao',()=>({useConfiguracao:()=>({atualizarConfiguracao:fake.write})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:fake.read})})}),auth:{getSession:async()=>({data:{session:{user:{id:fake.user.authUserId}}},error:null})}}}));
import {useAdministrativeConfigSection} from './useProntuarioSettings';
const response=(value:unknown)=>({data:{configuracoes:{section:value}},error:null});
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve};}
beforeEach(()=>{vi.clearAllMocks();fake.user.authUserId='auth1';fake.read.mockResolvedValue(response({a:1}));fake.write.mockResolvedValue(true);});
afterEach(()=>vi.restoreAllMocks());
describe('homologação do editor administrativo compartilhado',()=>{
 it('impede gravação antes de leitura confirmada',async()=>{const {result}=renderHook(()=>useAdministrativeConfigSection('section'));await expect(result.current.save(()=>({a:2}))).rejects.toThrow('Leitura');expect(fake.write).not.toHaveBeenCalled();});
 it('ignora resposta antiga após nova consulta',async()=>{const old=deferred<ReturnType<typeof response>>();fake.read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({a:3}));const {result}=renderHook(()=>useAdministrativeConfigSection('section'));const first=result.current.load();const rejection=expect(first).rejects.toThrow('substituída');await expect(result.current.load()).resolves.toEqual({a:3});old.resolve(response({a:1}));await rejection;await result.current.save(()=>({a:4}));expect(fake.write).toHaveBeenCalledWith('section',{a:4},expect.objectContaining({expectedSection:{key:'section',value:{a:3}}}));});
 it('não reaplica operação enfileirada após nova leitura',async()=>{const {result}=renderHook(()=>useAdministrativeConfigSection('section'));await result.current.load();const pending=deferred<boolean>();fake.write.mockReturnValueOnce(pending.promise);const one=result.current.save(()=>({a:2}));await Promise.resolve();const two=result.current.save(()=>({a:3}));const rejection=expect(two).rejects.toThrow('Rascunho');await result.current.load();pending.resolve(true);await one;await rejection;expect(fake.write).toHaveBeenCalledTimes(1);});
 it('não muda o baseline após falha de gravação',async()=>{const {result}=renderHook(()=>useAdministrativeConfigSection('section'));await result.current.load();fake.write.mockResolvedValueOnce(false);await expect(result.current.save(()=>({a:2}))).resolves.toBe(false);await result.current.save(()=>({a:3}));expect(fake.write).toHaveBeenLastCalledWith('section',{a:3},expect.objectContaining({expectedSection:{key:'section',value:{a:1}}}));});
});
