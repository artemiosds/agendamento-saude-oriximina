import {sameConfigSection,configObject} from './configSectionGuard';
import type {CustomFieldsConfig,ScreenConfig} from '@/hooks/useCustomFields';

export const emptyAdminScreen=():ScreenConfig=>({fields:[],hiddenNative:[],labelOverrides:{},orderedNames:[]});
export function readAdminScope(config:CustomFieldsConfig,screen:string,unit:string):ScreenConfig|undefined {
  const group=config[screen];
  if(group===undefined)return undefined;
  configObject(group);
  const value=group[unit];
  if(value===undefined)return undefined;
  configObject(value);
  if(!Array.isArray(value.fields)||!Array.isArray(value.hiddenNative)||!value.labelOverrides||typeof value.labelOverrides!=='object'||Array.isArray(value.labelOverrides))throw Error('Configuração da tela inválida.');
  return value;
}
export function mergeAdminScope(current:CustomFieldsConfig,screen:string,unit:string,expected:ScreenConfig|undefined,next:ScreenConfig,natives:readonly string[]):CustomFieldsConfig {
  const stored=readAdminScope(current,screen,unit);
  if(!sameConfigSection(stored,expected))throw Error('Esta tela/unidade foi alterada por outra sessão. Recarregue antes de editar.');
  const previous=stored??emptyAdminScreen();
  // A global reference can be consumed by any unit. Reject removal while an overlapping scope still refers to it.
  const removed=previous.fields.filter(f=>!next.fields.some(n=>n.id===f.id));
  for(const field of removed){
    if(next.fields.some(f=>f.condicao?.fieldName===field.nome))throw Error('Campo referenciado por uma condição.');
    if(unit==='__global__'&&Object.entries(current[screen]??{}).some(([scope,value])=>scope!==unit&&value.fields.some(f=>f.condicao?.fieldName===field.nome)))throw Error('Campo global referenciado por uma unidade.');
  }
  const group=current[screen]??{};
  const added=next.fields.filter(f=>!previous.fields.some(old=>old.id===f.id));
  for(const field of added){
    if(!field.nome||natives.includes(field.nome)||next.fields.filter(f=>f.nome===field.nome).length>1)throw Error('Nome interno já utilizado ou inválido.');
    for(const [scope,value] of Object.entries(group)){
      if(scope!==unit&&(unit==='__global__'||scope==='__global__')&&value.fields.some(f=>f.nome===field.nome))throw Error('Nome interno já utilizado em uma configuração global ou de unidade que se sobrepõe.');
    }
  }
  return {...current,[screen]:{...group,[unit]:{...stored,...next}}};
}
export function conditionalCycle(fields:readonly {key:string;reference?:string}[],key:string):boolean {
  const byKey=new Map(fields.map(f=>[f.key,f.reference]));
  const visited=new Set<string>();
  let current:string|undefined=key;
  while(current){
    if(visited.has(current))return true;
    visited.add(current);current=byKey.get(current);
  }
  return false;
}
export function validateFieldLimits(min:string,max:string,length:string,regex:string):string|null {
  const low=min.trim()===''?undefined:Number(min),high=max.trim()===''?undefined:Number(max),size=length.trim()===''?undefined:Number(length);
  if((low!==undefined&&!Number.isFinite(low))||(high!==undefined&&!Number.isFinite(high)))return 'Limites numéricos inválidos.';
  if(low!==undefined&&high!==undefined&&low>high)return 'O mínimo não pode ser maior que o máximo.';
  if(size!==undefined&&(!Number.isSafeInteger(size)||size<1))return 'Informe um comprimento máximo inteiro positivo.';
  if(regex){try{new RegExp(regex);}catch{return 'Expressão regular inválida.';}}
  return null;
}
