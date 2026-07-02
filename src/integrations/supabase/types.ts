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
          acao_legivel: string | null
          after: Json | null
          agendamento_id: string | null
          before: Json | null
          campos_alterados: string[] | null
          changes: Json | null
          created_at: string
          detalhes: Json
          dispositivo: string | null
          documento_id: string | null
          entidade: string
          entidade_id: string
          erro: string | null
          error_code: string | null
          error_message: string | null
          id: string
          ip: string | null
          metadata: Json | null
          modulo: string
          navegador: string | null
          origem: string | null
          paciente_id: string | null
          paciente_nome: string | null
          profissional_id: string | null
          profissional_nome: string | null
          prontuario_id: string | null
          resumo_alteracao: string | null
          role: string
          rota: string | null
          sistema_operacional: string | null
          status: string
          tipo_evento: string | null
          unidade_id: string
          unidade_nome: string | null
          user_agent: string | null
          user_id: string
          user_nome: string
        }
        Insert: {
          acao: string
          acao_legivel?: string | null
          after?: Json | null
          agendamento_id?: string | null
          before?: Json | null
          campos_alterados?: string[] | null
          changes?: Json | null
          created_at?: string
          detalhes?: Json
          dispositivo?: string | null
          documento_id?: string | null
          entidade: string
          entidade_id?: string
          erro?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string
          navegador?: string | null
          origem?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          profissional_id?: string | null
          profissional_nome?: string | null
          prontuario_id?: string | null
          resumo_alteracao?: string | null
          role?: string
          rota?: string | null
          sistema_operacional?: string | null
          status?: string
          tipo_evento?: string | null
          unidade_id?: string
          unidade_nome?: string | null
          user_agent?: string | null
          user_id?: string
          user_nome?: string
        }
        Update: {
          acao?: string
          acao_legivel?: string | null
          after?: Json | null
          agendamento_id?: string | null
          before?: Json | null
          campos_alterados?: string[] | null
          changes?: Json | null
          created_at?: string
          detalhes?: Json
          dispositivo?: string | null
          documento_id?: string | null
          entidade?: string
          entidade_id?: string
          erro?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string
          navegador?: string | null
          origem?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          profissional_id?: string | null
          profissional_nome?: string | null
          prontuario_id?: string | null
          resumo_alteracao?: string | null
          role?: string
          rota?: string | null
          sistema_operacional?: string | null
          status?: string
          tipo_evento?: string | null
          unidade_id?: string
          unidade_nome?: string | null
          user_agent?: string | null
          user_id?: string
          user_nome?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          agendado_por_externo: string | null
          atualizado_em: string
          cid_concluido: string | null
          concluido_em: string | null
          concluido_por_id: string | null
          concluido_por_master: boolean
          concluido_por_nome: string | null
          criado_em: string | null
          criado_por: string
          custom_data: Json
          data: string
          falta_justificativa: string | null
          falta_liberada: boolean
          google_event_id: string | null
          hora: string
          id: string
          iniciado_em: string | null
          lembrete_24h_enviado_em: string | null
          lembrete_proximo_enviado_em: string | null
          liberada_em: string | null
          liberada_por: string | null
          motivo_liberacao: string | null
          nome_procedimento: string | null
          obs_conclusao: string | null
          observacoes: string
          origem: string
          paciente_id: string
          paciente_nome: string
          prioridade_perfil: string
          procedimento_concluido: string | null
          procedimento_sigtap: string | null
          profissional_id: string
          profissional_nome: string
          sala_id: string
          setor_id: string
          status: string
          sync_status: string | null
          tipo: string
          tipo_falta: string | null
          turno: string | null
          unidade_id: string
        }
        Insert: {
          agendado_por_externo?: string | null
          atualizado_em?: string
          cid_concluido?: string | null
          concluido_em?: string | null
          concluido_por_id?: string | null
          concluido_por_master?: boolean
          concluido_por_nome?: string | null
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data?: string
          falta_justificativa?: string | null
          falta_liberada?: boolean
          google_event_id?: string | null
          hora?: string
          id: string
          iniciado_em?: string | null
          lembrete_24h_enviado_em?: string | null
          lembrete_proximo_enviado_em?: string | null
          liberada_em?: string | null
          liberada_por?: string | null
          motivo_liberacao?: string | null
          nome_procedimento?: string | null
          obs_conclusao?: string | null
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade_perfil?: string
          procedimento_concluido?: string | null
          procedimento_sigtap?: string | null
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          tipo_falta?: string | null
          turno?: string | null
          unidade_id?: string
        }
        Update: {
          agendado_por_externo?: string | null
          atualizado_em?: string
          cid_concluido?: string | null
          concluido_em?: string | null
          concluido_por_id?: string | null
          concluido_por_master?: boolean
          concluido_por_nome?: string | null
          criado_em?: string | null
          criado_por?: string
          custom_data?: Json
          data?: string
          falta_justificativa?: string | null
          falta_liberada?: boolean
          google_event_id?: string | null
          hora?: string
          id?: string
          iniciado_em?: string | null
          lembrete_24h_enviado_em?: string | null
          lembrete_proximo_enviado_em?: string | null
          liberada_em?: string | null
          liberada_por?: string | null
          motivo_liberacao?: string | null
          nome_procedimento?: string | null
          obs_conclusao?: string | null
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          prioridade_perfil?: string
          procedimento_concluido?: string | null
          procedimento_sigtap?: string | null
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          tipo_falta?: string | null
          turno?: string | null
          unidade_id?: string
        }
        Relationships: []
      }
      agendamentos_externos: {
        Row: {
          atualizado_em: string | null
          cota_id: string | null
          criado_em: string | null
          data: string
          documento_url: string | null
          horario: string
          id: string
          observacoes: string | null
          paciente_id: string
          profissional_externo_id: string
          profissional_interno_id: string | null
          status: string
          turno: string
          unidade_id: string
        }
        Insert: {
          atualizado_em?: string | null
          cota_id?: string | null
          criado_em?: string | null
          data: string
          documento_url?: string | null
          horario: string
          id?: string
          observacoes?: string | null
          paciente_id: string
          profissional_externo_id: string
          profissional_interno_id?: string | null
          status?: string
          turno: string
          unidade_id: string
        }
        Update: {
          atualizado_em?: string | null
          cota_id?: string | null
          criado_em?: string | null
          data?: string
          documento_url?: string | null
          horario?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          profissional_externo_id?: string
          profissional_interno_id?: string | null
          status?: string
          turno?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_externos_cota_id_fkey"
            columns: ["cota_id"]
            isOneToOne: false
            referencedRelation: "quotas_externas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_externos_profissional_externo_id_fkey"
            columns: ["profissional_externo_id"]
            isOneToOne: false
            referencedRelation: "profissionais_externos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_externos_profissional_interno_id_fkey"
            columns: ["profissional_interno_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
          uazapi_admin_token: string
          uazapi_ativo: boolean
          uazapi_instance: string
          uazapi_server_url: string
          updated_at: string
          whatsapp_provider_active: string
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
          uazapi_admin_token?: string
          uazapi_ativo?: boolean
          uazapi_instance?: string
          uazapi_server_url?: string
          updated_at?: string
          whatsapp_provider_active?: string
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
          uazapi_admin_token?: string
          uazapi_ativo?: boolean
          uazapi_instance?: string
          uazapi_server_url?: string
          updated_at?: string
          whatsapp_provider_active?: string
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
      integracoes_log: {
        Row: {
          created_at: string
          direcao: string
          endpoint: string
          id: string
          identificador_origem: string
          ip: string
          mensagem: string
          payload: Json
          sistema_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          direcao?: string
          endpoint?: string
          id?: string
          identificador_origem?: string
          ip?: string
          mensagem?: string
          payload?: Json
          sistema_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          direcao?: string
          endpoint?: string
          id?: string
          identificador_origem?: string
          ip?: string
          mensagem?: string
          payload?: Json
          sistema_id?: string | null
          status?: string
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
          codigo_rename: string | null
          concentracao: string
          created_at: string
          dosagem_padrao: string
          estoque_controlado: boolean
          estoque_localizacao: string
          estoque_minimo: number
          estoque_quantidade: number
          estoque_unidade: string
          forma_farmaceutica: string
          id: string
          is_global: boolean
          nome: string
          nome_comercial: string
          origem: string
          principio_ativo: string
          profissional_id: string | null
          tipo: string
          via_padrao: string
        }
        Insert: {
          apresentacao?: string
          ativo?: boolean
          classe_terapeutica?: string
          codigo_rename?: string | null
          concentracao?: string
          created_at?: string
          dosagem_padrao?: string
          estoque_controlado?: boolean
          estoque_localizacao?: string
          estoque_minimo?: number
          estoque_quantidade?: number
          estoque_unidade?: string
          forma_farmaceutica?: string
          id?: string
          is_global?: boolean
          nome: string
          nome_comercial?: string
          origem?: string
          principio_ativo?: string
          profissional_id?: string | null
          tipo?: string
          via_padrao?: string
        }
        Update: {
          apresentacao?: string
          ativo?: boolean
          classe_terapeutica?: string
          codigo_rename?: string | null
          concentracao?: string
          created_at?: string
          dosagem_padrao?: string
          estoque_controlado?: boolean
          estoque_localizacao?: string
          estoque_minimo?: number
          estoque_quantidade?: number
          estoque_unidade?: string
          forma_farmaceutica?: string
          id?: string
          is_global?: boolean
          nome?: string
          nome_comercial?: string
          origem?: string
          principio_ativo?: string
          profissional_id?: string | null
          tipo?: string
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
          category: string | null
          criado_em: string
          destinatario_email: string | null
          destinatario_telefone: string | null
          erro: string | null
          evento: string
          id: string
          opt_in_status: string | null
          payload: Json
          prior_interaction: boolean | null
          provider: string
          resposta: string | null
          status: string
          template_id: string | null
          window_24h: boolean | null
        }
        Insert: {
          agendamento_id?: string | null
          canal?: string
          category?: string | null
          criado_em?: string
          destinatario_email?: string | null
          destinatario_telefone?: string | null
          erro?: string | null
          evento: string
          id?: string
          opt_in_status?: string | null
          payload?: Json
          prior_interaction?: boolean | null
          provider?: string
          resposta?: string | null
          status?: string
          template_id?: string | null
          window_24h?: boolean | null
        }
        Update: {
          agendamento_id?: string | null
          canal?: string
          category?: string | null
          criado_em?: string
          destinatario_email?: string | null
          destinatario_telefone?: string | null
          erro?: string | null
          evento?: string
          id?: string
          opt_in_status?: string | null
          payload?: Json
          prior_interaction?: boolean | null
          provider?: string
          resposta?: string | null
          status?: string
          template_id?: string | null
          window_24h?: boolean | null
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
      paciente_profissional_status: {
        Row: {
          paciente_id: string
          profissional_id: string
          status_falta: string
          total_faltas: number
          ultima_falta: string | null
          updated_at: string | null
        }
        Insert: {
          paciente_id: string
          profissional_id: string
          status_falta: string
          total_faltas?: number
          ultima_falta?: string | null
          updated_at?: string | null
        }
        Update: {
          paciente_id?: string
          profissional_id?: string
          status_falta?: string
          total_faltas?: number
          ultima_falta?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pps_paciente"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pps_profissional"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          auth_user_id: string | null
          bairro: string | null
          cep: string | null
          cid: string
          cns: string
          complemento: string | null
          comportamento: string
          comunicacao: string
          cpf: string
          cpf_responsavel: string
          criado_em: string | null
          custom_data: Json
          data_encaminhamento: string
          data_marcacao_excecao: string | null
          data_nascimento: string
          descricao_clinica: string
          diagnostico_resumido: string
          documento_url: string
          email: string
          endereco: string
          equipamentos: string[]
          especialidade_destino: string
          faltas_consecutivas: number
          id: string
          is_autista: boolean
          is_gestante: boolean
          is_pne: boolean
          is_tfd: boolean
          justificativa: string
          logradouro: string | null
          marcado_por: string | null
          menor_idade: boolean
          mobilidade: string
          motivo_excecao_bloqueio: string | null
          municipio: string
          nacionalidade: string | null
          naturalidade: string
          naturalidade_uf: string
          nome: string
          nome_mae: string
          nome_responsavel: string
          numero: string | null
          observacao_equipamentos: string
          observacao_tfd_ordem_judicial: string | null
          observacoes: string
          outro_servico_sus: boolean
          possui_ordem_judicial: boolean
          profissional_solicitante: string
          raca_cor: string | null
          sexo: string | null
          situacao_rua: boolean | null
          status_falta: string
          telefone: string
          telefone_secundario: string | null
          tipo_condicao: string
          tipo_dispositivo: string
          tipo_encaminhamento: string
          tipo_logradouro: string | null
          total_faltas: number
          transporte: string
          turno_preferido: string
          ubs_origem: string
          uf: string | null
          unidade_id: string
          usa_dispositivo: boolean
          usa_equipamentos: boolean
          whatsapp_consent_proof: Json | null
          whatsapp_has_prior_interaction: boolean | null
          whatsapp_opt_in_marketing: boolean | null
          whatsapp_opt_in_waiting_list: boolean | null
        }
        Insert: {
          auth_user_id?: string | null
          bairro?: string | null
          cep?: string | null
          cid?: string
          cns?: string
          complemento?: string | null
          comportamento?: string
          comunicacao?: string
          cpf?: string
          cpf_responsavel?: string
          criado_em?: string | null
          custom_data?: Json
          data_encaminhamento?: string
          data_marcacao_excecao?: string | null
          data_nascimento?: string
          descricao_clinica?: string
          diagnostico_resumido?: string
          documento_url?: string
          email?: string
          endereco?: string
          equipamentos?: string[]
          especialidade_destino?: string
          faltas_consecutivas?: number
          id: string
          is_autista?: boolean
          is_gestante?: boolean
          is_pne?: boolean
          is_tfd?: boolean
          justificativa?: string
          logradouro?: string | null
          marcado_por?: string | null
          menor_idade?: boolean
          mobilidade?: string
          motivo_excecao_bloqueio?: string | null
          municipio?: string
          nacionalidade?: string | null
          naturalidade?: string
          naturalidade_uf?: string
          nome: string
          nome_mae?: string
          nome_responsavel?: string
          numero?: string | null
          observacao_equipamentos?: string
          observacao_tfd_ordem_judicial?: string | null
          observacoes?: string
          outro_servico_sus?: boolean
          possui_ordem_judicial?: boolean
          profissional_solicitante?: string
          raca_cor?: string | null
          sexo?: string | null
          situacao_rua?: boolean | null
          status_falta?: string
          telefone?: string
          telefone_secundario?: string | null
          tipo_condicao?: string
          tipo_dispositivo?: string
          tipo_encaminhamento?: string
          tipo_logradouro?: string | null
          total_faltas?: number
          transporte?: string
          turno_preferido?: string
          ubs_origem?: string
          uf?: string | null
          unidade_id?: string
          usa_dispositivo?: boolean
          usa_equipamentos?: boolean
          whatsapp_consent_proof?: Json | null
          whatsapp_has_prior_interaction?: boolean | null
          whatsapp_opt_in_marketing?: boolean | null
          whatsapp_opt_in_waiting_list?: boolean | null
        }
        Update: {
          auth_user_id?: string | null
          bairro?: string | null
          cep?: string | null
          cid?: string
          cns?: string
          complemento?: string | null
          comportamento?: string
          comunicacao?: string
          cpf?: string
          cpf_responsavel?: string
          criado_em?: string | null
          custom_data?: Json
          data_encaminhamento?: string
          data_marcacao_excecao?: string | null
          data_nascimento?: string
          descricao_clinica?: string
          diagnostico_resumido?: string
          documento_url?: string
          email?: string
          endereco?: string
          equipamentos?: string[]
          especialidade_destino?: string
          faltas_consecutivas?: number
          id?: string
          is_autista?: boolean
          is_gestante?: boolean
          is_pne?: boolean
          is_tfd?: boolean
          justificativa?: string
          logradouro?: string | null
          marcado_por?: string | null
          menor_idade?: boolean
          mobilidade?: string
          motivo_excecao_bloqueio?: string | null
          municipio?: string
          nacionalidade?: string | null
          naturalidade?: string
          naturalidade_uf?: string
          nome?: string
          nome_mae?: string
          nome_responsavel?: string
          numero?: string | null
          observacao_equipamentos?: string
          observacao_tfd_ordem_judicial?: string | null
          observacoes?: string
          outro_servico_sus?: boolean
          possui_ordem_judicial?: boolean
          profissional_solicitante?: string
          raca_cor?: string | null
          sexo?: string | null
          situacao_rua?: boolean | null
          status_falta?: string
          telefone?: string
          telefone_secundario?: string | null
          tipo_condicao?: string
          tipo_dispositivo?: string
          tipo_encaminhamento?: string
          tipo_logradouro?: string | null
          total_faltas?: number
          transporte?: string
          turno_preferido?: string
          ubs_origem?: string
          uf?: string | null
          unidade_id?: string
          usa_dispositivo?: boolean
          usa_equipamentos?: boolean
          whatsapp_consent_proof?: Json | null
          whatsapp_has_prior_interaction?: boolean | null
          whatsapp_opt_in_marketing?: boolean | null
          whatsapp_opt_in_waiting_list?: boolean | null
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
      patient_documents: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          descricao: string | null
          id: string
          mime_type: string | null
          nome_arquivo: string
          nome_original: string | null
          origem: string | null
          paciente_id: string
          storage_bucket: string | null
          storage_path: string
          tamanho_bytes: number | null
          tipo_documento: string | null
          unidade_id: string | null
          updated_at: string | null
          uploaded_by: string | null
          url_publica: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo: string
          nome_original?: string | null
          origem?: string | null
          paciente_id: string
          storage_bucket?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          tipo_documento?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          url_publica?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string
          nome_original?: string | null
          origem?: string | null
          paciente_id?: string
          storage_bucket?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          tipo_documento?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          url_publica?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
      patient_procedures: {
        Row: {
          cid: string | null
          created_at: string
          id: string
          patient_id: string
          procedimento_nome: string | null
          sigtap_codigo: string | null
          updated_at: string
        }
        Insert: {
          cid?: string | null
          created_at?: string
          id?: string
          patient_id: string
          procedimento_nome?: string | null
          sigtap_codigo?: string | null
          updated_at?: string
        }
        Update: {
          cid?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          procedimento_nome?: string | null
          sigtap_codigo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_procedures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_referrals: {
        Row: {
          cid: string | null
          created_at: string | null
          data_encaminhamento: string | null
          diagnostico_resumido: string | null
          especialidade_destino: string
          id: string
          justificativa: string | null
          patient_id: string
          professional_id: string | null
          profissional_solicitante: string | null
          status: string | null
          tipo_encaminhamento: string | null
          ubs_origem: string | null
          unidade_id: string | null
          updated_at: string | null
        }
        Insert: {
          cid?: string | null
          created_at?: string | null
          data_encaminhamento?: string | null
          diagnostico_resumido?: string | null
          especialidade_destino: string
          id?: string
          justificativa?: string | null
          patient_id: string
          professional_id?: string | null
          profissional_solicitante?: string | null
          status?: string | null
          tipo_encaminhamento?: string | null
          ubs_origem?: string | null
          unidade_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cid?: string | null
          created_at?: string | null
          data_encaminhamento?: string | null
          diagnostico_resumido?: string | null
          especialidade_destino?: string
          id?: string
          justificativa?: string | null
          patient_id?: string
          professional_id?: string | null
          profissional_solicitante?: string | null
          status?: string | null
          tipo_encaminhamento?: string | null
          ubs_origem?: string | null
          unidade_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
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
          can_approve: boolean | null
          can_attach: boolean | null
          can_cancel: boolean | null
          can_configure: boolean | null
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_execute: boolean
          can_export: boolean | null
          can_print: boolean | null
          can_sign: boolean | null
          can_view: boolean
          created_at: string
          granular_actions: Json | null
          id: string
          modulo: string
          perfil: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          can_approve?: boolean | null
          can_attach?: boolean | null
          can_cancel?: boolean | null
          can_configure?: boolean | null
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_export?: boolean | null
          can_print?: boolean | null
          can_sign?: boolean | null
          can_view?: boolean
          created_at?: string
          granular_actions?: Json | null
          id?: string
          modulo: string
          perfil: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          can_approve?: boolean | null
          can_attach?: boolean | null
          can_cancel?: boolean | null
          can_configure?: boolean | null
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_execute?: boolean
          can_export?: boolean | null
          can_print?: boolean | null
          can_sign?: boolean | null
          can_view?: boolean
          created_at?: string
          granular_actions?: Json | null
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
          can_approve: boolean | null
          can_attach: boolean | null
          can_cancel: boolean | null
          can_configure: boolean | null
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_execute: boolean | null
          can_export: boolean | null
          can_print: boolean | null
          can_sign: boolean | null
          can_view: boolean | null
          created_at: string
          granular_actions: Json | null
          id: string
          modulo: string
          unidade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_approve?: boolean | null
          can_attach?: boolean | null
          can_cancel?: boolean | null
          can_configure?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_execute?: boolean | null
          can_export?: boolean | null
          can_print?: boolean | null
          can_sign?: boolean | null
          can_view?: boolean | null
          created_at?: string
          granular_actions?: Json | null
          id?: string
          modulo: string
          unidade_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_approve?: boolean | null
          can_attach?: boolean | null
          can_cancel?: boolean | null
          can_configure?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_execute?: boolean | null
          can_export?: boolean | null
          can_print?: boolean | null
          can_sign?: boolean | null
          can_view?: boolean | null
          created_at?: string
          granular_actions?: Json | null
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
      procedimentos_realizados: {
        Row: {
          atualizado_em: string | null
          cids_selecionados: string[] | null
          criado_em: string | null
          data_atendimento: string
          id: string
          observacao: string | null
          paciente_id: string
          procedimento_id: string
          quantidade: number | null
        }
        Insert: {
          atualizado_em?: string | null
          cids_selecionados?: string[] | null
          criado_em?: string | null
          data_atendimento?: string
          id?: string
          observacao?: string | null
          paciente_id: string
          procedimento_id: string
          quantidade?: number | null
        }
        Update: {
          atualizado_em?: string | null
          cids_selecionados?: string[] | null
          criado_em?: string | null
          data_atendimento?: string
          id?: string
          observacao?: string | null
          paciente_id?: string
          procedimento_id?: string
          quantidade?: number | null
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
          custom_data: Json
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
          custom_data?: Json
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
          custom_data?: Json
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
          data_validade: string | null
          documento: string | null
          email: string
          id: string
          nome: string
          observacoes: string | null
          orgao_origem: string | null
          permissoes: Json | null
          responsavel: string | null
          telefone: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string
          data_validade?: string | null
          documento?: string | null
          email: string
          id?: string
          nome: string
          observacoes?: string | null
          orgao_origem?: string | null
          permissoes?: Json | null
          responsavel?: string | null
          telefone?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auth_user_id?: string | null
          criado_em?: string
          criado_por?: string
          data_validade?: string | null
          documento?: string | null
          email?: string
          id?: string
          nome?: string
          observacoes?: string | null
          orgao_origem?: string | null
          permissoes?: Json | null
          responsavel?: string | null
          telefone?: string | null
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
      prontuario_exames: {
        Row: {
          atendimento_id: string
          created_at: string
          created_by: string
          data_exame: string | null
          id: string
          interpretacao_profissional: string
          laboratorio: string
          medico_solicitante: string
          nome_exame: string
          observacoes_medicas: string
          paciente_id: string
          profissional_id: string
          profissional_nome: string
          prontuario_id: string
          resultado_descrito: string
          status: string
          tipo_atendimento_vinculado: string
          tipo_exame: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          atendimento_id?: string
          created_at?: string
          created_by?: string
          data_exame?: string | null
          id?: string
          interpretacao_profissional?: string
          laboratorio?: string
          medico_solicitante?: string
          nome_exame?: string
          observacoes_medicas?: string
          paciente_id?: string
          profissional_id?: string
          profissional_nome?: string
          prontuario_id?: string
          resultado_descrito?: string
          status?: string
          tipo_atendimento_vinculado?: string
          tipo_exame?: string
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          atendimento_id?: string
          created_at?: string
          created_by?: string
          data_exame?: string | null
          id?: string
          interpretacao_profissional?: string
          laboratorio?: string
          medico_solicitante?: string
          nome_exame?: string
          observacoes_medicas?: string
          paciente_id?: string
          profissional_id?: string
          profissional_nome?: string
          prontuario_id?: string
          resultado_descrito?: string
          status?: string
          tipo_atendimento_vinculado?: string
          tipo_exame?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prontuario_procedimentos: {
        Row: {
          cids_selecionados: string[]
          criado_em: string
          id: string
          observacao: string
          procedimento_id: string
          prontuario_id: string
          quantidade: number | null
        }
        Insert: {
          cids_selecionados?: string[]
          criado_em?: string
          id?: string
          observacao?: string
          procedimento_id: string
          prontuario_id: string
          quantidade?: number | null
        }
        Update: {
          cids_selecionados?: string[]
          criado_em?: string
          id?: string
          observacao?: string
          procedimento_id?: string
          prontuario_id?: string
          quantidade?: number | null
        }
        Relationships: [
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
          meta_pts_id: string | null
          motivo_alteracao: string
          observacoes: string | null
          outro_procedimento: string
          paciente_id: string
          paciente_nome: string
          prescricao: string | null
          procedimentos_texto: string
          profissional_id: string
          profissional_nome: string
          pts_meta_id: string | null
          pts_meta_worked: boolean | null
          queixa_principal: string | null
          resultado_exame: string
          sala_id: string | null
          setor: string | null
          sinais_sintomas: string | null
          soap_avaliacao: string | null
          soap_objetivo: string | null
          soap_plano: string | null
          soap_subjetivo: string | null
          solicitacao_exames: string | null
          status: string | null
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
          meta_pts_id?: string | null
          motivo_alteracao?: string
          observacoes?: string | null
          outro_procedimento?: string
          paciente_id: string
          paciente_nome: string
          prescricao?: string | null
          procedimentos_texto?: string
          profissional_id: string
          profissional_nome: string
          pts_meta_id?: string | null
          pts_meta_worked?: boolean | null
          queixa_principal?: string | null
          resultado_exame?: string
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          soap_avaliacao?: string | null
          soap_objetivo?: string | null
          soap_plano?: string | null
          soap_subjetivo?: string | null
          solicitacao_exames?: string | null
          status?: string | null
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
          meta_pts_id?: string | null
          motivo_alteracao?: string
          observacoes?: string | null
          outro_procedimento?: string
          paciente_id?: string
          paciente_nome?: string
          prescricao?: string | null
          procedimentos_texto?: string
          profissional_id?: string
          profissional_nome?: string
          pts_meta_id?: string | null
          pts_meta_worked?: boolean | null
          queixa_principal?: string | null
          resultado_exame?: string
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          soap_avaliacao?: string | null
          soap_objetivo?: string | null
          soap_plano?: string | null
          soap_subjetivo?: string | null
          solicitacao_exames?: string | null
          status?: string | null
          tipo_registro?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prontuarios_pts_meta_id_fkey"
            columns: ["pts_meta_id"]
            isOneToOne: false
            referencedRelation: "pts_metas"
            referencedColumns: ["id"]
          },
        ]
      }
      pts: {
        Row: {
          acompanhamento_interdisciplinar: boolean | null
          barreiras: string | null
          ciencia_familia: boolean | null
          contextos_afetados: string[] | null
          created_at: string
          criterio_alta_atingido: boolean | null
          criterios_alta: string | null
          custom_data: Json
          data_proxima_revisao: string | null
          data_ultima_revisao: string | null
          diagnostico_funcional: string
          encaminhamentos: string | null
          especialidades_envolvidas: string[]
          fatores_risco: string | null
          frequencia_planejada: string | null
          id: string
          justificativa_clinica: string | null
          metas_curto_prazo: string
          metas_longo_prazo: string
          metas_medio_prazo: string
          motivo_encaminhamento: string | null
          motivo_encerramento: string | null
          necessidade_interdisciplinar: boolean | null
          necessidade_revisao: boolean | null
          num_sessoes_previsto: number | null
          objetivo_geral: string | null
          objetivos_terapeuticos: string
          obs_revisao: string | null
          observacao_revisao: string | null
          orientacoes_finais: string | null
          patient_id: string
          plano_conduta: string | null
          potencialidades: string | null
          prioridade: string | null
          professional_id: string
          recursos_necessarios: string | null
          rede_apoio: string | null
          rede_apoio_presente: boolean | null
          resumo_desfecho: string | null
          revisao_obrigatoria: boolean | null
          status: string
          status_final: string | null
          tipo_atendimento: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          acompanhamento_interdisciplinar?: boolean | null
          barreiras?: string | null
          ciencia_familia?: boolean | null
          contextos_afetados?: string[] | null
          created_at?: string
          criterio_alta_atingido?: boolean | null
          criterios_alta?: string | null
          custom_data?: Json
          data_proxima_revisao?: string | null
          data_ultima_revisao?: string | null
          diagnostico_funcional?: string
          encaminhamentos?: string | null
          especialidades_envolvidas?: string[]
          fatores_risco?: string | null
          frequencia_planejada?: string | null
          id?: string
          justificativa_clinica?: string | null
          metas_curto_prazo?: string
          metas_longo_prazo?: string
          metas_medio_prazo?: string
          motivo_encaminhamento?: string | null
          motivo_encerramento?: string | null
          necessidade_interdisciplinar?: boolean | null
          necessidade_revisao?: boolean | null
          num_sessoes_previsto?: number | null
          objetivo_geral?: string | null
          objetivos_terapeuticos?: string
          obs_revisao?: string | null
          observacao_revisao?: string | null
          orientacoes_finais?: string | null
          patient_id: string
          plano_conduta?: string | null
          potencialidades?: string | null
          prioridade?: string | null
          professional_id: string
          recursos_necessarios?: string | null
          rede_apoio?: string | null
          rede_apoio_presente?: boolean | null
          resumo_desfecho?: string | null
          revisao_obrigatoria?: boolean | null
          status?: string
          status_final?: string | null
          tipo_atendimento?: string | null
          unit_id?: string
          updated_at?: string
        }
        Update: {
          acompanhamento_interdisciplinar?: boolean | null
          barreiras?: string | null
          ciencia_familia?: boolean | null
          contextos_afetados?: string[] | null
          created_at?: string
          criterio_alta_atingido?: boolean | null
          criterios_alta?: string | null
          custom_data?: Json
          data_proxima_revisao?: string | null
          data_ultima_revisao?: string | null
          diagnostico_funcional?: string
          encaminhamentos?: string | null
          especialidades_envolvidas?: string[]
          fatores_risco?: string | null
          frequencia_planejada?: string | null
          id?: string
          justificativa_clinica?: string | null
          metas_curto_prazo?: string
          metas_longo_prazo?: string
          metas_medio_prazo?: string
          motivo_encaminhamento?: string | null
          motivo_encerramento?: string | null
          necessidade_interdisciplinar?: boolean | null
          necessidade_revisao?: boolean | null
          num_sessoes_previsto?: number | null
          objetivo_geral?: string | null
          objetivos_terapeuticos?: string
          obs_revisao?: string | null
          observacao_revisao?: string | null
          orientacoes_finais?: string | null
          patient_id?: string
          plano_conduta?: string | null
          potencialidades?: string | null
          prioridade?: string | null
          professional_id?: string
          recursos_necessarios?: string | null
          rede_apoio?: string | null
          rede_apoio_presente?: boolean | null
          resumo_desfecho?: string | null
          revisao_obrigatoria?: boolean | null
          status?: string
          status_final?: string | null
          tipo_atendimento?: string | null
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
      pts_metas: {
        Row: {
          categoria: string | null
          created_at: string
          descricao: string | null
          especialidade: string | null
          id: string
          indicador_sucesso: string | null
          observacao: string | null
          prazo_estimado: string | null
          prioridade: string | null
          pts_id: string
          responsavel_id: string | null
          status: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          especialidade?: string | null
          id?: string
          indicador_sucesso?: string | null
          observacao?: string | null
          prazo_estimado?: string | null
          prioridade?: string | null
          pts_id: string
          responsavel_id?: string | null
          status?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          especialidade?: string | null
          id?: string
          indicador_sucesso?: string | null
          observacao?: string | null
          prazo_estimado?: string | null
          prioridade?: string | null
          pts_id?: string
          responsavel_id?: string | null
          status?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pts_metas_pts_id_fkey"
            columns: ["pts_id"]
            isOneToOne: false
            referencedRelation: "pts"
            referencedColumns: ["id"]
          },
        ]
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
          ativo: boolean | null
          criado_em: string
          dia_semana: number | null
          duracao_atendimento: number | null
          especialidade: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          periodo_fim: string
          periodo_inicio: string
          profissional_externo_id: string
          profissional_interno_id: string
          turno: string | null
          unidade_id: string
          updated_at: string
          vagas_total: number
          vagas_usadas: number
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string
          dia_semana?: number | null
          duracao_atendimento?: number | null
          especialidade?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          profissional_externo_id: string
          profissional_interno_id: string
          turno?: string | null
          unidade_id?: string
          updated_at?: string
          vagas_total?: number
          vagas_usadas?: number
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string
          dia_semana?: number | null
          duracao_atendimento?: number | null
          especialidade?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          profissional_externo_id?: string
          profissional_interno_id?: string
          turno?: string | null
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
      referral_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          referral_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          referral_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attachments_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "patient_referrals"
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
      sistemas_integrados: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          id: string
          identificador: string
          nome: string
          pode_enviar: boolean
          pode_receber: boolean
          token_entrada_hash: string
          token_entrada_prefix: string
          token_saida: string
          ultimo_teste_em: string | null
          ultimo_teste_status: string
          unidade_id: string
          updated_at: string
          url_base: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          id?: string
          identificador: string
          nome: string
          pode_enviar?: boolean
          pode_receber?: boolean
          token_entrada_hash?: string
          token_entrada_prefix?: string
          token_saida?: string
          ultimo_teste_em?: string | null
          ultimo_teste_status?: string
          unidade_id?: string
          updated_at?: string
          url_base?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          id?: string
          identificador?: string
          nome?: string
          pode_enviar?: boolean
          pode_receber?: boolean
          token_entrada_hash?: string
          token_entrada_prefix?: string
          token_saida?: string
          ultimo_teste_em?: string | null
          ultimo_teste_status?: string
          unidade_id?: string
          updated_at?: string
          url_base?: string
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
      system_cleanup_logs: {
        Row: {
          cleanup_type: string
          created_at: string
          created_by: string | null
          details: Json | null
          error_message: string | null
          id: string
          items_count: number | null
          status: string | null
        }
        Insert: {
          cleanup_type: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          items_count?: number | null
          status?: string | null
        }
        Update: {
          cleanup_type?: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          items_count?: number | null
          status?: string | null
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
      system_monitoring_alerts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          recommendation: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          recommendation?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          source?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          recommendation?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      system_monitoring_settings: {
        Row: {
          api_url: string | null
          config: Json | null
          coolify_url: string | null
          created_at: string
          hosting_type: string | null
          id: string
          monitoring_enabled: boolean | null
          public_url: string | null
          updated_at: string
        }
        Insert: {
          api_url?: string | null
          config?: Json | null
          coolify_url?: string | null
          created_at?: string
          hosting_type?: string | null
          id?: string
          monitoring_enabled?: boolean | null
          public_url?: string | null
          updated_at?: string
        }
        Update: {
          api_url?: string | null
          config?: Json | null
          coolify_url?: string | null
          created_at?: string
          hosting_type?: string | null
          id?: string
          monitoring_enabled?: boolean | null
          public_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_monitoring_snapshots: {
        Row: {
          alertas_count: number | null
          created_at: string
          created_by: string | null
          db_status: string | null
          hosting_status: string | null
          id: string
          payload: Json | null
          status_geral: string
          storage_status: string | null
          total_arquivos: number | null
          total_registros: number | null
        }
        Insert: {
          alertas_count?: number | null
          created_at?: string
          created_by?: string | null
          db_status?: string | null
          hosting_status?: string | null
          id?: string
          payload?: Json | null
          status_geral: string
          storage_status?: string | null
          total_arquivos?: number | null
          total_registros?: number | null
        }
        Update: {
          alertas_count?: number | null
          created_at?: string
          created_by?: string | null
          db_status?: string | null
          hosting_status?: string | null
          id?: string
          payload?: Json | null
          status_geral?: string
          storage_status?: string | null
          total_arquivos?: number | null
          total_registros?: number | null
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
          falta_justificativa: string | null
          falta_liberada: boolean
          id: string
          liberada_em: string | null
          liberada_por: string | null
          motivo_liberacao: string | null
          patient_id: string
          procedure_done: string
          professional_id: string
          scheduled_date: string
          session_number: number
          status: string
          tipo_falta: string | null
          total_sessions: number
        }
        Insert: {
          absence_type?: string | null
          appointment_id?: string | null
          clinical_notes?: string
          created_at?: string
          cycle_id: string
          falta_justificativa?: string | null
          falta_liberada?: boolean
          id?: string
          liberada_em?: string | null
          liberada_por?: string | null
          motivo_liberacao?: string | null
          patient_id: string
          procedure_done?: string
          professional_id: string
          scheduled_date?: string
          session_number?: number
          status?: string
          tipo_falta?: string | null
          total_sessions?: number
        }
        Update: {
          absence_type?: string | null
          appointment_id?: string | null
          clinical_notes?: string
          created_at?: string
          cycle_id?: string
          falta_justificativa?: string | null
          falta_liberada?: boolean
          id?: string
          liberada_em?: string | null
          liberada_por?: string | null
          motivo_liberacao?: string | null
          patient_id?: string
          procedure_done?: string
          professional_id?: string
          scheduled_date?: string
          session_number?: number
          status?: string
          tipo_falta?: string | null
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
      whatsapp_connection_status: {
        Row: {
          created_at: string
          details: Json
          fila_pausada_ate: string | null
          fila_pausada_motivo: string
          id: string
          instance_name: string
          last_check_at: string | null
          last_connected_at: string | null
          last_disconnected_at: string | null
          last_error: string
          last_error_at: string | null
          last_success_send_at: string | null
          reconnect_attempts: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          fila_pausada_ate?: string | null
          fila_pausada_motivo?: string
          id?: string
          instance_name?: string
          last_check_at?: string | null
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_error?: string
          last_error_at?: string | null
          last_success_send_at?: string | null
          reconnect_attempts?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          fila_pausada_ate?: string | null
          fila_pausada_motivo?: string
          id?: string
          instance_name?: string
          last_check_at?: string | null
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_error?: string
          last_error_at?: string | null
          last_success_send_at?: string | null
          reconnect_attempts?: number
          status?: string
          updated_at?: string
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
      whatsapp_conversations: {
        Row: {
          created_at: string
          human_handoff: boolean
          human_handoff_at: string | null
          last_outbound_at: string | null
          last_patient_message_at: string | null
          opted_out: boolean
          opted_out_at: string | null
          opted_out_reason: string
          paciente_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          human_handoff?: boolean
          human_handoff_at?: string | null
          last_outbound_at?: string | null
          last_patient_message_at?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          opted_out_reason?: string
          paciente_id?: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          human_handoff?: boolean
          human_handoff_at?: string | null
          last_outbound_at?: string | null
          last_patient_message_at?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          opted_out_reason?: string
          paciente_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_event_config: {
        Row: {
          antecedencia_minutos: number
          ativo: boolean
          created_at: string
          delay_envio_min: number
          evento: string
          exigir_confirmacao: boolean
          horario_personalizado: string
          id: string
          impedir_duplicidade: boolean
          limite_por_paciente: number
          prioridade: string
          template_id: string | null
          template_mensagem: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          antecedencia_minutos?: number
          ativo?: boolean
          created_at?: string
          delay_envio_min?: number
          evento: string
          exigir_confirmacao?: boolean
          horario_personalizado?: string
          id?: string
          impedir_duplicidade?: boolean
          limite_por_paciente?: number
          prioridade?: string
          template_id?: string | null
          template_mensagem?: string
          unidade_id: string
          updated_at?: string
        }
        Update: {
          antecedencia_minutos?: number
          ativo?: boolean
          created_at?: string
          delay_envio_min?: number
          evento?: string
          exigir_confirmacao?: boolean
          horario_personalizado?: string
          id?: string
          impedir_duplicidade?: boolean
          limite_por_paciente?: number
          prioridade?: string
          template_id?: string | null
          template_mensagem?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_event_config_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_health_snapshots: {
        Row: {
          created_at: string
          details: Json
          entregues: number
          enviadas: number
          falhas: number
          id: string
          lidas: number
          pausadas: number
          pendentes: number
          provider: string
          rejeicoes_template: number
          respostas: number
          snapshot_date: string
          status_conexao: string
          taxa_confirmacao: number
          taxa_erro: number
          taxa_resposta: number
          unidade_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          entregues?: number
          enviadas?: number
          falhas?: number
          id?: string
          lidas?: number
          pausadas?: number
          pendentes?: number
          provider?: string
          rejeicoes_template?: number
          respostas?: number
          snapshot_date?: string
          status_conexao?: string
          taxa_confirmacao?: number
          taxa_erro?: number
          taxa_resposta?: number
          unidade_id?: string
        }
        Update: {
          created_at?: string
          details?: Json
          entregues?: number
          enviadas?: number
          falhas?: number
          id?: string
          lidas?: number
          pausadas?: number
          pendentes?: number
          provider?: string
          rejeicoes_template?: number
          respostas?: number
          snapshot_date?: string
          status_conexao?: string
          taxa_confirmacao?: number
          taxa_erro?: number
          taxa_resposta?: number
          unidade_id?: string
        }
        Relationships: []
      }
      whatsapp_inbound_messages: {
        Row: {
          agendamento_id: string
          body: string
          created_at: string
          id: string
          intent: string
          paciente_id: string
          paciente_nome: string
          phone: string
          processed: boolean
          processed_at: string | null
          provider: string
          provider_message_id: string
          raw: Json
          recebido_em: string
        }
        Insert: {
          agendamento_id?: string
          body?: string
          created_at?: string
          id?: string
          intent?: string
          paciente_id?: string
          paciente_nome?: string
          phone: string
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_message_id?: string
          raw?: Json
          recebido_em?: string
        }
        Update: {
          agendamento_id?: string
          body?: string
          created_at?: string
          id?: string
          intent?: string
          paciente_id?: string
          paciente_nome?: string
          phone?: string
          processed?: boolean
          processed_at?: string | null
          provider?: string
          provider_message_id?: string
          raw?: Json
          recebido_em?: string
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          agendado_para: string
          agendamento_id: string
          category: string | null
          criado_em: string
          delivered_at: string | null
          error_code: string
          evento: string
          id: string
          mensagem: string
          metadados: Json
          motivo_bloqueio: string
          motivo_erro: string
          next_retry_at: string | null
          paciente_id: string
          paciente_nome: string
          payload_json: Json
          prioridade: string
          priority: number
          processado_em: string | null
          provider: string
          provider_message_id: string
          read_at: string | null
          status: string
          telefone: string
          template_id: string | null
          tentativas: number
          unidade_id: string
          updated_at: string
        }
        Insert: {
          agendado_para?: string
          agendamento_id?: string
          category?: string | null
          criado_em?: string
          delivered_at?: string | null
          error_code?: string
          evento: string
          id?: string
          mensagem: string
          metadados?: Json
          motivo_bloqueio?: string
          motivo_erro?: string
          next_retry_at?: string | null
          paciente_id?: string
          paciente_nome?: string
          payload_json?: Json
          prioridade?: string
          priority?: number
          processado_em?: string | null
          provider?: string
          provider_message_id?: string
          read_at?: string | null
          status?: string
          telefone: string
          template_id?: string | null
          tentativas?: number
          unidade_id?: string
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          agendamento_id?: string
          category?: string | null
          criado_em?: string
          delivered_at?: string | null
          error_code?: string
          evento?: string
          id?: string
          mensagem?: string
          metadados?: Json
          motivo_bloqueio?: string
          motivo_erro?: string
          next_retry_at?: string | null
          paciente_id?: string
          paciente_nome?: string
          payload_json?: Json
          prioridade?: string
          priority?: number
          processado_em?: string | null
          provider?: string
          provider_message_id?: string
          read_at?: string | null
          status?: string
          telefone?: string
          template_id?: string | null
          tentativas?: number
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          evento: string
          id: string
          idioma: string
          mensagem: string
          nome_interno: string
          permite_envio_fora_24h: boolean
          provider: string
          provider_template_id: string
          status: string
          tipo: string
          unidade_id: string
          updated_at: string
          variaveis_permitidas: Json
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          evento?: string
          id?: string
          idioma?: string
          mensagem?: string
          nome_interno?: string
          permite_envio_fora_24h?: boolean
          provider?: string
          provider_template_id?: string
          status?: string
          tipo?: string
          unidade_id?: string
          updated_at?: string
          variaveis_permitidas?: Json
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          evento?: string
          id?: string
          idioma?: string
          mensagem?: string
          nome_interno?: string
          permite_envio_fora_24h?: boolean
          provider?: string
          provider_template_id?: string
          status?: string
          tipo?: string
          unidade_id?: string
          updated_at?: string
          variaveis_permitidas?: Json
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
      atualizar_status_falta:
        | { Args: { p_paciente_id: string }; Returns: Json }
        | {
            Args: { p_paciente_id: string; p_profissional_id?: string }
            Returns: Json
          }
      check_slot_availability: {
        Args: {
          p_data: string
          p_hora: string
          p_profissional_id: string
          p_unidade_id: string
        }
        Returns: Json
      }
      concluir_atendimento_master: {
        Args: {
          p_agendamento_id: string
          p_cid: string
          p_hora_termino: string
          p_is_master?: boolean
          p_obs?: string
          p_procedimento: string
          p_user_id: string
          p_user_nome: string
        }
        Returns: Json
      }
      current_user_cbo_codigo: { Args: never; Returns: string }
      desbloquear_paciente_faltas: {
        Args: {
          p_paciente_id: string
          p_user_id?: string
          p_user_nome?: string
        }
        Returns: undefined
      }
      enqueue_whatsapp_message: {
        Args: {
          p_agendado_para?: string
          p_agendamento_id?: string
          p_evento: string
          p_paciente_id: string
          p_paciente_nome: string
          p_payload: Json
          p_priority?: number
          p_provider?: string
          p_telefone: string
          p_template_id: string
          p_unidade_id?: string
        }
        Returns: Json
      }
      get_atendimentos_pendentes_master: {
        Args: { p_minutos?: number; p_unidade_id?: string }
        Returns: {
          data: string
          hora: string
          id: string
          iniciado_em: string
          minutos_aberto: number
          paciente_id: string
          paciente_nome: string
          profissional_id: string
          profissional_nome: string
          unidade_id: string
        }[]
      }
      get_procedures_for_cid: {
        Args: { lim?: number; p_cid: string }
        Returns: Json
      }
      get_tables_info: {
        Args: never
        Returns: {
          record_count: number
          table_name: string
        }[]
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
      is_whatsapp_24h_window_open: {
        Args: { p_phone: string }
        Returns: boolean
      }
      liberar_falta:
        | {
            Args: {
              p_agendamento_id?: string
              p_all?: boolean
              p_motivo?: string
              p_paciente_id: string
              p_session_id?: string
              p_user_id?: string
              p_user_nome?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_agendamento_id?: string
              p_all?: boolean
              p_motivo?: string
              p_paciente_id: string
              p_profissional_id?: string
              p_session_id?: string
              p_user_id?: string
              p_user_nome?: string
            }
            Returns: Json
          }
      reavaliar_todos_status_falta: { Args: never; Returns: Json }
      refresh_paciente_profissional_status: { Args: never; Returns: undefined }
      register_whatsapp_inbound: {
        Args: {
          p_body: string
          p_phone: string
          p_provider?: string
          p_provider_message_id?: string
          p_raw?: Json
        }
        Returns: Json
      }
      resetar_faltas_paciente: {
        Args: { p_paciente_id: string }
        Returns: undefined
      }
      resolve_form_template: {
        Args: {
          p_form_slug: string
          p_profissional_id?: string
          p_unidade_id?: string
        }
        Returns: Json
      }
      save_document_template: {
        Args: {
          p_ativo?: boolean
          p_blocos_clinicos?: Json
          p_conteudo?: string
          p_nome?: string
          p_perfis_permitidos?: string[]
          p_template_id?: string
          p_tipo?: string
          p_tipo_modelo?: string
          p_unidade_id?: string
          p_versoes?: Json
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "document_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_patients: {
        Args: { p_limit?: number; p_search: string; p_unit_id?: string }
        Returns: {
          auth_user_id: string | null
          bairro: string | null
          cep: string | null
          cid: string
          cns: string
          complemento: string | null
          comportamento: string
          comunicacao: string
          cpf: string
          cpf_responsavel: string
          criado_em: string | null
          custom_data: Json
          data_encaminhamento: string
          data_marcacao_excecao: string | null
          data_nascimento: string
          descricao_clinica: string
          diagnostico_resumido: string
          documento_url: string
          email: string
          endereco: string
          equipamentos: string[]
          especialidade_destino: string
          faltas_consecutivas: number
          id: string
          is_autista: boolean
          is_gestante: boolean
          is_pne: boolean
          is_tfd: boolean
          justificativa: string
          logradouro: string | null
          marcado_por: string | null
          menor_idade: boolean
          mobilidade: string
          motivo_excecao_bloqueio: string | null
          municipio: string
          nacionalidade: string | null
          naturalidade: string
          naturalidade_uf: string
          nome: string
          nome_mae: string
          nome_responsavel: string
          numero: string | null
          observacao_equipamentos: string
          observacao_tfd_ordem_judicial: string | null
          observacoes: string
          outro_servico_sus: boolean
          possui_ordem_judicial: boolean
          profissional_solicitante: string
          raca_cor: string | null
          sexo: string | null
          situacao_rua: boolean | null
          status_falta: string
          telefone: string
          telefone_secundario: string | null
          tipo_condicao: string
          tipo_dispositivo: string
          tipo_encaminhamento: string
          tipo_logradouro: string | null
          total_faltas: number
          transporte: string
          turno_preferido: string
          ubs_origem: string
          uf: string | null
          unidade_id: string
          usa_dispositivo: boolean
          usa_equipamentos: boolean
          whatsapp_consent_proof: Json | null
          whatsapp_has_prior_interaction: boolean | null
          whatsapp_opt_in_marketing: boolean | null
          whatsapp_opt_in_waiting_list: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pacientes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_sigtap_and_cid: {
        Args: { lim?: number; q: string }
        Returns: Json
      }
      set_excecao_bloqueio: {
        Args: {
          p_is_tfd: boolean
          p_motivo?: string
          p_observacao?: string
          p_ordem_judicial: boolean
          p_paciente_id: string
          p_user_id?: string
          p_user_nome?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
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
