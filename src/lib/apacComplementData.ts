// Coordinates in PDF points, top-left origin. Calibrated on the approved original.
export type Area = 'quimioterapia'|'radioterapia'|'nefroPrimeiro'|'nefroSeguimento'|'protese';
export const AREAS: {id:Area;label:string}[] = [
 {id:'quimioterapia',label:'Oncologia — Quimioterapia'},
 {id:'radioterapia',label:'Oncologia — Radioterapia'},
 {id:'nefroPrimeiro',label:'Nefrologia — Primeiro atendimento'},
 {id:'nefroSeguimento',label:'Nefrologia — Seguimento'},
 {id:'protese',label:'Prótese mamária'}
];
export type Complement = {areas:Area[];values:Record<string,string>};
export const emptyComplement=():Complement=>({areas:[],values:{}});
type Box=[number,number,number,number];
type Target={box:Box;size:number;min:number;align:'left'|'center'};
type Field={id:string;label:string;page:0|1;kind:'text'|'cid'|'date'|'wholeDate'|'digits'|'decimal'|'height'|'splitDecimal'|'choice';targets:Target[];options?:{value:string;label:string}[];pattern?:RegExp;max?:number;readOnly?:boolean};
type Group={id:string;label:string;fields:Field[];row?:number;depends?:string;area:Area|'oncologia';series?:string};
const target=(box:Box,size=9,min=6.5,align:Target['align']='left'):Target=>({box,size,min,align});
const txt=(id:string,label:string,page:0|1,box:Box,align:Target['align']='left',size=9,min=6.5,pattern?:RegExp):Field=>({id,label,page,kind:'text',targets:[target(box,size,min,align)],pattern});
const num=(id:string,label:string,page:0|1,box:Box,integer=false):Field=>({...txt(id,label,page,box,'center',9,6.5,integer?/^\d+$/:/^\d+(?:[,.]\d+)?$/),kind:'decimal'});
const divs=(edges:number[],y0:number,y1:number,size=8.5)=>edges.slice(0,-1).map((x,i)=>target([x+.6,y0,edges[i+1]-.6,y1],size,5,'center'));
const digits=(id:string,label:string,page:0|1,edges:number[],y0:number,y1:number,kind:Field['kind']='digits',size=8.5):Field=>({id,label,page,kind,targets:divs(edges,y0,y1,size),max:edges.length-1});
const date=(id:string,label:string,page:0|1,edges:number[],y0:number,y1:number):Field=>({id,label,page,kind:'date',targets:edges.slice(0,-1).map((x,i)=>target([x+1.2,y0,edges[i+1]-1.2,y1],8,5.5,'center'))});
const wholeDate=(id:string,label:string,page:0|1,box:Box):Field=>({...txt(id,label,page,box,'center',8),kind:'wholeDate'});
const choices=(id:string,label:string,page:0|1,options:[string,string,Box][]):Field=>({id,label,page,kind:'choice',options:options.map(([value,label])=>({value,label})),targets:options.map(([, ,box])=>target(box,7.5,5,'center'))});
const yn=(id:string,label:string,page:0|1,yes:Box,no:Box)=>choices(id,label,page,[['sim','Sim',yes],['nao','Não',no]]);
const pn=(id:string,label:string,pos:Box,neg:Box)=>choices(id,label,1,[['positivo','Positivo',pos],['negativo','Negativo',neg]]);
const cid=(id:string,label:string,edges:number[],y0:number,y1:number)=>digits(id,label,0,edges,y0,y1,'cid',8);
const g=(id:string,label:string,area:Group['area'],fields:Field[],rest:Partial<Group>={}):Group=>({id,label,area,fields,...rest});
const previous=(area:'quimioterapia'|'radioterapia')=>Array.from({length:3},(_,i)=>{
 const q=area==='quimioterapia',p=area+'.anteriores.'+(i+1),lo=q?[256.12,271.03,285.94][i]:[648.77,662.57,676.38][i],hi=q?[271.03,285.94,300.85][i]:[662.57,676.38,690.18][i];
 return g(p,'Tratamento anterior '+(i+1),area,[
 txt(p+'.descricao','Descrição',0,q?[84.6,lo+1,488.7,hi-1]:[86,lo+.8,486.8,hi-.8]),
 q?wholeDate(p+'.data_inicio','Data de início',0,[491,lo+1,555.8,hi-1]):date(p+'.data_inicio','Data de início',0,[487.79,511,529.5,554.39],lo+.8,hi-.8)
 ],{row:i+1,series:area+'.anteriores',depends:area+'.tratamento_anterior'});
});
export const GROUPS:Group[]=[
 g('oncologia','Identificação patológica','oncologia',[
 txt('oncologia.tumor_primario','Localização do tumor primário',0,[32,109,489,119]),
 cid('oncologia.cid_topografico','CID-10 topográfico',[493.13,510,527.2,545,556.84],110.5,119.8),
 choices('oncologia.linfonodos','Linfonodos regionais',0,[['sim','Sim',[94.12,130.97,106.88,140.73]],['nao','Não',[123.37,130.97,136.12,140.73]],['nao_avaliaveis','Não avaliáveis',[211.13,126.47,238.88,139.98]]]),
 txt('oncologia.metastases','Localização de metástases',0,[256,127,557,140]),
 txt('oncologia.estadio_uicc','Estádio UICC',0,[32,151,151,160.9],'center'),
 txt('oncologia.estadio_outro','Estádio — outro sistema',0,[157,150.9,461.5,161.8]),
 txt('oncologia.grau_histopatologico','Grau histopatológico',0,[466.5,147.6,558.5,161.5],'center'),
 txt('oncologia.diagnostico_cito_histopatologico','Diagnóstico cito/histopatológico',0,[32,172.7,465,182]),
 date('oncologia.data_diagnostico','Data do diagnóstico',0,[471.38,502.2,530.7,560.61],171,181.8)]),
 g('quimio-hist','Quimioterapia — Histórico','quimioterapia',[yn('quimioterapia.tratamento_anterior','Tratamento anterior?',0,[48.38,224.78,57.38,233.77],[84.42,224.78,93.37,233.77])]),
 ...previous('quimioterapia'),
 g('quimio-plan','Quimioterapia — Planejamento','quimioterapia',[
 yn('quimioterapia.continuidade','Continuidade do tratamento?',0,[88.88,338.12,102.38,350.13],[43.88,337.37,57.38,350.13]),
 date('quimioterapia.inicio','Data de início',0,[137.62,175.8,209.5,249.3],338,353),
 txt('quimioterapia.esquema','Esquema (sigla ou abreviatura)',0,[253,332.5,358,352.4],'center',8),
 num('quimioterapia.meses_planejados','Total de meses planejados',0,[363,332.5,454,352.4],true)
 ]),
 ...Array.from({length:10},(_,i)=>{
 const lo=401.99+14.91*i,hi=416.9+14.91*i,p='quimioterapia.medicamentos.'+(i+1);
 return g(p,'Medicamento '+(i+1),'quimioterapia',[
 {...txt(p+'.codigo','Código oficial do medicamento',0,[88.26,lo+.8,132.02,hi-.8],'center',7.5,6,/^\d{10}$/),max:10},
 txt(p+'.descricao','Descrição do medicamento',0,[134.02,lo+.8,553.95,hi-.8])
 ],{row:i+1,series:'quimioterapia.medicamentos'});
 }),
 g('radio-hist','Radioterapia — Histórico','radioterapia',[yn('radioterapia.tratamento_anterior','Tratamento anterior?',0,[91.12,619.57,100.12,630.83],[40.12,619.57,49.88,630.83])]),
 ...previous('radioterapia'),
 g('radio-plan','Radioterapia — Planejamento','radioterapia',[
 yn('radioterapia.continuidade','Continuidade do tratamento?',0,[98.62,711.13,106.01,720.22],[46.88,711.13,54.36,720.12]),
 date('radioterapia.inicio','Data de início',0,[131.62,184,216.3,252.37],714,730),
 choices('radioterapia.finalidade','Finalidade',0,[
 ['radical','Radical',[270.79,706.99,281.59,717.2]],['paliativa','Paliativa',[271.13,718.64,281.59,729.15]],['adjuvante','Adjuvante',[389.62,708.13,400.83,718.64]],['previa','Prévia',[389.62,720.14,400.83,729.9]],['antialgica','Antiálgica',[476.63,708.13,487.09,718.64]],['antihemorragica','Anti-hemorrágica',[476.63,719.39,487.09,729.9]]])
 ]),
 ...Array.from({length:3},(_,i)=>{
 const lo=[748.66,765.53,782.44][i],hi=[765.53,782.4,798.93][i],clo=[750.88,766.79,782.7][i],chi=[766.79,782.7,798.11][i],p='radioterapia.areas.'+(i+1);
 return g(p,'Área irradiada '+(i+1),'radioterapia',[
 cid(p+'.cid_topografico','CID topográfico',[40.42,58.41,76.4,94.4,112.39],clo+.8,chi-.8),
 txt(p+'.descricao','Descrição da área',0,[140.5,lo+(i===0?3.7:1),358.5,hi-1],'left',8.2),
 num(p+'.quantidade','Nº de campos/inserções',0,[360.7,lo+2,429.8,hi-1],true),
 date(p+'.inicio','Data de início',0,[430.88,449,465.8,487.88],lo+3,hi-.9),
 date(p+'.termino','Data de término',0,[487.88,506,523.2,553.87],lo+3,hi-.9)
 ],{row:i+1,series:'radioterapia.areas'});
 }),
 g('nefro-primeiro','Nefrologia — Primeiro atendimento','nefroPrimeiro',[
 date('nefrologia.primeiro.data_primeira_dialise','Data da primeira diálise',1,[28.12,63.5,89.5,133.85],128,140),
 digits('nefrologia.primeiro.altura_m','Altura (m; campo compartilhado com IMC)',1,[159.37,170.62,184.12,193.85],129.5,140.7,'height'),
 num('nefrologia.primeiro.peso','Peso (kg)',1,[221,127.2,254.5,140.7]),
 digits('nefrologia.primeiro.diurese_ml','Diurese (ml)',1,[285.38,296.63,310.13,320.61],128,140.5),
 num('nefrologia.primeiro.glicose','Glicose (mg/dl)',1,[355.2,126.5,388.8,140.6]),
 {id:'nefrologia.primeiro.albumina',label:'Albumina (unidade impressa: %)',page:1,kind:'splitDecimal',targets:[target([431.5,128,451,141.2],8.5,5.8,'center'),target([452.5,128,466.3,141.2],8.5,6.5,'center')]},
 {id:'nefrologia.primeiro.hb',label:'Hemoglobina (g%)',page:1,kind:'splitDecimal',targets:[target([493,127.8,512,140.5],8.5,5.8,'center'),target([513.2,127.8,527.7,140.5],8.5,6.5,'center')]},
 yn('nefrologia.primeiro.acesso_vascular','Acesso vascular',1,[37.12,157.23,48.35,166.99],[72.38,157.23,83.6,166.24]),
 pn('nefrologia.primeiro.hiv','aa HIV',[129.37,155.73,140.59,165.49],[183.37,155.73,194.59,165.49]),
 pn('nefrologia.primeiro.hcv','aa HCV',[247.88,155.73,259.1,165.49],[288.38,156.48,299.6,166.24]),
 pn('nefrologia.primeiro.hbsag','HBsAg',[349.12,155.73,360.34,165.49],[394.87,155.73,406.09,166.24]),
 yn('nefrologia.primeiro.ultrassonografia','Ultrassonografia abdominal',1,[451.88,156.48,463.1,166.24],[502.88,156.48,514.1,166.24])
 ]),
 g('nefro-seguimento','Nefrologia — Seguimento','nefroSeguimento',[
 num('nefrologia.seguimento.tru','TRU',1,[75,202,108.8,222]),
 num('nefrologia.seguimento.hb','Hemoglobina (g%)',1,[203.2,200.3,237,220]),
 num('nefrologia.seguimento.albumina','Albumina (g%)',1,[354.7,202.6,388.5,222.2]),
 num('nefrologia.seguimento.intervencoes_fistula','Quantidade de intervenções de fístula',1,[503.2,205,537,222.2],true),
 yn('nefrologia.seguimento.cncdo','Inscrito na lista da CNCDO',1,[41.62,248.8,52.85,258.56],[82.88,248.8,94.1,258.56]),
 pn('nefrologia.seguimento.hiv','aa HIV',[158.62,248.8,169.84,258.56],[205.88,248.8,217.1,258.56]),
 pn('nefrologia.seguimento.hcv','aa HCV',[307.88,250.3,319.1,260.06],[360.37,251.05,371.59,260.81]),
 pn('nefrologia.seguimento.hbsag','HBsAg',[448.13,251.8,459.35,261.56],[505.13,251.05,516.35,260.81])
 ]),
 g('protese','Prótese mamária','protese',[
 choices('protese_mamaria.marca','Marca da prótese',1,[['pip','PIP',[31.88,311.85,43.1,321.61]],['rofil','ROFIL',[68.62,311.85,79.85,321.61]]]),
 {...digits('protese_mamaria.ano_implantacao','Ano de implantação',1,[176.62,192.37,210,227.63,244.79],311.5,323,'digits',9),pattern:/^\d{4}$/},
 txt('protese_mamaria.estabelecimento','Estabelecimento onde foi realizado o implante',1,[298,313,450,326],'left',8.2),
 {...digits('protese_mamaria.cnes','CNES do estabelecimento',1,[451.88,466.45,481.09,495.73,510.37,524.95,539.59,554.59],309,323,'digits',8.6),pattern:/^\d{7}$/}
 ])
];
export const activeGroups=(d:Complement)=>GROUPS.filter(g=>(g.area==='oncologia'?d.areas.includes('quimioterapia')||d.areas.includes('radioterapia'):d.areas.includes(g.area))&&(!g.depends||d.values[g.depends]==='sim'));
export function parts(field:Field,raw:string):string[]{
 const s=raw.trim().toLocaleUpperCase('pt-BR');if(!s)return [];
 if(field.pattern&&!field.pattern.test(s))throw new Error('Formato inválido');
 switch(field.kind){
 case 'choice':{const i=field.options!.findIndex(o=>o.value===raw);if(i<0)throw new Error('Seleção inválida');return field.targets.map((_,j)=>i===j?'X':'');}
 case 'cid':{const c=s.replace('.','');if(!/^[A-Z]\d{2}[A-Z0-9]?$/.test(c))throw new Error('CID inválido');return Array.from(c);}
 case 'date':case 'wholeDate':{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('Data inválida');const d=new Date(s+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error('Data inválida');const [y,m,day]=s.split('-');return field.kind==='date'?[day,m,y]:[day+'/'+m+'/'+y];}
 case 'digits':if(!/^\d+$/.test(s)||s.length>field.targets.length)throw new Error('Quantidade de dígitos inválida');return Array.from(s);
 case 'height':{if(!/^\d[,.]\d{2}$/.test(s))throw new Error('Informe altura em metros com duas casas decimais, ex.: 1,70');return [s[0]+',',s[2],s[3]];}
 case 'splitDecimal':{if(!/^\d{1,2}(?:[,.]\d)?$/.test(s))throw new Error('Informe o valor com até uma casa decimal, sem arredondar');const [a,b]=s.replace('.',',').split(',');return b?[a+',',b]:[a];}
 case 'decimal':return [s.replace('.',',')];
 default:return [s];
 }
}
export function validateComplement(d:Complement):string[]{
 const errors:string[]=[];
 if(!d.areas.length)return errors;
 for(const g of activeGroups(d)){
 const filled=g.fields.some(f=>!!d.values[f.id]?.trim());
 for(const f of g.fields){const raw=d.values[f.id]||'';try{parts(f,raw);}catch(e){errors.push(f.label+' ('+g.label+'): '+(e instanceof Error?e.message:'Valor inválido'));}
 if(g.row&&filled&&!raw.trim())errors.push(g.label+': preencha '+f.label+'.');
 }
 if(g.series==='quimioterapia.medicamentos'&&g.row===1&&!filled)errors.push('Quimioterapia: informe o primeiro medicamento com código oficial e descrição.');
 if(g.series==='radioterapia.areas'&&filled){const a=d.values[g.id+'.inicio'],b=d.values[g.id+'.termino'];if(a&&b&&b<a)errors.push(g.label+': término anterior ao início.');}
 }
 for(const area of d.areas){if(!activeGroups(d).some(g=>g.area===area&&g.fields.some(f=>d.values[f.id]?.trim())))errors.push('Preencha os dados de '+AREAS.find(a=>a.id===area)?.label+'.');}
 if(d.areas.includes('quimioterapia')&&d.values['quimioterapia.med_catalog_confirmed']!=='sim')errors.push('Confirme os códigos dos medicamentos na lista oficial vigente.');
 return [...new Set(errors)];
}
