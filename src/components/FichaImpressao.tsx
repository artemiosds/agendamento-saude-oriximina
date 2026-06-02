import React, { useCallback, useState, useEffect } from 'react';
import { formatCNS, maskCNS } from '@/lib/cnsUtils';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { loadDocumentConfig, printViaIframe, buildDocumentShell, type DocumentConfig } from '@/lib/printLayout';
import { useAuth } from '@/contexts/AuthContext';



interface FichaData {
  paciente: {
    nome: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
    telefone_secundario?: string;
    email?: string;
    endereco?: string;
    responsavel?: string;
    sexo?: string;
    naturalidade?: string;
    nacionalidade?: string;
    raca_cor?: string;
    situacao_rua?: boolean;
    menor_idade?: boolean;
    parentesco_responsavel?: string;
    observacoes_cadastrais?: string;
    informacoes_adicionais?: string;
    origem_cadastro?: string;
    unidade_vinculada?: string;
    // New structured address fields
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
    especialidade?: string;
    encaminhamento?: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
    glicemia?: string;
    frequencia_respiratoria?: string;
  };
  profissional: {
    nome: string;
    cargo: string;
    registro: string;
  };
  evoluciones: Array<{
    data: string;
    observacao: string;
    profissional: string;
  }>;
}

const formatarData = (data: string): string => {
  if (!data) return '___/___/______';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return '___/___/______';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '___/___/______';
  }
};

const calcIdade = (dataNasc: string): string => {
  if (!dataNasc) return '__';
  try {
    const d = new Date(dataNasc.length <= 10 ? dataNasc + 'T12:00:00' : dataNasc);
    if (isNaN(d.getTime())) return '__';
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 ? `${age} anos` : '__';
  } catch {
    return '__';
  }
};

const v = (valor: string | undefined): string => valor?.trim() || '';

export type FichaPrintMode = 'completa' | 'dados_pessoais';

interface FichaImpressaoProps {
  data: FichaData;
  mode?: FichaPrintMode;
  onPrintComplete?: () => void;
}




export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa', onPrintComplete }) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const somentePessoais = mode === 'dados_pessoais';


  useEffect(() => {
    loadDocumentConfig().then(setConfig);
  }, []);

  const buildHTML = useCallback(() => {
    if (!config) return '';

    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const idade = calcIdade(data.paciente.data_nascimento);
    const p = data.paciente;
    const emitidoPor = user?.nome || '—';

    const formatBool = (val?: boolean) => val ? 'SIM' : 'NÃO';

    // Apenas o conteúdo (sem cabeçalho/rodapé) — o shell global cuida disso
    const bodyContent = `
  <!-- IDENTIFICAÇÃO -->
  <div class="bloco">
    <div class="bloco-titulo">1. Identificação do Paciente</div>
    <div class="bloco-body">
      <div class="campo campo-full"><b>Nome Completo:</b> <span style="font-size:11px;font-weight:700">${v(p.nome) || '—'}</span></div>
      <div class="campo campo-full"><b>Nome da Mãe:</b> <span>${v(p.nome_mae) || '—'}</span></div>
      <div class="grid-5">
        <div class="campo"><b>CPF:</b> <span>${v(p.cpf) || '—'}</span></div>
        <div class="campo" style="grid-column: span 2"><b>CNS:</b> <span>${formatCNS(p.cns) || '—'}</span></div>
        <div class="campo"><b>Data Nasc.:</b> <span>${formatarData(p.data_nascimento)}</span></div>
        <div class="campo"><b>Idade:</b> <span>${idade}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>Sexo:</b> <span>${v(p.sexo) || '—'}</span></div>
        <div class="campo"><b>Naturalidade:</b> <span>${v(p.naturalidade) || '—'}</span></div>
        <div class="campo"><b>Nacionalidade:</b> <span>${v(p.nacionalidade) || 'BRASILEIRA'}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>Raça/Cor:</b> <span>${v(p.raca_cor) || '—'}</span></div>
        <div class="campo"><b>Situação de Rua:</b> <span>${formatBool(p.situacao_rua)}</span></div>
        <div class="campo"><b>Menor de Idade:</b> <span>${formatBool(p.menor_idade)}</span></div>
      </div>
    </div>
  </div>


  <!-- ENDEREÇO -->
  <div class="bloco">
    <div class="bloco-titulo">2. Endereço</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>CEP:</b> <span>${v(p.cep) || '—'}</span></div>
        <div class="campo" style="grid-column: span 2"><b>Tipo Logradouro:</b> <span>${v(p.tipo_logradouro) || '—'}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo" style="grid-column: span 2"><b>Logradouro:</b> <span>${v(p.logradouro) || '—'}</span></div>
        <div class="campo"><b>Número:</b> <span>${v(p.numero) || '—'}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo" style="grid-column: span 2"><b>Bairro:</b> <span>${v(p.bairro) || '—'}</span></div>
        <div class="campo"><b>Complemento:</b> <span>${v(p.complemento) || '—'}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo" style="grid-column: span 2"><b>Município/UF:</b> <span>${v(p.municipio)} / ${v(p.uf)}</span></div>
      </div>
      ${p.endereco ? `<div class="campo campo-full"><b>Ref./Legado:</b> <span>${p.endereco}</span></div>` : ''}
    </div>
  </div>


  <!-- CONTATO -->
  <div class="bloco">
    <div class="bloco-titulo">3. Contato</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo"><b>Telefone Principal:</b> <span>${v(p.telefone) || '—'}</span></div>
        <div class="campo"><b>Telefone Secundário:</b> <span>${v(p.telefone_secundario) || '—'}</span></div>
      </div>
      <div class="campo campo-full"><b>E-mail:</b> <span>${v(p.email) || '—'}</span></div>
    </div>
  </div>


  <!-- COMPLEMENTARES -->
  <div class="bloco">
    <div class="bloco-titulo">4. Complementares</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo"><b>Responsável:</b> <span>${v(p.responsavel) || '—'}</span></div>
        <div class="campo"><b>Parentesco/Vínculo:</b> <span>${v(p.parentesco_responsavel) || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Origem Cadastro:</b> <span>${v(p.origem_cadastro) || '—'}</span></div>
        <div class="campo"><b>Unidade Vinculada:</b> <span>${v(p.unidade_vinculada) || '—'}</span></div>
      </div>
      <div class="campo campo-full"><b>Observações Cadastrais:</b> <span>${v(p.observacoes_cadastrais) || '—'}</span></div>
      <div class="campo campo-full"><b>Informações Adicionais:</b> <span>${v(p.informacoes_adicionais) || '—'}</span></div>
    </div>
  </div>

  ${!somentePessoais ? `
  <!-- ATENDIMENTO (MODO COMPLETA) -->
  <div class="bloco">
    <div class="bloco-titulo">5. Atendimento</div>
    <div class="bloco-body">
      <div class="grid-4">
        <div class="campo"><b>Tipo:</b> <span>${v(data.dadosClinicos.tipo_atendimento) || '—'}</span></div>
        <div class="campo"><b>CID:</b> <span>${v(data.dadosClinicos.cid) || '—'}</span></div>
        <div class="campo"><b>Profissional:</b> <span>—</span></div>
        <div class="campo"><b>Especialidade:</b> <span>—</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Unidade:</b> <span>${v(data.dadosClinicos.unidade_atendimento) || '—'}</span></div>
        <div class="campo"><b>Data:</b> <span>${formatarData(data.dadosClinicos.data_atendimento)}</span></div>
      </div>
    </div>
  </div>

  <!-- TRIAGEM / SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">6. Triagem / Sinais Vitais</div>
    <div class="bloco-body">
      <div class="vitais-grid">
        <div class="vital-item"><b>PA</b><span>${v(data.sinaisVitais.pressao_arterial) || '___'}</span></div>
        <div class="vital-item"><b>FC</b><span>${v(data.sinaisVitais.frequencia_cardiaca) || '___'}</span></div>
        <div class="vital-item"><b>FR</b><span>${v(data.sinaisVitais.frequencia_respiratoria) || '___'}</span></div>
        <div class="vital-item"><b>Temp</b><span>${v(data.sinaisVitais.temperatura) || '___'}</span></div>
        <div class="vital-item"><b>SpO2</b><span>${v(data.sinaisVitais.saturacao) || '___'}</span></div>
        <div class="vital-item"><b>Peso</b><span>${v(data.sinaisVitais.peso) || '___'}</span></div>
        <div class="vital-item"><b>Altura</b><span>${v(data.sinaisVitais.altura) || '___'}</span></div>
        <div class="vital-item"><b>Glicemia</b><span>${v(data.sinaisVitais.glicemia) || '___'}</span></div>
      </div>
    </div>
  </div>

  <!-- CAMPOS CLÍNICOS TEXTUAIS -->
  <div class="bloco">
    <div class="bloco-titulo">7. Avaliação Clínica</div>
    <div class="bloco-body">
      <div class="manual-area">
        <div class="manual-label">Queixa Principal:</div>
        <div class="manual-lines-lg"></div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Evolução Clínica:</div>
        <div class="manual-lines-lg"></div>
      </div>
    </div>
  </div>

  <div class="bloco">
    <div class="bloco-titulo">8. Conduta / Prescrição</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="manual-area">
          <div class="manual-label">Diagnóstico:</div>
          <div class="manual-lines"></div>
        </div>
        <div class="manual-area">
          <div class="manual-label">Retorno:</div>
          <div class="manual-lines"></div>
        </div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Medicação / Prescrição:</div>
        <div class="manual-lines-lg"></div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Procedimentos:</div>
        <div class="manual-lines-lg"></div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- ASSINATURA -->
  <div class="signature" style="margin-top: 30px;">
    <div style="font-size: 10pt; color: #475569; margin-bottom: 20px;">
      Oriximiná &mdash; PA, ____/____/________
    </div>
    <div class="signature-line"></div>
    <div class="name">${!somentePessoais ? 'Profissional Responsável' : 'Responsável pelo Cadastro'}</div>
    <div class="role">${!somentePessoais ? 'Registro Profissional' : 'Assinatura'}</div>
  </div>`;

    // Estilos auxiliares específicos dos blocos da ficha (cabeçalho/rodapé vêm do shell global)
    const localStyles = `
    <style>
      .bloco { margin-top: 6px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
      .bloco-titulo { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
        background: #f1f5f9; color: #0c4a6e; padding: 4px 10px; border-bottom: 1px solid #cbd5e1; }
      .bloco-body { padding: 6px 10px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 12px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 8px; }
      .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px 6px; }
      .campo { margin-bottom: 1px; display: flex; align-items: baseline; gap: 4px; overflow: hidden; }
      .campo b { font-size: 8pt; text-transform: uppercase; color: #64748b; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
      .campo span { color: #0f172a; font-weight: 600; font-size: 10pt; white-space: normal; word-break: break-word; }

      .campo-full { grid-column: 1 / -1; }
      .manual-area { margin-top: 4px; }
      .manual-label { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 2px; }
      .manual-lines { border-bottom: 1px solid #e2e8f0; min-height: 20px; margin-bottom: 6px; }
      .manual-lines-lg { min-height: 60px; background-image: linear-gradient(#e2e8f0 1px, transparent 1px);
        background-size: 100% 20px; margin-bottom: 8px; }
      .vitais-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 2px; }
      .vital-item { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; text-align: center; background: #f8fafc; }
      .vital-item b { display: block; font-size: 7.5pt; text-transform: uppercase; color: #64748b; margin-bottom: 1px; }
      .vital-item span { font-weight: 700; font-size: 11pt; color: #0f172a; }
    </style>`;

    const title = somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO CLÍNICO';
    const shell = buildDocumentShell(title, localStyles + bodyContent, config, {
      Emissão: `${dataAtual} ${horaAtual}`,
      'Emitido por': emitidoPor,
      Paciente: p.nome || '—',
    });
    return shell;
  }, [data, somentePessoais, config, user]);



  const handlePrint = useCallback(() => {
    try {
      const html = buildHTML();
      printViaIframe(html);
      // Fecha o modal um pouco depois para o usuário enxergar o diálogo de impressão
      setTimeout(() => { onPrintComplete?.(); }, 800);
    } catch (err) {
      console.error('[FichaImpressao] erro ao imprimir:', err);
    }
  }, [buildHTML, onPrintComplete]);

  const idade = calcIdade(data.paciente.data_nascimento);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        <div className="text-center mb-3 border-b-2 border-[#0c4a6e] pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a6e]">SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h2>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER II</p>
          <p className="text-[10px] uppercase font-extrabold text-[#0c4a6e] mt-1">{somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO CLÍNICO'}</p>
        </div>

        <div className="space-y-3 text-sm">
          {/* IDENTIFICAÇÃO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">1. Identificação</h3>
            <p className="mb-1"><span className="text-[9px] font-bold uppercase text-muted-foreground">Nome:</span> <span className="font-bold">{data.paciente.nome || '—'}</span></p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CPF:</span> {data.paciente.cpf || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CNS:</span> {formatCNS(data.paciente.cns) || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Idade:</span> {idade}</p>
            </div>
          </div>

          {/* ENDEREÇO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">2. Endereço</h3>
            <p className="mb-1"><span className="text-[9px] font-bold uppercase text-muted-foreground">Logradouro:</span> {data.paciente.logradouro || data.paciente.endereco || '—'}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Bairro:</span> {data.paciente.bairro || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Município/UF:</span> {data.paciente.municipio || '—'} / {data.paciente.uf || '—'}</p>
            </div>
          </div>

          {/* CONTATO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">3. Contato</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Telefone:</span> {data.paciente.telefone || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">E-mail:</span> {data.paciente.email || '—'}</p>
            </div>
          </div>

          {!somentePessoais && (
            <>
              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">4. Atendimento</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tipo:</span> {data.dadosClinicos.tipo_atendimento || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CID:</span> {data.dadosClinicos.cid || '—'}</p>
                </div>
              </div>

              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">5. Triagem / Sinais Vitais</h3>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <p><strong>PA:</strong> {data.sinaisVitais.pressao_arterial || '—'}</p>
                  <p><strong>FC:</strong> {data.sinaisVitais.frequencia_cardiaca || '—'}</p>
                  <p><strong>FR:</strong> {data.sinaisVitais.frequencia_respiratoria || '—'}</p>
                  <p><strong>Temp:</strong> {data.sinaisVitais.temperatura || '—'}</p>
                  <p><strong>SpO₂:</strong> {data.sinaisVitais.saturacao || '—'}</p>
                  <p><strong>Peso:</strong> {data.sinaisVitais.peso || '—'}</p>
                  <p><strong>Altura:</strong> {data.sinaisVitais.altura || '—'}</p>
                  <p><strong>Glicemia:</strong> {data.sinaisVitais.glicemia || '—'}</p>
                </div>
              </div>

              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">6. Avaliação Clínica</h3>
                <p className="text-[10px] text-muted-foreground italic">Campos em branco para preenchimento manual no PDF/Impressão</p>
                {/* Evoluções antigas removidas da ficha */}
              </div>
            </>
          )}
        </div>
      </div>

      <Button onClick={handlePrint} className="w-full max-w-xs" size="lg">
        <Printer className="w-4 h-4 mr-2" />
        Imprimir Ficha
      </Button>
    </div>
  );
};

export default FichaImpressao;
