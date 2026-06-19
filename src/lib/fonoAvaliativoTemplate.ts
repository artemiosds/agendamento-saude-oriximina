// Estrutura completa do "Relatório Fonoaudiológico Avaliativo — Versão 1"
// Reproduz integralmente todas as seções, campos e opções do documento de referência.
// Componentes são gerados dinamicamente a partir desta estrutura.

export type FieldKind = "radio" | "checkbox" | "scale4" | "scale3" | "yesno" | "number" | "text" | "textarea";

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  options?: string[];        // para radio / checkbox
  max?: number;              // para number (pontuação)
  allowOther?: boolean;      // habilita campo "Outros"
  requireJustification?: boolean; // ex.: "Não foi possível avaliar"
  justificationTrigger?: string;  // valor que dispara obrigatoriedade
  observation?: boolean;     // permite observação livre
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
}

export interface StepDef {
  id: string;
  title: string;
  sections: SectionDef[];
}

const ESCALA4 = ["Insatisfatório", "Em desenvolvimento", "Regular", "Satisfatório"];
const ESCALA3 = ["Insatisfatório", "Regular", "Satisfatório"];

export const FONO_AVALIATIVO_VERSION = 1;
export const FONO_AVALIATIVO_TIPO_REGISTRO = "alta_individual_fono_v1";

export const FONO_STEPS: StepDef[] = [
  {
    id: "identificacao",
    title: "1. Identificação",
    sections: [
      {
        id: "identificacao",
        title: "Dados do paciente e profissional",
        fields: [
          { id: "queixa_principal", label: "Queixa principal", kind: "textarea" },
        ],
      },
    ],
  },
  {
    id: "mbgr_extraoral",
    title: "2. Avaliação Miofuncional Orofacial (MBGR) — Extraoral",
    sections: [
      {
        id: "labios",
        title: "Avaliação dos lábios",
        fields: [
          {
            id: "labios_posicao",
            label: "Posição habitual",
            kind: "radio",
            options: [
              "Fechados",
              "Fechados com tensão",
              "Ora abertos ora fechados",
              "Fechados em contato dentário",
              "Abertos",
              "Entreabertos",
            ],
            requireJustification: true,
            justificationTrigger: "Não foi possível avaliar",
            observation: true,
          },
        ],
      },
    ],
  },
  {
    id: "mbgr_intraoral",
    title: "3. Avaliação Intraoral",
    sections: [
      {
        id: "lingua",
        title: "Língua",
        fields: [
          { id: "lingua_sulco", label: "Sulco longitudinal", kind: "radio", options: ["Adequado", "Profundo"] },
          { id: "lingua_largura", label: "Largura", kind: "radio", options: ["Apropriada", "Diminuída", "Aumentada"] },
          {
            id: "lingua_posicao",
            label: "Posição habitual",
            kind: "radio",
            options: ["Não observável", "No assoalho", "Dorso alto", "Interdental", "Na papila"],
          },
          {
            id: "lingua_tremor",
            label: "Tremor",
            kind: "radio",
            options: ["Ausente", "Na posição habitual", "Ao protrair", "Nos movimentos (comissuras)"],
          },
        ],
      },
      {
        id: "saliva",
        title: "Saliva",
        fields: [{ id: "saliva", label: "Saliva", kind: "radio", options: ["Deglutida", "Acumulada"] }],
      },
      {
        id: "frenulo",
        title: "Frênulo",
        fields: [
          { id: "frenulo_extensao", label: "Extensão", kind: "radio", options: ["Normal", "Curto", "Encurtado"] },
          {
            id: "frenulo_assoalho",
            label: "Fixação no assoalho",
            kind: "radio",
            options: ["Entre as carúnculas", "Entre a crista e as carúnculas", "Crista alveolar"],
          },
          {
            id: "frenulo_lingua",
            label: "Fixação na língua",
            kind: "radio",
            options: ["Parte média", "Anterior a parte média", "No ápice"],
          },
          {
            id: "frenulo_obs",
            label: "Observações (ex.: Não foi possível avaliar — justificar)",
            kind: "textarea",
          },
        ],
      },
      {
        id: "palato",
        title: "Palato duro",
        fields: [
          {
            id: "palato_profundidade",
            label: "Profundidade",
            kind: "radio",
            options: ["Normal", "Reduzida (baixo)", "Aumentada (alto) – Ogival"],
          },
          {
            id: "palato_largura",
            label: "Largura",
            kind: "radio",
            options: ["Normal", "Reduzida - Atresia", "Aumentada"],
          },
        ],
      },
      {
        id: "tonsilas",
        title: "Tonsilas palatinas (amídalas)",
        fields: [
          {
            id: "tonsilas_presenca",
            label: "Presença",
            kind: "radio",
            options: ["Presente", "Removidas", "Não observáveis"],
          },
          { id: "tonsilas_tamanho", label: "Tamanho", kind: "radio", options: ["Normal", "Hipertrofiadas"] },
        ],
      },
      {
        id: "oclusao",
        title: "Dentes e oclusão",
        fields: [
          {
            id: "linha_media",
            label: "Linha média",
            kind: "radio",
            options: ["Adequada", "Desviada D", "Desviada E"],
          },
          {
            id: "alt_horizontal",
            label: "Alteração horizontal",
            kind: "radio",
            options: ["Ausente", "Mordida de topo", "Sobressaliência", "Mordida cruzada anterior"],
          },
          {
            id: "alt_vertical",
            label: "Alteração vertical",
            kind: "radio",
            options: ["Ausente", "Sobremordida", "Mordida aberta anterior", "Mordida aberta posterior"],
          },
          {
            id: "alt_transversal",
            label: "Alteração transversal",
            kind: "radio",
            options: [
              "Ausente",
              "Mordida cruzada posterior direita",
              "Mordida cruzada posterior esquerda",
            ],
          },
          { id: "oclusao_obs", label: "Observações", kind: "textarea" },
        ],
      },
    ],
  },
  {
    id: "mobilidade_tonus",
    title: "4. Mobilidade e Tônus",
    sections: [
      {
        id: "mobilidade",
        title: "Mobilidade",
        fields: [
          {
            id: "mob_labios",
            label: "Lábios",
            kind: "checkbox",
            options: [
              "Protrair fechados",
              "Protrair fechados à D",
              "Protrair fechados à E",
              "Estalar protraídos",
              "Retrair fechados",
              "Estalar retraídos",
              "Vibrar",
            ],
          },
          {
            id: "mob_lingua",
            label: "Língua",
            kind: "checkbox",
            options: [
              "Protrair",
              "Elevar na papila incisiva",
              "Elevar no lábio superior",
              "Tocar a comissura labial D",
              "Tocar a comissura labial E",
              "Sugar a língua no palato",
              "Estalar a língua",
              "Vibrar",
            ],
          },
        ],
      },
      {
        id: "tonus",
        title: "Tônus",
        fields: [
          { id: "tonus_labio_sup", label: "Lábio superior", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
          { id: "tonus_labio_inf", label: "Lábio inferior", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
          { id: "tonus_lingua", label: "Língua", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
          { id: "tonus_mento", label: "Mento", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
          { id: "tonus_boch_d", label: "Bochecha D", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
          { id: "tonus_boch_e", label: "Bochecha E", kind: "radio", options: ["Diminuído", "Normal", "Aumentado"] },
        ],
      },
    ],
  },
  {
    id: "funcoes_orais",
    title: "5. Funções orais",
    sections: [
      {
        id: "respiracao",
        title: "Respiração",
        fields: [
          { id: "respiracao", label: "Respiração", kind: "radio", options: ["Oral", "Oronasal", "Nasal"] },
          { id: "respiracao_obs", label: "Observações (ex.: sugestões de encaminhamento)", kind: "textarea" },
        ],
      },
    ],
  },
  {
    id: "linguagem_oral",
    title: "6. Avaliação da Linguagem Oral",
    sections: [
      {
        id: "fonetico",
        title: "Desvio fonético",
        fields: [
          { id: "fonetico_status", label: "Status", kind: "radio", options: ["Sem alteração", "Com alteração"] },
          {
            id: "fonetico_tipos",
            label: "Tipos observados",
            kind: "checkbox",
            options: [
              "Sigmatismo anterior",
              "Sigmatismo lateral",
              "Projeção lingual (durante a articulação dos fonemas linguodentais)",
            ],
          },
        ],
      },
      {
        id: "fonologico",
        title: "Desvio fonológico",
        fields: [
          { id: "fonologico_status", label: "Status", kind: "radio", options: ["Sem alteração", "Com alteração"] },
        ],
      },
      {
        id: "wertzner",
        title: "Processos Fonológicos observados — Wertzner",
        fields: [
          {
            id: "wertzner_esperados",
            label: "Processos esperados",
            kind: "checkbox",
            options: [
              "Redução de sílaba (pato→pa) — até 2 anos e 6 meses",
              "Harmonia consonantal (macaco→cacaco) — até 2 anos e 6 meses",
              "Plosivação de fricativas (s→t; f→p; j→g; v→b) — até 2 anos e 6 meses",
              "Frontalização de velar (k→t; g→d) — até 3 anos e 6 meses",
              "Posteriorização para velar (t→k; d→g) — até 3 anos e 6 meses",
              "Simplificação de líquida (r→l) — até 3 anos e 6 meses",
              "Posteriorização para palatal (s→ch; z→j) — até 4 anos e 6 meses",
              "Frontalização de palatal (ch→s; j→z) — até 4 anos e 6 meses",
              "Simplificação do Encontro Consonantal (prato→pato) — até 7 anos",
              "Simplificação da consoante final (pasta→pata) — até 7 anos",
            ],
          },
          {
            id: "wertzner_nao_descritos",
            label: "Processos observados e não descritos em literatura",
            kind: "checkbox",
            options: [
              "Sonorização de plosiva (k→g; p→b; t→d)",
              "Sonorização de fricativa (f→v; s→z; ch→j)",
              "Ensurdecimento de plosivas (b→p; d→t; g→k)",
              "Ensurdecimento de fricativas (v→f; z→s; j→ch)",
            ],
            allowOther: true,
          },
        ],
      },
    ],
  },
  {
    id: "linguagem_proc",
    title: "7. Avaliação da Linguagem — PROC (Zorzi)",
    sections: [
      {
        id: "desenvolvimento",
        title: "Desenvolvimento da Linguagem oral",
        fields: [
          {
            id: "desenv_status",
            label: "Status",
            kind: "radio",
            options: ["Satisfatório", "Insatisfatório"],
            observation: true,
          },
        ],
      },
      {
        id: "funcoes",
        title: "Funções da linguagem",
        fields: [
          { id: "func_pragmatica", label: "Pragmática", kind: "radio", options: ESCALA4 },
          { id: "func_semantica", label: "Semântica", kind: "radio", options: ESCALA4 },
          { id: "func_sintatica", label: "Sintática", kind: "radio", options: ESCALA4 },
          { id: "func_fonologica", label: "Fonológica", kind: "radio", options: ESCALA4 },
        ],
      },
      {
        id: "pontuacao",
        title: "Pontuação obtida (total calculado automaticamente)",
        fields: [
          { id: "proc_habilidades", label: "Habilidades comunicativas (expressiva)", kind: "number", max: 70 },
          { id: "proc_compreensao", label: "Compreensão da linguagem oral", kind: "number", max: 60 },
          { id: "proc_cognitivo", label: "Aspectos do desenvolvimento cognitivo", kind: "number", max: 70 },
        ],
      },
      {
        id: "habilidades",
        title: "Características gerais das habilidades comunicativas",
        fields: [
          {
            id: "habilidades_comunicativas",
            label: "Selecione (única)",
            kind: "radio",
            options: [
              "Não apresenta comunicação intencional",
              "Comunicação intencional com funções primárias por meios não simbólicos, restrita ou ausente participação em atividade dialógica",
              "Comunicação intencional plurifuncional, ampla participação em atividade dialógica por meios não simbólicos e não verbais",
              "Comunicação intencional plurifuncional, ampla participação em atividade dialógica por meios simbólicos e não verbais",
              "Comunicação intencional com funções primárias, restrita participação em atividade dialógica por meios verbais",
              "Comunicação intencional plurifuncional, ampla participação em atividade dialógica por meios verbais, ligados ao contexto imediato",
              "Comunicação intencional plurifuncional, ampla participação em atividade dialógica por meios verbais, não ligados ao contexto imediato",
            ],
          },
        ],
      },
      {
        id: "organizacao",
        title: "Características gerais da organização linguística",
        fields: [
          {
            id: "organizacao_linguistica",
            label: "Selecione (única)",
            kind: "radio",
            options: [
              "Não apresenta organização linguística",
              "Produção de palavras isoladas",
              "Produção de enunciados (duas ou mais palavras organizadas no nível de frase)",
              "Produção de discurso (frases encadeadas)",
            ],
          },
        ],
      },
      {
        id: "compreensao",
        title: "Características gerais da compreensão da linguagem oral",
        fields: [
          {
            id: "compreensao_oral",
            label: "Selecione (única)",
            kind: "radio",
            options: [
              "Não demonstra compreensão da linguagem oral",
              "Responde não sistematicamente",
              "Compreende ordens de até duas ações, ligadas ao contexto imediato",
              "Compreende ordens com 3 ações, não ligadas ao contexto imediato",
              "Respondeu não sistematicamente a comandos ou durante o diálogo (pode estar relacionado a compreensão de linguagem ou aspectos comportamentais)",
            ],
          },
        ],
      },
      {
        id: "imitacao",
        title: "Características gerais da imitação",
        fields: [
          {
            id: "imitacao_gestual",
            label: "Imitação gestual",
            kind: "radio",
            options: [
              "Não responde às solicitações",
              "Imita gestos visíveis no próprio corpo",
              "Imita gestos visíveis e não visíveis no próprio corpo",
            ],
          },
          {
            id: "imitacao_sonora",
            label: "Imitação sonora",
            kind: "radio",
            options: [
              "Não responde às solicitações",
              "Imita somente sons não verbais",
              "Imita sons verbais e não verbais",
            ],
          },
        ],
      },
      {
        id: "cognitivo",
        title: "Características gerais do desenvolvimento cognitivo",
        fields: [
          {
            id: "desenv_cognitivo",
            label: "Estágio",
            kind: "radio",
            options: [
              "Sensório-motor – fases iniciais",
              "Sensório-motor – fases avançadas",
              "Transição entre o estágio sensório-motor e representativo",
              "Representativo",
            ],
            observation: true,
          },
        ],
      },
    ],
  },
  {
    id: "desenvolvimento_infantil",
    title: "8. Aspectos do desenvolvimento infantil",
    sections: [
      {
        id: "desenv_infantil",
        title: "Escalas",
        fields: [
          { id: "di_imitacao", label: "Habilidade de imitação", kind: "radio", options: ESCALA4 },
          { id: "di_assimilacao", label: "Assimilação da aprendizagem", kind: "radio", options: ESCALA4 },
          { id: "di_estrategias", label: "Cria estratégias para solucionar problemas", kind: "radio", options: ESCALA4 },
          { id: "di_brinquedos", label: "Demonstra interesse por brinquedos diversos", kind: "radio", options: ESCALA4 },
          { id: "di_brincadeiras", label: "Demonstra interesse por brincadeiras compartilhadas", kind: "radio", options: ESCALA4 },
          { id: "di_tempo_brinquedo", label: "Tempo de exploração do brinquedo", kind: "radio", options: ESCALA4 },
          { id: "di_tempo_brincadeira", label: "Tempo de permanência na brincadeira", kind: "radio", options: ESCALA4 },
          { id: "di_partes_corpo", label: "Reconhecimento das partes do corpo", kind: "radio", options: ESCALA4 },
          { id: "di_cores", label: "Conhecimento das cores – pareamento", kind: "radio", options: ESCALA4 },
          { id: "di_numericas", label: "Noções básicas numéricas", kind: "radio", options: ESCALA4 },
          { id: "di_coord_ampla", label: "Coordenação motora ampla", kind: "radio", options: ESCALA4 },
          { id: "di_coord_fina", label: "Coordenação motora fina", kind: "radio", options: ESCALA4 },
          { id: "di_categorizacao", label: "Categorização semântica", kind: "radio", options: ESCALA4 },
          { id: "di_conceitos", label: "Conceitos (maior x menor; alto x baixo; etc.)", kind: "radio", options: ESCALA4 },
          { id: "di_obs", label: "Observações", kind: "textarea" },
        ],
      },
    ],
  },
  {
    id: "percepcoes",
    title: "9. Percepções auditivas e visuais",
    sections: [
      {
        id: "auditiva",
        title: "Avaliação da percepção auditiva",
        fields: [
          { id: "aud_ordens", label: "Compreensão de ordens simples e instruções", kind: "radio", options: ESCALA3 },
          { id: "aud_memorizacao", label: "Memorização para instruções com dois comandos", kind: "radio", options: ESCALA3 },
          { id: "aud_competitivos", label: "Compreensão da fala mediante sons competitivos", kind: "radio", options: ESCALA3 },
          { id: "aud_repeticao", label: "Beneficia-se da repetição da informação", kind: "yesno" },
        ],
      },
      {
        id: "visual",
        title: "Avaliação da percepção visual",
        fields: [
          { id: "vis_perseguicao", label: "Movimento de perseguição", kind: "radio", options: ESCALA3 },
          { id: "vis_convergencia", label: "Movimento de convergência", kind: "radio", options: ESCALA3 },
          { id: "vis_obs", label: "Observação (ex.: dificuldade em manter atenção)", kind: "textarea" },
          { id: "vis_lentes", label: "Faz uso de lentes corretivas", kind: "yesno" },
        ],
      },
      {
        id: "comportamentais",
        title: "Aspectos comportamentais observados durante a avaliação clínica",
        fields: [
          { id: "comp_obs", label: "Descreva os aspectos comportamentais observados", kind: "textarea" },
        ],
      },
    ],
  },
  {
    id: "parecer",
    title: "10. Parecer e Objetivos Terapêuticos",
    sections: [
      {
        id: "parecer",
        title: "Parecer Fonoaudiológico",
        fields: [{ id: "parecer", label: "Parecer (texto livre)", kind: "textarea" }],
      },
      {
        id: "objetivos",
        title: "Principais Objetivos Terapêuticos",
        fields: [
          {
            id: "objetivos_terapeuticos",
            label: "Selecione os objetivos aplicáveis",
            kind: "checkbox",
            allowOther: true,
            options: [
              "Adequação de Tonicidade e Mobilidade dos Órgãos Fonoarticulatórios – lábios, língua e bochechas",
              "Adequação do Padrão das Funções reflexo-vegetativas de respiração, sucção, mastigação e deglutição",
              "Estimulação de Linguagem",
              "Adequação do Distúrbio Articulatório",
              "Adequação do Desvio Fonético e Desvio Fonológico",
              "Estimulação das habilidades que envolvem o repertório básico para a alfabetização",
              "Estimulação da Habilidade de Consciência Fonológica",
              "Estimulação da habilidade de nomeação rápida automática",
              "Treinamento das Habilidades Auditivas (treinamento auditivo-cognitivo)",
              "Treinamento das Habilidades Perceptuais Visuais",
              "Treinamento das Habilidades Perceptuais Visuais em processos de decodificação durante a leitura",
              "Treinamento de movimentos pré-gráficos para estimular coordenação visomotora e planejamento motor para a letra cursiva",
              "Estimulação do raciocínio lógico e execução de cálculos matemáticos",
              "Estimulação de competências que envolvem a habilidade de Leitura",
              "Estimulação de competências que envolvem a habilidade de Escrita",
              "Estimulação de habilidades metacognitivas que auxiliam na execução de habilidades pedagógicas",
              "Abordagem de alfabetização neuroprática multissensorial",
              "Elaboração de metodologia de estudo baseada na teoria de habilidades múltiplas",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "orientacoes_escola",
    title: "11. Orientações à instituição de ensino",
    sections: [
      {
        id: "orientacoes",
        title: "Orientações selecionáveis",
        fields: [
          {
            id: "orient_artigo",
            label: "Pronome a ser utilizado no relatório",
            kind: "radio",
            options: ["o paciente", "a paciente"],
          },
          {
            id: "orientacoes_escola_lista",
            label: "Selecione as orientações aplicáveis",
            kind: "checkbox",
            allowOther: true,
            options: [
              "Oferecer o tempo necessário para a execução de atividades em sala de aula e provas",
              "Esclarecer enunciados ou instruções verbais quando necessário",
              "Fragmentar comandos verbais",
              "Após uma instrução verbal, utilizar um exemplo prático para a execução da tarefa",
              "Quando houver ruído em sala/externo durante explicação, garantir compreensão e retomar se necessário",
              "Antes de instruções verbais, solicitar a atenção da classe",
              "Fazer uso de gestos, expressões faciais e entonações durante o discurso oral",
              "Sempre que possível utilizar apoio visual (fotos, gráficos, figuras)",
              "Durante uma explicação realizar associações com assuntos familiares ou do cotidiano",
              "Formular provas com conforto visual e organização espacial (exercício completo na mesma página)",
              "Utilizar letras e espaçamentos confortáveis e boa qualidade de impressão",
              "Assento preferencial em sala de aula, distante de portas/janelas/equipamentos ruidosos, centralizado com a lousa",
            ],
          },
          {
            id: "orientacoes_escola_texto",
            label: "Texto complementar das orientações",
            kind: "textarea",
          },
        ],
      },
    ],
  },
  {
    id: "conclusao",
    title: "12. Conclusão",
    sections: [
      {
        id: "conclusao",
        title: "Conclusão",
        fields: [
          { id: "conclusao", label: "Texto de conclusão", kind: "textarea" },
          { id: "data_relatorio", label: "Data do relatório", kind: "text" },
        ],
      },
    ],
  },
];

export const proc = {
  max: { habilidades: 70, compreensao: 60, cognitivo: 70, total: 200 },
};
