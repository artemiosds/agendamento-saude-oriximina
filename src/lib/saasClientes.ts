/**
 * Painel Central SaaS — registro de clientes/contratos.
 * Guardado em system_config id='saas_clientes' (acesso só do dono global, travado no banco).
 * Sem nenhum dado clínico: apenas dados contratuais.
 */
import { DEFAULT_LICENSE, LicenseState, normalizeLicense } from './licenseModules';

export type TipoOrganizacao = 'publica_sus' | 'filantropica' | 'particular';
export type StatusContrato = 'ativo' | 'demonstracao' | 'suspenso' | 'cancelado';

export const TIPO_LABEL: Record<TipoOrganizacao, string> = {
  publica_sus: 'Pública (SUS)', filantropica: 'Filantrópica', particular: 'Particular / Convênios',
};
export const STATUS_LABEL: Record<StatusContrato, string> = {
  ativo: 'Ativo', demonstracao: 'Demonstração', suspenso: 'Suspenso', cancelado: 'Cancelado',
};

export interface HistoricoItem { em: string; por: string | null; motivo: string; acao: string }

export interface SaasCliente {
  id: string;
  nome: string;
  nomeCurto: string;
  tipo: TipoOrganizacao;
  cnpj: string;
  cidade: string;
  uf: string;
  responsavel: string;
  email: string;
  telefone: string;
  status: StatusContrato;
  inicio: string;      // YYYY-MM-DD
  vencimento: string;  // YYYY-MM-DD ('' = sem vencimento)
  modulos: LicenseState;
  observacoes: string;
  historico: HistoricoItem[];
}

export function novoCliente(): SaasCliente {
  return {
    id: crypto.randomUUID(), nome: '', nomeCurto: '', tipo: 'publica_sus', cnpj: '', cidade: '', uf: '',
    responsavel: '', email: '', telefone: '', status: 'demonstracao',
    inicio: new Date().toISOString().slice(0, 10), vencimento: '',
    modulos: { ...DEFAULT_LICENSE }, observacoes: '', historico: [],
  };
}

export function normalizeClientes(raw: any): SaasCliente[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(c => c && typeof c.id === 'string').map(c => ({
    ...novoCliente(), ...c, modulos: normalizeLicense(c.modulos), historico: Array.isArray(c.historico) ? c.historico : [],
  }));
}

/** Valida CNPJ pelos dígitos verificadores. Vazio é aceito (cliente em negociação). */
export function cnpjValido(v: string): boolean {
  const d = (v || '').replace(/\D/g, '');
  if (!d) return true;
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const pesos = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function validarCliente(c: SaasCliente): string[] {
  const erros: string[] = [];
  if (c.nome.trim().length < 3) erros.push('Informe o nome da instituição.');
  if (!cnpjValido(c.cnpj)) erros.push('CNPJ inválido.');
  if (c.uf && !/^[A-Z]{2}$/.test(c.uf)) erros.push('UF deve ter 2 letras.');
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) erros.push('E-mail inválido.');
  if (c.vencimento && c.inicio && c.vencimento < c.inicio) erros.push('Vencimento anterior ao início.');
  if (c.status === 'ativo' && !Object.values(c.modulos).some(Boolean)) erros.push('Cliente ativo precisa de ao menos um módulo.');
  return erros;
}

/** Dias até vencer (negativo = vencido). null = sem vencimento. */
export function diasParaVencer(c: SaasCliente, hoje = new Date()): number | null {
  if (!c.vencimento) return null;
  const h = new Date(hoje.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const v = new Date(c.vencimento + 'T00:00:00Z').getTime();
  return Math.round((v - h) / 86400000);
}

/** Licença efetiva: suspenso/cancelado/vencido = nenhum módulo opcional ligado. */
export function licencaEfetiva(c: SaasCliente, hoje = new Date()): LicenseState {
  const d = diasParaVencer(c, hoje);
  const bloqueado = c.status === 'suspenso' || c.status === 'cancelado' || (d !== null && d < 0);
  if (bloqueado) return { faturamento_sus: false, reabilitacao: false, triagem: false, regulacao: false };
  return { ...c.modulos };
}

/** Pacote de configuração inicial para a instalação do cliente (sem dados clínicos). */
export function gerarPacoteInstalacao(c: SaasCliente, hoje = new Date()) {
  return {
    versao: 1,
    gerado_em: hoje.toISOString(),
    cliente_id: c.id,
    licenca: { modulos: licencaEfetiva(c, hoje), status: c.status, vencimento: c.vencimento || null },
    marca: {
      marcaTitulo: c.nomeCurto || c.nome,
      marcaSubtitulo: TIPO_LABEL[c.tipo],
      marcaCidadeUf: [c.cidade, c.uf].filter(Boolean).join(' - '),
      marcaMantenedora: c.nome,
    },
  };
}
