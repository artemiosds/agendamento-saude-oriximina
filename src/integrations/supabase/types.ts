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
      agendamentos: {
        Row: {
          criado_em: string | null
          criado_por: string
          data: string
          google_event_id: string | null
          hora: string
          id: string
          observacoes: string
          origem: string
          paciente_id: string
          paciente_nome: string
          profissional_id: string
          profissional_nome: string
          sala_id: string
          setor_id: string
          status: string
          sync_status: string | null
          tipo: string
          unidade_id: string
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string
          data?: string
          google_event_id?: string | null
          hora?: string
          id: string
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          unidade_id?: string
        }
        Update: {
          criado_em?: string | null
          criado_por?: string
          data?: string
          google_event_id?: string | null
          hora?: string
          id?: string
          observacoes?: string
          origem?: string
          paciente_id?: string
          paciente_nome?: string
          profissional_id?: string
          profissional_nome?: string
          sala_id?: string
          setor_id?: string
          status?: string
          sync_status?: string | null
          tipo?: string
          unidade_id?: string
        }
        Relationships: []
      }
      atendimentos: {
        Row: {
          agendamento_id: string
          criado_em: string | null
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
      disponibilidades: {
        Row: {
          criado_em: string | null
          data_fim: string
          data_inicio: string
          dias_semana: number[]
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
      fila_espera: {
        Row: {
          criado_em: string | null
          criado_por: string
          hora_chamada: string | null
          hora_chegada: string
          id: string
          observacoes: string | null
          paciente_id: string
          paciente_nome: string
          posicao: number
          prioridade: string
          profissional_id: string | null
          setor: string
          status: string
          unidade_id: string
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string
          hora_chamada?: string | null
          hora_chegada?: string
          id: string
          observacoes?: string | null
          paciente_id?: string
          paciente_nome?: string
          posicao?: number
          prioridade?: string
          profissional_id?: string | null
          setor?: string
          status?: string
          unidade_id?: string
        }
        Update: {
          criado_em?: string | null
          criado_por?: string
          hora_chamada?: string | null
          hora_chegada?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          paciente_nome?: string
          posicao?: number
          prioridade?: string
          profissional_id?: string | null
          setor?: string
          status?: string
          unidade_id?: string
        }
        Relationships: []
      }
      funcionarios: {
        Row: {
          ativo: boolean | null
          auth_user_id: string | null
          cargo: string | null
          criado_em: string | null
          criado_por: string | null
          email: string
          id: string
          nome: string
          numero_conselho: string
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
          criado_em?: string | null
          criado_por?: string | null
          email: string
          id?: string
          nome: string
          numero_conselho?: string
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
          criado_em?: string | null
          criado_por?: string | null
          email?: string
          id?: string
          nome?: string
          numero_conselho?: string
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
      pacientes: {
        Row: {
          cpf: string
          criado_em: string | null
          data_nascimento: string
          email: string
          endereco: string
          id: string
          nome: string
          observacoes: string
          telefone: string
        }
        Insert: {
          cpf?: string
          criado_em?: string | null
          data_nascimento?: string
          email?: string
          endereco?: string
          id: string
          nome: string
          observacoes?: string
          telefone?: string
        }
        Update: {
          cpf?: string
          criado_em?: string | null
          data_nascimento?: string
          email?: string
          endereco?: string
          id?: string
          nome?: string
          observacoes?: string
          telefone?: string
        }
        Relationships: []
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
          anamnese: string | null
          atualizado_em: string | null
          conduta: string | null
          criado_em: string | null
          data_atendimento: string
          evolucao: string | null
          exame_fisico: string | null
          hipotese: string | null
          hora_atendimento: string | null
          id: string
          observacoes: string | null
          paciente_id: string
          paciente_nome: string
          prescricao: string | null
          profissional_id: string
          profissional_nome: string
          queixa_principal: string | null
          sala_id: string | null
          setor: string | null
          sinais_sintomas: string | null
          solicitacao_exames: string | null
          unidade_id: string
        }
        Insert: {
          agendamento_id?: string | null
          anamnese?: string | null
          atualizado_em?: string | null
          conduta?: string | null
          criado_em?: string | null
          data_atendimento?: string
          evolucao?: string | null
          exame_fisico?: string | null
          hipotese?: string | null
          hora_atendimento?: string | null
          id?: string
          observacoes?: string | null
          paciente_id: string
          paciente_nome: string
          prescricao?: string | null
          profissional_id: string
          profissional_nome: string
          queixa_principal?: string | null
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          solicitacao_exames?: string | null
          unidade_id: string
        }
        Update: {
          agendamento_id?: string | null
          anamnese?: string | null
          atualizado_em?: string | null
          conduta?: string | null
          criado_em?: string | null
          data_atendimento?: string
          evolucao?: string | null
          exame_fisico?: string | null
          hipotese?: string | null
          hora_atendimento?: string | null
          id?: string
          observacoes?: string | null
          paciente_id?: string
          paciente_nome?: string
          prescricao?: string | null
          profissional_id?: string
          profissional_nome?: string
          queixa_principal?: string | null
          sala_id?: string | null
          setor?: string | null
          sinais_sintomas?: string | null
          solicitacao_exames?: string | null
          unidade_id?: string
        }
        Relationships: []
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
      unidades: {
        Row: {
          ativo: boolean
          criado_em: string | null
          endereco: string
          id: string
          nome: string
          telefone: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string | null
          endereco?: string
          id: string
          nome: string
          telefone?: string
          whatsapp?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string | null
          endereco?: string
          id?: string
          nome?: string
          telefone?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
