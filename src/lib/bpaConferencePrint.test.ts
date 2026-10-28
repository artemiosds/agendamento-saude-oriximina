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
