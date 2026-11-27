import {describe,it,expect} from 'vitest';
import {operationalAccess,operationalSection,operationalDestination,MONITORING_DESTINATION,OPERATIONAL_DATA_PATH} from './operationalNavigation';
describe('central de gestão operacional',()=>{
 const master={id:'m',role:'master',ativo:true};
 const staff={id:'s',role:'profissional',ativo:true};
 it('preserva as duas áreas para Master global ou de unidade, sem elevar permissões internas de exportação',()=>{
  const access=operationalAccess(master,false);
  expect(access).toEqual({monitoramento:true,dados:true});
  expect(operationalSection(null,access)).toBe('monitoramento');
  expect(operationalSection('dados',access)).toBe('dados');
 });
 it('permite somente monitoramento ao perfil autorizado e nega tentativa direta de backup',()=>{
  const access=operationalAccess(staff,true);
  expect(access).toEqual({monitoramento:true,dados:false});
  expect(operationalSection('monitoramento',access)).toBe('monitoramento');
  expect(operationalSection('dados',access)).toBeNull();
  expect(operationalSection('desconhecido',access)).toBe('monitoramento');
 });
 it('nega perfil sem autorização, usuário inativo e identidade ausente',()=>{
  for(const [user,permission] of [[staff,false],[{...master,ativo:false},true],[null,true],[{...staff,id:''},true]] as const){
   const access=operationalAccess(user,permission);
   expect(access).toEqual({monitoramento:false,dados:false});
   expect(operationalSection(null,access)).toBeNull();
  }
 });
 it('mantém destino canônico e destinos explícitos',()=>{
  expect(operationalDestination('monitoramento')).toBe(MONITORING_DESTINATION);
  expect(operationalDestination('dados')).toBe(OPERATIONAL_DATA_PATH+'?aba=dados');
 });
});
