export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json
          entidade: string
          entidade_id: string
          erro: string | null
          id: string
          ip: string | null
          modulo: string
          role: string
          status: string
          unidade_id: string
          user_id: string
          user_nome: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json
          entidade: string
          entidade_id?: string
          erro?: string | null
          id?: string
          ip?: string | null
          modulo?: string
          role?: string
          status?: string
          unidade_id?: string
          user_id?: string
          user_nome?: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json
          entidade?: string
          entidade_id?: string
          erro?: string | null
          id?: string
          ip?: string | null
          modulo?: string
          role?: string
          status?: string
          unidade_id?: string
          user_id?: string
          user_nome?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          agendado_por_externo: string | null
          atualizado_em: string
          criado_em: string | null
          criado_por: string
          custom_data: Json
          data: string
          google_event_id: string | null
          hora: string
          id: string
          lembrete_24h_enviado_em: string | null
          lembrete_proximo_enviado_em: string | null
          nome_procedimento: string | null
          observacoes: string
          origem: string
          paciente_id: string
          paciente_nome: string
          prioridade_perfil: string
          procedimento_sigtap: string | null
          profissional_id: string
          profissional_nome: string
          sala_id: string
          setor_id: string
          status: string
          sync_status: string | null
          tipo: string
          turno: string | null
          unidade_id: string
        }
        Insert: {
          agendado_por_externo?: string | null
          atualizado_em?: string
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data?: string
          google_event_id?: string | null
          hora?: string
          id: string
          lembrete_24h_enviado_em?: string | null
          lembrete_proximo_enviado_em?: string | null
          nome_procedimento?: string | null
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade_perfil?: string
          procedimento_sigtap?: string | null
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          turno?: string | null
          unidade_id?: string
        }
        Update: {
          agendado_por_externo?: string | null
          atualizado_em?: string
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data?: string
          google_event_id?: string | null
          hora?: string
          id?: string
          lembrete_24h_enviado_em?: string | null
          lembrete_proximo_enviado_em?: string | null
          nome_procedimento?: string | null
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade_perfil?: string
          procedimento_sigtap?: string | null
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          turno?: string | null
          unidade_id?: string
        }
        Relationships: []
      }
      atendimentos: {
        Row: {
          agendamento_id: string
          criado_em: string | null
          custom_data: Json
          data: string
          duracao_minutos: number | null
          hora_fim: string
          hora_inicio: string
          id: string
          observacoes: string
          paciente_id: string
          paciente_nome: string
          procedimento: string
          profissional_id: string
          profissional_nome: string
          sala_id: string
          setor: string
          status: string
          unidade_id: string
        }
        Insert: {
          agendamento_id?: string
          criado_em?: string | null
          custom_data?: Json
          data?: string
          duracao_minutos?: number | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          observacoes?: string
          paciente_id: string
          paciente_nome: string
          procedimento?: string
          profissional_id: string
          profissional_nome: string
          sala_id?: string
          setor?: string
          status?: string
          unidade_id?: string
        }
        Update: {
          agendamento_id?: string
          criado_em?: string | null
          custom_data?: Json
          data?: string
          duracao_minutos?: number | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          observacoes?: string
          paciente_id?: string
          paciente_nome?: string
          procedimento?: string
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor?: string
          status?: string
          unidade_id?: string
        }
        Relationships: []
      }
      bloqueios: {
        Row: {
          criado_em: string | null
          criado_por: string
          data_fim: string
          data_inicio: string
          dia_inteiro: boolean | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          profissional_id: string | null
          tipo: string
          titulo: string
          unidade_id: string | null
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string
          data_fim: string
          data_inicio: string
          dia_inteiro?: boolean | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          profissional_id?: string | null
          tipo?: string
          titulo?: string
          unidade_id?: string | null
        }
        Update: {
          criado_em?: string | null
          criado_por?: string
          data_fim?: string
          data_inicio?: string
          dia_inteiro?: boolean | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          profissional_id?: string | null
          tipo?: string
          titulo?: string
          unidade_id?: string | null
        }
        Relationships: []
      }
      cbo_codigos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string
          id: string
          profissoes_relacionadas: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao: string
          id?: string
          profissoes_relacionadas?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string
          id?: string
          profissoes_relacionadas?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      cid10_codigos: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          especialidade: string
          id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao?: string
          especialidade?: string
          id?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          especialidade?: string
          id?: string
        }
        Relationships: []
      }
      clinica_config: {
        Row: {
          created_at: string
          evolution_api_key: string
          evolution_base_url: string
          evolution_instance_name: string
          id: string
          logo_url: string
          nome_clinica: string
          telefone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evolution_api_key?: string
          evolution_base_url?: string
          evolution_instance_name?: string
          id?: string
          logo_url?: string
          nome_clinica?: string
          telefone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string
          evolution_base_url?: string
          evolution_instance_name?: string
          id?: string
          logo_url?: string
          nome_clinica?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      disponibilidades: {
        Row: {
          criado_em: string | null
          data_fim: string
          data_inicio: string
          dias_semana: number[]
          duracao_consulta: number
          hora_fim: string
          hora_inicio: string
          id: string
          profissional_id: string
          sala_id: string | null
          unidade_id: string
          vagas_por_dia: number
          vagas_por_hora: number
        }
        Insert: {
          criado_em?: string | null
          data_fim: string
          data_inicio: string
          dias_semana?: number[]
          duracao_consulta?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          profissional_id: string
          sala_id?: string | null
          unidade_id: string
          vagas_por_dia?: number
          vagas_por_hora?: number
        }
        Update: {
          criado_em?: string | null
          data_fim?: string
          data_inicio?: string
          dias_semana?: number[]
          duracao_consulta?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          profissional_id?: string
          sala_id?: string | null
          unidade_id?: string
          vagas_por_dia?: number
          vagas_por_hora?: number
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          ativo: boolean
          blocos_clinicos: Json
          conteudo: string
          created_at: string
          criado_por: string
          criado_por_nome: string
          id: string
          nome: string
          perfis_permitidos: string[]
          tipo: string
          tipo_modelo: string
          unidade_id: string | null
          updated_at: string
          versoes: Json
        }
        Insert: {
          ativo?: boolean
          blocos_clinicos?: Json
          conteudo?: string
          created_at?: string
          criado_por?: string
          criado_por_nome?: string
          id?: string
          nome?: string
          perfis_permitidos?: string[]
          tipo?: string
          tipo_modelo?: string
          unidade_id?: string | null
          updated_at?: string
          versoes?: Json
        }
        Update: {
          ativo?: boolean
          blocos_clinicos?: Json
          conteudo?: string
          created_at?: string
          criado_por?: string
          criado_por_nome?: string
          id?: string
          nome?: string
          perfis_permitidos?: string[]
          tipo?: string
          tipo_modelo?: string
          unidade_id?: string | null
          updated_at?: string
          versoes?: Json
        }
        Relationships: []
      }
      documentos_gerados: {
        Row: {
          assinado_em: string | null
          campos_formulario: Json
          cancelado_em: string | null
          cancelado_por: string
          conteudo_html: string
          conteudo_original: string
          created_at: string
          hash_assinatura: string
          id: string
          ip_assinatura: string
          modelo_id: string
          motivo_cancelamento: string
          paciente_id: string
          paciente_nome: string
          profissional_id: string
          profissional_nome: string
          status: string
          tipo_documento: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          assinado_em?: string | null
          campos_formulario?: Json
          cancelado_em?: string | null
          cancelado_por?: string
          conteudo_html?: string
          conteudo_original?: string
          created_at?: string
          hash_assinatura?: string
          id?: string
          ip_assinatura?: string
          modelo_id?: string
          motivo_cancelamento?: string
          paciente_id?: string
          paciente_nome?: string
          profissional_id?: string
          profissional_nome?: string
          status?: string
          tipo_documento?: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          assinado_em?: string | null
          campos_formulario?: Json
          cancelado_em?: string | null
          cancelado_por?: string
          conteudo_html?: string
          conteudo_original?: string
          created_at?: string
          hash_assinatura?: string
          id?: string
          ip_assinatura?: string
          modelo_id?: string
          motivo_cancelamento?: string
          paciente_id?: string
          paciente_nome?: string
          profissional_id?: string
          profissional_nome?: string
          status?: string
          tipo_documento?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      episodios_clinicos: {
        Row: {
          atualizado_em: string
          criado_em: string
          data_fim: string | null
          data_inicio: string
          descricao: string
          id: string
          paciente_id: string
          profissional_id: string
          profissional_nome: string
          status: string
          tipo: string
          titulo: string
          unidade_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          id?: string
          paciente_id: string
          profissional_id: string
          profissional_nome?: string
          status?: string
          tipo?: string
          titulo: string
          unidade_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          id?: string
          paciente_id?: string
          profissional_id?: string
          profissional_nome?: string
          status?: string
          tipo?: string
          titulo?: string
          unidade_id?: string
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      exam_types: {
        Row: {
          ativo: boolean
          categoria: string
          codigo_sus: string
          criado_em: string
          id: string
          is_global: boolean
          nome: string
          profissional_id: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          codigo_sus?: string
          criado_em?: string
          id?: string
          is_global?: boolean
          nome: string
          profissional_id?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo_sus?: string
          criado_em?: string
          id?: string
          is_global?: boolean
          nome?: string
          profissional_id?: string | null
        }
        Relationships: []
      }
      fila_espera: {
        Row: {
          cid: string
          criado_em: string | null
          criado_por: string
          custom_data: Json
          data_solicitacao_original: string
          descricao_clinica: string
          especialidade_destino: string
          hora_chamada: string | null
          hora_chegada: string
          id: string
          observacoes: string | null
          origem_cadastro: string
          paciente_id: string
          paciente_nome: string
          posicao: number
          prioridade: string
          prioridade_perfil: string
          profissional_id: string | null
          setor: string
          status: string
          unidade_id: string
        }
        Insert: {
          cid?: string
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data_solicitacao_original?: string
          descricao_clinica?: string
          especialidade_destino?: string
          hora_chamada?: string | null
          hora_chegada?: string
          id: string
          observacoes?: string | null
          origem_cadastro?: string
          paciente_id?: string
          paciente_nome?: string
          posicao?: number
          prioridade?: string
          prioridade_perfil?: string
          profissional_id?: string | null
          setor?: string
          status?: string
          unidade_id?: string
        }
        Update: {
          cid?: string
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data_solicitacao_original?: string
          descricao_clinica?: string
          especialidade_destino?: string
          hora_chamada?: string | null
          hora_chegada?: string
          id?: string
          observacoes?: string | null
          origem_cadastro?: string
          paciente_id?: string
          paciente_nome?: string
          posicao?: number
          prioridade?: string
          prioridade_perfil?: string
          profissional_id?: string | null
          setor?: string
          status?: string
          unidade_id?: string
        }
        Relationships: []
      }
      form_templates: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          descricao: string
          display_name: string
          form_slug: string
          id: string
          profissional_id: string
          schema: Json
          unidade_id: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          descricao?: string
          display_name?: string
          form_slug: string
          id?: string
          profissional_id?: string
          schema?: Json
          unidade_id?: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          descricao?: string
          display_name?: string
          form_slug?: string
          id?: string
          profissional_id?: string
          schema?: Json
          unidade_id?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          ativo: boolean | null
          auth_user_id: string | null
          cargo: string | null
          coren: string | null
          cpf: string
          criado_em: string | null
          criado_por: string | null
          custom_data: Json
          email: string
          id: string
          nome: string
          numero_conselho: string
          pode_agendar_retorno: boolean
          profissao: string
          role: string
          sala_id: string | null
          setor: string | null
          tempo_atendimento: number
          tipo_conselho: string
          uf_conselho: string
          unidade_id: string | null
          usuario: string
        }
        Insert: {
          ativo?: boolean | null
          auth_user_id?: string | null
          cargo?: string | null
          coren?: string | null
          cpf?: string
          criado_em?: string | null
          criado_por?: string | null
          custom_data?: Json
          email: string
          id?: string
          nome: string
          numero_conselho?: string
          pode_agendar_retorno?: boolean
          profissao?: string
          role?: string
          sala_id?: string | null
          setor?: string | null
          tempo_atendimento?: number
          tipo_conselho?: string
          uf_conselho?: string
          unidade_id?: string | null
          usuario: string
        }
        Update: {
          ativo?: boolean | null
          auth_user_id?: string | null
          cargo?: string | null
          coren?: string | null
          cpf?: string
          criado_em?: string | null
          criado_por?: string | null
          custom_data?: Json
          email?: string
          id?: string
          nome?: string
          numero_conselho?: string
          pode_agendar_retorno?: boolean
          profissao?: string
          role?: string
          sala_id?: string | null
          setor?: string | null
          tempo_atendimento?: number
          tipo_conselho?: string
          uf_conselho?: string
          unidade_id?: string | null
          usuario?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      horarios_funcionamento: {
        Row: {
          ativo: boolean
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_slots: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dia_semana: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_slots?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_slots?: number
          updated_at?: string
        }
        Relationships: []
      }
      logradouros_dne: {
        Row: {
          codigo: string
          descricao: string
        }
        Insert: {
          codigo: string
          descricao: string
        }
        Update: {
          codigo?: string
          descricao?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          apresentacao: string
          ativo: boolean
          classe_terapeutica: string
          created_at: string
          dosagem_padrao: string
          id: string
          is_global: boolean
          nome: string
          principio_ativo: string
          profissional_id: string | null
          via_padrao: string
        }
        Insert: {
          apresentacao?: string
          ativo?: boolean
          classe_terapeutica?: string
          created_at?: string
          dosagem_padrao?: string
          id?: string
          is_global?: boolean
          nome: string
          principio_ativo?: string
          profissional_id?: string | null
          via_padrao?: string
        }
        Update: {
          apresentacao?: string
          ativo?: boolean
          classe_terapeutica?: string
          created_at?: string
          dosagem_padrao?: string
          id?: string
          is_global?: boolean
          nome?: string
          principio_ativo?: string
          profissional_id?: string | null
          via_padrao?: string
        }
        Relationships: []
      }
      multiprofessional_evaluations: {
        Row: {
          agendamento_id: string | null
          clinical_evaluation: string
          created_at: string
          custom_data: Json
          evaluation_date: string
          id: string
          observations: string
          parecer: string
          patient_id: string
          professional_id: string
          professional_nome: string
          specialty: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinical_evaluation?: string
          created_at?: string
          custom_data?: Json
          evaluation_date?: string
          id?: string
          observations?: string
          parecer?: string
          patient_id: string
          professional_id: string
          professional_nome?: string
          specialty?: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinical_evaluation?: string
          created_at?: string
          custom_data?: Json
          evaluation_date?: string
          id?: string
          observations?: string
          parecer?: string
          patient_id?: string
          professional_id?: string
          professional_nome?: string
          specialty?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          agendamento_id: string | null
          canal: string
          criado_em: string
          destinatario_email: string | null
          destinatario_telefone: string | null
          erro: string | null
          evento: string
          id: string
          payload: Json
          resposta: string | null
          status: string
        }
        Insert: {
          agendamento_id?: string | null
          canal?: string
          criado_em?: string
          destinatario_email?: string | null
          destinatario_telefone?: string | null
          erro?: string | null
          evento: string
          id?: string
          payload?: Json
          resposta?: string | null
          status?: string
        }
        Update: {
          agendamento_id?: string | null
          canal?: string
          criado_em?: string
          destinatario_email?: string | null
          destinatario_telefone?: string | null
          erro?: string | null
          evento?: string
          id?: string
          payload?: Json
          resposta?: string | null
          status?: string
        }
        Relationships: []
      }
      nursing_evaluations: {
        Row: {
          agendamento_id: string | null
          anamnese_resumida: string
          avaliacao_risco: string
          condicao_clinica: string
          created_at: string
          evaluation_date: string
          id: string
          motivo_inapto: string
          observacoes_clinicas: string
          patient_id: string
          prioridade: string
          professional_id: string
          resultado: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          anamnese_resumida?: string
          avaliacao_risco?: string
          condicao_clinica?: string
          created_at?: string
          evaluation_date?: string
          id?: string
          motivo_inapto?: string
          observacoes_clinicas?: string
          patient_id: string
          prioridade?: string
          professional_id: string
          resultado?: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          anamnese_resumida?: string
          avaliacao_risco?: string
          condicao_clinica?: string
          created_at?: string
          evaluation_date?: string
          id?: string
          motivo_inapto?: string
          observacoes_clinicas?: string
          patient_id?: string
          prioridade?: string
          professional_id?: string
          resultado?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          auth_user_id: string | null
          cid: string
          cns: string
          comportamento: string
          comunicacao: string
          cpf: string
          cpf_responsavel: string
          criado_em: string | null
          custom_data: Json
          data_encaminhamento: string
          data_nascimento: string
          descricao_clinica: string
          diagnostico_resumido: string
          documento_url: string
          email: string
          endereco: string
          equipamentos: string[]
          especialidade_destino: string
          id: string
          is_autista: boolean
          is_gestante: boolean
          is_pne: boolean
          justificativa: string
          menor_idade: boolean
          mobilidade: string
          municipio: string
          nome: string
          nome_mae: string
          nome_responsavel: string
          observacao_equipamentos: string
          observacoes: string
          outro_servico_sus: boolean
          profissional_solicitante: string
          telefone: string
          tipo_condicao: string
          tipo_dispositivo: string
          tipo_encaminhamento: string
          transporte: string
          turno_preferido: string
          ubs_origem: string
          unidade_id: string
          usa_dispositivo: boolean
          usa_equipamentos: boolean
        }
        Insert: {
          auth_user_id?: string | null
          cid?: string
          cns?: string
          comportamento?: string
          comunicacao?: string
          cpf?: string
          cpf_responsavel?: string
          criado_em?: string | null
          custom_data?: Json
          data_encaminhamento?: string
          data_nascimento?: string
          descricao_clinica?: string
          diagnostico_resumido?: string
          documento_url?: string
          email?: string
          endereco?: string
          equipamentos?: string[]
          especialidade_destino?: string
          id: string
          is_autista?: boolean
          is_gestante?: boolean
          is_pne?: boolean
          justificativa?: string
          menor_idade?: boolean
          mobilidade?: string
          municipio?: string
          nome: string
          nome_mae?: string
          nome_responsavel?: string
          observacao_equipamentos?: string
          observacoes?: string
          outro_servico_sus?: boolean
          profissional_solicitante?: string
          telefone?: string
          tipo_condicao?: string
          tipo_dispositivo?: string
          tipo_encaminhamento?: string
          transporte?: string
          turno_preferido?: string
          ubs_origem?: string
          unidade_id?: string
          usa_dispositivo?: boolean
          usa_equipamentos?: boolean
        }
        Update: {
          auth_user_id?: string | null
          cid?: string
          cns?: string
          comportamento?: string
          comunicacao?: string
          cpf?: string
          cpf_responsavel?: string
          criado_em?: string | null
          custom_data?: Json
          data_encaminhamento?: string
          data_nascimento?: string
          descricao_clinica?: string
          diagnostico_resumido?: string
          documento_url?: string
          email?: string
          endereco?: string
          equipamentos?: string[]
          especialidade_destino?: string
          id?: string
          is_autista?: boolean
          is_gestante?: boolean
          is_pne?: boolean
          justificativa?: string
          menor_idade?: boolean
          mobilidade?: string
          municipio?: string
          nome?: string
          nome_mae?: string
          nome_responsavel?: string
          observacao_equipamentos?: string
          observacoes?: string
          outro_servico_sus?: boolean
          profissional_solicitante?: string
          telefone?: string
          tipo_condicao?: string
          tipo_dispositivo?: string
          tipo_encaminhamento?: string
          transporte?: string
          turno_preferido?: string
          ubs_origem?: string
          unidade_id?: string
          usa_dispositivo?: boolean
          usa_equipamentos?: boolean
        }
        Relationships: []
      }
      patient_discharges: {
        Row: {
          created_at: string
          custom_data: Json
          cycle_id: string
          discharge_date: string
          final_notes: string
          id: string
          patient_id: string
          professional_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          custom_data?: Json
          cycle_id: string
          discharge_date?: string
          final_notes?: string
          id?: string
          patient_id: string
          professional_id: string
          reason?: string
        }
        Update: {
          created_at?: string
          custom_data?: Json
          cycle_id?: string
          discharge_date?: string
          final_notes?: string
          id?: string
          patient_id?: string
          professional_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_discharges_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "treatment_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_evaluations: {
        Row: {
          clinical_notes: string
          created_at: string
          defined_procedures: string[]
          evaluation_date: string
          frequency: string
          id: string
          patient_id: string
          professional_id: string
          regulation_id: string | null
          rejection_reason: string
          sessions_planned: number
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          clinical_notes?: string
          created_at?: string
          defined_procedures?: string[]
          evaluation_date?: string
          frequency?: string
          id?: string
          patient_id: string
          professional_id: string
          regulation_id?: string | null
          rejection_reason?: string
          sessions_planned?: number
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          clinical_notes?: string
          created_at?: string
          defined_procedures?: string[]
          evaluation_date?: string
          frequency?: string
          id?: string
          patient_id?: string
          professional_id?: string
          regulation_id?: string | null
          rejection_reason?: string
          sessions_planned?: number
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_evaluations_regulation_id_fkey"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "patient_regulation"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_regulation: {
        Row: {
          cid_code: string
          cns: string
          cpf: string
          created_at: string
          id: string
          mother_name: string
          name: string
          notes: string
          patient_id: string
          priority_level: string
          referral_source: string
          requires_specialty: string
          status: string
          updated_at: string
        }
        Insert: {
          cid_code?: string
          cns?: string
          cpf?: string
          created_at?: string
          id?: string
          mother_name?: string
          name: string
          notes?: string
          patient_id: string
          priority_level?: string
          referral_source?: string
          requires_specialty?: string
          status?: string
          updated_at?: string
        }
        Update: {
          cid_code?: string
          cns?: string
          cpf?: string
          created_at?: string
          id?: string
          mother_name?: string
          name?: string
          notes?: string
          patient_id?: string
          priority_level?: string
          referral_source?: string
          requires_specialty?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissoes: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_execute: boolean
          can_view: boolean
          created_at: string
          id: string
          modulo: string
          perfil: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo: string
          perfil: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo?: string
          perfil?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissoes_usuario: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_execute: boolean
          can_view: boolean
          created_at: string
          id: string
          modulo: string
          unidade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo: string
          unidade_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo?: string
          unidade_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      procedimento_profissionais: {
        Row: {
          created_at: string
          id: string
          procedimento_codigo: string
          profissional_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          procedimento_codigo: string
          profissional_id: string
        }
        Update: {
          created_at?: string
          id?: string
          procedimento_codigo?: string
          profissional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_profissionais_procedimento_codigo_fkey"
            columns: ["procedimento_codigo"]
            isOneToOne: false
            referencedRelation: "sigtap_procedimentos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      procedimentos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo_sigtap: string
          criado_em: string
          descricao: string
          especialidade: string
          id: string
          nome: string
          profissao: string
          profissionais_ids: string[] | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo_sigtap?: string
          criado_em?: string
          descricao?: string
          especialidade?: string
          id?: string
          nome: string
          profissao?: string
          profissionais_ids?: string[] | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo_sigtap?: string
          criado_em?: string
          descricao?: string
          especialidade?: string
          id?: string
          nome?: string
          profissao?: string
          profissionais_ids?: string[] | null
        }
        Relationships: []
      }
      professional_preferences: {
        Row: {
          criado_em: string
          desabilitado: boolean
          id: string
          item_id: string
          profissional_id: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          desabilitado?: boolean
          id?: string
          item_id: string
          profissional_id: string
          tipo?: string
        }
        Update: {
          criado_em?: string
          desabilitado?: boolean
          id?: string
          item_id?: string
          profissional_id?: string
          tipo?: string
        }
        Relationships: []
      }
      profissionais_carimbo: {
        Row: {
          cargo: string
          conselho: string
          created_at: string
          especialidade: string
          id: string
          imagem_url: string
          nome: string
          numero_registro: string
          profissional_id: string
          tipo: string
          uf: string
          updated_at: string
        }
        Insert: {
          cargo?: string
          conselho?: string
          created_at?: string
          especialidade?: string
          id?: string
          imagem_url?: string
          nome?: string
          numero_registro?: string
          profissional_id: string
          tipo?: string
          uf?: string
          updated_at?: string
        }
        Update: {
          cargo?: string
          conselho?: string
          created_at?: string
          especialidade?: string
          id?: string
          imagem_url?: string
          nome?: string
          numero_registro?: string
          profissional_id?: string
          tipo?: string
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      profissionais_externos: {
        Row: {
          ativo: boolean
          auth_user_id: string | null
          criado_em: string
          criado_por: string
          email: string
          id: string
          nome: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string
          email: string
          id?: string
          nome: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string
          email?: string
          id?: string
          nome?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prontuario_config: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          is_default: boolean | null
          profissional_id: string
          template_nome: string | null
          tipo_prontuario: string
          updated_at: string | null
          versao: number
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          profissional_id: string
          template_nome?: string | null
          tipo_prontuario?: string
          updated_at?: string | null
          versao?: number
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          profissional_id?: string
          template_nome?: string | null
          tipo_prontuario?: string
          updated_at?: string | null
          versao?: number
        }
        Relationships: []
      }
      prontuario_procedimentos: {
        Row: {
          criado_em: string
          id: string
          observacao: string
          procedimento_id: string
          prontuario_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          observacao?: string
          procedimento_id: string
          prontuario_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          observacao?: string
          procedimento_id?: string
          prontuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prontuario_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prontuario_procedimentos_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
          anamnese: string | null
          atualizado_em: string | null
          conduta: string | null
          criado_em: string | null
          custom_data: Json
          data_atendimento: string
          episodio_id: string | null
          evolucao: string | null
          exame_fisico: string | null
          hipotese: string | null
          hora_atendimento: string | null
          id: string
          indicacao_retorno: string
          motivo_alteracao: string
          observacoes: string | null
          outro_procedimento: string
          paciente_id: string
          paciente_nome: string
          prescricao: string | null
          procedimentos_texto: string
          profissional_id: string
          profissional_nome: string
          queixa_principal: string | null
          sala_id: string | null
          setor: string | null
          sinais_sintomas: string | null
          soap_avaliacao: string | null
          soap_objetivo: string | null
          soap_plano: string | null
          soap_subjetivo: string | null
          solicitacao_exames: string | null
          tipo_registro: string
          unidade_id: string
        }
        Insert: {
          agendamento_id?: string | null
          anamnese?: string | null
          atualizado_em?: string | null
          conduta?: string | null
          criado_em?: string | null
          custom_data?: Json
          data_atendimento?: string
          episodio_id?: string | null
          evolucao?: string | null
          exame_fisico?: string | null
          hipotese?: string | null
          hora_atendimento?: string | null
          id?: string
          indicacao_retorno?: string
          motivo_alteracao?: string
          observacoes?: string | null
          outro_procedimento?: string
          paciente_id: string
          paciente_nome: string
          prescricao?: string | null
          procedimentos_texto?: string
          profissional_id: string
          profissional_nome: string
          queixa_principal?: string | null
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          soap_avaliacao?: string | null
          soap_objetivo?: string | null
          soap_plano?: string | null
          soap_subjetivo?: string | null
          solicitacao_exames?: string | null
          tipo_registro?: string
          unidade_id: string
        }
        Update: {
          agendamento_id?: string | null
          anamnese?: string | null
          atualizado_em?: string | null
          conduta?: string | null
          criado_em?: string | null
          custom_data?: Json
          data_atendimento?: string
          episodio_id?: string | null
          evolucao?: string | null
          exame_fisico?: string | null
          hipotese?: string | null
          hora_atendimento?: string | null
          id?: string
          indicacao_retorno?: string
          motivo_alteracao?: string
          observacoes?: string | null
          outro_procedimento?: string
          paciente_id?: string
          paciente_nome?: string
          prescricao?: string | null
          procedimentos_texto?: string
          profissional_id?: string
          profissional_nome?: string
          queixa_principal?: string | null
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          soap_avaliacao?: string | null
          soap_objetivo?: string | null
          soap_plano?: string | null
          soap_subjetivo?: string | null
          solicitacao_exames?: string | null
          tipo_registro?: string
          unidade_id?: string
        }
        Relationships: []
      }
      pts: {
        Row: {
          created_at: string
          custom_data: Json
          diagnostico_funcional: string
          especialidades_envolvidas: string[]
          id: string
          metas_curto_prazo: string
          metas_longo_prazo: string
          metas_medio_prazo: string
          objetivos_terapeuticos: string
          patient_id: string
          professional_id: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_data?: Json
          diagnostico_funcional?: string
          especialidades_envolvidas?: string[]
          id?: string
          metas_curto_prazo?: string
          metas_longo_prazo?: string
          metas_medio_prazo?: string
          objetivos_terapeuticos?: string
          patient_id: string
          professional_id: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_data?: Json
          diagnostico_funcional?: string
          especialidades_envolvidas?: string[]
          id?: string
          metas_curto_prazo?: string
          metas_longo_prazo?: string
          metas_medio_prazo?: string
          objetivos_terapeuticos?: string
          patient_id?: string
          professional_id?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pts_cid: {
        Row: {
          cid_codigo: string
          cid_descricao: string
          created_at: string
          id: string
          pts_id: string
        }
        Insert: {
          cid_codigo?: string
          cid_descricao?: string
          created_at?: string
          id?: string
          pts_id: string
        }
        Update: {
          cid_codigo?: string
          cid_descricao?: string
          created_at?: string
          id?: string
          pts_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pts_cid_pts_id_fkey"
            columns: ["pts_id"]
            isOneToOne: false
            referencedRelation: "pts"
            referencedColumns: ["id"]
          },
        ]
      }
      pts_import_log: {
        Row: {
          competencia: string
          detalhes: Json
          especialidade: string
          id: string
          importado_em: string
          tipo: string
          total_cids: number
          total_procedimentos: number
        }
        Insert: {
          competencia?: string
          detalhes?: Json
          especialidade?: string
          id?: string
          importado_em?: string
          tipo?: string
          total_cids?: number
          total_procedimentos?: number
        }
        Update: {
          competencia?: string
          detalhes?: Json
          especialidade?: string
          id?: string
          importado_em?: string
          tipo?: string
          total_cids?: number
          total_procedimentos?: number
        }
        Relationships: []
      }
      pts_sigtap: {
        Row: {
          created_at: string
          especialidade: string
          id: string
          procedimento_codigo: string
          procedimento_nome: string
          pts_id: string
        }
        Insert: {
          created_at?: string
          especialidade?: string
          id?: string
          procedimento_codigo?: string
          procedimento_nome?: string
          pts_id: string
        }
        Update: {
          created_at?: string
          especialidade?: string
          id?: string
          procedimento_codigo?: string
          procedimento_nome?: string
          pts_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pts_sigtap_pts_id_fkey"
            columns: ["pts_id"]
            isOneToOne: false
            referencedRelation: "pts"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas_externas: {
        Row: {
          criado_em: string
          id: string
          periodo_fim: string
          periodo_inicio: string
          profissional_externo_id: string
          profissional_interno_id: string
          unidade_id: string
          updated_at: string
          vagas_total: number
          vagas_usadas: number
        }
        Insert: {
          criado_em?: string
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          profissional_externo_id: string
          profissional_interno_id: string
          unidade_id?: string
          updated_at?: string
          vagas_total?: number
          vagas_usadas?: number
        }
        Update: {
          criado_em?: string
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          profissional_externo_id?: string
          profissional_interno_id?: string
          unidade_id?: string
          updated_at?: string
          vagas_total?: number
          vagas_usadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotas_externas_profissional_externo_id_fkey"
            columns: ["profissional_externo_id"]
            isOneToOne: false
            referencedRelation: "profissionais_externos"
            referencedColumns: ["id"]
          },
        ]
      }
      salas: {
        Row: {
          ativo: boolean
          criado_em: string | null
          id: string
          nome: string
          unidade_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string | null
          id: string
          nome: string
          unidade_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string | null
          id?: string
          nome?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      sigtap_procedimento_cids: {
        Row: {
          cid_codigo: string
          cid_descricao: string
          created_at: string
          id: string
          procedimento_codigo: string
        }
        Insert: {
          cid_codigo: string
          cid_descricao?: string
          created_at?: string
          id?: string
          procedimento_codigo: string
        }
        Update: {
          cid_codigo?: string
          cid_descricao?: string
          created_at?: string
          id?: string
          procedimento_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sigtap_procedimento_cids_procedimento_codigo_fkey"
            columns: ["procedimento_codigo"]
            isOneToOne: false
            referencedRelation: "sigtap_procedimentos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      sigtap_procedimentos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          criado_por: string
          descricao: string
          especialidade: string
          id: string
          nome: string
          origem: string
          total_cids: number
          updated_at: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          criado_por?: string
          descricao?: string
          especialidade?: string
          id?: string
          nome: string
          origem?: string
          total_cids?: number
          updated_at?: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          criado_por?: string
          descricao?: string
          especialidade?: string
          id?: string
          nome?: string
          origem?: string
          total_cids?: number
          updated_at?: string
          valor?: number | null
        }
        Relationships: []
      }
      soap_custom_options: {
        Row: {
          campo: string
          created_at: string
          id: string
          opcao: string
          profissao: string
          profissional_id: string
        }
        Insert: {
          campo: string
          created_at?: string
          id?: string
          opcao: string
          profissao?: string
          profissional_id: string
        }
        Update: {
          campo?: string
          created_at?: string
          id?: string
          opcao?: string
          profissao?: string
          profissional_id?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          configuracoes: Json
          id: string
          updated_at: string
        }
        Insert: {
          configuracoes?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          configuracoes?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      treatment_cycles: {
        Row: {
          clinical_notes: string
          created_at: string
          created_by: string
          custom_data: Json
          end_date_predicted: string | null
          frequency: string
          id: string
          patient_id: string
          professional_id: string
          pts_id: string | null
          sessions_done: number
          specialty: string
          start_date: string
          status: string
          total_sessions: number
          treatment_type: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          clinical_notes?: string
          created_at?: string
          created_by?: string
          custom_data?: Json
          end_date_predicted?: string | null
          frequency?: string
          id?: string
          patient_id: string
          professional_id: string
          pts_id?: string | null
          sessions_done?: number
          specialty?: string
          start_date?: string
          status?: string
          total_sessions?: number
          treatment_type?: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          clinical_notes?: string
          created_at?: string
          created_by?: string
          custom_data?: Json
          end_date_predicted?: string | null
          frequency?: string
          id?: string
          patient_id?: string
          professional_id?: string
          pts_id?: string | null
          sessions_done?: number
          specialty?: string
          start_date?: string
          status?: string
          total_sessions?: number
          treatment_type?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_cycles_pts_id_fkey"
            columns: ["pts_id"]
            isOneToOne: false
            referencedRelation: "pts"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_extensions: {
        Row: {
          changed_at: string
          changed_by: string
          cycle_id: string
          id: string
          new_end_date: string | null
          new_sessions: number
          previous_end_date: string | null
          previous_sessions: number
          reason: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          cycle_id: string
          id?: string
          new_end_date?: string | null
          new_sessions: number
          previous_end_date?: string | null
          previous_sessions: number
          reason?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          cycle_id?: string
          id?: string
          new_end_date?: string | null
          new_sessions?: number
          previous_end_date?: string | null
          previous_sessions?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_extensions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "treatment_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_sessions: {
        Row: {
          absence_type: string | null
          appointment_id: string | null
          clinical_notes: string
          created_at: string
          cycle_id: string
          id: string
          patient_id: string
          procedure_done: string
          professional_id: string
          scheduled_date: string
          session_number: number
          status: string
          total_sessions: number
        }
        Insert: {
          absence_type?: string | null
          appointment_id?: string | null
          clinical_notes?: string
          created_at?: string
          cycle_id: string
          id?: string
          patient_id: string
          procedure_done?: string
          professional_id: string
          scheduled_date?: string
          session_number?: number
          status?: string
          total_sessions?: number
        }
        Update: {
          absence_type?: string | null
          appointment_id?: string | null
          clinical_notes?: string
          created_at?: string
          cycle_id?: string
          id?: string
          patient_id?: string
          procedure_done?: string
          professional_id?: string
          scheduled_date?: string
          session_number?: number
          status?: string
          total_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "treatment_sessions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "treatment_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_records: {
        Row: {
          agendamento_id: string
          alergias: string[] | null
          altura: number | null
          classificacao_risco: string
          confirmado_em: string | null
          criado_em: string | null
          custom_data: Json
          frequencia_cardiaca: number | null
          glicemia: number | null
          id: string
          imc: number | null
          iniciado_em: string | null
          medicamentos: string[] | null
          observacoes: string
          peso: number | null
          pressao_arterial: string | null
          queixa: string | null
          saturacao_oxigenio: number | null
          tecnico_id: string
          temperatura: number | null
        }
        Insert: {
          agendamento_id: string
          alergias?: string[] | null
          altura?: number | null
          classificacao_risco?: string
          confirmado_em?: string | null
          criado_em?: string | null
          custom_data?: Json
          frequencia_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          iniciado_em?: string | null
          medicamentos?: string[] | null
          observacoes?: string
          peso?: number | null
          pressao_arterial?: string | null
          queixa?: string | null
          saturacao_oxigenio?: number | null
          tecnico_id: string
          temperatura?: number | null
        }
        Update: {
          agendamento_id?: string
          alergias?: string[] | null
          altura?: number | null
          classificacao_risco?: string
          confirmado_em?: string | null
          criado_em?: string | null
          custom_data?: Json
          frequencia_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          iniciado_em?: string | null
          medicamentos?: string[] | null
          observacoes?: string
          peso?: number | null
          pressao_arterial?: string | null
          queixa?: string | null
          saturacao_oxigenio?: number | null
          tecnico_id?: string
          temperatura?: number | null
        }
        Relationships: []
      }
      triage_settings: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          profissional_id: string | null
          unidade_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          profissional_id?: string | null
          unidade_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          profissional_id?: string | null
          unidade_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      unidades: {
        Row: {
          ativo: boolean
          criado_em: string | null
          custom_data: Json
          endereco: string
          id: string
          nome: string
          nome_exibicao: string
          telefone: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string | null
          custom_data?: Json
          endereco?: string
          id: string
          nome: string
          nome_exibicao?: string
          telefone?: string
          whatsapp?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string | null
          custom_data?: Json
          endereco?: string
          id?: string
          nome?: string
          nome_exibicao?: string
          telefone?: string
          whatsapp?: string
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          bloquear_sem_interacao_previa: boolean
          created_at: string
          delay_aleatorio_max_seg: number
          delay_aleatorio_min_seg: number
          dias_permitidos: number[]
          horario_fim: string
          horario_inicio: string
          id: string
          intervalo_minimo_minutos: number
          limite_global_por_minuto: number
          max_msgs_paciente_dia: number
          max_msgs_paciente_semana: number
          modo_estrito: boolean
          respeitar_opt_out: boolean
          unidade_id: string
          updated_at: string
          whatsapp_ativo: boolean
        }
        Insert: {
          bloquear_sem_interacao_previa?: boolean
          created_at?: string
          delay_aleatorio_max_seg?: number
          delay_aleatorio_min_seg?: number
          dias_permitidos?: number[]
          horario_fim?: string
          horario_inicio?: string
          id?: string
          intervalo_minimo_minutos?: number
          limite_global_por_minuto?: number
          max_msgs_paciente_dia?: number
          max_msgs_paciente_semana?: number
          modo_estrito?: boolean
          respeitar_opt_out?: boolean
          unidade_id: string
          updated_at?: string
          whatsapp_ativo?: boolean
        }
        Update: {
          bloquear_sem_interacao_previa?: boolean
          created_at?: string
          delay_aleatorio_max_seg?: number
          delay_aleatorio_min_seg?: number
          dias_permitidos?: number[]
          horario_fim?: string
          horario_inicio?: string
          id?: string
          intervalo_minimo_minutos?: number
          limite_global_por_minuto?: number
          max_msgs_paciente_dia?: number
          max_msgs_paciente_semana?: number
          modo_estrito?: boolean
          respeitar_opt_out?: boolean
          unidade_id?: string
          updated_at?: string
          whatsapp_ativo?: boolean
        }
        Relationships: []
      }
      whatsapp_consents: {
        Row: {
          criado_em: string
          criado_por: string
          detalhes: Json
          id: string
          origem: string
          paciente_id: string
          telefone: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string
          detalhes?: Json
          id?: string
          origem?: string
          paciente_id: string
          telefone: string
          tipo: string
        }
        Update: {
          criado_em?: string
          criado_por?: string
          detalhes?: Json
          id?: string
          origem?: string
          paciente_id?: string
          telefone?: string
          tipo?: string
        }
        Relationships: []
      }
      whatsapp_event_config: {
        Row: {
          ativo: boolean
          created_at: string
          delay_envio_min: number
          evento: string
          exigir_confirmacao: boolean
          horario_personalizado: string
          id: string
          limite_por_paciente: number
          prioridade: string
          template_mensagem: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          delay_envio_min?: number
          evento: string
          exigir_confirmacao?: boolean
          horario_personalizado?: string
          id?: string
          limite_por_paciente?: number
          prioridade?: string
          template_mensagem?: string
          unidade_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          delay_envio_min?: number
          evento?: string
          exigir_confirmacao?: boolean
          horario_personalizado?: string
          id?: string
          limite_por_paciente?: number
          prioridade?: string
          template_mensagem?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          agendado_para: string
          agendamento_id: string
          criado_em: string
          evento: string
          id: string
          mensagem: string
          metadados: Json
          motivo_bloqueio: string
          motivo_erro: string
          paciente_id: string
          paciente_nome: string
          prioridade: string
          processado_em: string | null
          status: string
          telefone: string
          tentativas: number
          unidade_id: string
          updated_at: string
        }
        Insert: {
          agendado_para?: string
          agendamento_id?: string
          criado_em?: string
          evento: string
          id?: string
          mensagem: string
          metadados?: Json
          motivo_bloqueio?: string
          motivo_erro?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade?: string
          processado_em?: string | null
          status?: string
          telefone: string
          tentativas?: number
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          agendamento_id?: string
          criado_em?: string
          evento?: string
          id?: string
          mensagem?: string
          metadados?: Json
          motivo_bloqueio?: string
          motivo_erro?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade?: string
          processado_em?: string | null
          status?: string
          telefone?: string
          tentativas?: number
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          mensagem: string
          tipo: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          mensagem?: string
          tipo?: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          mensagem?: string
          tipo?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      clinica_config_safe: {
        Row: {
          created_at: string | null
          evolution_base_url: string | null
          evolution_instance_name: string | null
          id: string | null
          logo_url: string | null
          nome_clinica: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evolution_base_url?: string | null
          evolution_instance_name?: string | null
          id?: string | null
          logo_url?: string | null
          nome_clinica?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evolution_base_url?: string | null
          evolution_instance_name?: string | null
          id?: string | null
          logo_url?: string | null
          nome_clinica?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_slot_availability: {
        Args: {
          p_data: string
          p_hora: string
          p_profissional_id: string
          p_unidade_id: string
        }
        Returns: Json
      }
      get_treatment_cycles_paginated: {
        Args: {
          p_only_own_professional?: boolean
          p_page?: number
          p_page_size?: number
          p_professional_id?: string
          p_search?: string
          p_status?: string
          p_unit_id?: string
        }
        Returns: Json
      }
      has_staff_role: { Args: { _role: string }; Returns: boolean }
      iniciar_atendimento: {
        Args: { p_agendamento_id: string; p_profissional_id: string }
        Returns: undefined
      }
      is_date_blocked: {
        Args: {
          p_date: string
          p_profissional_id: string
          p_unidade_id: string
        }
        Returns: boolean
      }
      is_external_professional: { Args: never; Returns: boolean }
      is_staff_member: { Args: never; Returns: boolean }
      resolve_form_template: {
        Args: {
          p_form_slug: string
          p_profissional_id?: string
          p_unidade_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
