import {beforeEach,describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),in:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:db.from}}));
import {procedureService} from './procedureService';
beforeEach(()=>{vi.clearAllMocks();db.from.mockReturnValue(db);db.select.mockReturnValue(db);db.in.mockReturnValue(db);db.limit.mockReturnValue(db);});
describe('leitura exata do CID informado',()=>{
 it('normaliza código e consulta apenas versões exata e pontuada sem escrita',async()=>{
  db.maybeSingle.mockResolvedValue({data:{codigo:'Z000',descricao:'Exame médico geral'},error:null});
  expect(await procedureService.getCidByCode(' z00.0 ')).toEqual({codigo:'Z000',descricao:'Exame médico geral'});
  expect(db.from).toHaveBeenCalledWith('cid10_codigos');
  expect(db.in).toHaveBeenCalledWith('codigo',['Z000','Z00.0']);
  expect(db.limit).toHaveBeenCalledWith(1);
 });
 it('não consulta o banco para texto que não é um código CID',async()=>{
  expect(await procedureService.getCidByCode('Z000 OR 1=1')).toBeNull();
  expect(db.from).not.toHaveBeenCalled();
 });
 it('distingue ausência de código de falha de consulta',async()=>{
  db.maybeSingle.mockResolvedValueOnce({data:null,error:null});
  expect(await procedureService.getCidByCode('Z999')).toBeNull();
  db.maybeSingle.mockResolvedValueOnce({data:null,error:new Error('Rede indisponível')});
  await expect(procedureService.getCidByCode('Z000')).rejects.toThrow('Rede indisponível');
 });
});
