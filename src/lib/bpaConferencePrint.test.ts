import { describe, expect, it } from 'vitest';
import { buildBpaConferenceGroups } from './bpaConferencePrint';
const row = { paciente_nome:'PACIENTE', paciente_cpf:'123', paciente_cns:'456', numero:'1139', data_atendimento:'01/09/2026', codigo_sigtap:'0302050027', cid_usado:'M545', cids_adicionais:['M508','M755'] };
describe('conferência compacta BPA', () => {
 it('agrupa identificação e mantém cada procedimento e seus CIDs na própria linha sem mutar dados', () => {
  const rows=[row,{...row,codigo_sigtap:'0302060014',cid_usado:'F82',cids_adicionais:['G809']}];
  const before=JSON.stringify(rows);const html=buildBpaConferenceGroups(rows);
  const doc=new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelectorAll('table')).toHaveLength(1);
  expect(doc.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(doc.querySelector('tbody tr')?.textContent).toContain('M508, M755');
  expect(doc.querySelectorAll('tbody tr')[1].textContent).toContain('G809');
  expect(doc.querySelectorAll('tbody tr')[1].textContent).not.toContain('M508');
  expect(doc.querySelector('.bpa-patient')?.textContent).toContain('1139');
  expect(JSON.stringify(rows)).toBe(before);
 });
 it('não mistura pacientes homônimos ou endereços diferentes', () => {
  const html=buildBpaConferenceGroups([row,{...row,paciente_cpf:'789'},{...row,numero:'1264'}]);
  expect(new DOMParser().parseFromString(html,'text/html').querySelectorAll('table')).toHaveLength(3);
 });
 it('escapa conteúdo e distingue ausência de CID', () => {
  const html=buildBpaConferenceGroups([{...row,paciente_nome:'<script>erro</script>',cid_usado:'—',cids_adicionais:[]}]);
  const doc=new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelector('script')).toBeNull();
  expect(doc.querySelector('.bpa-cid')?.textContent).toBe('Sem CID');
 });
 it('preserva os 338 registros mesmo agrupando as identificações', () => {
  const html=buildBpaConferenceGroups(Array.from({length:338},(_,i)=>({...row,paciente_cpf:String(i%56)})));
  const doc=new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelectorAll('tbody tr')).toHaveLength(338);
  expect(doc.querySelectorAll('.bpa-patient')).toHaveLength(56);
  expect(doc.querySelector('[data-bpa-record="338"]')).not.toBeNull();
 });
});

describe('conferência dos registros não exportados', () => {
 it('usa cartão completo, seis colunas, variante rejeitada e numeração contínua sem mutação', () => {
  const rows = [{...row, paciente_nome:'PACIENTE A', data_nascimento:'02/03/1980', sexo:'F', tipo_logradouro:'RUA', logradouro:'PRINCIPAL', bairro:'CENTRO', _ctx:{paciente_id:'pac-a'}}, {...row, codigo_sigtap:'0303190019', _ctx:{paciente_id:'pac-b'}}];
  const before = JSON.stringify(rows);
  const html = buildBpaConferenceGroups(rows, {variant:'rejected',startIndex:1069,cidColumnHeader:'CID no Prontuário'});
  const doc = new DOMParser().parseFromString(html,'text/html');
  expect(doc.querySelectorAll('table.bpa-group-table.bpa-rejected')).toHaveLength(2);
  expect(doc.querySelectorAll('thead tr:nth-child(2) th')).toHaveLength(12);
  expect(doc.querySelector('thead tr:nth-child(2) th:nth-child(4)')?.textContent).toBe('CID no Prontuário');
  expect(doc.querySelector('[data-bpa-record="1070"] td')?.textContent).toBe('1070');
  expect(doc.querySelector('[data-bpa-record="1071"] td')?.textContent).toBe('1071');
  const patient = doc.querySelector('.bpa-patient')?.textContent;
  for (const value of ['PACIENTE A','02/03/1980','Sexo: F','CNS: 456','CPF: 123','RUA PRINCIPAL','1139','CENTRO']) expect(patient).toContain(value);
  expect(doc.querySelector('.bpa-additional')?.textContent).toContain('M508, M755');
  expect(JSON.stringify(rows)).toBe(before);
 });
 it('mantém o padrão azul e o cabeçalho atual sem opções', () => {
  const doc = new DOMParser().parseFromString(buildBpaConferenceGroups([row]),'text/html');
  expect(doc.querySelector('.bpa-rejected')).toBeNull();
  expect(doc.querySelector('thead tr:nth-child(2) th:nth-child(4)')?.textContent).toBe('CID no TXT');
  expect(doc.querySelector('[data-bpa-record="1"]')).not.toBeNull();
 });
 it('escapa o cabeçalho customizado e todos os campos também na variante rejeitada', () => {
  const attack = '<img src=x onerror="alert(1)"><script>erro</script>';
  const doc = new DOMParser().parseFromString(buildBpaConferenceGroups([{...row,paciente_nome:attack,logradouro:attack,cid_usado:attack,cids_adicionais:[attack]}], {variant:'rejected',cidColumnHeader:attack}),'text/html');
  expect(doc.querySelector('img,script')).toBeNull();
  expect(doc.querySelector('.bpa-cid')?.textContent).toBe(attack);
  expect(doc.querySelector('thead tr:nth-child(2) th:nth-child(4)')?.textContent).toBe(attack);
 });
 it('não mistura homônimos com identificadores diferentes e não cria registros para lista vazia', () => {
  const doc = new DOMParser().parseFromString(buildBpaConferenceGroups([{...row,_ctx:{paciente_id:'a'}},{...row,_ctx:{paciente_id:'b'}}],{variant:'rejected'}),'text/html');
  expect(doc.querySelectorAll('table')).toHaveLength(2);
  expect(buildBpaConferenceGroups([],{variant:'rejected',startIndex:20})).toBe('');
 });
 it('reinicia em um quando o deslocamento é inválido', () => {
  for (const startIndex of [-1,NaN,Infinity,0.5]) {
   expect(buildBpaConferenceGroups([row],{variant:'rejected',startIndex})).toContain('data-bpa-record="1"');
  }
 });
});
