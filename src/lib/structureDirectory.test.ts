import { describe,expect,it } from 'vitest';
import { buildRoomStaff,filterStructureRooms,structureSearch,summarizeStructure, type RoomStaff } from './structureDirectory';
const units=[{id:'u1',nome:'Reabilitação',ativo:true}];
const rooms=[{id:'a',nome:'Consultório 10',unidadeId:'u1',ativo:true},{id:'b',nome:'Consultório 2',unidadeId:'u1',ativo:false},{id:'c',nome:'Aparelho',unidadeId:'u1',ativo:true}];
const devices=new Set(['c']),names=new Map([['c','Ultrassonografia']]),meta=new Map([['u1',{cnes:'1234567',videoConfigured:true}]]);
const person:RoomStaff={id:'p',nome:'Teste',profissao:null,cargo:null,sala_id:'a',unidade_id:'u1'};
describe('estrutura física — projeções somente leitura',()=>{
  it('busca sem acentos',()=>expect(structureSearch(' ÁÇÃO ')).toBe('acao'));
  it('ordena naturalmente sem mudar a fonte',()=>{
    expect(filterStructureRooms(rooms,units,devices,'todas','all','',true,names).map(r=>r.id)).toEqual(['c','b','a']);
    expect(rooms.map(r=>r.id)).toEqual(['a','b','c']);
  });
  it('separa consultórios de aparelhos',()=>{
    expect(filterStructureRooms(rooms,units,devices,'consultorios','all','',true,names).map(r=>r.id)).toEqual(['b','a']);
    expect(filterStructureRooms(rooms,units,devices,'aparelhos','all','',true,names).map(r=>r.id)).toEqual(['c']);
  });
  it('filtra situação cadastral',()=>{
    expect(filterStructureRooms(rooms,units,devices,'todas','active','',true,names).map(r=>r.id)).toEqual(['c','a']);
    expect(filterStructureRooms(rooms,units,devices,'todas','inactive','',true,names).map(r=>r.id)).toEqual(['b']);
  });
  it('busca por unidade ou modalidade de exame',()=>{
    expect(filterStructureRooms(rooms,units,devices,'todas','all','reabilitacao',true,names)).toHaveLength(3);
    expect(filterStructureRooms(rooms,units,devices,'todas','all','ultrassonografia',true,names).map(r=>r.id)).toEqual(['c']);
  });
  it('não classifica aparelhos antes de confirmar a configuração',()=>{
    expect(filterStructureRooms(rooms,units,devices,'aparelhos','all','',false,names)).toHaveLength(0);
    expect(filterStructureRooms(rooms,units,devices,'todas','all','ultrassonografia',false,names)).toHaveLength(0);
    expect(summarizeStructure(units,rooms,devices,meta,false).devices).toBe(null);
  });
  it('restringe vínculos a sala e unidade exatas, sem duplicação',()=>{
    const m=buildRoomStaff(rooms,[person,person,{...person,id:'q',unidade_id:'u2'},{...person,id:'r',sala_id:'ausente'}]);
    expect(m.size).toBe(1);expect(m.get('a')).toEqual([person]);
  });
  it('conta salas, aparelhos e vídeo local sem inventar ocupação',()=>{
    expect(summarizeStructure(units,rooms,devices,meta,true)).toEqual({units:1,activeUnits:1,rooms:3,activeRooms:2,devices:1,consultories:2,videoUnits:1});
  });
});
