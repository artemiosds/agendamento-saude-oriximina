import {describe,it,expect} from 'vitest';
import {filterLoadedQueue} from './adminQueueSearch';
const rows=[{id:'1',paciente_nome:'Paciente fictício',telefone:'000123'},{id:'2',paciente_nome:'Outro exemplo',telefone:'000456'},{id:'3',paciente_nome:null,telefone:null}];
describe('busca local da fila administrativa',()=>{
 it('preserva a janela original sem busca',()=>expect(filterLoadedQueue(rows,'  ')).toBe(rows));
 it('encontra nome sem distinguir maiúsculas',()=>expect(filterLoadedQueue(rows,' PACIENTE ')).toEqual([rows[0]]));
 it('encontra telefone sem alterar ordem ou conteúdo',()=>{expect(filterLoadedQueue(rows,'456')).toEqual([rows[1]]);expect(rows).toHaveLength(3);});
 it('não inventa resultados para campos ausentes',()=>expect(filterLoadedQueue(rows,'inexistente')).toEqual([]));
});
