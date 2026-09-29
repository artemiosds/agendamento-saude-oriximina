// Templates prontos que o usuário pode inserir com um clique no editor de modelos.

export interface ReadyTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  descricao?: string;
  blocos_clinicos?: any;
}

const OCI_HEADER = 'LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE OFERTA DE CUIDADOS INTEGRADOS (OCI)';

const ociSeedHtml = (procedimentoPrincipal: string) => `
<h2 style="text-align:center;margin:0 0 4px 0;">${OCI_HEADER}</h2>
<p style="text-align:center;font-size:11px;margin:0 0 12px 0;">
  <em>Formulário estruturado OCI. O preenchimento clínico é feito no Prontuário/PTS e a impressão usa o renderizador oficial do sistema.</em>
</p>
<p><strong>Procedimento principal do modelo:</strong> ${procedimentoPrincipal}</p>
`.trim();

const ociReady = (
  id: string,
  nome: string,
  linhasSecundarias = 20,
): ReadyTemplate => ({
  id,
  nome,
  tipo: 'Laudo Clínico',
  descricao: 'Formulário OCI estruturado com identificação automática do paciente, busca CID-10/SIGTAP e impressão A4 fiel ao formulário.',
  conteudo: ociSeedHtml(nome),
  blocos_clinicos: {
    structured_type: 'OCI',
    mostrar_logos: true,
    campos_manuais: [],
    oci: {
      titulo: OCI_HEADER,
      linhas_secundarias: linhasSecundarias,
      procedimento_principal: {
        codigo: '',
        nome,
        quantidade: 1,
      },
    },
  },
});

export const READY_TEMPLATES: ReadyTemplate[] = [
  ociReady(
    'oci-cancer-prostata',
    'OCI PROGRESSÃO DA AVALIAÇÃO DIAGNÓSTICA DE CÂNCER DE PRÓSTATA',
  ),
  ociReady(
    'oci-ortopedia-radiologia-tc',
    'OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA E TOMOGRAFIA COMPUTADORIZADA',
  ),
  ociReady(
    'oci-cancer-colo-utero-i',
    'OCI AVALIAÇÃO DIAGNÓSTICA E TERAPÊUTICA DE CÂNCER DE COLO DO ÚTERO-I',
  ),
  ociReady(
    'oci-risco-cirurgico',
    'OCI AVALIAÇÃO DE RISCO CIRÚRGICO',
  ),
  ociReady(
    'oci-avaliacao-cardiologica',
    'OCI AVALIAÇÃO CARDIOLÓGICA',
  ),
  ociReady(
    'oci-cancer-mama',
    'OCI AVALIAÇÃO DIAGNÓSTICA INICIAL DE CÂNCER DE MAMA',
  ),
  ociReady(
    'oci-gin1-saude-mulher',
    'OCI - GIN1 - AVALIAÇÃO DIAGNÓSTICA INICIAL DE SAÚDE DA MULHER (GINECOLOGIA) I',
  ),
  ociReady(
    'oci-ortopedia-radiologia',
    'OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA',
  ),
  ociReady(
    'oci-sindrome-coronariana-cronica-i',
    'OCI PROGRESSÃO DA AVALIAÇÃO DIAGNÓSTICA I – SÍNDROME CORONARIANA CRÔNICA',
  ),
];
