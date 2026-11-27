import { describe,expect,it } from 'vitest';
import { buildUnitProfilePrint,safeStructureLogo } from './structureProfilePrint';
const unit={id:'u1',nome:'Unidade <teste>',ativo:true};
const rooms=[{id:'a',nome:'Sala 10',unidadeId:'u1',ativo:false},{id:'b',nome:'Sala 2',unidadeId:'u1',ativo:true,examNames:'Exame <teste>'},{id:'x',nome:'Outra unidade',unidadeId:'u2',ativo:true}];
const meta={cnes:'1234567',videoConfigured:true},devices=new Set(['b']);
describe('ficha institucional de estrutura física',()=>{
  it('restringe a unidade, ordena naturalmente e escapa conteúdo',()=>{
    const html=buildUnitProfilePrint(unit,rooms,devices,meta,'');
    expect(html).toContain('Unidade &lt;teste&gt;');
    expect(html).toContain('Exame &lt;teste&gt;');
    expect(html).not.toContain('Outra unidade');
    expect(html.indexOf('Sala 2')).toBeLessThan(html.indexOf('Sala 10'));
    expect(html).toContain('2 sala(s) · 1 ativa(s) · 1 aparelho(s)');
  });
  it('não inclui equipe se a consulta não foi autorizada ou confirmada',()=>{
    expect(buildUnitProfilePrint(unit,rooms,devices,meta,'')).not.toContain('<th>Equipe vinculada</th>');
    expect(buildUnitProfilePrint(unit,rooms,devices,meta,'',new Map([['b',3]]))).toContain('<td class="num">3</td>');
  });
  it('não usa logos inseguras nem credenciais em URL',()=>{
    expect(safeStructureLogo('javascript:alert(1)')).toBe('');
    expect(safeStructureLogo('http://example.invalid/logo.png')).toBe('');
    expect(safeStructureLogo('https://user:pass@example.invalid/logo.png')).toBe('');
    expect(safeStructureLogo('https://example.invalid/logo.png')).toBe('https://example.invalid/logo.png');
  });
  it('trata estado vazio sem inventar registros ou validar CNES',()=>{
    const html=buildUnitProfilePrint(unit,[],devices,{cnes:'',videoConfigured:false},'');
    expect(html).toContain('Nenhuma sala cadastrada.');
    expect(html).toContain('Sem vídeo local configurado');
    expect(html).toContain('Não certifica CNES');
  });
  it('não altera as fontes de dados',()=>{
    const before=JSON.stringify([unit,rooms,meta]);
    buildUnitProfilePrint(unit,rooms,devices,meta,'');
    expect(JSON.stringify([unit,rooms,meta])).toBe(before);
  });
});
