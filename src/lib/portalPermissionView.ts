import type { PortalPermissoes } from '@/types';
export type PortalTab = 'proximos' | 'historico' | 'fila' | 'exames' | 'dados';
export const PORTAL_PERMISSION_GROUPS: { title:string; description:string; rules:{key:keyof PortalPermissoes;label:string;desc:string;enforcement:string}[] }[] = [
  {title:'Consultas e histórico',description:'Organiza as abas de agendamentos do paciente.',rules:[
    {key:'verProximas',label:'Ver próximas consultas',desc:'Mostra a aba de consultas futuras.',enforcement:'Interface; leitura direta ainda depende de política do banco.'},
    {key:'verHistorico',label:'Ver histórico de atendimentos',desc:'Mostra consultas anteriores, faltas e cancelamentos.',enforcement:'Interface; leitura direta ainda depende de política do banco.'},
    {key:'cancelar',label:'Cancelar consultas',desc:'Permite cancelar consultas pendentes ou confirmadas antes da chegada, na aba de próximas consultas.',enforcement:'Validação prevista na RPC de cancelamento.'},
  ]},
  {title:'Acompanhamento e cadastro',description:'Controla a fila e a edição da própria ficha.',rules:[
    {key:'verFila',label:'Ver posição na fila de espera',desc:'Exibe a fila e as notificações de chamada.',enforcement:'Validação prevista na política de leitura da fila.'},
    {key:'editarDados',label:'Editar dados cadastrais',desc:'Permite edição da ficha; o e-mail de login permanece protegido.',enforcement:'Validação prevista na função de atualização cadastral.'},
  ]},
  {title:'Documentos',description:'Controla a impressão de comprovantes de agendamento.',rules:[
    {key:'imprimirComprovante',label:'Imprimir comprovante',desc:'Permite emitir comprovantes nas abas de consultas autorizadas. Não controla laudos de exames.',enforcement:'Interface com nova conferência de autorização antes de emitir.'},
  ]},
];
export function portalAllowedTabs(perms: PortalPermissoes): PortalTab[] {
  return [...(perms.verProximas ? ['proximos' as const] : []),...(perms.verHistorico ? ['historico' as const] : []),...(perms.verFila ? ['fila' as const] : []),'exames','dados'];
}
export function portalSafeTab(tab: PortalTab, perms: PortalPermissoes): PortalTab {
  const allowed=portalAllowedTabs(perms);
  return allowed.includes(tab) ? tab : allowed.find(t=>t!=='exames') ?? 'dados';
}
export function canPrintPortalReceipt(perms: PortalPermissoes, sections: {future:boolean;past:boolean}): boolean {
  return perms.imprimirComprovante && ((perms.verProximas && sections.future) || (perms.verHistorico && sections.past));
}
export function portalAppointmentSections(row:{data:string;status:string}, now:Date) {
  const end=new Date(row.data+'T23:59:59');
  return {future:end>=now && !['cancelado','falta'].includes(row.status),past:end<now || ['cancelado','concluido','falta'].includes(row.status)};
}
