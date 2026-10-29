import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({fail:''}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:async(column:string)=>({data:[],error:column===m.fail ? new Error('lookup failed') : null})})})}}));
import { checkPatientDuplicity } from './paciente-duplicity';
beforeEach(()=>{m.fail='';});
it.each(['cpf','cns','data_nascimento'])('does not allow a new registration when the %s lookup fails',async(column)=>{
 m.fail=column;
 const data={nome:'PACIENTE',dataNascimento:'2000-01-01',cpf:'12345678901',cns:'700000000000001'};
 await expect(checkPatientDuplicity(data,{strict:true})).rejects.toThrow('lookup failed');
});
