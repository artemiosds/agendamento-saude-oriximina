import { beforeEach, describe, expect, it, vi } from 'vitest';
const {insert} = vi.hoisted(()=>({insert:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({insert})}}));
vi.mock('@/lib/clientInfo',()=>({getPublicIp:async()=> 'IP não disponível',getDeviceInfo:()=>({browser:'Teste',os:'Teste',device:'desktop'})}));
import { auditService } from './auditService';
const params={acao:'editar',modulo:'auditoria',entidade:'teste',before:{nome:'A',senha:'old'},after:{nome:'B',senha:'new'},detalhes:{token:'fake'}};
describe('confirmação de gravação e sigilo de auditoria',()=>{
  beforeEach(()=>insert.mockReset());
  it('mantém operações antigas não bloqueantes e tenta gravar uma vez',async()=>{
    insert.mockResolvedValue({error:{message:'teste'}});
    await expect(auditService.log(params)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it('interrompe operação estrita quando o banco rejeita ou a rede falha',async()=>{
    insert.mockResolvedValueOnce({error:{message:'teste'}}).mockRejectedValueOnce(Error('rede'));
    await expect(auditService.log(params,{requireConfirmation:true})).rejects.toThrow('não confirmado');
    await expect(auditService.log(params,{requireConfirmation:true})).rejects.toThrow('não confirmado');
    expect(insert).toHaveBeenCalledTimes(2);
  });
  it('confirma gravação e mascara também a diferença calculada, sem mudar nomes',async()=>{
    insert.mockResolvedValue({error:null});
    await expect(auditService.log(params,{requireConfirmation:true})).resolves.toBeUndefined();
    const payload=insert.mock.calls[0][0];
    expect(payload.changes.senha).toBe('********');
    expect(payload.changes.nome).toEqual({from:'A',to:'B'});
    expect(payload.before.senha).toBe('********');
    expect(payload.after.senha).toBe('********');
    expect(payload.detalhes.token).toBe('********');
  });
});
