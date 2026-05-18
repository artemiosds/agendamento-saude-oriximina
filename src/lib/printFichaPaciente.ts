/**
 * Ficha Cadastral do Paciente — usa o padrão institucional global
 * (cabeçalho com 3 logos + bloco institucional + rodapé) configurado em
 * Configurações → Impressão de Documentos. Fiel ao preview e ao PDF.
 */
import { loadDocumentConfig, buildDocumentShell, printViaIframe } from './printLayout';

interface FichaPacienteData {
  paciente: {
    id: string;
    nome: string;
    cpf: string;
    cns: string;
    nomeMae: string;
    telefone: string;
    dataNascimento: string;
    email: string;
    endereco: string;
    descricaoClinica: string;
    cid: string;
    criadoEm: string;
    // campos opcionais expandidos (SUS / complementares)
    sexo?: string;
    nacionalidade?: string;
    raca?: string;
    naturalidade?: string;
    // endereço detalhado opcional
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    // contato secundário
    telefoneSecundario?: string;
    // SUS
    especialidadeDestino?: string;
    origemCadastro?: string;
    origemEncaminhamento?: string;
    observacoes?: string;
  };
  unidadeAtual?: string;
  dataAtendimento?: string;
  tipoAtendimento?: string;
  unidadeOrigem?: string;
  ultimoAtendimento?: {
    data: string;
    profissional: string;
    procedimentos: string;
    queixa: string;
    tipo: string;
  };
  historicoAtendimentos?: Array<{
    data: string;
    profissional: string;
    observacao: string;
    tipo: string;
  }>;
  anexos?: Array<{ nome: string; tipo?: string }>;
}

const fmt = (v: any): string => {
  const s = (v ?? '').toString().trim();
  return s ? s : 'Não informado';
};

const formatarData = (data: string): string => {
  if (!data) return 'Não informado';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return data;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return data;
  }
};

const calcularIdade = (dataNascimento: string): string => {
  if (!dataNascimento) return 'Não informado';
  const parts = dataNascimento.includes('/') ? dataNascimento.split('/').reverse().join('-') : dataNascimento;
  const birth = new Date(parts + 'T12:00:00');
  if (isNaN(birth.getTime())) return 'Não informado';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
};

function field(label: string, value: any): string {
  return `
    <div class="field">
      <div class="field-label">${label}</div>
      <div class="field-value">${fmt(value)}</div>
    </div>`;
}

function section(title: string, inner: string): string {
  return `
    <div class="section doc-section">
      <div class="section-title">${title}</div>
      <div class="section-content">${inner}</div>
    </div>`;
}

export async function printFichaPaciente(data: FichaPacienteData): Promise<void> {
  const config = await loadDocumentConfig();
  const p = data.paciente;

  // Endereço completo (usa detalhado quando disponível, senão cai no campo livre)
  const enderecoMontado = [
    [p.logradouro, p.numero].filter(Boolean).join(', '),
    p.complemento,
    p.bairro,
    [p.municipio, p.uf].filter(Boolean).join(' / '),
    p.cep,
  ].filter((x) => x && String(x).trim()).join(' — ') || p.endereco;

  const identificacao = `
    <div class="info-grid">
      ${field('Nome Completo', p.nome)}
      ${field('Nome da Mãe', p.nomeMae)}
      ${field('Data de Nascimento', formatarData(p.dataNascimento))}
      ${field('Idade', calcularIdade(p.dataNascimento))}
      ${field('Sexo', p.sexo)}
      ${field('CPF', p.cpf)}
      ${field('CNS', p.cns)}
      ${field('Naturalidade', p.naturalidade)}
      ${field('Nacionalidade', p.nacionalidade)}
      ${field('Raça / Cor', p.raca)}
    </div>`;

  const endereco = `
    <div class="info-grid">
      ${field('CEP', p.cep)}
      ${field('Logradouro', p.logradouro)}
      ${field('Número', p.numero)}
      ${field('Complemento', p.complemento)}
      ${field('Bairro', p.bairro)}
      ${field('Município / UF', [p.municipio, p.uf].filter(Boolean).join(' / '))}
      <div class="field" style="grid-column: 1 / -1">
        <div class="field-label">Endereço Completo</div>
        <div class="field-value">${fmt(enderecoMontado)}</div>
      </div>
    </div>`;

  const contato = `
    <div class="info-grid">
      ${field('Telefone Principal', p.telefone)}
      ${field('Telefone Secundário', p.telefoneSecundario)}
      ${field('E-mail', p.email)}
    </div>`;

  const complementares = `
    <div class="info-grid">
      ${field('Unidade Vinculada', data.unidadeAtual || data.unidadeOrigem)}
      ${field('Especialidade Destino', p.especialidadeDestino)}
      ${field('Origem do Cadastro', p.origemCadastro)}
      ${field('Origem do Encaminhamento', p.origemEncaminhamento)}
      ${field('CID / Diagnóstico Complementar', p.cid)}
      ${field('Cadastrado em', formatarData(p.criadoEm))}
      <div class="field" style="grid-column: 1 / -1">
        <div class="field-label">Descrição Clínica</div>
        <div class="field-value">${fmt(p.descricaoClinica)}</div>
      </div>
      <div class="field" style="grid-column: 1 / -1">
        <div class="field-label">Observações</div>
        <div class="field-value">${fmt(p.observacoes)}</div>
      </div>
    </div>`;

  const anexosList = (data.anexos || []).filter((a) => a?.nome);
  const anexos = anexosList.length
    ? `<ul style="margin: 4px 0 0 18px;">${anexosList
        .map((a) => `<li>${a.nome}${a.tipo ? ` <span style="color:#64748b">(${a.tipo})</span>` : ''}</li>`)
        .join('')}</ul>`
    : `<div style="color:#94a3b8;font-style:italic">Nenhum documento anexado.</div>`;

  const body = `
    ${section('1. Identificação do Paciente', identificacao)}
    ${section('2. Endereço', endereco)}
    ${section('3. Contato', contato)}
    ${section('4. Complementares / SUS', complementares)}
    ${section('5. Documentos / Anexos', anexos)}

    <div class="signature" style="margin-top: 40px;">
      <div style="margin-bottom: 30px; color:#475569; font-size:10pt;">
        Oriximiná — PA, ____ / ____ / ________
      </div>
      <div class="signature-line"></div>
      <div class="name">Assinatura do Responsável</div>
      <div class="role">Paciente / Responsável Legal</div>
    </div>`;

  const html = buildDocumentShell('Ficha Cadastral do Paciente', body, config, {
    Prontuário: p.id || '—',
    Paciente: p.nome || '—',
  });

  printViaIframe(html);
}
