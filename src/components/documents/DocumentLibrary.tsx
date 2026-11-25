import React, {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {ClipboardCheck,ClipboardList,ContactRound,FileSignature,FileText,FolderOpen,LayoutGrid,Loader2,MoreVertical,Pencil,Search,Star,Stethoscope,UserRound,Accessibility,X,ArrowRight} from 'lucide-react';

export type DocumentCategory='Todos'|'Cadastro'|'Clínico'|'Regulação'|'CER';
export const DOCUMENT_CATEGORIES:DocumentCategory[]=['Todos','Cadastro','Clínico','Regulação','CER'];
const categoryIcons={Todos:LayoutGrid,Cadastro:ContactRound,'Clínico':Stethoscope,'Regulação':ClipboardCheck,CER:Accessibility};
export interface LibraryItem {id:string;nome:string;categoria:Exclude<DocumentCategory,'Todos'>;descricao?:string;codigo?:string;icon?:React.ReactNode;canEdit?:boolean}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
export function classifyDocument(tipo:string,nome:string):Exclude<DocumentCategory,'Todos'> {
 const raw=normalize((tipo||'')+' '+(nome||''));
 if(/\b(oci|apac)\b|regula/.test(raw))return 'Regulação';
 if(/\bcer\b|\balta\b/.test(raw))return 'CER';
 if(/cadastr|\bficha\b/.test(raw))return 'Cadastro';
 return 'Clínico';
}
export function modelCode(model:{blocos_clinicos?:unknown}):string{
 const code=(model.blocos_clinicos as {oci?:{procedimento_principal?:{codigo?:unknown}}}|undefined)?.oci?.procedimento_principal?.codigo;
 return typeof code==='string'&&/^\d{10}$/.test(code)?code:'';
}
export function matchesDocument(item:LibraryItem,query:string){
 const q=normalize(query);
 const hay=normalize([item.nome,item.categoria,item.descricao,item.codigo].filter(Boolean).join(' '));
 return !q||q.split(' ').every(word=>hay.includes(word));
}
function readFavorites(userId:string):string[]{
 if(!userId)return [];
 try{const v=JSON.parse(localStorage.getItem('document-library-favorites:v1:'+userId)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,200):[];}catch{return [];}
}
export function DocumentPatientBanner({name}:{name?:string}){
 return <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
 <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary"><UserRound className="h-5 w-5"/></div>
 <div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Paciente selecionado</p><p className="text-sm font-semibold break-words">{name||'Nenhum paciente selecionado'}</p></div>
 </div>;
}
interface Props{
 items:LibraryItem[];userId?:string;loading?:boolean;error?:string;
 search:string;onSearch:(s:string)=>void;category:DocumentCategory;onCategory:(v:DocumentCategory)=>void;
 onGenerate:(id:string)=>void;onSign?:(id:string)=>void;onEdit?:(id:string)=>void;disabled?:boolean;
}
export default function DocumentLibrary({items,userId='',loading=false,error,search,onSearch,category,onCategory,onGenerate,onSign,onEdit,disabled=false}:Props){
 const [favorites,setFavorites]=useState<string[]>(()=>readFavorites(userId));
 const [onlyFavorites,setOnlyFavorites]=useState(false);
 useEffect(()=>{setFavorites(readFavorites(userId));setOnlyFavorites(false);},[userId]);
 const toggle=(id:string)=>{
 const next=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id].slice(-200);
 setFavorites(next);
 if(userId)try{localStorage.setItem('document-library-favorites:v1:'+userId,JSON.stringify(next));}catch{/* session-only fallback */}
 };
 const availableFavorites=items.filter(x=>favorites.includes(x.id)).length;
 const counts=useMemo(()=>Object.fromEntries(DOCUMENT_CATEGORIES.map(c=>[c,items.filter(i=>c==='Todos'||i.categoria===c).length])),[items]);
 const filtered=items.filter(i=>(category==='Todos'||i.categoria===category)&&(!onlyFavorites||favorites.includes(i.id))&&matchesDocument(i,search));
 return <div className="flex min-h-0 flex-col gap-3">
 <div className="flex gap-2 items-center">
 <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"/><Input aria-label="Buscar documento" value={search} onChange={e=>onSearch(e.target.value)} placeholder="Buscar por nome, finalidade ou código..." className="pl-9 pr-9 h-10"/>{search&&<Button type="button" variant="ghost" size="icon" aria-label="Limpar busca" className="absolute right-1 top-1 h-8 w-8" onClick={()=>onSearch('')}><X className="h-4 w-4"/></Button>}</div>
 <Button type="button" variant={onlyFavorites?'default':'outline'} aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(v=>!v)} className="h-10 gap-1.5 px-3" title="Mostrar favoritos"><Star className={'h-4 w-4 '+(onlyFavorites?'fill-current':'')}/><span className="hidden sm:inline">Favoritos</span><span className="text-xs">{availableFavorites}</span></Button>
 </div>
 <nav aria-label="Categorias de documentos" className="flex flex-wrap gap-1.5">
 {DOCUMENT_CATEGORIES.map(c=>{const Icon=categoryIcons[c];return <Button key={c} type="button" variant={category===c?'default':'outline'} aria-pressed={category===c} onClick={()=>onCategory(c)} className="gap-1.5 h-9 px-2.5 text-xs sm:text-sm"><Icon className="h-4 w-4 shrink-0"/>{c}<span className="text-[11px] opacity-80 tabular-nums">{counts[c]}</span></Button>})}
 </nav>
 {loading?<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando documentos...</div>:<>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{filtered.length} {filtered.length===1?'documento disponível':'documentos disponíveis'}</span>{onlyFavorites&&<button type="button" className="underline" onClick={()=>setOnlyFavorites(false)}>Ver todos os documentos</button>}</div>
 <div className="space-y-4">
 {filtered.length===0?<div className="rounded-lg border border-dashed py-10 px-4 text-center text-sm text-muted-foreground"><FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-60"/><p>Nenhum documento encontrado.</p><p className="text-xs mt-1">Altere a busca ou a categoria.</p><Button type="button" variant="ghost" size="sm" className="mt-2" onClick={()=>{onSearch('');onCategory('Todos');setOnlyFavorites(false);}}>Limpar filtros</Button></div>:DOCUMENT_CATEGORIES.slice(1).map(c=>{
 const group=filtered.filter(i=>i.categoria===c);if(!group.length)return null;const Icon=categoryIcons[c];
 return <section key={c} aria-label={c} className="space-y-2">
 <div className="flex items-center gap-2 border-b pb-1.5"><Icon className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">{c}</h3><span className="ml-auto text-xs text-muted-foreground tabular-nums">{group.length}</span></div>
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
 {group.map(item=><article key={item.id} className="group flex min-w-0 rounded-xl border bg-card transition-colors hover:border-primary/40 hover:bg-muted/20">
 <button type="button" disabled={disabled} onClick={()=>onGenerate(item.id)} aria-label={'Gerar '+item.nome} className="flex flex-1 min-w-0 items-start gap-3 text-left p-3 rounded-l-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
 <div className="flex shrink-0 items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary">{item.icon||<Icon className="h-5 w-5"/>}</div>
 <div className="flex-1 min-w-0 space-y-1"><p className="text-sm font-semibold leading-snug break-words [overflow-wrap:anywhere]">{item.nome}</p>{item.descricao&&<p className="text-xs text-muted-foreground leading-snug break-words">{item.descricao}</p>}{item.codigo&&<p className="text-xs font-mono text-muted-foreground">SIGTAP {item.codigo}</p>}<span className="inline-flex items-center gap-1 text-xs font-medium text-primary">Gerar <ArrowRight className="w-3 h-3"/></span></div>
 </button>
 <div className="flex shrink-0 items-start gap-0.5 pt-2 pr-2">
 <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={(favorites.includes(item.id)?'Remover favorito ':'Favoritar ')+item.nome} aria-pressed={favorites.includes(item.id)} onClick={()=>toggle(item.id)}><Star className={'h-4 w-4 '+(favorites.includes(item.id)?'fill-amber-400 text-amber-600':'text-muted-foreground')}/></Button>
 {(onSign||(onEdit&&item.canEdit))&&<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={'Ações de '+item.nome}><MoreVertical className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-40">{onSign&&<DropdownMenuItem disabled={disabled} onSelect={()=>onSign(item.id)}><FileSignature className="mr-2 h-4 w-4"/>Assinar</DropdownMenuItem>}{onEdit&&item.canEdit&&<DropdownMenuItem onSelect={()=>onEdit(item.id)}><Pencil className="mr-2 h-4 w-4"/>Editar modelo</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>}
 </div></article>)}
 </div></section>;
 })}
 </div></>}
 </div>;
}
