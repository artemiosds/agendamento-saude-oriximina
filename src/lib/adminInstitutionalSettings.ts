import {configObject,sameConfigSection} from './configSectionGuard';
import {safeIntegrationUrl} from './adminIntegrations';
export interface SistemaConfig {
  instituicao: { nome: string; cer: string; cnpj: string; endereco: string; telefone: string; email: string; logoUrl: string; marcaTitulo?:string; marcaSubtitulo?:string; marcaCidadeUf?:string; marcaUnidadeCarimbo?:string; marcaMantenedora?:string };
  notificacoes: {
    notificarChegada: boolean; alertarFimCiclo: boolean; alertarPtsVencer: boolean;
    notificarTriagemPendente: boolean; resumoDiario: boolean; relatorioSemanal: boolean;
    canal: string;
  };
  aparencia: { tema: string; corPrimaria: string; fonte: string; tamanhoFonte: string };
  conformidade: { lgpdTexto: string; exibirAvisoLgpd: boolean; retencaoDados: number; anonimizarApos: number };
}

export const DEFAULT: SistemaConfig = {
  instituicao: {
    nome: 'Secretaria Municipal de Saúde de Oriximiná',
    cer: 'Centro Especializado em Reabilitação Nível II',
    cnpj: '', endereco: '', telefone: '', email: '', logoUrl: '',
  },
  notificacoes: {
    notificarChegada: true, alertarFimCiclo: true, alertarPtsVencer: true,
    notificarTriagemPendente: true, resumoDiario: false, relatorioSemanal: false,
    canal: 'ambos',
  },
  aparencia: { tema: 'sistema', corPrimaria: '#1B3A5C', fonte: 'Inter', tamanhoFonte: 'medio' },
  conformidade: {
    lgpdTexto: 'Este sistema coleta e processa dados pessoais de saúde em conformidade com a Lei Geral de Proteção de Dados (LGPD). Os dados são utilizados exclusivamente para fins de atendimento clínico e são armazenados de forma segura.',
    exibirAvisoLgpd: true, retencaoDados: 20, anonimizarApos: 25,
  },
};


const groups=['instituicao','notificacoes','aparencia','conformidade'] as const;
export function readInstitutionalConfig(raw:unknown):SistemaConfig{
 const root=raw===undefined?{}:configObject(raw);
 const result={...DEFAULT,...root};
 for(const group of groups){
   const current=root[group]===undefined?{}:configObject(root[group]);
   const defaults=DEFAULT[group];
   for(const [key,value] of Object.entries(defaults)){
     if(current[key]!==undefined&&typeof current[key]!==typeof value)throw Error('Formato institucional inválido.');
   }
   result[group]={...defaults,...current};
 }
 const i=configObject(result.instituicao);
 for(const key of ['marcaTitulo','marcaSubtitulo','marcaCidadeUf','marcaUnidadeCarimbo','marcaMantenedora'])if(i[key]!==undefined&&typeof i[key]!=='string')throw Error('Marca institucional inválida.');
 return result as unknown as SistemaConfig;
}
/** Keep the stored document intact; write only changed fields in edited groups. */
export function mergeInstitutionalEdits(raw:unknown,baseline:SistemaConfig,draft:SistemaConfig){
 const root=raw===undefined?{}:configObject(raw);
 const next={...root};
 for(const group of groups){
   const old=configObject(baseline[group]),edited=configObject(draft[group]);
   const delta=Object.fromEntries(Object.entries(edited).filter(([key,value])=>!sameConfigSection(old[key],value)));
   if(Object.keys(delta).length)next[group]={...DEFAULT[group],...(root[group]===undefined?{}:configObject(root[group])),...delta};
 }
 return next;
}
export function validateInstitutionalEdits(before:SistemaConfig,after:SistemaConfig):string|null{
 const old=before.instituicao,i=after.instituicao;
 if(i.nome!==old.nome&&!i.nome.trim())return 'Informe o nome da instituição.';
 if(i.logoUrl!==old.logoUrl&&i.logoUrl!==''&&!safeIntegrationUrl(i.logoUrl))return 'Informe URL HTTP/HTTPS válida para o logotipo.';
 if(i.email!==old.email&&i.email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email))return 'Informe um e-mail institucional válido.';
 if(after.aparencia.corPrimaria!==before.aparencia.corPrimaria&&!/^#[0-9a-fA-F]{6}$/.test(after.aparencia.corPrimaria))return 'A cor deve estar no formato #RRGGBB.';
 for(const key of ['retencaoDados','anonimizarApos'] as const){
   const v=after.conformidade[key];if(v!==before.conformidade[key]&&(!Number.isSafeInteger(v)||v<1||v>100))return 'Informe prazos inteiros entre 1 e 100 anos.';
 }
 // These fields are consumed by existing print/branding readers; do not introduce markup.
 for(const key of ['marcaTitulo','marcaSubtitulo','marcaCidadeUf','marcaUnidadeCarimbo','marcaMantenedora'] as const){
   const v=i[key];if(v!==old[key]&&v!==undefined&&(v.length>300||/[<>]/.test(v)))return 'Use texto simples de até 300 caracteres nos campos de marca.';
 }
 return null;
}
