import type { StructureRoom, StructureUnit, UnitMetadata } from './structureDirectory';

export type UnitProfile = StructureUnit & {endereco?:string|null;telefone?:string|null;whatsapp?:string|null};
export type ProfileRoom = StructureRoom & {examNames?:string};
export const escapeStructureHtml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function safeStructureLogo(value:unknown):string{
  if(typeof value!=='string')return '';
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function buildUnitProfilePrint(unit:UnitProfile,rooms:readonly ProfileRoom[],devices:ReadonlySet<string>,meta:UnitMetadata,logoUrl:string,staffCounts?:ReadonlyMap<string,number>){
  const esc=escapeStructureHtml;
  const own=rooms.filter(r=>r.unidadeId===unit.id).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true,sensitivity:'base'})||a.id.localeCompare(b.id));
  const text=(v:unknown)=>esc(String(v??'').trim()||'Não informado');
  const logo=safeStructureLogo(logoUrl);
  const rows=own.map(r=>`<tr><td>${text(r.nome)}</td><td>${r.ativo?'Ativa':'Inativa'}</td><td>${devices.has(r.id)?'Aparelho / exame':'Consultório'}</td><td>${devices.has(r.id)?text(r.examNames):'—'}</td>${staffCounts?`<td class="num">${staffCounts.get(r.id)??0}</td>`:''}</tr>`).join('');
  return `<style>.structure-ficha{font:10pt Arial,sans-serif;line-height:1.35;color:#16394d}.structure-ficha h2{font-size:11pt;margin:10px 0 5px;break-after:avoid}.structure-ficha .unit-logo{float:right;max-width:30mm;max-height:20mm;object-fit:contain;margin:0 0 5px 8px}.structure-ficha dl{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin:0 0 8px}.structure-ficha dt{font-size:8pt;font-weight:bold;color:#4b6576}.structure-ficha dd{margin:0;overflow-wrap:anywhere}.structure-ficha table{width:100%;border-collapse:collapse;font-size:9pt}.structure-ficha thead{display:table-header-group}.structure-ficha th,.structure-ficha td{border:1px solid #d2dee5;padding:5px;text-align:left;overflow-wrap:anywhere}.structure-ficha th{background:#eaf2f6}.structure-ficha tr{break-inside:avoid}.structure-ficha .num{text-align:center}.structure-ficha .note{font-size:8pt;color:#516675;margin-top:7px}</style>
<div class="structure-ficha">${logo?`<img class="unit-logo" src="${esc(logo)}" alt="Logo da unidade selecionada"/>`:''}
<h2>Identificação institucional</h2><dl><div><dt>Unidade</dt><dd>${text(unit.nome)}</dd></div><div><dt>Nome de exibição</dt><dd>${text(unit.nomeExibicao)}</dd></div><div><dt>CNES</dt><dd>${text(meta.cnes)}${/^\d{7}$/.test(meta.cnes)?' (formato preenchido)':' — conferir'}</dd></div><div><dt>Situação</dt><dd>${unit.ativo?'Ativa':'Inativa'}</dd></div><div><dt>Endereço</dt><dd>${text(unit.endereco)}</dd></div><div><dt>Telefone / WhatsApp</dt><dd>${text(unit.telefone)} / ${text(unit.whatsapp)}</dd></div></dl>
<h2>Estrutura física cadastrada</h2><p>${own.length} sala(s) · ${own.filter(r=>r.ativo).length} ativa(s) · ${own.filter(r=>devices.has(r.id)).length} aparelho(s)</p>
<table><thead><tr><th>Sala</th><th>Situação</th><th>Finalidade</th><th>Exames cadastrados</th>${staffCounts?'<th>Equipe vinculada</th>':''}</tr></thead><tbody>${rows||`<tr><td colspan="${staffCounts?5:4}">Nenhuma sala cadastrada.</td></tr>`}</tbody></table>
<h2>Painel de Chamadas</h2><p>${meta.videoConfigured?'Vídeo local configurado':'Sem vídeo local configurado'}.</p>
<p class="note">Ficha administrativa da estrutura cadastrada. Não certifica CNES, capacidade, ocupação, escala, funcionamento da TV ou disponibilidade de vagas. ${staffCounts?'Equipe: funcionários ativos vinculados à mesma sala e unidade nos registros acessíveis.':'Vínculos da equipe não incluídos.'}</p></div>`;
}
