export interface MedicationRow {
 medicamento:string;dosagem:string;via:string;frequencia:string;duracao:string;observacao:string;
 catalogoId?:string;catalogoTipo?:string;
}
export interface CatalogMedication {
 id:string;nome:string;nome_comercial:string;principio_ativo:string;concentracao:string;forma_farmaceutica:string;apresentacao:string;origem:string;tipo:string;codigo_rename:string|null;
 estoque_controlado:boolean;estoque_quantidade:number;estoque_minimo:number;
}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const isStandardPrescription=(name:string)=>norm(name)==='receituario medico padrao';
export const emptyPrescriptionRow=():MedicationRow=>({medicamento:'',dosagem:'',via:'',frequencia:'',duracao:'',observacao:''});
export function catalogLabel(m:CatalogMedication){
 const parts=[m.nome.trim()];
 for(const value of [m.concentracao,m.forma_farmaceutica])if(value?.trim()&&!norm(parts.join(' ')).includes(norm(value)))parts.push(value.trim());
 if(!m.concentracao&&!m.forma_farmaceutica&&m.apresentacao?.trim()&&!norm(parts.join(' ')).includes(norm(m.apresentacao)))parts.push(m.apresentacao.trim());
 return parts.join(' — ');
}
export function searchCatalog(items:CatalogMedication[],query:string){
 const q=norm(query);if(q.length<2)return [];
 const tokens=q.split(' ');
 return items.filter(m=>{const hay=norm([m.nome,m.nome_comercial,m.principio_ativo,m.concentracao,m.forma_farmaceutica,m.apresentacao,m.codigo_rename].filter(Boolean).join(' '));return tokens.every(x=>hay.includes(x));}).slice(0,20);
}
export function addCatalogMedication(rows:MedicationRow[],m:CatalogMedication){
 if(rows.some(r=>r.catalogoId===m.id))return rows;
 const next={...emptyPrescriptionRow(),medicamento:catalogLabel(m),catalogoId:m.id,catalogoTipo:m.tipo};
 const i=rows.findIndex(r=>![r.medicamento,r.dosagem,r.frequencia,r.duracao,r.observacao].some(v=>v.trim())&&(!r.via||r.via==='oral'));
 return i<0?[...rows,next]:rows.map((r,j)=>j===i?next:r);
}
export function editPrescriptionRow(row:MedicationRow,field:'medicamento'|'dosagem'|'via'|'frequencia'|'duracao'|'observacao',value:string):MedicationRow{
 if(field==='medicamento'&&value!==row.medicamento){
  // A different product must not inherit the dose or directions of the previous product.
  if(row.catalogoId)return {...emptyPrescriptionRow(),medicamento:value};
  return {...row,medicamento:value};
 }
 return {...row,[field]:value};
}
export function medicationWarning(type?:string){
 return type==='controlado'||type==='psicotropico'?'Medicamento sujeito a controle especial. Confira o receituário exigido antes de emitir.':type==='antibiotico'?'Antimicrobiano: confira os requisitos específicos de prescrição e dispensação.':'';
}
export function stockLabel(m:CatalogMedication){
 if(!m.estoque_controlado)return '';
 return m.estoque_quantidade<=0?'Sem estoque informado disponível':m.estoque_quantidade<=m.estoque_minimo?'Estoque baixo':'Estoque cadastrado disponível';
}
