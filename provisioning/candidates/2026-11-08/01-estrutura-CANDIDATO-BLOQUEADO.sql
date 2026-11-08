-- CANDIDATO PARA HOMOLOGAÇÃO. NÃO É UM INSTALADOR APROVADO.

-- Nenhum registro de paciente, usuário, contrato ou catálogo é incluído.

BEGIN;

DO $guard$ BEGIN RAISE EXCEPTION 'Instalação bloqueada: homologação em ambiente isolado pendente'; END $guard$;

DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m')) THEN RAISE EXCEPTION 'Destino não vazio: instalação recusada'; END IF; END $empty$;

SET LOCAL search_path = public, extensions;

SET LOCAL check_function_bodies = false;

CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE public."tipo_alta" AS ENUM ('conclusao', 'outro');

CREATE TABLE public."action_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text DEFAULT ''::text NOT NULL,
  "user_nome" text DEFAULT ''::text NOT NULL,
  "role" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "acao" text NOT NULL,
  "entidade" text NOT NULL,
  "entidade_id" text DEFAULT ''::text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "modulo" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'sucesso'::text NOT NULL,
  "erro" text DEFAULT ''::text,
  "ip" text DEFAULT ''::text,
  "acao_legivel" text,
  "tipo_evento" text,
  "origem" text,
  "paciente_id" text,
  "paciente_nome" text,
  "profissional_id" text,
  "profissional_nome" text,
  "agendamento_id" text,
  "prontuario_id" text,
  "documento_id" text,
  "unidade_nome" text,
  "before" jsonb,
  "after" jsonb,
  "changes" jsonb,
  "campos_alterados" text[],
  "resumo_alteracao" text,
  "user_agent" text,
  "navegador" text,
  "sistema_operacional" text,
  "dispositivo" text,
  "rota" text,
  "error_message" text,
  "error_code" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."action_logs" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."action_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."action_logs" TO "service_role";

ALTER TABLE public."action_logs" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."agendamentos" (
  "id" text NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "paciente_nome" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "sala_id" text DEFAULT ''::text NOT NULL,
  "setor_id" text DEFAULT ''::text NOT NULL,
  "profissional_id" text DEFAULT ''::text NOT NULL,
  "profissional_nome" text DEFAULT ''::text NOT NULL,
  "data" date DEFAULT CURRENT_DATE NOT NULL,
  "hora" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "tipo" text DEFAULT 'Consulta'::text NOT NULL,
  "observacoes" text DEFAULT ''::text NOT NULL,
  "origem" text DEFAULT 'recepcao'::text NOT NULL,
  "google_event_id" text DEFAULT ''::text,
  "sync_status" text DEFAULT 'pendente'::text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "criado_por" text DEFAULT ''::text NOT NULL,
  "prioridade_perfil" text DEFAULT 'normal'::text NOT NULL,
  "lembrete_24h_enviado_em" timestamp with time zone,
  "lembrete_proximo_enviado_em" timestamp with time zone,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "procedimento_sigtap" text DEFAULT ''::text,
  "nome_procedimento" text DEFAULT ''::text,
  "turno" text DEFAULT ''::text,
  "agendado_por_externo" text DEFAULT ''::text,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone,
  "concluido_por_id" text,
  "concluido_por_nome" text,
  "concluido_por_master" boolean DEFAULT false NOT NULL,
  "procedimento_concluido" text,
  "cid_concluido" text,
  "obs_conclusao" text,
  "tipo_falta" text,
  "falta_justificativa" text,
  "falta_liberada" boolean DEFAULT false NOT NULL,
  "liberada_em" timestamp with time zone,
  "liberada_por" uuid,
  "motivo_liberacao" text
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."agendamentos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."agendamentos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."agendamentos" TO "service_role";

ALTER TABLE public."agendamentos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."agendamentos_externos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "profissional_externo_id" uuid NOT NULL,
  "profissional_interno_id" uuid,
  "unidade_id" text NOT NULL,
  "cota_id" uuid,
  "data" date NOT NULL,
  "horario" time without time zone NOT NULL,
  "turno" text NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "observacoes" text,
  "documento_url" text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."agendamentos_externos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."agendamentos_externos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."agendamentos_externos" TO "service_role";

ALTER TABLE public."agendamentos_externos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."atendimentos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agendamento_id" text DEFAULT ''::text NOT NULL,
  "paciente_id" text NOT NULL,
  "paciente_nome" text NOT NULL,
  "profissional_id" text NOT NULL,
  "profissional_nome" text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "sala_id" text DEFAULT ''::text NOT NULL,
  "setor" text DEFAULT ''::text NOT NULL,
  "procedimento" text DEFAULT ''::text NOT NULL,
  "observacoes" text DEFAULT ''::text NOT NULL,
  "data" date DEFAULT CURRENT_DATE NOT NULL,
  "hora_inicio" text DEFAULT ''::text NOT NULL,
  "hora_fim" text DEFAULT ''::text NOT NULL,
  "duracao_minutos" integer,
  "status" text DEFAULT 'em_atendimento'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."atendimentos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."atendimentos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."atendimentos" TO "service_role";

ALTER TABLE public."atendimentos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."bloqueios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_id" text DEFAULT ''::text,
  "unidade_id" text DEFAULT ''::text,
  "tipo" text DEFAULT 'feriado'::text NOT NULL,
  "titulo" text DEFAULT ''::text NOT NULL,
  "data_inicio" date NOT NULL,
  "data_fim" date NOT NULL,
  "hora_inicio" text DEFAULT ''::text,
  "hora_fim" text DEFAULT ''::text,
  "dia_inteiro" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "criado_por" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."bloqueios" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."bloqueios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."bloqueios" TO "service_role";

ALTER TABLE public."bloqueios" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."cbo_codigos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "codigo" text NOT NULL,
  "descricao" text NOT NULL,
  "profissoes_relacionadas" text[] DEFAULT '{}'::text[] NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."cbo_codigos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."cbo_codigos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."cbo_codigos" TO "service_role";

ALTER TABLE public."cbo_codigos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."cid10_codigos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "codigo" text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "especialidade" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."cid10_codigos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."cid10_codigos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."cid10_codigos" TO "service_role";

ALTER TABLE public."cid10_codigos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."clinica_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome_clinica" text DEFAULT ''::text NOT NULL,
  "logo_url" text DEFAULT ''::text NOT NULL,
  "telefone" text DEFAULT ''::text NOT NULL,
  "evolution_base_url" text DEFAULT ''::text NOT NULL,
  "evolution_api_key" text DEFAULT ''::text NOT NULL,
  "evolution_instance_name" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "uazapi_server_url" text DEFAULT ''::text NOT NULL,
  "uazapi_admin_token" text DEFAULT ''::text NOT NULL,
  "uazapi_instance" text DEFAULT ''::text NOT NULL,
  "uazapi_ativo" boolean DEFAULT false NOT NULL,
  "whatsapp_provider_active" text DEFAULT 'evolution'::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."clinica_config" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."clinica_config" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."clinica_config" TO "service_role";

ALTER TABLE public."clinica_config" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."disponibilidades" (
  "id" text DEFAULT ('d'::text || ((EXTRACT(epoch FROM now()))::bigint)::text) NOT NULL,
  "profissional_id" text NOT NULL,
  "unidade_id" text NOT NULL,
  "sala_id" text DEFAULT ''::text,
  "data_inicio" date NOT NULL,
  "data_fim" date NOT NULL,
  "hora_inicio" text DEFAULT '08:00'::text NOT NULL,
  "hora_fim" text DEFAULT '17:00'::text NOT NULL,
  "vagas_por_hora" integer DEFAULT 3 NOT NULL,
  "vagas_por_dia" integer DEFAULT 25 NOT NULL,
  "dias_semana" integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "duracao_consulta" integer DEFAULT 30 NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."disponibilidades" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."disponibilidades" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."disponibilidades" TO "service_role";

ALTER TABLE public."disponibilidades" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."document_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text DEFAULT ''::text NOT NULL,
  "tipo" text DEFAULT 'Atestado Médico'::text NOT NULL,
  "conteudo" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "perfis_permitidos" text[] DEFAULT ARRAY['master'::text, 'profissional'::text] NOT NULL,
  "tipo_modelo" text DEFAULT 'UNIDADE'::text NOT NULL,
  "unidade_id" text DEFAULT ''::text,
  "criado_por" text DEFAULT ''::text NOT NULL,
  "criado_por_nome" text DEFAULT ''::text NOT NULL,
  "versoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "blocos_clinicos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."document_templates" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."document_templates" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."document_templates" TO "service_role";

ALTER TABLE public."document_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."documentos_gerados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "paciente_nome" text DEFAULT ''::text NOT NULL,
  "profissional_id" text DEFAULT ''::text NOT NULL,
  "profissional_nome" text DEFAULT ''::text NOT NULL,
  "tipo_documento" text DEFAULT ''::text NOT NULL,
  "conteudo_original" text DEFAULT ''::text NOT NULL,
  "conteudo_html" text DEFAULT ''::text NOT NULL,
  "campos_formulario" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hash_assinatura" text DEFAULT ''::text NOT NULL,
  "ip_assinatura" text DEFAULT ''::text NOT NULL,
  "assinado_em" timestamp with time zone,
  "modelo_id" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'rascunho'::text NOT NULL,
  "motivo_cancelamento" text DEFAULT ''::text NOT NULL,
  "cancelado_por" text DEFAULT ''::text NOT NULL,
  "cancelado_em" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."documentos_gerados" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."documentos_gerados" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."documentos_gerados" TO "service_role";

ALTER TABLE public."documentos_gerados" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."episodios_clinicos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "profissional_id" text NOT NULL,
  "profissional_nome" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "tipo" text DEFAULT 'tratamento'::text NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "data_inicio" date DEFAULT CURRENT_DATE NOT NULL,
  "data_fim" date,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."episodios_clinicos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."episodios_clinicos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."episodios_clinicos" TO "service_role";

ALTER TABLE public."episodios_clinicos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."especialidades" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "cor" text DEFAULT '#3b82f6'::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."especialidades" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."especialidades" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."especialidades" TO "service_role";

ALTER TABLE public."especialidades" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."exam_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "codigo_sus" text DEFAULT ''::text NOT NULL,
  "categoria" text DEFAULT ''::text NOT NULL,
  "is_global" boolean DEFAULT true NOT NULL,
  "profissional_id" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."exam_types" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."exam_types" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."exam_types" TO "service_role";

ALTER TABLE public."exam_types" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."fila_espera" (
  "id" text NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "paciente_nome" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "profissional_id" text DEFAULT ''::text,
  "setor" text DEFAULT ''::text NOT NULL,
  "prioridade" text DEFAULT 'normal'::text NOT NULL,
  "status" text DEFAULT 'aguardando'::text NOT NULL,
  "posicao" integer DEFAULT 0 NOT NULL,
  "hora_chegada" text DEFAULT ''::text NOT NULL,
  "hora_chamada" text DEFAULT ''::text,
  "observacoes" text DEFAULT ''::text,
  "criado_por" text DEFAULT 'sistema'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "prioridade_perfil" text DEFAULT 'normal'::text NOT NULL,
  "descricao_clinica" text DEFAULT ''::text NOT NULL,
  "cid" text DEFAULT ''::text NOT NULL,
  "data_solicitacao_original" text DEFAULT ''::text NOT NULL,
  "origem_cadastro" text DEFAULT 'normal'::text NOT NULL,
  "especialidade_destino" text DEFAULT ''::text NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."fila_espera" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."fila_espera" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."fila_espera" TO "service_role";

ALTER TABLE public."fila_espera" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."form_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "profissional_id" text DEFAULT ''::text NOT NULL,
  "form_slug" text NOT NULL,
  "display_name" text DEFAULT ''::text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "schema" jsonb DEFAULT '{"sections": []}'::jsonb NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "criado_por" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."form_templates" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."form_templates" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."form_templates" TO "service_role";

ALTER TABLE public."form_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."funcionarios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_user_id" uuid,
  "nome" text NOT NULL,
  "usuario" text NOT NULL,
  "email" text NOT NULL,
  "setor" text DEFAULT ''::text,
  "unidade_id" text DEFAULT ''::text,
  "sala_id" text DEFAULT ''::text,
  "cargo" text DEFAULT ''::text,
  "role" text DEFAULT 'recepcao'::text NOT NULL,
  "ativo" boolean DEFAULT true,
  "criado_em" timestamp with time zone DEFAULT now(),
  "criado_por" text DEFAULT ''::text,
  "tempo_atendimento" integer DEFAULT 30 NOT NULL,
  "profissao" text DEFAULT ''::text NOT NULL,
  "tipo_conselho" text DEFAULT ''::text NOT NULL,
  "numero_conselho" text DEFAULT ''::text NOT NULL,
  "uf_conselho" text DEFAULT ''::text NOT NULL,
  "pode_agendar_retorno" boolean DEFAULT false NOT NULL,
  "cpf" text DEFAULT ''::text NOT NULL,
  "coren" character varying(20) DEFAULT ''::character varying,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."funcionarios" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."funcionarios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."funcionarios" TO "service_role";

ALTER TABLE public."funcionarios" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."google_calendar_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "calendar_id" text DEFAULT 'primary'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."google_calendar_tokens" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."google_calendar_tokens" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."google_calendar_tokens" TO "service_role";

ALTER TABLE public."google_calendar_tokens" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."horarios_funcionamento" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "dia_semana" integer NOT NULL,
  "ativo" boolean DEFAULT false NOT NULL,
  "hora_inicio" text DEFAULT '07:00'::text NOT NULL,
  "hora_fim" text DEFAULT '13:00'::text NOT NULL,
  "intervalo_slots" integer DEFAULT 30 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."horarios_funcionamento" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."horarios_funcionamento" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."horarios_funcionamento" TO "service_role";

ALTER TABLE public."horarios_funcionamento" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."integracoes_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sistema_id" uuid,
  "identificador_origem" text DEFAULT ''::text NOT NULL,
  "direcao" text DEFAULT 'entrada'::text NOT NULL,
  "endpoint" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'sucesso'::text NOT NULL,
  "mensagem" text DEFAULT ''::text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ip" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."integracoes_log" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."integracoes_log" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."integracoes_log" TO "service_role";

ALTER TABLE public."integracoes_log" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."logradouros_dne" (
  "codigo" character varying(3) NOT NULL,
  "descricao" character varying(60) NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."logradouros_dne" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."logradouros_dne" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."logradouros_dne" TO "service_role";

ALTER TABLE public."logradouros_dne" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."medications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "principio_ativo" text DEFAULT ''::text NOT NULL,
  "classe_terapeutica" text DEFAULT ''::text NOT NULL,
  "apresentacao" text DEFAULT ''::text NOT NULL,
  "dosagem_padrao" text DEFAULT ''::text NOT NULL,
  "via_padrao" text DEFAULT 'oral'::text NOT NULL,
  "is_global" boolean DEFAULT true NOT NULL,
  "profissional_id" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "nome_comercial" text DEFAULT ''::text NOT NULL,
  "forma_farmaceutica" text DEFAULT ''::text NOT NULL,
  "concentracao" text DEFAULT ''::text NOT NULL,
  "codigo_rename" text,
  "tipo" text DEFAULT 'comum'::text NOT NULL,
  "origem" text DEFAULT 'manual'::text NOT NULL,
  "estoque_quantidade" integer DEFAULT 0 NOT NULL,
  "estoque_minimo" integer DEFAULT 0 NOT NULL,
  "estoque_unidade" text DEFAULT 'unidades'::text NOT NULL,
  "estoque_localizacao" text DEFAULT ''::text NOT NULL,
  "estoque_controlado" boolean DEFAULT false NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."medications" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."medications" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."medications" TO "service_role";

ALTER TABLE public."medications" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."multiprofessional_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "agendamento_id" text,
  "professional_id" text NOT NULL,
  "professional_nome" text DEFAULT ''::text NOT NULL,
  "specialty" text DEFAULT ''::text NOT NULL,
  "unit_id" text DEFAULT ''::text NOT NULL,
  "clinical_evaluation" text DEFAULT ''::text NOT NULL,
  "parecer" text DEFAULT 'favoravel'::text NOT NULL,
  "observations" text DEFAULT ''::text NOT NULL,
  "evaluation_date" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."multiprofessional_evaluations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."multiprofessional_evaluations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."multiprofessional_evaluations" TO "service_role";

ALTER TABLE public."multiprofessional_evaluations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."notification_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agendamento_id" text DEFAULT ''::text,
  "evento" text NOT NULL,
  "canal" text DEFAULT 'webhook'::text NOT NULL,
  "destinatario_email" text DEFAULT ''::text,
  "destinatario_telefone" text DEFAULT ''::text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'enviado'::text NOT NULL,
  "resposta" text DEFAULT ''::text,
  "erro" text DEFAULT ''::text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "provider" text DEFAULT 'evolution'::text NOT NULL,
  "prior_interaction" boolean,
  "opt_in_status" text,
  "window_24h" boolean,
  "category" text,
  "template_id" uuid
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."notification_logs" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."notification_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."notification_logs" TO "service_role";

ALTER TABLE public."notification_logs" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."nursing_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "agendamento_id" text,
  "professional_id" text NOT NULL,
  "unit_id" text DEFAULT ''::text NOT NULL,
  "evaluation_date" date DEFAULT CURRENT_DATE NOT NULL,
  "anamnese_resumida" text DEFAULT ''::text NOT NULL,
  "condicao_clinica" text DEFAULT ''::text NOT NULL,
  "avaliacao_risco" text DEFAULT ''::text NOT NULL,
  "prioridade" text DEFAULT 'media'::text NOT NULL,
  "observacoes_clinicas" text DEFAULT ''::text NOT NULL,
  "resultado" text DEFAULT 'apto'::text NOT NULL,
  "motivo_inapto" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."nursing_evaluations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."nursing_evaluations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."nursing_evaluations" TO "service_role";

ALTER TABLE public."nursing_evaluations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."paciente_profissional_status" (
  "paciente_id" text NOT NULL,
  "profissional_id" uuid NOT NULL,
  "total_faltas" integer DEFAULT 0 NOT NULL,
  "status_falta" text NOT NULL,
  "ultima_falta" date,
  "updated_at" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."paciente_profissional_status" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."paciente_profissional_status" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."paciente_profissional_status" TO "service_role";

ALTER TABLE public."paciente_profissional_status" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pacientes" (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "cpf" text DEFAULT ''::text NOT NULL,
  "telefone" text DEFAULT ''::text NOT NULL,
  "data_nascimento" text DEFAULT ''::text NOT NULL,
  "email" text DEFAULT ''::text NOT NULL,
  "endereco" text DEFAULT ''::text NOT NULL,
  "observacoes" text DEFAULT ''::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "auth_user_id" uuid,
  "descricao_clinica" text DEFAULT ''::text NOT NULL,
  "cid" text DEFAULT ''::text NOT NULL,
  "cns" text DEFAULT ''::text NOT NULL,
  "nome_mae" text DEFAULT ''::text NOT NULL,
  "municipio" text DEFAULT ''::text NOT NULL,
  "menor_idade" boolean DEFAULT false NOT NULL,
  "nome_responsavel" text DEFAULT ''::text NOT NULL,
  "cpf_responsavel" text DEFAULT ''::text NOT NULL,
  "ubs_origem" text DEFAULT ''::text NOT NULL,
  "profissional_solicitante" text DEFAULT ''::text NOT NULL,
  "tipo_encaminhamento" text DEFAULT ''::text NOT NULL,
  "diagnostico_resumido" text DEFAULT ''::text NOT NULL,
  "justificativa" text DEFAULT ''::text NOT NULL,
  "data_encaminhamento" text DEFAULT ''::text NOT NULL,
  "documento_url" text DEFAULT ''::text NOT NULL,
  "tipo_condicao" text DEFAULT ''::text NOT NULL,
  "mobilidade" text DEFAULT ''::text NOT NULL,
  "usa_dispositivo" boolean DEFAULT false NOT NULL,
  "tipo_dispositivo" text DEFAULT ''::text NOT NULL,
  "comunicacao" text DEFAULT ''::text NOT NULL,
  "comportamento" text DEFAULT ''::text NOT NULL,
  "usa_equipamentos" boolean DEFAULT false NOT NULL,
  "equipamentos" text[] DEFAULT '{}'::text[] NOT NULL,
  "observacao_equipamentos" text DEFAULT ''::text NOT NULL,
  "outro_servico_sus" boolean DEFAULT false NOT NULL,
  "transporte" text DEFAULT ''::text NOT NULL,
  "turno_preferido" text DEFAULT ''::text NOT NULL,
  "especialidade_destino" text DEFAULT ''::text NOT NULL,
  "is_gestante" boolean DEFAULT false NOT NULL,
  "is_pne" boolean DEFAULT false NOT NULL,
  "is_autista" boolean DEFAULT false NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "naturalidade" text DEFAULT ''::text NOT NULL,
  "naturalidade_uf" text DEFAULT ''::text NOT NULL,
  "sexo" text,
  "raca_cor" text,
  "nacionalidade" text,
  "situacao_rua" boolean DEFAULT false,
  "cep" text,
  "tipo_logradouro" text,
  "logradouro" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "uf" text,
  "telefone_secundario" text,
  "total_faltas" integer DEFAULT 0 NOT NULL,
  "faltas_consecutivas" integer DEFAULT 0 NOT NULL,
  "status_falta" text DEFAULT 'REGULAR'::text NOT NULL,
  "is_tfd" boolean DEFAULT false NOT NULL,
  "possui_ordem_judicial" boolean DEFAULT false NOT NULL,
  "motivo_excecao_bloqueio" text,
  "observacao_tfd_ordem_judicial" text,
  "data_marcacao_excecao" timestamp with time zone,
  "marcado_por" uuid,
  "whatsapp_opt_in_marketing" boolean DEFAULT false,
  "whatsapp_opt_in_waiting_list" boolean DEFAULT false,
  "whatsapp_has_prior_interaction" boolean DEFAULT false,
  "whatsapp_consent_proof" jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pacientes" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pacientes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pacientes" TO "service_role";

ALTER TABLE public."pacientes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_discharges" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "patient_id" text NOT NULL,
  "professional_id" text NOT NULL,
  "discharge_date" date DEFAULT CURRENT_DATE NOT NULL,
  "reason" text DEFAULT ''::text NOT NULL,
  "final_notes" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tipo_alta" tipo_alta DEFAULT 'outro'::tipo_alta NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_discharges" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_discharges" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_discharges" TO "service_role";

ALTER TABLE public."patient_discharges" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "unidade_id" text,
  "nome_arquivo" text NOT NULL,
  "nome_original" text,
  "tipo_documento" text,
  "mime_type" text,
  "tamanho_bytes" bigint,
  "storage_bucket" text DEFAULT 'patient-documents'::text,
  "storage_path" text NOT NULL,
  "url_publica" text,
  "origem" text DEFAULT 'anexado'::text,
  "descricao" text,
  "ativo" boolean DEFAULT true,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_documents" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_documents" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_documents" TO "service_role";

ALTER TABLE public."patient_documents" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "regulation_id" uuid,
  "professional_id" text NOT NULL,
  "unit_id" text DEFAULT ''::text NOT NULL,
  "evaluation_date" date DEFAULT CURRENT_DATE NOT NULL,
  "clinical_notes" text DEFAULT ''::text NOT NULL,
  "defined_procedures" text[] DEFAULT '{}'::text[] NOT NULL,
  "sessions_planned" integer DEFAULT 1 NOT NULL,
  "frequency" text DEFAULT 'semanal'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "rejection_reason" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_evaluations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_evaluations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_evaluations" TO "service_role";

ALTER TABLE public."patient_evaluations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_procedures" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "sigtap_codigo" text,
  "procedimento_nome" text,
  "cid" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_procedures" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_procedures" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_procedures" TO "service_role";

ALTER TABLE public."patient_procedures" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_profession_careness" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "profession_key" text NOT NULL,
  "profession_name" text NOT NULL,
  "discharge_id" uuid,
  "source_professional_id" text DEFAULT ''::text NOT NULL,
  "source_unit_id" text DEFAULT ''::text NOT NULL,
  "discharge_date" date NOT NULL,
  "release_date" date NOT NULL,
  "scope" text NOT NULL,
  "released_at" timestamp with time zone,
  "release_reason" text DEFAULT ''::text NOT NULL,
  "annulled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT SELECT ON TABLE public."patient_profession_careness" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_profession_careness" TO "service_role";

ALTER TABLE public."patient_profession_careness" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_referrals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "unidade_id" text,
  "professional_id" uuid,
  "especialidade_destino" text NOT NULL,
  "ubs_origem" text,
  "profissional_solicitante" text,
  "tipo_encaminhamento" text,
  "cid" text,
  "diagnostico_resumido" text,
  "justificativa" text,
  "data_encaminhamento" date DEFAULT CURRENT_DATE,
  "status" text DEFAULT 'ativo'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "observacoes" text
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_referrals" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_referrals" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_referrals" TO "service_role";

ALTER TABLE public."patient_referrals" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."patient_regulation" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "cns" text DEFAULT ''::text NOT NULL,
  "cpf" text DEFAULT ''::text NOT NULL,
  "name" text NOT NULL,
  "mother_name" text DEFAULT ''::text NOT NULL,
  "priority_level" text DEFAULT 'baixo'::text NOT NULL,
  "referral_source" text DEFAULT 'espontaneo'::text NOT NULL,
  "cid_code" text DEFAULT ''::text NOT NULL,
  "requires_specialty" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'waiting'::text NOT NULL,
  "notes" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_regulation" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."patient_regulation" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."patient_regulation" TO "service_role";

ALTER TABLE public."patient_regulation" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."permissoes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "perfil" text NOT NULL,
  "modulo" text NOT NULL,
  "can_view" boolean DEFAULT false NOT NULL,
  "can_create" boolean DEFAULT false NOT NULL,
  "can_edit" boolean DEFAULT false NOT NULL,
  "can_delete" boolean DEFAULT false NOT NULL,
  "can_execute" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "can_print" boolean DEFAULT false,
  "can_export" boolean DEFAULT false,
  "can_attach" boolean DEFAULT false,
  "can_sign" boolean DEFAULT false,
  "can_approve" boolean DEFAULT false,
  "can_cancel" boolean DEFAULT false,
  "can_configure" boolean DEFAULT false,
  "granular_actions" jsonb DEFAULT '{}'::jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."permissoes" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."permissoes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."permissoes" TO "service_role";

ALTER TABLE public."permissoes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."permissoes_usuario" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "modulo" text NOT NULL,
  "can_view" boolean,
  "can_create" boolean,
  "can_edit" boolean,
  "can_delete" boolean,
  "can_execute" boolean,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "can_print" boolean,
  "can_export" boolean,
  "can_attach" boolean,
  "can_sign" boolean,
  "can_approve" boolean,
  "can_cancel" boolean,
  "can_configure" boolean,
  "granular_actions" jsonb DEFAULT '{}'::jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."permissoes_usuario" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."permissoes_usuario" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."permissoes_usuario" TO "service_role";

ALTER TABLE public."permissoes_usuario" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."procedimento_profissionais" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "procedimento_codigo" text NOT NULL,
  "profissional_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimento_profissionais" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimento_profissionais" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."procedimento_profissionais" TO "service_role";

ALTER TABLE public."procedimento_profissionais" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."procedimentos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "profissao" text DEFAULT ''::text NOT NULL,
  "especialidade" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "profissionais_ids" uuid[] DEFAULT '{}'::uuid[],
  "codigo_sigtap" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimentos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimentos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."procedimentos" TO "service_role";

ALTER TABLE public."procedimentos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."procedimentos_realizados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "procedimento_id" uuid NOT NULL,
  "data_atendimento" date DEFAULT CURRENT_DATE NOT NULL,
  "cids_selecionados" text[] DEFAULT '{}'::text[],
  "quantidade" integer DEFAULT 1,
  "observacao" text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimentos_realizados" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."procedimentos_realizados" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."procedimentos_realizados" TO "service_role";

ALTER TABLE public."procedimentos_realizados" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."profession_careness_mapping_state" (
  "id" boolean DEFAULT true NOT NULL,
  "confirmed_signature" text DEFAULT ''::text NOT NULL,
  "confirmed_at" timestamp with time zone,
  "confirmed_by" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profession_careness_mapping_state" TO "service_role";

ALTER TABLE public."profession_careness_mapping_state" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."profession_careness_rules" (
  "profession_key" text NOT NULL,
  "profession_name" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "duration_value" integer DEFAULT 30 NOT NULL,
  "duration_unit" text DEFAULT 'days'::text NOT NULL,
  "scope" text DEFAULT 'global'::text NOT NULL,
  "updated_by" text DEFAULT ''::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."profession_careness_rules" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profession_careness_rules" TO "service_role";

ALTER TABLE public."profession_careness_rules" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."professional_preferences" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_id" text NOT NULL,
  "tipo" text DEFAULT 'exam'::text NOT NULL,
  "item_id" uuid NOT NULL,
  "desabilitado" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."professional_preferences" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."professional_preferences" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."professional_preferences" TO "service_role";

ALTER TABLE public."professional_preferences" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."profissionais_carimbo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_id" uuid NOT NULL,
  "tipo" text DEFAULT 'digital'::text NOT NULL,
  "nome" text DEFAULT ''::text NOT NULL,
  "conselho" text DEFAULT ''::text NOT NULL,
  "numero_registro" text DEFAULT ''::text NOT NULL,
  "uf" text DEFAULT ''::text NOT NULL,
  "especialidade" text DEFAULT ''::text NOT NULL,
  "cargo" text DEFAULT ''::text NOT NULL,
  "imagem_url" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."profissionais_carimbo" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."profissionais_carimbo" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profissionais_carimbo" TO "service_role";

ALTER TABLE public."profissionais_carimbo" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."profissionais_externos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_user_id" uuid,
  "nome" text NOT NULL,
  "email" text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "criado_por" text DEFAULT ''::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "telefone" text,
  "documento" text,
  "orgao_origem" text,
  "responsavel" text,
  "observacoes" text,
  "permissoes" jsonb DEFAULT '{"pode_agendar": true, "pode_cancelar": true, "pode_visualizar": true, "pode_editar_paciente": true, "pode_anexar_documento": true, "pode_cadastrar_paciente": true, "pode_selecionar_paciente": true}'::jsonb,
  "data_validade" date
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."profissionais_externos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."profissionais_externos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."profissionais_externos" TO "service_role";

ALTER TABLE public."profissionais_externos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."prontuario_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_id" text NOT NULL,
  "tipo_prontuario" text DEFAULT 'sessao'::text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "template_nome" text,
  "is_default" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_config" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_config" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."prontuario_config" TO "service_role";

ALTER TABLE public."prontuario_config" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."prontuario_exames" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "prontuario_id" text DEFAULT ''::text NOT NULL,
  "atendimento_id" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "profissional_id" text DEFAULT ''::text NOT NULL,
  "profissional_nome" text DEFAULT ''::text NOT NULL,
  "nome_exame" text DEFAULT ''::text NOT NULL,
  "tipo_exame" text DEFAULT ''::text NOT NULL,
  "data_exame" date,
  "laboratorio" text DEFAULT ''::text NOT NULL,
  "medico_solicitante" text DEFAULT ''::text NOT NULL,
  "resultado_descrito" text DEFAULT ''::text NOT NULL,
  "interpretacao_profissional" text DEFAULT ''::text NOT NULL,
  "observacoes_medicas" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'liberado'::text NOT NULL,
  "tipo_atendimento_vinculado" text DEFAULT ''::text NOT NULL,
  "created_by" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_exames" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_exames" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."prontuario_exames" TO "service_role";

ALTER TABLE public."prontuario_exames" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."prontuario_procedimentos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "prontuario_id" uuid NOT NULL,
  "procedimento_id" uuid NOT NULL,
  "observacao" text DEFAULT ''::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "cids_selecionados" text[] DEFAULT '{}'::text[] NOT NULL,
  "quantidade" integer DEFAULT 1
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_procedimentos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuario_procedimentos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."prontuario_procedimentos" TO "service_role";

ALTER TABLE public."prontuario_procedimentos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."prontuarios" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "paciente_nome" text NOT NULL,
  "profissional_id" text NOT NULL,
  "profissional_nome" text NOT NULL,
  "unidade_id" text NOT NULL,
  "sala_id" text DEFAULT ''::text,
  "setor" text DEFAULT ''::text,
  "agendamento_id" text DEFAULT ''::text,
  "data_atendimento" date DEFAULT CURRENT_DATE NOT NULL,
  "hora_atendimento" text DEFAULT ''::text,
  "queixa_principal" text DEFAULT ''::text,
  "anamnese" text DEFAULT ''::text,
  "sinais_sintomas" text DEFAULT ''::text,
  "exame_fisico" text DEFAULT ''::text,
  "hipotese" text DEFAULT ''::text,
  "conduta" text DEFAULT ''::text,
  "prescricao" text DEFAULT ''::text,
  "solicitacao_exames" text DEFAULT ''::text,
  "evolucao" text DEFAULT ''::text,
  "observacoes" text DEFAULT ''::text,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "indicacao_retorno" text DEFAULT ''::text NOT NULL,
  "motivo_alteracao" text DEFAULT ''::text NOT NULL,
  "episodio_id" uuid,
  "procedimentos_texto" text DEFAULT ''::text NOT NULL,
  "outro_procedimento" text DEFAULT ''::text NOT NULL,
  "tipo_registro" text DEFAULT 'consulta'::text NOT NULL,
  "soap_subjetivo" text DEFAULT ''::text,
  "soap_objetivo" text DEFAULT ''::text,
  "soap_avaliacao" text DEFAULT ''::text,
  "soap_plano" text DEFAULT ''::text,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resultado_exame" text DEFAULT ''::text NOT NULL,
  "pts_meta_id" uuid,
  "pts_meta_worked" boolean DEFAULT false,
  "meta_pts_id" uuid,
  "status" text DEFAULT 'finalizado'::text
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuarios" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."prontuarios" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."prontuarios" TO "service_role";

ALTER TABLE public."prontuarios" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "professional_id" text NOT NULL,
  "unit_id" text DEFAULT ''::text NOT NULL,
  "diagnostico_funcional" text DEFAULT ''::text NOT NULL,
  "objetivos_terapeuticos" text DEFAULT ''::text NOT NULL,
  "metas_curto_prazo" text DEFAULT ''::text NOT NULL,
  "metas_medio_prazo" text DEFAULT ''::text NOT NULL,
  "metas_longo_prazo" text DEFAULT ''::text NOT NULL,
  "especialidades_envolvidas" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prioridade" text,
  "contextos_afetados" text[],
  "fatores_risco" text,
  "rede_apoio" text,
  "tipo_atendimento" text,
  "necessidade_interdisciplinar" boolean DEFAULT false,
  "motivo_encaminhamento" text,
  "potencialidades" text,
  "barreiras" text,
  "justificativa_clinica" text,
  "plano_conduta" text,
  "frequencia_planejada" text,
  "num_sessoes_previsto" integer,
  "recursos_necessarios" text,
  "data_ultima_revisao" date,
  "data_proxima_revisao" date,
  "revisao_obrigatoria" boolean DEFAULT false,
  "observacao_revisao" text,
  "criterios_alta" text,
  "motivo_encerramento" text,
  "resumo_desfecho" text,
  "orientacoes_finais" text,
  "encaminhamentos" text,
  "ciencia_familia" boolean DEFAULT false,
  "acompanhamento_interdisciplinar" boolean DEFAULT false,
  "necessidade_revisao" boolean DEFAULT false,
  "objetivo_geral" text,
  "rede_apoio_presente" boolean DEFAULT false,
  "obs_revisao" text,
  "status_final" text,
  "criterio_alta_atingido" boolean DEFAULT false
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pts" TO "service_role";

ALTER TABLE public."pts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pts_cid" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pts_id" uuid NOT NULL,
  "cid_codigo" text DEFAULT ''::text NOT NULL,
  "cid_descricao" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_cid" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_cid" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pts_cid" TO "service_role";

ALTER TABLE public."pts_cid" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pts_import_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text DEFAULT 'sync_datasus_automatico'::text NOT NULL,
  "especialidade" text DEFAULT 'todas'::text NOT NULL,
  "total_procedimentos" integer DEFAULT 0 NOT NULL,
  "total_cids" integer DEFAULT 0 NOT NULL,
  "competencia" text DEFAULT ''::text NOT NULL,
  "detalhes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "importado_em" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_import_log" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_import_log" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pts_import_log" TO "service_role";

ALTER TABLE public."pts_import_log" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pts_metas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pts_id" uuid NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "categoria" text,
  "especialidade" text,
  "responsavel_id" text,
  "indicador_sucesso" text,
  "prazo_estimado" date,
  "status" text DEFAULT 'não iniciada'::text,
  "prioridade" text,
  "observacao" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_metas" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_metas" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pts_metas" TO "service_role";

ALTER TABLE public."pts_metas" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."pts_sigtap" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pts_id" uuid NOT NULL,
  "procedimento_codigo" text DEFAULT ''::text NOT NULL,
  "procedimento_nome" text DEFAULT ''::text NOT NULL,
  "especialidade" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_sigtap" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."pts_sigtap" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."pts_sigtap" TO "service_role";

ALTER TABLE public."pts_sigtap" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."quotas_externas" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_externo_id" uuid NOT NULL,
  "profissional_interno_id" uuid NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "vagas_total" integer DEFAULT 0 NOT NULL,
  "vagas_usadas" integer DEFAULT 0 NOT NULL,
  "periodo_inicio" date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date NOT NULL,
  "periodo_fim" date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "especialidade" text,
  "dia_semana" integer,
  "turno" text,
  "horario_inicio" time without time zone,
  "horario_fim" time without time zone,
  "duracao_atendimento" integer DEFAULT 30,
  "ativo" boolean DEFAULT true
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."quotas_externas" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."quotas_externas" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."quotas_externas" TO "service_role";

ALTER TABLE public."quotas_externas" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."referral_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "referral_id" uuid NOT NULL,
  "file_path" text NOT NULL,
  "file_name" text NOT NULL,
  "file_type" text,
  "file_size" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."referral_attachments" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."referral_attachments" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."referral_attachments" TO "service_role";

ALTER TABLE public."referral_attachments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."salas" (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "unidade_id" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."salas" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."salas" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."salas" TO "service_role";

ALTER TABLE public."salas" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sigtap_procedimento_cids" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "procedimento_codigo" text NOT NULL,
  "cid_codigo" text NOT NULL,
  "cid_descricao" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sigtap_procedimento_cids" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sigtap_procedimento_cids" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."sigtap_procedimento_cids" TO "service_role";

ALTER TABLE public."sigtap_procedimento_cids" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sigtap_procedimentos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "codigo" text NOT NULL,
  "nome" text NOT NULL,
  "especialidade" text DEFAULT ''::text NOT NULL,
  "total_cids" integer DEFAULT 0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "origem" text DEFAULT 'SIGTAP'::text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "valor" numeric(10,2),
  "criado_por" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sigtap_procedimentos" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sigtap_procedimentos" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."sigtap_procedimentos" TO "service_role";

ALTER TABLE public."sigtap_procedimentos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sistemas_integrados" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "identificador" text NOT NULL,
  "url_base" text DEFAULT ''::text NOT NULL,
  "token_saida" text DEFAULT ''::text NOT NULL,
  "token_entrada_hash" text DEFAULT ''::text NOT NULL,
  "token_entrada_prefix" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "pode_enviar" boolean DEFAULT true NOT NULL,
  "pode_receber" boolean DEFAULT true NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "criado_por" text DEFAULT ''::text NOT NULL,
  "ultimo_teste_em" timestamp with time zone,
  "ultimo_teste_status" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sistemas_integrados" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."sistemas_integrados" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."sistemas_integrados" TO "service_role";

ALTER TABLE public."sistemas_integrados" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."soap_custom_options" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profissional_id" text NOT NULL,
  "campo" text NOT NULL,
  "opcao" text NOT NULL,
  "profissao" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."soap_custom_options" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."soap_custom_options" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."soap_custom_options" TO "service_role";

ALTER TABLE public."soap_custom_options" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."system_cleanup_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "cleanup_type" text NOT NULL,
  "items_count" integer,
  "details" jsonb,
  "status" text,
  "error_message" text
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_cleanup_logs" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_cleanup_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_cleanup_logs" TO "service_role";

ALTER TABLE public."system_cleanup_logs" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."system_config" (
  "id" text DEFAULT 'default'::text NOT NULL,
  "configuracoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_config" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_config" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_config" TO "service_role";

ALTER TABLE public."system_config" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."system_monitoring_alerts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "source" text,
  "recommendation" text,
  "resolved" boolean DEFAULT false,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_alerts" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_alerts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_monitoring_alerts" TO "service_role";

ALTER TABLE public."system_monitoring_alerts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."system_monitoring_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "hosting_type" text,
  "public_url" text,
  "api_url" text,
  "coolify_url" text,
  "monitoring_enabled" boolean DEFAULT true,
  "config" jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_settings" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_settings" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_monitoring_settings" TO "service_role";

ALTER TABLE public."system_monitoring_settings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."system_monitoring_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "status_geral" text NOT NULL,
  "db_status" text,
  "storage_status" text,
  "hosting_status" text,
  "total_registros" integer,
  "total_arquivos" integer,
  "alertas_count" integer,
  "payload" jsonb
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_snapshots" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."system_monitoring_snapshots" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."system_monitoring_snapshots" TO "service_role";

ALTER TABLE public."system_monitoring_snapshots" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."treatment_cycles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "patient_id" text NOT NULL,
  "professional_id" text NOT NULL,
  "unit_id" text DEFAULT ''::text NOT NULL,
  "specialty" text DEFAULT ''::text NOT NULL,
  "treatment_type" text DEFAULT ''::text NOT NULL,
  "start_date" date DEFAULT CURRENT_DATE NOT NULL,
  "end_date_predicted" date,
  "total_sessions" integer DEFAULT 1 NOT NULL,
  "sessions_done" integer DEFAULT 0 NOT NULL,
  "frequency" text DEFAULT 'semanal'::text NOT NULL,
  "status" text DEFAULT 'em_andamento'::text NOT NULL,
  "clinical_notes" text DEFAULT ''::text NOT NULL,
  "created_by" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pts_id" uuid,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_cycles" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_cycles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."treatment_cycles" TO "service_role";

ALTER TABLE public."treatment_cycles" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."treatment_extensions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "previous_sessions" integer NOT NULL,
  "new_sessions" integer NOT NULL,
  "previous_end_date" date,
  "new_end_date" date,
  "reason" text DEFAULT ''::text NOT NULL,
  "changed_by" text DEFAULT ''::text NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_extensions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_extensions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."treatment_extensions" TO "service_role";

ALTER TABLE public."treatment_extensions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."treatment_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL,
  "patient_id" text NOT NULL,
  "professional_id" text NOT NULL,
  "appointment_id" text,
  "session_number" integer DEFAULT 1 NOT NULL,
  "total_sessions" integer DEFAULT 1 NOT NULL,
  "scheduled_date" date DEFAULT CURRENT_DATE,
  "status" text DEFAULT 'agendada'::text NOT NULL,
  "absence_type" text,
  "clinical_notes" text DEFAULT ''::text NOT NULL,
  "procedure_done" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tipo_falta" text,
  "falta_justificativa" text,
  "falta_liberada" boolean DEFAULT false NOT NULL,
  "liberada_em" timestamp with time zone,
  "liberada_por" uuid,
  "motivo_liberacao" text
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_sessions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."treatment_sessions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."treatment_sessions" TO "service_role";

ALTER TABLE public."treatment_sessions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."triage_records" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "agendamento_id" text NOT NULL,
  "tecnico_id" text NOT NULL,
  "peso" numeric(5,2),
  "altura" numeric(5,2),
  "imc" numeric(5,2),
  "pressao_arterial" character varying(10),
  "temperatura" numeric(4,1),
  "frequencia_cardiaca" integer,
  "saturacao_oxigenio" integer,
  "glicemia" numeric(6,2),
  "alergias" text[] DEFAULT '{}'::text[],
  "medicamentos" text[] DEFAULT '{}'::text[],
  "queixa" text,
  "iniciado_em" timestamp with time zone,
  "confirmado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now(),
  "classificacao_risco" text DEFAULT ''::text NOT NULL,
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "observacoes" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."triage_records" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."triage_records" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."triage_records" TO "service_role";

ALTER TABLE public."triage_records" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."triage_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidade_id" text,
  "profissional_id" text,
  "enabled" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."triage_settings" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."triage_settings" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."triage_settings" TO "service_role";

ALTER TABLE public."triage_settings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."unidades" (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "endereco" text DEFAULT ''::text NOT NULL,
  "telefone" text DEFAULT ''::text NOT NULL,
  "whatsapp" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now(),
  "custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "nome_exibicao" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."unidades" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."unidades" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."unidades" TO "service_role";

ALTER TABLE public."unidades" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidade_id" text NOT NULL,
  "whatsapp_ativo" boolean DEFAULT true NOT NULL,
  "max_msgs_paciente_dia" integer DEFAULT 5 NOT NULL,
  "max_msgs_paciente_semana" integer DEFAULT 10 NOT NULL,
  "intervalo_minimo_minutos" integer DEFAULT 10 NOT NULL,
  "delay_aleatorio_min_seg" integer DEFAULT 5 NOT NULL,
  "delay_aleatorio_max_seg" integer DEFAULT 30 NOT NULL,
  "limite_global_por_minuto" integer DEFAULT 20 NOT NULL,
  "horario_inicio" text DEFAULT '08:00'::text NOT NULL,
  "horario_fim" text DEFAULT '18:00'::text NOT NULL,
  "dias_permitidos" integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
  "modo_estrito" boolean DEFAULT true NOT NULL,
  "respeitar_opt_out" boolean DEFAULT true NOT NULL,
  "bloquear_sem_interacao_previa" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_config" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_config" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_config" TO "service_role";

ALTER TABLE public."whatsapp_config" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_connection_status" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "instance_name" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'desconhecido'::text NOT NULL,
  "last_check_at" timestamp with time zone,
  "last_connected_at" timestamp with time zone,
  "last_disconnected_at" timestamp with time zone,
  "last_success_send_at" timestamp with time zone,
  "last_error" text DEFAULT ''::text NOT NULL,
  "last_error_at" timestamp with time zone,
  "reconnect_attempts" integer DEFAULT 0 NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "fila_pausada_ate" timestamp with time zone,
  "fila_pausada_motivo" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_connection_status" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_connection_status" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_connection_status" TO "service_role";

ALTER TABLE public."whatsapp_connection_status" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_consents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text NOT NULL,
  "telefone" text NOT NULL,
  "tipo" text NOT NULL,
  "origem" text DEFAULT 'cadastro'::text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "criado_por" text DEFAULT ''::text NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_consents" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_consents" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_consents" TO "service_role";

ALTER TABLE public."whatsapp_consents" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_conversations" (
  "phone" text NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "last_patient_message_at" timestamp with time zone,
  "last_outbound_at" timestamp with time zone,
  "opted_out" boolean DEFAULT false NOT NULL,
  "opted_out_at" timestamp with time zone,
  "opted_out_reason" text DEFAULT ''::text NOT NULL,
  "human_handoff" boolean DEFAULT false NOT NULL,
  "human_handoff_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_conversations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_conversations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_conversations" TO "service_role";

ALTER TABLE public."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_event_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidade_id" text NOT NULL,
  "evento" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "template_mensagem" text DEFAULT ''::text NOT NULL,
  "delay_envio_min" integer DEFAULT 0 NOT NULL,
  "horario_personalizado" text DEFAULT ''::text NOT NULL,
  "limite_por_paciente" integer DEFAULT 1 NOT NULL,
  "prioridade" text DEFAULT 'media'::text NOT NULL,
  "exigir_confirmacao" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "template_id" uuid,
  "antecedencia_minutos" integer DEFAULT 0 NOT NULL,
  "impedir_duplicidade" boolean DEFAULT true NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_event_config" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_event_config" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_event_config" TO "service_role";

ALTER TABLE public."whatsapp_event_config" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_health_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "snapshot_date" date DEFAULT CURRENT_DATE NOT NULL,
  "provider" text DEFAULT 'evolution'::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "enviadas" integer DEFAULT 0 NOT NULL,
  "entregues" integer DEFAULT 0 NOT NULL,
  "lidas" integer DEFAULT 0 NOT NULL,
  "falhas" integer DEFAULT 0 NOT NULL,
  "respostas" integer DEFAULT 0 NOT NULL,
  "rejeicoes_template" integer DEFAULT 0 NOT NULL,
  "pendentes" integer DEFAULT 0 NOT NULL,
  "pausadas" integer DEFAULT 0 NOT NULL,
  "taxa_erro" numeric(5,2) DEFAULT 0 NOT NULL,
  "taxa_resposta" numeric(5,2) DEFAULT 0 NOT NULL,
  "taxa_confirmacao" numeric(5,2) DEFAULT 0 NOT NULL,
  "status_conexao" text DEFAULT 'desconhecido'::text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_health_snapshots" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_health_snapshots" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_health_snapshots" TO "service_role";

ALTER TABLE public."whatsapp_health_snapshots" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_inbound_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "phone" text NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "paciente_nome" text DEFAULT ''::text NOT NULL,
  "agendamento_id" text DEFAULT ''::text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "intent" text DEFAULT 'livre'::text NOT NULL,
  "provider" text DEFAULT 'evolution'::text NOT NULL,
  "provider_message_id" text DEFAULT ''::text NOT NULL,
  "recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "processed" boolean DEFAULT false NOT NULL,
  "processed_at" timestamp with time zone,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_inbound_messages" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_inbound_messages" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_inbound_messages" TO "service_role";

ALTER TABLE public."whatsapp_inbound_messages" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "paciente_id" text DEFAULT ''::text NOT NULL,
  "paciente_nome" text DEFAULT ''::text NOT NULL,
  "telefone" text NOT NULL,
  "evento" text NOT NULL,
  "mensagem" text NOT NULL,
  "prioridade" text DEFAULT 'media'::text NOT NULL,
  "agendado_para" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "motivo_erro" text DEFAULT ''::text NOT NULL,
  "motivo_bloqueio" text DEFAULT ''::text NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "agendamento_id" text DEFAULT ''::text NOT NULL,
  "metadados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "processado_em" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provider" text DEFAULT 'evolution'::text NOT NULL,
  "category" text DEFAULT 'utility'::text,
  "template_id" uuid,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
  "provider_message_id" text DEFAULT ''::text NOT NULL,
  "error_code" text DEFAULT ''::text NOT NULL,
  "next_retry_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_queue" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_queue" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_queue" TO "service_role";

ALTER TABLE public."whatsapp_queue" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whatsapp_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "unidade_id" text DEFAULT ''::text NOT NULL,
  "tipo" text DEFAULT 'confirmacao'::text NOT NULL,
  "mensagem" text DEFAULT ''::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "nome_interno" text DEFAULT ''::text NOT NULL,
  "categoria" text DEFAULT 'utility'::text NOT NULL,
  "evento" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'rascunho'::text NOT NULL,
  "provider" text DEFAULT 'evolution'::text NOT NULL,
  "provider_template_id" text DEFAULT ''::text NOT NULL,
  "idioma" text DEFAULT 'pt_BR'::text NOT NULL,
  "variaveis_permitidas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "permite_envio_fora_24h" boolean DEFAULT false NOT NULL
);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_templates" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, UPDATE ON TABLE public."whatsapp_templates" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."whatsapp_templates" TO "service_role";

ALTER TABLE public."whatsapp_templates" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.align_treatment_session_to_agenda(p_session_id uuid, p_expected_date date, p_appointment_id text, p_expected_agenda_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; a public.agendamentos%ROWTYPE; c public.treatment_cycles%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
 SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
 PERFORM public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF s.appointment_id IS DISTINCT FROM p_appointment_id OR s.scheduled_date IS DISTINCT FROM p_expected_date OR p_expected_agenda_date IS NULL THEN
  RAISE EXCEPTION 'O vínculo mudou. Recarregue a sessão.' USING ERRCODE='40001';
 END IF;
 SELECT * INTO a FROM public.agendamentos WHERE id=p_appointment_id FOR UPDATE;
 IF NOT FOUND OR a.data IS DISTINCT FROM p_expected_agenda_date THEN
  RAISE EXCEPTION 'O agendamento mudou ou não foi encontrado. Recarregue os dados.' USING ERRCODE='40001';
 END IF;
 result:=public.update_agenda_treatment_appointment(a.id,jsonb_build_object('data',a.data),jsonb_build_object('data',a.data,'hora',a.hora,'profissional_id',a.profissional_id));
 RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."align_treatment_session_to_agenda"(p_session_id uuid, p_expected_date date, p_appointment_id text, p_expected_agenda_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."align_treatment_session_to_agenda"(p_session_id uuid, p_expected_date date, p_appointment_id text, p_expected_agenda_date date) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."align_treatment_session_to_agenda"(p_session_id uuid, p_expected_date date, p_appointment_id text, p_expected_agenda_date date) TO "service_role";

CREATE OR REPLACE FUNCTION public.apply_profession_careness_for_discharge(p_discharge_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_discharge record;
  v_profession text;
  v_key text;
  v_name text;
  v_rule public.profession_careness_rules%ROWTYPE;
  v_release date;
BEGIN
  SELECT d.id, d.patient_id, d.cycle_id, d.professional_id, d.discharge_date, d.tipo_alta,
         c.professional_id AS cycle_professional_id, c.unit_id
    INTO v_discharge
    FROM public.patient_discharges d
    JOIN public.treatment_cycles c ON c.id = d.cycle_id
   WHERE d.id = p_discharge_id;
  IF NOT FOUND OR v_discharge.tipo_alta <> 'conclusao' THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_conclusion');
  END IF;

  SELECT f.profissao INTO v_profession FROM public.funcionarios f
   WHERE f.id::text = v_discharge.cycle_professional_id;
  v_key := public.normalize_profession(coalesce(v_profession, ''));
  IF v_key IS NULL THEN RETURN jsonb_build_object('created', false, 'reason', 'profession_missing'); END IF;

  SELECT r.* INTO v_rule FROM public.profession_careness_rules r
   WHERE r.profession_key = v_key AND (r.enabled OR p_force);
  IF NOT FOUND THEN RETURN jsonb_build_object('created', false, 'reason', 'rule_disabled'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.treatment_cycles other_cycle
    JOIN public.funcionarios other_prof ON other_prof.id::text = other_cycle.professional_id
    WHERE other_cycle.patient_id = v_discharge.patient_id
      AND other_cycle.id <> v_discharge.cycle_id
      AND other_cycle.professional_id <> v_discharge.cycle_professional_id
      AND other_cycle.status IN ('em_andamento','ativo')
      AND public.normalize_profession(coalesce(other_prof.profissao,'')) = v_key
  ) THEN
    RETURN jsonb_build_object('created', false, 'reason', 'other_active_treatment');
  END IF;

  v_release := public.careness_release_date(v_discharge.discharge_date, v_rule.duration_value, v_rule.duration_unit);
  INSERT INTO public.patient_profession_careness (
    patient_id, profession_key, profession_name, discharge_id, source_professional_id,
    source_unit_id, discharge_date, release_date, scope
  ) VALUES (
    v_discharge.patient_id, v_key, v_rule.profession_name, p_discharge_id,
    v_discharge.cycle_professional_id, coalesce(v_discharge.unit_id,''),
    v_discharge.discharge_date, v_release, v_rule.scope
  ) ON CONFLICT (discharge_id) DO UPDATE SET
      profession_key=EXCLUDED.profession_key, profession_name=EXCLUDED.profession_name,
      source_professional_id=EXCLUDED.source_professional_id, source_unit_id=EXCLUDED.source_unit_id,
      discharge_date=EXCLUDED.discharge_date, release_date=EXCLUDED.release_date, scope=EXCLUDED.scope,
      released_at=NULL, release_reason=''
    WHERE p_force AND public.patient_profession_careness.released_at IS NOT NULL
      AND public.patient_profession_careness.release_reason='regra desativada';
  RETURN jsonb_build_object('created', EXISTS (SELECT 1 FROM public.patient_profession_careness pc
      WHERE pc.discharge_id=p_discharge_id AND pc.released_at IS NULL AND pc.annulled_at IS NULL),
    'profession', v_rule.profession_name, 'release_date', v_release, 'scope', v_rule.scope);
END;
$function$
;

REVOKE ALL ON FUNCTION public."apply_profession_careness_for_discharge"(p_discharge_id uuid, p_force boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."apply_profession_careness_for_discharge"(p_discharge_id uuid, p_force boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.assert_care_flow_actor(p_unit text, p_actor text, p_module text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND OR v_staff.id::text IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Usuário não autorizado para esta operação.' USING ERRCODE='42501';
  END IF;
  IF nullif(p_unit,'') IS NULL OR (v_staff.usuario IS DISTINCT FROM 'admin.sms' AND (nullif(v_staff.unidade_id,'') IS NULL OR v_staff.unidade_id IS DISTINCT FROM p_unit)) THEN
    RAISE EXCEPTION 'Operação fora da sua unidade.' USING ERRCODE='42501';
  END IF;
  v_role := lower(btrim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado.' USING ERRCODE='42501'; END IF;
  IF v_role <> 'master' THEN
    SELECT allowed INTO v_permission FROM (
      SELECT pu.can_execute AS allowed, 1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo=p_module AND pu.unidade_id=v_staff.unidade_id AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo=p_module AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(btrim(v_staff.role))) AND p.modulo=p_module AND p.unidade_id=v_staff.unidade_id AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(btrim(v_staff.role))) AND p.modulo=p_module AND p.unidade_id=''
    ) permissions ORDER BY rank LIMIT 1;
    -- Same defaults used by PermissionsContext when no override/profile row exists.
    IF NOT FOUND THEN
      v_permission := (p_module='agenda' AND v_role IN ('recepcao','gestao','profissional')) OR (p_module='triagem' AND v_role IN ('triagem','enfermagem','gestao'));
    END IF;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para executar esta ação.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN to_jsonb(v_staff) || jsonb_build_object('normalized_role',v_role);
END $function$
;

REVOKE ALL ON FUNCTION public."assert_care_flow_actor"(p_unit text, p_actor text, p_module text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."assert_care_flow_actor"(p_unit text, p_actor text, p_module text) TO "service_role";

CREATE OR REPLACE FUNCTION public.assert_treatment_cycle_integrity(p_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE issues text[];
BEGIN
  issues := public.treatment_cycle_integrity_issues(p_cycle_id);
  IF cardinality(issues) > 0 THEN RAISE EXCEPTION '%', array_to_string(issues, ' ') USING ERRCODE = '23514'; END IF;
END $function$
;

REVOKE ALL ON FUNCTION public."assert_treatment_cycle_integrity"(p_cycle_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."assert_treatment_cycle_integrity"(p_cycle_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."assert_treatment_cycle_integrity"(p_cycle_id uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.assert_treatment_write_scope(p_professional_id text, p_unit_id text, p_manage boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_staff record; v_role text; v_permission boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.nome, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.allowed INTO v_permission FROM (
      SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END AS allowed, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN pu.can_delete ELSE pu.can_execute END, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT CASE WHEN p_manage AND v_role <> 'profissional' THEN p.can_delete ELSE p.can_execute END, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND p_unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND p_professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_unit_id, '') IS NULL OR NOT EXISTS (SELECT 1 FROM public.funcionarios WHERE id::text = p_professional_id AND ativo IS TRUE) THEN
    RAISE EXCEPTION 'Profissional ou unidade inválida' USING ERRCODE = '23514';
  END IF;
  RETURN to_jsonb(v_staff);
END $function$
;

REVOKE ALL ON FUNCTION public."assert_treatment_write_scope"(p_professional_id text, p_unit_id text, p_manage boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."assert_treatment_write_scope"(p_professional_id text, p_unit_id text, p_manage boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."assert_treatment_write_scope"(p_professional_id text, p_unit_id text, p_manage boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN public.atualizar_status_falta(p_paciente_id, NULL);
END;
$function$
;

REVOKE ALL ON FUNCTION public."atualizar_status_falta"(p_paciente_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."atualizar_status_falta"(p_paciente_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."atualizar_status_falta"(p_paciente_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.atualizar_status_falta(p_paciente_id text, p_profissional_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_is_tfd boolean;
  v_ordem_judicial boolean;
  v_paciente_nome text;
  
  curr_prof RECORD;
  
  v_faltas_ag int := 0;
  v_faltas_sess int := 0;
  v_total int := 0;
  v_novo_status text;
  v_ultima_falta_ag date;
  v_ultima_falta_sess date;
  v_ultima_falta date;
  
  v_res jsonb := '[]'::jsonb;
BEGIN
  -- 1. Carregar configurações
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
    FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
  END IF;

  -- 2. Verificar isenção global do paciente
  SELECT nome, COALESCE(is_tfd, false), COALESCE(possui_ordem_judicial, false)
    INTO v_paciente_nome, v_is_tfd, v_ordem_judicial
    FROM public.pacientes WHERE id = p_paciente_id;
    
  IF v_paciente_nome IS NULL THEN
    RETURN jsonb_build_object('error','paciente_nao_encontrado');
  END IF;

  -- 3. Identificar profissionais afetados
  FOR curr_prof IN 
    SELECT DISTINCT prof_id FROM (
      SELECT profissional_id as prof_id FROM public.agendamentos WHERE paciente_id = p_paciente_id AND status = 'falta'
      UNION
      SELECT professional_id as prof_id FROM public.treatment_sessions WHERE patient_id = p_paciente_id AND status IN ('falta','paciente_faltou')
      UNION 
      SELECT p_profissional_id WHERE p_profissional_id IS NOT NULL
    ) t 
    WHERE prof_id IS NOT NULL 
      AND prof_id <> ''
      AND prof_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    -- Se p_profissional_id foi passado, ignora os outros no loop
    IF p_profissional_id IS NOT NULL AND curr_prof.prof_id <> p_profissional_id THEN
      CONTINUE;
    END IF;

    -- Contagem por profissional - Agenda
    SELECT COUNT(*), MAX(data::date) INTO v_faltas_ag, v_ultima_falta_ag
      FROM public.agendamentos
     WHERE paciente_id = p_paciente_id
       AND profissional_id = curr_prof.prof_id
       AND status = 'falta'
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    -- Contagem por profissional - Sessões
    SELECT COUNT(*), MAX(scheduled_date::date) INTO v_faltas_sess, v_ultima_falta_sess
      FROM public.treatment_sessions
     WHERE patient_id = p_paciente_id
       AND professional_id = curr_prof.prof_id
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada, false) = false;

    v_total := COALESCE(v_faltas_ag, 0) + COALESCE(v_faltas_sess, 0);
    v_ultima_falta := GREATEST(v_ultima_falta_ag, v_ultima_falta_sess);

    -- Lógica de status (respeita isenção global)
    IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
    ELSIF v_total >= v_limite_bloqueio THEN
      v_novo_status := 'BLOQUEADO';
    ELSIF v_total >= v_limite_alerta THEN
      v_novo_status := 'FALTOSO';
    ELSE
      v_novo_status := 'REGULAR';
    END IF;

    -- Upsert na tabela de status por profissional com cast explícito para uuid
    INSERT INTO public.paciente_profissional_status (
      paciente_id, profissional_id, total_faltas, status_falta, ultima_falta, updated_at
    ) VALUES (
      p_paciente_id, curr_prof.prof_id::uuid, v_total, v_novo_status, v_ultima_falta, now()
    ) ON CONFLICT (paciente_id, profissional_id) DO UPDATE SET
      total_faltas = EXCLUDED.total_faltas,
      status_falta = EXCLUDED.status_falta,
      ultima_falta = EXCLUDED.ultima_falta,
      updated_at = now();

    v_res := v_res || jsonb_build_object(
      'profissional_id', curr_prof.prof_id,
      'total', v_total,
      'status', v_novo_status
    );
  END LOOP;

  -- 4. Atualizar também o status global no cadastro do paciente
  IF v_is_tfd OR v_ordem_judicial THEN
      v_novo_status := 'REGULAR';
  ELSE
      SELECT COALESCE(MAX(CASE 
          WHEN status_falta = 'BLOQUEADO' THEN 3 
          WHEN status_falta = 'FALTOSO' THEN 2 
          ELSE 1 END), 1) INTO v_total
      FROM public.paciente_profissional_status
      WHERE paciente_id = p_paciente_id;
      
      v_novo_status := CASE WHEN v_total = 3 THEN 'BLOQUEADO' WHEN v_total = 2 THEN 'FALTOSO' ELSE 'REGULAR' END;
  END IF;

  UPDATE public.pacientes 
     SET status_falta = v_novo_status,
         total_faltas = (SELECT COALESCE(SUM(total_faltas), 0) FROM public.paciente_profissional_status WHERE paciente_id = p_paciente_id)
   WHERE id = p_paciente_id;

  RETURN jsonb_build_object('ok', true, 'vinculos', v_res, 'status_global', v_novo_status);
END;
$function$
;

REVOKE ALL ON FUNCTION public."atualizar_status_falta"(p_paciente_id text, p_profissional_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."atualizar_status_falta"(p_paciente_id text, p_profissional_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."atualizar_status_falta"(p_paciente_id text, p_profissional_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.auto_fix_invalid_treatment_sessions_batch(p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_can_view boolean;
  v_candidate record;
  v_session record;
  v_cycle record;
  v_appointment record;
  v_last_id uuid;
  v_count integer := 0;
  v_more boolean := false;
  v_invalid boolean;
  v_rows integer;
  v_status text;
  v_reason text;
  v_error_code text;
  v_results jsonb := '[]'::jsonb;
  v_note constant text :=
    'Cancelado automaticamente: data inválida (feriado/fim de semana/bloqueio)';
BEGIN
  IF auth.uid() IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Autoajuste não autorizado ou lote inválido'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não autorizado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem'
    ELSE v_role
  END;

  -- The page allows master without a permission row. Everyone else must have
  -- an explicit effective can_view=true. Missing/NULL/error never grants access.
  IF v_role <> 'master' THEN
    SELECT ranked.can_view INTO v_can_view
      FROM (
        SELECT pu.can_view, 1 AS rank
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
           AND pu.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT pu.can_view, 2
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
           AND pu.unidade_id = ''
        UNION ALL
        SELECT p.can_view, 3
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT p.can_view, 4
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento' AND p.unidade_id = ''
      ) ranked
     ORDER BY ranked.rank
     LIMIT 1;
    IF v_can_view IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para Gestão de Tratamentos'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Keyset pagination skips already pending/unlinked sessions. The predicate
  -- matches isWeekend/buildBlockedRanges: whole civil days, inclusive dates,
  -- global OR unit-only OR professional-specific (regardless of unit).
  FOR v_candidate IN
    SELECT s.id, s.cycle_id, s.patient_id, s.professional_id,
           s.status, s.scheduled_date, s.appointment_id, c.unit_id
      FROM public.treatment_sessions s
      JOIN public.treatment_cycles c ON c.id = s.cycle_id
     WHERE (p_after IS NULL OR s.id > p_after)
       AND s.status IN ('agendada', 'pendente_agendamento')
       AND s.appointment_id IS NOT NULL
       AND (v_staff.usuario = 'admin.sms' OR
            (nullif(v_staff.unidade_id, '') IS NOT NULL
             AND c.unit_id = v_staff.unidade_id))
       AND (v_role <> 'profissional' OR c.professional_id = v_staff.id::text)
       AND (
         extract(isodow FROM s.scheduled_date) IN (6, 7)
         OR EXISTS (
           SELECT 1 FROM public.bloqueios b
            WHERE b.data_inicio <= s.scheduled_date
              AND b.data_fim >= s.scheduled_date
              AND (
                (coalesce(b.profissional_id, '') = ''
                 AND coalesce(b.unidade_id, '') = '')
                OR (coalesce(b.profissional_id, '') = ''
                    AND b.unidade_id = c.unit_id)
                OR b.profissional_id = s.professional_id
              )
              AND (b.dia_inteiro IS TRUE OR nullif(b.hora_inicio, '') IS NULL)
         )
       )
     ORDER BY s.id
     LIMIT p_limit + 1
  LOOP
    IF v_count = p_limit THEN
      v_more := true;
      EXIT;
    END IF;
    v_count := v_count + 1;
    v_last_id := v_candidate.id;
    v_status := 'falha';
    v_reason := 'alterado_concorrentemente';

    -- An EXCEPTION block is a subtransaction. If either UPDATE fails,
    -- changes to both records for this item are rolled back.
    BEGIN
      SELECT s.id, s.cycle_id, s.patient_id, s.professional_id,
             s.status, s.scheduled_date, s.appointment_id
        INTO v_session
        FROM public.treatment_sessions s
       WHERE s.id = v_candidate.id
       FOR UPDATE;

      IF NOT FOUND THEN
        v_reason := 'sessao_ausente';
      ELSIF v_session.status = 'pendente_agendamento'
            AND v_session.appointment_id IS NULL THEN
        v_status := 'ja_pendente';
        v_reason := NULL;
      ELSIF v_session.status NOT IN ('agendada', 'pendente_agendamento') THEN
        v_status := 'estado_protegido';
        v_reason := NULL;
      ELSIF v_session.cycle_id IS DISTINCT FROM v_candidate.cycle_id
         OR v_session.status IS DISTINCT FROM v_candidate.status
         OR v_session.scheduled_date IS DISTINCT FROM v_candidate.scheduled_date
         OR v_session.appointment_id IS DISTINCT FROM v_candidate.appointment_id
         OR v_session.patient_id IS DISTINCT FROM v_candidate.patient_id
         OR v_session.professional_id IS DISTINCT FROM v_candidate.professional_id THEN
        v_reason := 'alterado_concorrentemente';
      ELSE
        SELECT c.id, c.patient_id, c.professional_id, c.unit_id
          INTO v_cycle
          FROM public.treatment_cycles c
         WHERE c.id = v_session.cycle_id
         FOR UPDATE;

        IF NOT FOUND THEN
          v_status := 'vinculo_inconsistente';
          v_reason := NULL;
        ELSIF v_cycle.patient_id IS DISTINCT FROM v_session.patient_id
           OR v_cycle.professional_id IS DISTINCT FROM v_session.professional_id
           OR v_cycle.unit_id IS DISTINCT FROM v_candidate.unit_id THEN
          v_status := 'vinculo_inconsistente';
          v_reason := NULL;
        ELSIF (v_staff.usuario <> 'admin.sms' AND
               (nullif(v_staff.unidade_id, '') IS NULL
                OR v_cycle.unit_id <> v_staff.unidade_id))
           OR (v_role = 'profissional'
               AND v_cycle.professional_id <> v_staff.id::text) THEN
          v_reason := 'escopo_alterado';
        ELSE
          SELECT (
            extract(isodow FROM v_session.scheduled_date) IN (6, 7)
            OR EXISTS (
              SELECT 1 FROM public.bloqueios b
               WHERE b.data_inicio <= v_session.scheduled_date
                 AND b.data_fim >= v_session.scheduled_date
                 AND (
                   (coalesce(b.profissional_id, '') = ''
                    AND coalesce(b.unidade_id, '') = '')
                   OR (coalesce(b.profissional_id, '') = ''
                       AND b.unidade_id = v_cycle.unit_id)
                   OR b.profissional_id = v_session.professional_id
                 )
                 AND (b.dia_inteiro IS TRUE OR nullif(b.hora_inicio, '') IS NULL)
            )
          ) INTO v_invalid;

          IF NOT v_invalid THEN
            v_status := 'data_valida';
            v_reason := NULL;
          ELSE
            SELECT a.id, a.paciente_id, a.profissional_id,
                   a.unidade_id, a.data, a.status
              INTO v_appointment
              FROM public.agendamentos a
             WHERE a.id = v_session.appointment_id
             FOR UPDATE;

            IF NOT FOUND THEN
              v_status := 'vinculo_inconsistente';
              v_reason := NULL;
            ELSIF v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
               OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
               OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
               OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
              v_status := 'vinculo_inconsistente';
              v_reason := NULL;
            ELSIF v_appointment.status <> 'confirmado' THEN
              v_status := 'estado_protegido';
              v_reason := NULL;
            ELSE
              UPDATE public.treatment_sessions s
                 SET status = 'pendente_agendamento', appointment_id = NULL
               WHERE s.id = v_session.id
                 AND s.cycle_id = v_session.cycle_id
                 AND s.status = v_session.status
                 AND s.scheduled_date = v_session.scheduled_date
                 AND s.appointment_id = v_session.appointment_id;
              GET DIAGNOSTICS v_rows = ROW_COUNT;
              IF v_rows <> 1 THEN
                RAISE EXCEPTION 'Sessão alterada durante o autoajuste';
              END IF;

              UPDATE public.agendamentos a
                 SET status = 'cancelado',
                     observacoes = CASE
                       WHEN position(v_note IN a.observacoes) > 0
                         THEN a.observacoes
                       WHEN a.observacoes = '' THEN v_note
                       ELSE a.observacoes || E'\n' || v_note
                     END
               WHERE a.id = v_appointment.id
                 AND a.status = 'confirmado'
                 AND a.paciente_id = v_session.patient_id
                 AND a.profissional_id = v_session.professional_id
                 AND a.unidade_id = v_cycle.unit_id
                 AND a.data = v_session.scheduled_date;
              GET DIAGNOSTICS v_rows = ROW_COUNT;
              IF v_rows <> 1 THEN
                RAISE EXCEPTION 'Agendamento alterado durante o autoajuste';
              END IF;
              v_status := 'corrigido';
              v_reason := NULL;
            END IF;
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE;
      v_status := 'falha';
      v_reason := 'sqlstate_' || v_error_code;
    END;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'session_id', v_candidate.id,
        'status', v_status,
        'reason', v_reason
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'results', v_results,
    'next_cursor', v_last_id,
    'has_more', v_more
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public."auto_fix_invalid_treatment_sessions_batch"(p_after uuid, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."auto_fix_invalid_treatment_sessions_batch"(p_after uuid, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."auto_fix_invalid_treatment_sessions_batch"(p_after uuid, p_limit integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.bpa_profissionais_com_atendimento(p_start date, p_end date, p_unidade_id text DEFAULT NULL::text)
 RETURNS TABLE(profissional_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT x.profissional_id FROM (
    SELECT pr.profissional_id
    FROM public.prontuarios pr
    WHERE pr.data_atendimento >= p_start
      AND pr.data_atendimento <= p_end
      AND pr.status = 'finalizado'
      AND pr.profissional_id IS NOT NULL
      AND (p_unidade_id IS NULL OR pr.unidade_id = p_unidade_id)

    UNION

    SELECT tr.tecnico_id AS profissional_id
    FROM public.triage_records tr
    LEFT JOIN public.agendamentos ag ON ag.id = tr.agendamento_id
    WHERE tr.criado_em >= p_start::timestamptz
      AND tr.criado_em < (p_end + 1)::timestamptz
      AND tr.tecnico_id IS NOT NULL
      AND (p_unidade_id IS NULL OR ag.unidade_id = p_unidade_id)

    UNION

    SELECT a.profissional_id
    FROM public.agendamentos a
    WHERE a.data >= p_start
      AND a.data <= p_end
      AND a.profissional_id IS NOT NULL
      AND a.status IN (
        'concluido','confirmado_chegada','aguardando_atendimento',
        'em_atendimento','falta','paciente_faltou'
      )
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ) x
  WHERE x.profissional_id IS NOT NULL;
$function$
;

REVOKE ALL ON FUNCTION public."bpa_profissionais_com_atendimento"(p_start date, p_end date, p_unidade_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."bpa_profissionais_com_atendimento"(p_start date, p_end date, p_unidade_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."bpa_profissionais_com_atendimento"(p_start date, p_end date, p_unidade_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.cancel_external_appointment(p_agendamento_id text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user public.profissionais_externos%ROWTYPE;
  v_staff public.funcionarios%ROWTYPE;
  v_appt public.agendamentos%ROWTYPE;
  v_aux public.agendamentos_externos%ROWTYPE;
  v_quota public.quotas_externas%ROWTYPE;
  v_uuid uuid;
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_profile text;
  v_authorized boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  SELECT * INTO v_user FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid() AND ativo = true;
  SELECT * INTO v_staff FROM public.funcionarios
    WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1;
  SELECT * INTO v_appt FROM public.agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND OR v_appt.origem <> 'externo' THEN
    RAISE EXCEPTION 'Agendamento externo não encontrado';
  END IF;
  IF v_user.id IS NOT NULL AND v_appt.agendado_por_externo = v_user.id::text THEN
    v_actor_id := v_user.id::text;
    v_actor_name := v_user.nome;
    v_actor_role := 'externo';
    v_authorized := true;
  ELSIF v_staff.id IS NOT NULL THEN
    v_profile := CASE lower(btrim(v_staff.role))
      WHEN 'coordenador' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
      WHEN 'gestor' THEN 'gestao' WHEN 'gestão' THEN 'gestao'
      WHEN 'recepção' THEN 'recepcao' ELSE lower(btrim(v_staff.role)) END;
    IF v_profile = 'master' THEN
      v_authorized := true;
    ELSIF v_staff.unidade_id = v_appt.unidade_id THEN
      SELECT coalesce(
        (SELECT pu.can_edit FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'agenda'
           AND pu.unidade_id IN ('', v_appt.unidade_id)
         ORDER BY (pu.unidade_id = v_appt.unidade_id) DESC LIMIT 1),
        (SELECT p.can_edit FROM public.permissoes p
         WHERE p.perfil IN (v_profile, lower(btrim(v_staff.role))) AND p.modulo = 'agenda'
           AND p.unidade_id IN ('', v_appt.unidade_id)
         ORDER BY (p.unidade_id = v_appt.unidade_id) DESC,
                  (p.perfil = v_profile) DESC LIMIT 1), false)
      INTO v_authorized;
    END IF;
    v_actor_id := v_staff.id::text;
    v_actor_name := v_staff.nome;
    v_actor_role := v_staff.role;
  END IF;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este agendamento externo nesta unidade';
  END IF;
  IF p_agendamento_id !~ '^ag_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Vínculo externo inválido; solicite revisão ao Master';
  END IF;
  v_uuid := substring(p_agendamento_id FROM 4)::uuid;
  SELECT * INTO v_aux FROM public.agendamentos_externos WHERE id = v_uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo externo ausente; solicite revisão ao Master'; END IF;
  IF v_aux.profissional_externo_id::text IS DISTINCT FROM v_appt.agendado_por_externo
     OR v_aux.profissional_externo_id::text IS DISTINCT FROM v_appt.criado_por
     OR v_aux.paciente_id IS DISTINCT FROM v_appt.paciente_id
     OR v_aux.profissional_interno_id::text IS DISTINCT FROM v_appt.profissional_id
     OR v_aux.unidade_id IS DISTINCT FROM v_appt.unidade_id
     OR v_aux.data IS DISTINCT FROM v_appt.data
     OR v_aux.horario IS DISTINCT FROM v_appt.hora::time THEN
    RAISE EXCEPTION 'Vínculo externo divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status = 'cancelado' AND v_aux.status = 'cancelado' THEN
    RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', true);
  END IF;
  SELECT * INTO v_quota FROM public.quotas_externas WHERE id = v_aux.cota_id FOR UPDATE;
  IF NOT FOUND OR v_quota.profissional_externo_id IS DISTINCT FROM v_aux.profissional_externo_id OR
     v_quota.profissional_interno_id IS DISTINCT FROM v_aux.profissional_interno_id OR
     v_quota.unidade_id IS DISTINCT FROM v_aux.unidade_id THEN
    RAISE EXCEPTION 'Cota vinculada divergente; solicite revisão ao Master';
  END IF;
  IF v_appt.status NOT IN ('pendente', 'confirmado', 'confirmado_chegada')
     OR v_aux.status = 'cancelado' THEN
    RAISE EXCEPTION 'Estado incompatível com cancelamento; solicite revisão ao Master';
  END IF;
  IF v_quota.vagas_usadas <= 0 THEN RAISE EXCEPTION 'Contador da cota divergente; solicite revisão ao Master'; END IF;
  PERFORM set_config('app.external_booking_rpc', 'cancel', true);
  UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_appt.id;
  UPDATE public.agendamentos_externos SET status = 'cancelado' WHERE id = v_aux.id;
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas - 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, before, after, detalhes)
  VALUES (v_actor_id, v_actor_name, v_actor_role, v_quota.unidade_id,
    'cancelar_agendamento_externo', 'agendamento', v_appt.id, 'agenda', v_appt.id,
    v_appt.paciente_id, v_appt.profissional_id,
    jsonb_build_object('status', v_appt.status, 'vagas_usadas', v_quota.vagas_usadas),
    jsonb_build_object('status', 'cancelado', 'vagas_usadas', v_quota.vagas_usadas - 1),
    jsonb_build_object('cota_id', v_quota.id, 'profissional_externo_id', v_aux.profissional_externo_id,
      'motivo_alteracao', btrim(p_motivo)));
  RETURN jsonb_build_object('id', v_appt.id, 'already_cancelled', false);
END;
$function$
;

REVOKE ALL ON FUNCTION public."cancel_external_appointment"(p_agendamento_id text, p_motivo text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."cancel_external_appointment"(p_agendamento_id text, p_motivo text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."cancel_external_appointment"(p_agendamento_id text, p_motivo text) TO "service_role";

CREATE OR REPLACE FUNCTION public.capture_treatment_plan_baseline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE contexts jsonb; baseline jsonb; ids jsonb; fingerprint text; n integer;
BEGIN
  IF NEW.total_sessions IS NOT DISTINCT FROM OLD.total_sessions THEN RETURN NEW; END IF;
  contexts := coalesce(nullif(current_setting('app.treatment_plan_baselines', true), ''), '{}')::jsonb;
  -- The first state in this transaction is authoritative, including repeated extensions.
  IF contexts ? OLD.id::text THEN RETURN NEW; END IF;
  SELECT count(*), coalesce(jsonb_agg(s.id ORDER BY s.id), '[]'::jsonb),
    md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)::text)
    INTO n, ids, fingerprint FROM public.treatment_sessions s WHERE s.cycle_id = OLD.id;
  baseline := jsonb_build_object('total', OLD.total_sessions, 'count', n, 'ids', ids,
    'fingerprint', fingerprint, 'legacy', cardinality(public.treatment_cycle_integrity_issues(OLD.id)) > 0);
  PERFORM set_config('app.treatment_plan_baselines', (contexts || jsonb_build_object(OLD.id::text, baseline))::text, true);
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."capture_treatment_plan_baseline"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."capture_treatment_plan_baseline"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."capture_treatment_plan_baseline"() TO "service_role";

CREATE OR REPLACE FUNCTION public.careness_release_date(p_date date, p_value integer, p_unit text)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_unit = 'months'
    THEN (p_date + make_interval(months => p_value))::date
    ELSE p_date + p_value END
$function$
;

REVOKE ALL ON FUNCTION public."careness_release_date"(p_date date, p_value integer, p_unit text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."careness_release_date"(p_date date, p_value integer, p_unit text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."careness_release_date"(p_date date, p_value integer, p_unit text) TO "anon";

GRANT EXECUTE ON FUNCTION public."careness_release_date"(p_date date, p_value integer, p_unit text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."careness_release_date"(p_date date, p_value integer, p_unit text) TO "service_role";

CREATE OR REPLACE FUNCTION public.check_internal_slot_availability(p_profissional_id text, p_unidade_id text, p_data date, p_hora text, p_exclude_agendamento_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slot public.disponibilidades%ROWTYPE;
  v_hora time;
  v_total integer;
  v_internal integer;
  v_external integer;
  v_hour_count integer;
  v_reservation_requested integer := 0;
  v_reservation integer := 0;
  v_availability_count integer;
  v_matching_count integer;
  v_capacity integer;
  v_duration integer;
  v_off_grid boolean := false;
BEGIN
  IF p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_hour');
  END IF;
  v_hora := p_hora::time;
  IF public.is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b
    WHERE p_data BETWEEN b.data_inicio AND b.data_fim
      AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
        OR (b.unidade_id = p_unidade_id AND coalesce(b.profissional_id, '') = '')
        OR b.profissional_id = p_profissional_id)
      AND (b.dia_inteiro = true OR coalesce(b.hora_inicio, '') = ''
        OR (v_hora >= b.hora_inicio::time AND
            v_hora < coalesce(nullif(b.hora_fim, ''), '23:59')::time))) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

  SELECT count(*) INTO v_matching_count FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana)
    AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time;
  IF v_matching_count <> 1 THEN
    RETURN jsonb_build_object('available', true, 'reason', 'manual_time', 'manual_time', true);
  END IF;

  SELECT d.* INTO v_slot FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana)
    AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time
  ORDER BY d.id LIMIT 1;

  IF v_slot.vagas_por_hora > 0 THEN
    v_duration := coalesce(nullif(v_slot.duracao_consulta, 0), 30);
    IF mod(extract(epoch FROM (v_hora - v_slot.hora_inicio::time))::numeric,
           (v_duration * 60)::numeric) <> 0
       OR extract(epoch FROM (v_slot.hora_fim::time - v_hora)) < v_duration * 60 THEN
      v_off_grid := true;
    END IF;
  END IF;

  SELECT count(*) INTO v_availability_count FROM public.disponibilidades d
  WHERE d.profissional_id = p_profissional_id AND d.unidade_id = p_unidade_id
    AND p_data BETWEEN d.data_inicio AND d.data_fim
    AND extract(dow FROM p_data)::integer = ANY(d.dias_semana);

  SELECT coalesce(sum(q.vagas_total), 0)::integer INTO v_reservation_requested
  FROM public.quotas_externas q
  WHERE q.ativo = true AND q.profissional_interno_id::text = p_profissional_id
    AND q.unidade_id = p_unidade_id
    AND q.periodo_inicio = p_data AND q.periodo_fim = p_data
    AND q.vagas_total > 0 AND q.vagas_usadas BETWEEN 0 AND q.vagas_total
    AND q.turno IN ('manha', 'tarde', 'noite', 'integral', 'personalizado')
    AND (q.dia_semana IS NULL OR q.dia_semana = extract(dow FROM p_data)::integer)
    AND ((q.turno = 'integral' AND v_availability_count = 1)
      OR (q.turno <> 'integral' AND q.horario_inicio IS NOT NULL AND q.horario_fim IS NOT NULL
        AND q.horario_inicio::time = v_slot.hora_inicio::time
        AND q.horario_fim::time = v_slot.hora_fim::time));

  v_capacity := greatest(0, v_slot.vagas_por_dia);
  v_reservation := least(v_capacity, v_reservation_requested);
  SELECT count(*) FILTER (WHERE a.origem = 'externo'),
         count(*) FILTER (WHERE a.origem IS DISTINCT FROM 'externo')
    INTO v_external, v_internal
  FROM public.agendamentos a
  WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
    AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
    AND a.id IS DISTINCT FROM p_exclude_agendamento_id
    AND (v_slot.vagas_por_hora > 0 OR
      (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
  v_total := v_external + v_internal;

  -- Capacidade esgotada nao bloqueia mais a equipe interna: retorna disponivel
  -- com aviso de excesso para a tela pedir confirmacao de encaixe.
  IF v_total >= v_capacity THEN
    RETURN jsonb_build_object('available', true, 'capacity_exceeded', true,
      'reason', CASE WHEN v_slot.vagas_por_hora = 0 THEN 'turno_full' ELSE 'day_full' END,
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_internal >= greatest(0, v_capacity - v_reservation) THEN
    RETURN jsonb_build_object('available', true, 'capacity_exceeded', true, 'reason', 'external_reservation',
      'capacity', v_capacity, 'internal', v_internal, 'external', v_external,
      'external_reservation', v_reservation, 'external_reservation_remaining', greatest(0, v_reservation - v_external),
      'reservation_conflict', v_reservation_requested > v_capacity);
  END IF;
  IF v_slot.vagas_por_hora > 0 AND NOT v_off_grid THEN
    SELECT count(*) INTO v_hour_count FROM public.agendamentos a
    WHERE a.profissional_id = p_profissional_id AND a.unidade_id = p_unidade_id
      AND a.data = p_data AND a.status NOT IN ('cancelado', 'falta')
      AND a.id IS DISTINCT FROM p_exclude_agendamento_id
      AND left(a.hora, 3) = left(p_hora, 3);
    IF v_hour_count >= v_slot.vagas_por_hora THEN
      RETURN jsonb_build_object('available', true, 'capacity_exceeded', true, 'reason', 'hour_full',
        'capacity', v_capacity, 'internal', v_internal, 'external', v_external);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', true, 'capacity', v_capacity,
    'internal', v_internal, 'external', v_external, 'external_reservation', v_reservation,
    'internal_available', greatest(0, v_capacity - v_reservation - v_internal),
    'total_available', greatest(0, v_capacity - v_total),
    'manual_time', v_off_grid,
    'reservation_conflict', v_reservation_requested > v_capacity);
END;
$function$
;

REVOKE ALL ON FUNCTION public."check_internal_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text, p_exclude_agendamento_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."check_internal_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text, p_exclude_agendamento_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."check_internal_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text, p_exclude_agendamento_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.check_patient_profession_careness(p_patient_id text, p_professional_id text, p_unit_id text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_key text; v_name text; v_until date; v_scope text;
BEGIN
  -- This RPC is used by staff scheduling and the trusted public-scheduling
  -- Edge Function (service_role). Do not allow arbitrary authenticated clients
  -- to probe another patient's discharge information.
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_staff_member() THEN
    RAISE EXCEPTION 'Acesso não autorizado à verificação de carência' USING ERRCODE = '42501';
  END IF;

  IF NOT public.profession_careness_mapping_is_current() THEN
    RETURN jsonb_build_object('blocked', false, 'reason', 'mapping_confirmation_required');
  END IF;

  SELECT public.normalize_profession(coalesce(f.profissao,'')) INTO v_key
    FROM public.funcionarios f WHERE f.id::text = p_professional_id AND f.ativo IS TRUE;
  IF v_key IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  SELECT c.profession_name, c.release_date, c.scope
    INTO v_name, v_until, v_scope
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key = c.profession_key AND r.enabled IS TRUE
   WHERE c.patient_id = p_patient_id AND c.profession_key = v_key
     AND c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date > current_date
     AND (c.scope = 'global' OR c.source_unit_id = coalesce(p_unit_id,''))
   ORDER BY c.release_date DESC LIMIT 1;
  IF v_until IS NULL THEN RETURN jsonb_build_object('blocked', false); END IF;
  RETURN jsonb_build_object('blocked', true, 'profession', v_name, 'release_date', v_until, 'scope', v_scope,
    'message', format('Paciente em carência para %s até %s.', v_name, to_char(v_until,'DD/MM/YYYY')));
END;
$function$
;

REVOKE ALL ON FUNCTION public."check_patient_profession_careness"(p_patient_id text, p_professional_id text, p_unit_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."check_patient_profession_careness"(p_patient_id text, p_professional_id text, p_unit_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."check_patient_profession_careness"(p_patient_id text, p_professional_id text, p_unit_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.check_slot_availability(p_profissional_id text, p_unidade_id text, p_data date, p_hora text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vagas_por_hora integer;
  v_vagas_por_dia integer;
  v_current_hour_count integer;
  v_current_day_count integer;
  v_hora_prefix text;
  v_turno_total integer;
  v_turno_count integer;
  v_turno_start text;
  v_turno_end text;
BEGIN
  -- Check if date is blocked
  IF is_date_blocked(p_data, p_profissional_id, p_unidade_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'date_blocked');
  END IF;

  -- First check for turno-mode records (vagas_por_hora = 0)
  SELECT hora_inicio, hora_fim, vagas_por_dia
  INTO v_turno_start, v_turno_end, v_turno_total
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora = 0
    AND p_hora >= hora_inicio
    AND p_hora < hora_fim
  LIMIT 1;

  IF v_turno_total IS NOT NULL THEN
    -- Turno mode: count appointments in this turno range
    SELECT COUNT(*) INTO v_turno_count
    FROM agendamentos
    WHERE profissional_id = p_profissional_id
      AND unidade_id = p_unidade_id
      AND data = p_data
      AND hora >= v_turno_start
      AND hora < v_turno_end
      AND status NOT IN ('cancelado', 'falta');

    IF v_turno_count >= v_turno_total THEN
      RETURN jsonb_build_object('available', false, 'reason', 'turno_full',
        'turno_start', v_turno_start, 'turno_end', v_turno_end,
        'turno_count', v_turno_count, 'turno_total', v_turno_total);
    END IF;

    RETURN jsonb_build_object('available', true, 'mode', 'turno',
      'turno_count', v_turno_count, 'turno_total', v_turno_total);
  END IF;

  -- Standard per-hour mode
  SELECT vagas_por_hora, vagas_por_dia 
  INTO v_vagas_por_hora, v_vagas_por_dia
  FROM disponibilidades
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND p_data >= data_inicio
    AND p_data <= data_fim
    AND EXTRACT(DOW FROM p_data)::int = ANY(dias_semana)
    AND vagas_por_hora > 0
  LIMIT 1;

  IF v_vagas_por_hora IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no_availability');
  END IF;

  SELECT COUNT(*) INTO v_current_day_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_day_count >= v_vagas_por_dia THEN
    RETURN jsonb_build_object('available', false, 'reason', 'day_full');
  END IF;

  v_hora_prefix := LEFT(p_hora, 3);
  SELECT COUNT(*) INTO v_current_hour_count
  FROM agendamentos
  WHERE profissional_id = p_profissional_id
    AND unidade_id = p_unidade_id
    AND data = p_data
    AND hora LIKE v_hora_prefix || '%'
    AND status NOT IN ('cancelado', 'falta');

  IF v_current_hour_count >= v_vagas_por_hora THEN
    RETURN jsonb_build_object('available', false, 'reason', 'hour_full');
  END IF;

  RETURN jsonb_build_object('available', true, 'day_count', v_current_day_count, 'hour_count', v_current_hour_count);
END;
$function$
;

REVOKE ALL ON FUNCTION public."check_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."check_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."check_slot_availability"(p_profissional_id text, p_unidade_id text, p_data date, p_hora text) TO "service_role";

CREATE OR REPLACE FUNCTION public.clear_duplicate_treatment_session_date(p_session_id uuid, p_expected_date date, p_reason text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; kept public.treatment_sessions%ROWTYPE; actor jsonb; message text;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Confirme a regularização e informe motivo_alteracao.' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,true);
  IF s.scheduled_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'A sessão mudou. Recarregue.' USING ERRCODE='40001'; END IF;
  IF s.status<>'pendente_agendamento' OR s.appointment_id IS NOT NULL OR c.status<>'em_andamento' OR s.scheduled_date IS NULL THEN RAISE EXCEPTION 'Somente sessão pendente, sem agendamento próprio e com data pode ser regularizada.' USING ERRCODE='23514'; END IF;
  SELECT other.* INTO kept FROM public.treatment_sessions other JOIN public.agendamentos a ON a.id=other.appointment_id
    WHERE other.cycle_id=c.id AND other.id<>s.id AND other.scheduled_date=s.scheduled_date
      AND other.status NOT IN ('cancelada','remarcada') AND a.status NOT IN ('cancelado','falta','remarcado')
      AND a.paciente_id=c.patient_id AND a.profissional_id=c.professional_id AND a.unidade_id=c.unit_id AND a.data=other.scheduled_date
    ORDER BY other.session_number LIMIT 1;
  IF NOT FOUND THEN
    -- Nenhuma sessão da data tem agendamento: a de menor número mantém a data; só as de número maior podem ser liberadas.
    IF EXISTS (SELECT 1 FROM public.treatment_sessions o WHERE o.cycle_id=c.id AND o.id<>s.id AND o.scheduled_date=s.scheduled_date AND o.status NOT IN ('cancelada','remarcada') AND o.appointment_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Há vínculo de agendamento a conferir nesta data antes de regularizar.' USING ERRCODE='23514';
    END IF;
    SELECT o.* INTO kept FROM public.treatment_sessions o
      WHERE o.cycle_id=c.id AND o.id<>s.id AND o.scheduled_date=s.scheduled_date AND o.status NOT IN ('cancelada','remarcada') AND o.session_number<s.session_number
      ORDER BY o.session_number LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esta é a sessão que mantém a data. Libere a outra sessão duplicada.' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  UPDATE public.treatment_sessions SET scheduled_date=NULL,status='pendente_agendamento' WHERE id=s.id;
  message:=format('Data duplicada removida da sessão nº %s. O dia %s permanece com a sessão nº %s. Esta sessão aguarda uma nova data.',s.session_number,to_char(s.scheduled_date,'DD/MM/YYYY'),kept.session_number);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'retirar_data_duplicada','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
      jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'estado_anterior',s.status,'estado_novo','pendente_agendamento','valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',NULL,'status','pendente_agendamento','appointment_id',NULL),'sessao_protegida',kept.id,'agendamento_protegido',kept.appointment_id,'mensagem',message));
  RETURN jsonb_build_object('message',message,'session_id',s.id,'protected_session_id',kept.id);
END $function$
;

REVOKE ALL ON FUNCTION public."clear_duplicate_treatment_session_date"(p_session_id uuid, p_expected_date date, p_reason text, p_confirmed boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."clear_duplicate_treatment_session_date"(p_session_id uuid, p_expected_date date, p_reason text, p_confirmed boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."clear_duplicate_treatment_session_date"(p_session_id uuid, p_expected_date date, p_reason text, p_confirmed boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.concluir_atendimento_master(p_agendamento_id text, p_user_id text, p_user_nome text, p_hora_termino text, p_procedimento text, p_cid text, p_obs text DEFAULT NULL::text, p_is_master boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prof_id text;
  v_prof_nome text;
  v_paciente_id text;
  v_paciente_nome text;
  v_status text;
  v_unidade text;
  v_iniciado_em timestamptz;
BEGIN
  SELECT profissional_id, profissional_nome, paciente_id, paciente_nome, status, unidade_id, iniciado_em
    INTO v_prof_id, v_prof_nome, v_paciente_id, v_paciente_nome, v_status, v_unidade, v_iniciado_em
    FROM public.agendamentos WHERE id = p_agendamento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agendamento_nao_encontrado';
  END IF;
  IF v_status = 'concluido' THEN
    RAISE EXCEPTION 'ja_concluido';
  END IF;
  IF NOT p_is_master AND v_prof_id <> p_user_id THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  UPDATE public.agendamentos
     SET status = 'concluido',
         concluido_em = now(),
         concluido_por_id = p_user_id,
         concluido_por_nome = p_user_nome,
         concluido_por_master = p_is_master AND (v_prof_id <> p_user_id),
         procedimento_concluido = NULLIF(p_procedimento,''),
         cid_concluido = NULLIF(p_cid,''),
         obs_conclusao = COALESCE(p_obs,''),
         iniciado_em = COALESCE(iniciado_em, now()),
         atualizado_em = now()
   WHERE id = p_agendamento_id;

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','atendimento_concluido_master',
    jsonb_build_object(
      'agendamento_id', p_agendamento_id,
      'paciente_id', v_paciente_id,
      'paciente_nome', v_paciente_nome,
      'profissional_executor_id', v_prof_id,
      'profissional_executor_nome', v_prof_nome,
      'concluido_por_id', p_user_id,
      'concluido_por_nome', p_user_nome,
      'concluido_por_master', (p_is_master AND (v_prof_id <> p_user_id)),
      'unidade_id', v_unidade,
      'hora_termino', p_hora_termino,
      'procedimento', COALESCE(p_procedimento,''),
      'cid', COALESCE(p_cid,''),
      'observacao', COALESCE(p_obs,'')
    ), 'pendente', now());

  RETURN jsonb_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public."concluir_atendimento_master"(p_agendamento_id text, p_user_id text, p_user_nome text, p_hora_termino text, p_procedimento text, p_cid text, p_obs text, p_is_master boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."concluir_atendimento_master"(p_agendamento_id text, p_user_id text, p_user_nome text, p_hora_termino text, p_procedimento text, p_cid text, p_obs text, p_is_master boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."concluir_atendimento_master"(p_agendamento_id text, p_user_id text, p_user_nome text, p_hora_termino text, p_procedimento text, p_cid text, p_obs text, p_is_master boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.concluir_triagem_atendimento(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb, p_encaminhar_enfermagem boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.gravar_triagem_atendimento(p_agendamento_id,p_tecnico_id,p_dados_triagem,true,p_encaminhar_enfermagem);
$function$
;

REVOKE ALL ON FUNCTION public."concluir_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb, p_encaminhar_enfermagem boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."concluir_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb, p_encaminhar_enfermagem boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."concluir_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb, p_encaminhar_enfermagem boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.confirm_profession_careness_mapping(p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_current text;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role))='master';
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente Master pode confirmar o De-Para' USING ERRCODE='42501'; END IF;
  v_current := md5(public.profession_careness_catalog()::text);
  IF p_signature IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'A lista de profissões mudou. Atualize e revise o De-Para novamente.'; END IF;
  UPDATE public.profession_careness_mapping_state SET confirmed_signature=v_current,confirmed_at=now(),confirmed_by=v_staff.id::text WHERE id IS TRUE;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'depara_profissoes_confirmado',
    'profession_careness_mapping','active',jsonb_build_object('signature',v_current,'professions',public.profession_careness_catalog()));
  RETURN jsonb_build_object('confirmed',true,'signature',v_current);
END;
$function$
;

REVOKE ALL ON FUNCTION public."confirm_profession_careness_mapping"(p_signature text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."confirm_profession_careness_mapping"(p_signature text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."confirm_profession_careness_mapping"(p_signature text) TO "service_role";

CREATE OR REPLACE FUNCTION public.confirmar_chegada_atendimento(p_agendamento_id text, p_usuario_id text, p_usuario_nome text, p_unidade_id text, p_hora_chegada text, p_reconciliar boolean DEFAULT false, p_paciente_id_esperado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; v_actor jsonb;
 v_enabled boolean := false; v_status text; v_queue_status text; v_previous text; v_before_queue jsonb; v_hour text;
BEGIN
  v_actor := public.assert_care_flow_actor(p_unidade_id,p_usuario_id,'agenda');
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado. Atualize a Agenda.' USING ERRCODE='23503'; END IF;
  IF a.unidade_id IS DISTINCT FROM p_unidade_id OR (v_actor->>'normalized_role'='profissional' AND a.profissional_id IS DISTINCT FROM p_usuario_id) THEN
    RAISE EXCEPTION 'Agendamento fora do seu escopo.' USING ERRCODE='42501';
  END IF;
  IF p_paciente_id_esperado IS NOT NULL AND a.paciente_id IS DISTINCT FROM p_paciente_id_esperado THEN
    RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a Agenda antes de confirmar a chegada.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  v_before_queue := CASE WHEN FOUND THEN to_jsonb(f) ELSE NULL END;
  IF f.id IS NOT NULL AND (f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id) THEN
    RAISE EXCEPTION 'A fila possui um vínculo divergente. Solicite revisão.' USING ERRCODE='23514';
  END IF;
  IF p_reconciliar THEN
    IF v_actor->>'normalized_role' NOT IN ('recepcao','master') THEN RAISE EXCEPTION 'Somente Recepção ou Master pode sincronizar a triagem.' USING ERRCODE='42501'; END IF;
    IF a.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date OR a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
      RAISE EXCEPTION 'A sincronização é permitida apenas para chegadas pendentes de triagem de hoje.' USING ERRCODE='23514';
    END IF;
    IF f.id IS NOT NULL AND f.status <> 'excluido_da_fila_triagem' THEN
      RETURN jsonb_build_object('already_processed',true,'reconciled',false,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
    END IF;
    IF EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
      RAISE EXCEPTION 'A triagem já foi concluída. Solicite revisão do atendimento.' USING ERRCODE='23514';
    END IF;
  ELSIF a.status IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem','triagem_concluida','aguardando_enfermagem','aguardando_atendimento','apto_atendimento','chamado','em_atendimento','concluido','finalizado','atendido','atendimento_encerrado','prontuario_finalizado') OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
    RETURN jsonb_build_object('already_processed',true,'reconciled',false,'status',a.status,'agendamento',to_jsonb(a),'fila',v_before_queue);
  ELSIF a.status NOT IN ('pendente','confirmado','confirmada','agendado','atraso','falta') THEN
    RAISE EXCEPTION 'Este agendamento não permite confirmação de chegada.' USING ERRCODE='23514';
  END IF;
  IF f.id IS NOT NULL AND f.status IN ('apto_atendimento','aguardando_enfermagem','aguardando_atendimento','em_atendimento','concluido','atendido') THEN
    RAISE EXCEPTION 'O paciente já avançou na fila. Atualize a Agenda antes de continuar.' USING ERRCODE='23514';
  END IF;
  -- Professional override wins, including enabled=false. Global configuration is fallback only.
  SELECT enabled INTO v_enabled FROM public.triage_settings WHERE profissional_id=a.profissional_id AND (unidade_id=a.unidade_id OR nullif(unidade_id,'') IS NULL)
    ORDER BY (unidade_id=a.unidade_id) DESC NULLS LAST,updated_at DESC NULLS LAST,id LIMIT 1;
  IF NOT FOUND THEN
    SELECT enabled INTO v_enabled FROM public.triage_settings WHERE profissional_id IS NULL AND (unidade_id=a.unidade_id OR nullif(unidade_id,'') IS NULL)
      ORDER BY (unidade_id=a.unidade_id) DESC NULLS LAST,updated_at DESC NULLS LAST,id LIMIT 1;
  END IF;
  v_enabled := coalesce(v_enabled,false);
  v_previous := a.status;
  v_status := CASE WHEN v_enabled THEN 'confirmado_chegada' ELSE 'apto_atendimento' END;
  v_queue_status := CASE WHEN v_enabled THEN 'chegada_confirmada' ELSE 'apto_atendimento' END;
  v_hour := coalesce(nullif(f.hora_chegada,''),nullif(p_hora_chegada,''),to_char(now() AT TIME ZONE 'America/Sao_Paulo','HH24:MI'));
  IF v_hour !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Horário de chegada inválido.' USING ERRCODE='23514'; END IF;
  UPDATE public.agendamentos SET status=v_status WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.fila_espera(id,paciente_id,paciente_nome,unidade_id,profissional_id,status,hora_chegada,observacoes,prioridade_perfil,posicao,criado_por)
    VALUES(a.id,a.paciente_id,a.paciente_nome,a.unidade_id,a.profissional_id,v_queue_status,v_hour,a.observacoes,a.prioridade_perfil,
      coalesce((SELECT max(posicao)+1 FROM public.fila_espera WHERE unidade_id=a.unidade_id),1),v_actor->>'nome')
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,profissional_id=EXCLUDED.profissional_id,hora_chegada=EXCLUDED.hora_chegada,observacoes=EXCLUDED.observacoes
    WHERE public.fila_espera.paciente_id=EXCLUDED.paciente_id AND public.fila_espera.unidade_id=EXCLUDED.unidade_id
      AND public.fila_espera.status NOT IN ('apto_atendimento','aguardando_enfermagem','aguardando_atendimento','em_atendimento','concluido','atendido')
    RETURNING * INTO f;
  IF NOT FOUND THEN RAISE EXCEPTION 'A fila foi alterada por outro terminal. Atualize antes de continuar.' USING ERRCODE='23514'; END IF;
  IF v_enabled AND NOT p_reconciliar THEN
    -- Reset only this patient's counters in this unit. Do not run the legacy helper,
    -- which also changes unrelated historical BLOQUEIO_FALTA queue rows.
    UPDATE public.pacientes SET total_faltas=0,faltas_consecutivas=0,status_falta='REGULAR'
      WHERE id=a.paciente_id AND unidade_id=a.unidade_id;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,
      CASE WHEN p_reconciliar THEN 'sincronizar_triagem' ELSE 'confirmar_chegada' END,'agendamento',a.id,'agenda',a.id,a.paciente_id,a.profissional_id,
      jsonb_build_object('status',v_previous,'fila',v_before_queue),jsonb_build_object('status',a.status,'fila',to_jsonb(f)),
      jsonb_build_object('triagem_habilitada',v_enabled,'hora_chegada',v_hour,'motivo',CASE WHEN p_reconciliar THEN 'Correção manual de chegada de hoje sem fila ativa de triagem' ELSE 'Confirmação de chegada' END));
  RETURN jsonb_build_object('already_processed',false,'reconciled',p_reconciliar,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $function$
;

REVOKE ALL ON FUNCTION public."confirmar_chegada_atendimento"(p_agendamento_id text, p_usuario_id text, p_usuario_nome text, p_unidade_id text, p_hora_chegada text, p_reconciliar boolean, p_paciente_id_esperado text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."confirmar_chegada_atendimento"(p_agendamento_id text, p_usuario_id text, p_usuario_nome text, p_unidade_id text, p_hora_chegada text, p_reconciliar boolean, p_paciente_id_esperado text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."confirmar_chegada_atendimento"(p_agendamento_id text, p_usuario_id text, p_usuario_nome text, p_unidade_id text, p_hora_chegada text, p_reconciliar boolean, p_paciente_id_esperado text) TO "service_role";

CREATE OR REPLACE FUNCTION public.create_external_appointment(p_cota_id uuid, p_paciente_id text, p_data date, p_hora text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user public.profissionais_externos%ROWTYPE;
  v_quota public.quotas_externas%ROWTYPE;
  v_prof public.funcionarios%ROWTYPE;
  v_patient public.pacientes%ROWTYPE;
  v_uuid uuid;
  v_id text;
  v_used integer;
  v_time time;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_user FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid() AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional externo inativo ou não encontrado'; END IF;
  IF p_cota_id IS NULL OR p_paciente_id IS NULL OR p_data IS NULL OR p_hora IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios ausentes';
  END IF;
  SELECT * INTO v_quota FROM public.quotas_externas WHERE id = p_cota_id FOR UPDATE;
  IF NOT FOUND OR v_quota.profissional_externo_id <> v_user.id THEN
    RAISE EXCEPTION 'Cota não pertence ao profissional externo';
  END IF;
  IF v_quota.ativo IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cota inativa'; END IF;
  IF coalesce(btrim(v_quota.unidade_id), '') = '' THEN RAISE EXCEPTION 'Cota sem unidade; solicite correção ao Master'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.id = v_quota.unidade_id AND u.ativo) THEN
    RAISE EXCEPTION 'Unidade da cota indisponível';
  END IF;
  IF p_data < current_date OR p_data NOT BETWEEN v_quota.periodo_inicio AND v_quota.periodo_fim THEN
    RAISE EXCEPTION 'Data fora do período da cota';
  END IF;
  IF v_quota.dia_semana IS NOT NULL AND v_quota.dia_semana <> extract(dow FROM p_data)::integer THEN
    RAISE EXCEPTION 'Dia da semana incompatível com a cota';
  END IF;
  IF v_quota.turno IS NULL OR v_quota.turno NOT IN ('manha', 'tarde', 'noite', 'integral', 'personalizado') THEN
    RAISE EXCEPTION 'Turno da cota inválido; solicite correção ao Master';
  END IF;
  IF p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RAISE EXCEPTION 'Horário inválido';
  END IF;
  v_time := p_hora::time;
  IF v_quota.turno IS DISTINCT FROM 'integral' THEN
    IF v_quota.horario_inicio IS NULL OR v_quota.horario_fim IS NULL
       OR v_quota.horario_inicio >= v_quota.horario_fim THEN
      RAISE EXCEPTION 'Horários da cota inválidos; solicite correção ao Master';
    END IF;
    IF v_time < v_quota.horario_inicio OR v_time >= v_quota.horario_fim THEN
      RAISE EXCEPTION 'Horário fora da faixa da cota';
    END IF;
  END IF;
  SELECT * INTO v_prof FROM public.funcionarios
    WHERE id = v_quota.profissional_interno_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profissional interno indisponível'; END IF;
  SELECT * INTO v_patient FROM public.pacientes WHERE id = p_paciente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente não encontrado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_prof.id::text || '|' || v_quota.unidade_id || '|' || p_data::text, 0));
  IF EXISTS (SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = v_patient.id AND a.profissional_id = v_prof.id::text
      AND a.unidade_id = v_quota.unidade_id AND a.data = p_data AND a.hora = p_hora
      AND a.status NOT IN ('cancelado', 'falta')) THEN
    RAISE EXCEPTION 'Paciente já possui agendamento nesse horário';
  END IF;
  IF v_quota.vagas_total <= 0 THEN RAISE EXCEPTION 'Cota sem vagas'; END IF;
  SELECT count(*) INTO v_used FROM public.agendamentos_externos
    WHERE cota_id = v_quota.id AND status <> 'cancelado';
  IF v_used <> v_quota.vagas_usadas THEN
    RAISE EXCEPTION 'Contador da cota divergente; solicite revisão ao Master';
  END IF;
  IF v_used >= v_quota.vagas_total THEN RAISE EXCEPTION 'Cota esgotada'; END IF;

  v_uuid := gen_random_uuid();
  v_id := 'ag_' || v_uuid::text;
  PERFORM set_config('app.external_booking_rpc', 'create', true);
  INSERT INTO public.agendamentos
    (id, paciente_id, paciente_nome, unidade_id, profissional_id, profissional_nome,
     data, hora, tipo, status, origem, criado_por, agendado_por_externo, observacoes)
  VALUES (v_id, v_patient.id, v_patient.nome, v_quota.unidade_id,
    v_prof.id::text, v_prof.nome, p_data, p_hora, 'Consulta', 'pendente',
    'externo', v_user.id::text, v_user.id::text, 'Agendado por ' || v_user.nome);
  INSERT INTO public.agendamentos_externos
    (id, paciente_id, profissional_externo_id, profissional_interno_id,
     unidade_id, cota_id, data, horario, turno, status)
  VALUES (v_uuid, v_patient.id, v_user.id, v_prof.id, v_quota.unidade_id,
    v_quota.id, p_data, v_time, v_quota.turno, 'pendente');
  UPDATE public.quotas_externas SET vagas_usadas = vagas_usadas + 1 WHERE id = v_quota.id;
  INSERT INTO public.action_logs (user_id, user_nome, role, unidade_id, acao, entidade,
    entidade_id, modulo, agendamento_id, paciente_id, profissional_id, detalhes)
  VALUES (v_user.id::text, v_user.nome, 'externo', v_quota.unidade_id,
    'criar_agendamento_externo', 'agendamento', v_id, 'agenda', v_id,
    v_patient.id, v_prof.id::text, jsonb_build_object('cota_id', v_quota.id));
  RETURN jsonb_build_object('id', v_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public."create_external_appointment"(p_cota_id uuid, p_paciente_id text, p_data date, p_hora text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."create_external_appointment"(p_cota_id uuid, p_paciente_id text, p_data date, p_hora text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."create_external_appointment"(p_cota_id uuid, p_paciente_id text, p_data date, p_hora text) TO "service_role";

CREATE OR REPLACE FUNCTION public.create_internal_appointment_with_override(p_payload jsonb, p_motivo_alteracao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_row public.agendamentos%ROWTYPE; v_check jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo LIMIT 1;
  IF NOT FOUND OR lower(btrim(v_staff.role)) <> 'master' THEN RAISE EXCEPTION 'Somente Master pode autorizar encaixe'; END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND v_staff.unidade_id IS DISTINCT FROM p_payload->>'unidade_id' THEN
    RAISE EXCEPTION 'Master sem acesso à unidade do encaixe' USING ERRCODE='42501';
  END IF;
  IF coalesce(length(btrim(p_motivo_alteracao)), 0) < 3 THEN RAISE EXCEPTION 'Informe o motivo do encaixe'; END IF;
  IF coalesce(p_payload->>'origem', '') = 'externo' THEN RAISE EXCEPTION 'Origem externa não permitida nesta função'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (p_payload->>'profissional_id') || '|' || (p_payload->>'unidade_id') || '|' || (p_payload->>'data'), 0));
  v_check := public.check_internal_slot_availability(p_payload->>'profissional_id', p_payload->>'unidade_id',
    (p_payload->>'data')::date, p_payload->>'hora');
  IF v_check->>'reason' IS DISTINCT FROM 'external_reservation' THEN
    RAISE EXCEPTION 'Encaixe Master só pode ultrapassar a divisão da reserva externa; motivo de bloqueio: %',
      coalesce(v_check->>'reason', 'indisponivel');
  END IF;
  PERFORM set_config('app.master_capacity_override', 'on', true);
  INSERT INTO public.agendamentos (id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,
    profissional_id,profissional_nome,data,hora,status,tipo,observacoes,origem,criado_por,prioridade_perfil)
  VALUES (p_payload->>'id',p_payload->>'paciente_id',p_payload->>'paciente_nome',p_payload->>'unidade_id',
    coalesce(nullif(p_payload->>'sala_id',''),''),coalesce(nullif(p_payload->>'setor_id',''),''),p_payload->>'profissional_id',
    p_payload->>'profissional_nome',(p_payload->>'data')::date,p_payload->>'hora',
    coalesce(nullif(p_payload->>'status',''),'confirmado'),p_payload->>'tipo',coalesce(p_payload->>'observacoes',''),
    coalesce(nullif(p_payload->>'origem',''),'recepcao'),v_staff.id::text,'normal') RETURNING * INTO v_row;
  INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,
    agendamento_id,paciente_id,profissional_id,after,detalhes)
  VALUES (v_staff.id::text,v_staff.nome,v_staff.role,v_row.unidade_id,'encaixe_master','agendamento',v_row.id,
    'agenda',v_row.id,v_row.paciente_id,v_row.profissional_id,to_jsonb(v_row),
    jsonb_build_object('motivo_alteracao',btrim(p_motivo_alteracao),'capacidade',v_check));
  PERFORM set_config('app.master_capacity_override', 'off', true);
  RETURN jsonb_build_object('id',v_row.id,'created',true);
END;
$function$
;

REVOKE ALL ON FUNCTION public."create_internal_appointment_with_override"(p_payload jsonb, p_motivo_alteracao text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."create_internal_appointment_with_override"(p_payload jsonb, p_motivo_alteracao text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."create_internal_appointment_with_override"(p_payload jsonb, p_motivo_alteracao text) TO "service_role";

CREATE OR REPLACE FUNCTION public.create_internal_appointment_with_policy_override(p_payload jsonb, p_override_reason text, p_bypass_careness boolean, p_capacity_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_check jsonb;
  v_careness jsonb;
  v_row public.agendamentos%ROWTYPE;
  v_capacity_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_staff
  FROM public.funcionarios
  WHERE auth_user_id = auth.uid() AND ativo IS TRUE;

  IF NOT FOUND OR lower(trim(v_staff.role)) <> 'master' THEN
    RAISE EXCEPTION 'Somente Master pode autorizar esta exceção' USING ERRCODE = '42501';
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND v_staff.unidade_id IS DISTINCT FROM p_payload->>'unidade_id' THEN
    RAISE EXCEPTION 'Master sem acesso à unidade do agendamento' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(p_override_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da exceção';
  END IF;

  IF coalesce(p_payload->>'origem', '') = 'externo' THEN
    RAISE EXCEPTION 'Origem externa não permitida nesta função';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (p_payload->>'profissional_id') || '|' || (p_payload->>'unidade_id') || '|' || (p_payload->>'data'), 0));

  v_check := public.check_internal_slot_availability(
    p_payload->>'profissional_id',
    p_payload->>'unidade_id',
    (p_payload->>'data')::date,
    p_payload->>'hora'
  );

  v_capacity_reason := v_check->>'reason';
  IF NOT coalesce((v_check->>'available')::boolean, false)
     AND NOT (p_capacity_override AND coalesce(v_capacity_reason IN (
       'external_reservation', 'day_full', 'turno_full', 'hour_full'
     ), false)) THEN
    RAISE EXCEPTION 'Encaixe Master não permitido: %',
      coalesce(v_capacity_reason, 'indisponível');
  END IF;

  v_careness := public.check_patient_profession_careness(
    p_payload->>'paciente_id', p_payload->>'profissional_id', p_payload->>'unidade_id');
  IF coalesce((v_careness->>'blocked')::boolean, false) AND NOT p_bypass_careness THEN
    RAISE EXCEPTION '%', v_careness->>'message' USING ERRCODE = 'P0001';
  END IF;
  IF p_bypass_careness AND NOT coalesce((v_careness->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION 'Não há carência ativa para ignorar';
  END IF;

  IF p_capacity_override THEN
    PERFORM pg_catalog.set_config('app.master_capacity_override', 'on', true);
  END IF;
  IF p_bypass_careness THEN
    PERFORM pg_catalog.set_config('app.profession_careness_override', 'on', true);
  END IF;

  INSERT INTO public.agendamentos(
    id, paciente_id, paciente_nome, unidade_id, sala_id, setor_id,
    profissional_id, profissional_nome, data, hora, status, tipo,
    observacoes, origem, criado_por, prioridade_perfil
  ) VALUES (
    p_payload->>'id', p_payload->>'paciente_id', p_payload->>'paciente_nome', p_payload->>'unidade_id',
    coalesce(p_payload->>'sala_id', ''), coalesce(p_payload->>'setor_id', ''),
    p_payload->>'profissional_id', p_payload->>'profissional_nome',
    (p_payload->>'data')::date, p_payload->>'hora', coalesce(p_payload->>'status', 'confirmado'),
    p_payload->>'tipo', coalesce(p_payload->>'observacoes', ''),
    coalesce(p_payload->>'origem', 'recepcao'), v_staff.id::text, 'normal'
  ) RETURNING * INTO v_row;

  PERFORM pg_catalog.set_config('app.master_capacity_override', 'off', true);
  PERFORM pg_catalog.set_config('app.profession_careness_override', 'off', true);

  INSERT INTO public.action_logs(
    user_id, user_nome, role, unidade_id, acao, entidade, entidade_id,
    detalhes, agendamento_id, paciente_id, profissional_id
  ) VALUES (
    v_staff.id::text, v_staff.nome, v_staff.role, v_row.unidade_id,
    'encaixe_master_excecao_carencia', 'agendamento', v_row.id,
    jsonb_build_object(
      'motivo', btrim(p_override_reason),
      'bypass_careness', p_bypass_careness,
      'capacity_override', p_capacity_override,
      'carencia', v_careness,
      'capacity', v_check
    ),
    v_row.id, v_row.paciente_id, v_row.profissional_id
  );

  RETURN jsonb_build_object('id', v_row.id, 'created', true);
END;
$function$
;

REVOKE ALL ON FUNCTION public."create_internal_appointment_with_policy_override"(p_payload jsonb, p_override_reason text, p_bypass_careness boolean, p_capacity_override boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."create_internal_appointment_with_policy_override"(p_payload jsonb, p_override_reason text, p_bypass_careness boolean, p_capacity_override boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."create_internal_appointment_with_policy_override"(p_payload jsonb, p_override_reason text, p_bypass_careness boolean, p_capacity_override boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.current_user_cbo_codigo()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(coalesce(custom_data->>'cbo_codigo', ''), '\D', '', 'g')
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
     AND ativo = true
   LIMIT 1
$function$
;

REVOKE ALL ON FUNCTION public."current_user_cbo_codigo"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."current_user_cbo_codigo"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."current_user_cbo_codigo"() TO "service_role";

CREATE OR REPLACE FUNCTION public.delete_treatment_cycle_with_appointments(p_cycle_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_cycle public.treatment_cycles%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_appointment public.agendamentos%ROWTYPE;
  v_actor jsonb;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_appointment_ids text[] := ARRAY[]::text[];
  v_kept_ids text[] := ARRAY[]::text[];
  v_sessions integer;
  v_removed_appointments integer := 0;
BEGIN
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa para excluir o ciclo.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado. Atualize a Gestão de Tratamentos.' USING ERRCODE = '23503'; END IF;
  v_actor := public.assert_treatment_write_scope(v_cycle.professional_id, v_cycle.unit_id, true);
  IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id = p_cycle_id AND status IN ('realizada','concluida','presente','compareceu')) THEN
    RAISE EXCEPTION 'Este ciclo já tem sessão realizada (atendimento prestado). Para preservar o prontuário, use "Dar Alta".' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_sessions FROM public.treatment_sessions WHERE cycle_id = p_cycle_id;
  FOR v_session IN SELECT * FROM public.treatment_sessions WHERE cycle_id = p_cycle_id AND appointment_id IS NOT NULL ORDER BY id FOR UPDATE LOOP
    SELECT * INTO v_appointment FROM public.agendamentos WHERE id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.data >= v_today
       AND v_appointment.status IN ('pendente', 'confirmado', 'confirmada', 'agendado')
       AND NOT EXISTS (SELECT 1 FROM public.treatment_sessions o WHERE o.appointment_id = v_session.appointment_id AND o.cycle_id <> p_cycle_id)
       AND NOT EXISTS (SELECT 1 FROM public.atendimentos WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.prontuarios WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.triage_records WHERE agendamento_id = v_session.appointment_id)
       AND NOT EXISTS (SELECT 1 FROM public.fila_espera WHERE id = v_session.appointment_id) THEN
      v_appointment_ids := array_append(v_appointment_ids, v_session.appointment_id);
    ELSE
      v_kept_ids := array_append(v_kept_ids, v_session.appointment_id);
    END IF;
  END LOOP;

  IF cardinality(v_appointment_ids) > 0 THEN
    DELETE FROM public.agendamentos WHERE id = ANY(v_appointment_ids);
    GET DIAGNOSTICS v_removed_appointments = ROW_COUNT;
  END IF;
  DELETE FROM public.patient_discharges WHERE cycle_id = p_cycle_id;
  DELETE FROM public.treatment_extensions WHERE cycle_id = p_cycle_id;
  DELETE FROM public.treatment_cycles WHERE id = p_cycle_id;

  INSERT INTO public.action_logs
    (user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
  VALUES
    (v_actor->>'id', v_actor->>'nome', v_actor->>'role', v_cycle.unit_id,
     'excluir', 'treatment_cycle', p_cycle_id::text, 'tratamentos', v_cycle.patient_id, v_cycle.professional_id,
     jsonb_build_object('motivo_alteracao', btrim(p_reason), 'sessoes_excluidas', v_sessions,
                        'agendamentos_excluidos', v_removed_appointments, 'agendamentos_ids', to_jsonb(v_appointment_ids),
                        'agendamentos_preservados', to_jsonb(v_kept_ids),
                        'ciclo', to_jsonb(v_cycle)));
  RETURN jsonb_build_object('sessions_removed', v_sessions, 'appointments_removed', v_removed_appointments);
END;
$function$
;

REVOKE ALL ON FUNCTION public."delete_treatment_cycle_with_appointments"(p_cycle_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."delete_treatment_cycle_with_appointments"(p_cycle_id uuid, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."delete_treatment_cycle_with_appointments"(p_cycle_id uuid, p_reason text) TO "service_role";

CREATE OR REPLACE FUNCTION public.desbloquear_paciente_faltas(p_paciente_id text, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.pacientes WHERE id = p_paciente_id;
  PERFORM public.resetar_faltas_paciente(p_paciente_id);

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','paciente_desbloqueado',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'paciente_nome', v_nome,
      'desbloqueado_por_id', p_user_id,
      'desbloqueado_por_nome', p_user_nome,
      'mensagem', format('Paciente %s desbloqueado manualmente por %s', COALESCE(v_nome,'(sem nome)'), COALESCE(p_user_nome,'(usuário)'))
    ),'pendente', now());
END;
$function$
;

REVOKE ALL ON FUNCTION public."desbloquear_paciente_faltas"(p_paciente_id text, p_user_id uuid, p_user_nome text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."desbloquear_paciente_faltas"(p_paciente_id text, p_user_id uuid, p_user_nome text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."desbloquear_paciente_faltas"(p_paciente_id text, p_user_id uuid, p_user_nome text) TO "service_role";

CREATE OR REPLACE FUNCTION public.enforce_fono_avaliativo_cbo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cbo text;
  v_user text;
BEGIN
  IF NEW.tipo_registro IS DISTINCT FROM 'alta_individual_fono_v1' THEN
    RETURN NEW;
  END IF;

  -- admin global "admin.sms" sempre pode (necessário para manutenção/correção)
  SELECT usuario INTO v_user
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
   LIMIT 1;
  IF v_user = 'admin.sms' THEN
    RETURN NEW;
  END IF;

  v_cbo := public.current_user_cbo_codigo();

  IF v_cbo IS NULL OR v_cbo <> '223810' THEN
    RAISE EXCEPTION 'Apenas profissionais com CBO 223810 (Fonoaudiólogo) podem criar ou alterar o Relatório Fonoaudiológico Avaliativo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."enforce_fono_avaliativo_cbo"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."enforce_fono_avaliativo_cbo"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."enforce_fono_avaliativo_cbo"() TO "service_role";

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_message(p_paciente_id text, p_paciente_nome text, p_telefone text, p_evento text, p_template_id uuid, p_payload jsonb, p_agendamento_id text DEFAULT ''::text, p_unidade_id text DEFAULT ''::text, p_priority integer DEFAULT 50, p_agendado_para timestamp with time zone DEFAULT now(), p_provider text DEFAULT 'evolution'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_opted_out boolean := false;
  v_tpl record;
  v_window_open boolean;
  v_mensagem text := '';
BEGIN
  -- Regra 1: opt-out
  SELECT COALESCE(opted_out,false) INTO v_opted_out
    FROM public.whatsapp_conversations WHERE phone = p_telefone;
  IF v_opted_out THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'opted_out', 'status', 'ignorado');
  END IF;

  -- Regra 2: template aprovado
  IF p_template_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_required');
  END IF;
  SELECT * INTO v_tpl FROM public.whatsapp_templates WHERE id = p_template_id;
  IF v_tpl IS NULL OR v_tpl.ativo = false OR v_tpl.status <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_not_approved');
  END IF;

  -- Regra 3: janela 24h
  v_window_open := public.is_whatsapp_24h_window_open(p_telefone);
  IF NOT v_window_open AND COALESCE(v_tpl.permite_envio_fora_24h,false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outside_24h_window_and_template_not_allowed', 'status', 'bloqueado');
  END IF;

  v_mensagem := COALESCE(v_tpl.mensagem, '');

  -- Regra 4: anti-duplicidade (via índice único parcial)
  INSERT INTO public.whatsapp_queue (
    paciente_id, paciente_nome, telefone, evento, mensagem, prioridade, agendado_para,
    status, unidade_id, agendamento_id, metadados, provider, category,
    template_id, payload_json, priority
  ) VALUES (
    COALESCE(p_paciente_id,''), COALESCE(p_paciente_nome,''), p_telefone, p_evento, v_mensagem,
    CASE WHEN p_priority >= 80 THEN 'alta' WHEN p_priority >= 40 THEN 'media' ELSE 'baixa' END,
    p_agendado_para, 'pendente', COALESCE(p_unidade_id,''), COALESCE(p_agendamento_id,''),
    '{}'::jsonb, p_provider, COALESCE(v_tpl.categoria,'utility'),
    p_template_id, COALESCE(p_payload,'{}'::jsonb), p_priority
  )
  ON CONFLICT ON CONSTRAINT uniq_whatsapp_queue_dedup DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public."enqueue_whatsapp_message"(p_paciente_id text, p_paciente_nome text, p_telefone text, p_evento text, p_template_id uuid, p_payload jsonb, p_agendamento_id text, p_unidade_id text, p_priority integer, p_agendado_para timestamp with time zone, p_provider text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."enqueue_whatsapp_message"(p_paciente_id text, p_paciente_nome text, p_telefone text, p_evento text, p_template_id uuid, p_payload jsonb, p_agendamento_id text, p_unidade_id text, p_priority integer, p_agendado_para timestamp with time zone, p_provider text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."enqueue_whatsapp_message"(p_paciente_id text, p_paciente_nome text, p_telefone text, p_evento text, p_template_id uuid, p_payload jsonb, p_agendamento_id text, p_unidade_id text, p_priority integer, p_agendado_para timestamp with time zone, p_provider text) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_atendimentos_pendentes_master(p_unidade_id text DEFAULT NULL::text, p_minutos integer DEFAULT 60)
 RETURNS TABLE(id text, paciente_id text, paciente_nome text, profissional_id text, profissional_nome text, unidade_id text, data date, hora text, iniciado_em timestamp with time zone, minutos_aberto integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.paciente_id, a.paciente_nome, a.profissional_id, a.profissional_nome,
         a.unidade_id, a.data, a.hora, a.iniciado_em,
         EXTRACT(EPOCH FROM (now() - COALESCE(a.iniciado_em, (a.data::timestamp + a.hora::interval))))/60 ::int AS minutos_aberto
    FROM public.agendamentos a
   WHERE a.status = 'em_atendimento'
     AND (p_unidade_id IS NULL OR p_unidade_id = '' OR a.unidade_id = p_unidade_id)
     AND COALESCE(a.iniciado_em, (a.data::timestamp + a.hora::interval)) < now() - make_interval(mins => p_minutos)
   ORDER BY iniciado_em NULLS FIRST;
$function$
;

REVOKE ALL ON FUNCTION public."get_atendimentos_pendentes_master"(p_unidade_id text, p_minutos integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_atendimentos_pendentes_master"(p_unidade_id text, p_minutos integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_atendimentos_pendentes_master"(p_unidade_id text, p_minutos integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_procedures_for_cid(p_cid text, lim integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
  FROM (
    SELECT sp.codigo, sp.nome, sp.especialidade
    FROM public.sigtap_procedimento_cids spc
    JOIN public.sigtap_procedimentos sp ON sp.codigo = spc.procedimento_codigo
    WHERE spc.cid_codigo = p_cid AND sp.ativo = true
    ORDER BY sp.nome
    LIMIT lim
  ) t;
$function$
;

REVOKE ALL ON FUNCTION public."get_procedures_for_cid"(p_cid text, lim integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_procedures_for_cid"(p_cid text, lim integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_procedures_for_cid"(p_cid text, lim integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_tables_info()
 RETURNS TABLE(table_name text, record_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        t.table_name::TEXT,
        0::BIGINT -- Simplificado, o row count real é pego via select count(*) na function
    FROM 
        information_schema.tables t
    WHERE 
        t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
    ORDER BY 
        t.table_name;
END;
$function$
;

REVOKE ALL ON FUNCTION public."get_tables_info"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_tables_info"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_tables_info"() TO "service_role";

CREATE OR REPLACE FUNCTION public.get_treatment_cycles_paginated(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
SELECT public.get_treatment_cycles_scoped(p_page,p_page_size,p_professional_id,p_unit_id,p_status,p_search,p_only_own_professional,false);
$function$
;

REVOKE ALL ON FUNCTION public."get_treatment_cycles_paginated"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_treatment_cycles_paginated"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_treatment_cycles_paginated"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_treatment_cycles_scoped(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_professional_id text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_only_own_professional boolean DEFAULT false, p_integrity_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor public.funcionarios%ROWTYPE;
  v_offset integer;
  v_cycles jsonb;
  v_user_id text;
  v_search_digits text;
BEGIN
  SELECT * INTO v_actor FROM public.funcionarios WHERE auth_user_id=auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado.' USING ERRCODE='42501'; END IF;
  IF p_integrity_only AND lower(trim(v_actor.role))<>'master' THEN RAISE EXCEPTION 'Filtro exclusivo do Master.' USING ERRCODE='42501'; END IF;
  IF lower(trim(v_actor.role))='profissional' THEN p_professional_id:=v_actor.id::text; END IF;
  IF v_actor.usuario IS DISTINCT FROM 'admin.sms' THEN
    IF nullif(v_actor.unidade_id,'') IS NULL THEN RAISE EXCEPTION 'Unidade não identificada.' USING ERRCODE='42501'; END IF;
    p_unit_id:=v_actor.unidade_id;
  END IF;
  p_page_size:=greatest(1,least(coalesce(p_page_size,20),50));
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);
  v_search_digits := regexp_replace(p_search, '\D', '', 'g');

  IF p_only_own_professional THEN
    SELECT (f.id)::text INTO v_user_id
    FROM funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo = true
    LIMIT 1;
  END IF;

  WITH base AS (
    SELECT c.*, p.nome AS paciente_nome, f.nome AS professional_nome
    FROM treatment_cycles c
    LEFT JOIN pacientes p ON p.id = c.patient_id
    LEFT JOIN funcionarios f ON f.id::text = c.professional_id
    WHERE
      (p_professional_id IS NULL OR p_professional_id = '' OR p_professional_id = 'all' OR c.professional_id = p_professional_id)
      AND (p_unit_id IS NULL OR p_unit_id = '' OR p_unit_id = 'all' OR c.unit_id = p_unit_id)
      AND (
        p_status IS NULL OR p_status = '' OR p_status = 'all'
        OR (p_status != 'aguardando_agendamento' AND c.status = p_status)
        OR (p_status = 'aguardando_agendamento' AND EXISTS (
          SELECT 1 FROM treatment_sessions ts 
          WHERE ts.cycle_id = c.id AND ts.status = 'pendente_agendamento'
        ))
      )
      AND (NOT p_integrity_only OR cardinality(public.treatment_cycle_integrity_issues(c.id))>0)
      AND (NOT p_only_own_professional OR (v_user_id IS NOT NULL AND c.professional_id = v_user_id))
      AND (
        p_search IS NULL OR p_search = '' OR 
        unaccent(p.nome) ILIKE unaccent('%' || p_search || '%') OR 
        (v_search_digits <> '' AND p.cpf ILIKE '%' || v_search_digits || '%') OR 
        (v_search_digits <> '' AND p.cns ILIKE '%' || v_search_digits || '%') OR 
        unaccent(c.treatment_type) ILIKE unaccent('%' || p_search || '%') OR
        unaccent(f.nome) ILIKE unaccent('%' || p_search || '%')
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM base
  ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.created_at DESC
    LIMIT p_page_size OFFSET v_offset
  ),
  with_stats AS (
    SELECT 
      pg.*,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts 
        WHERE ts.cycle_id = pg.id AND ts.status = 'pendente_agendamento'
      ), 0) AS pending_ag,
      COALESCE((
        SELECT COUNT(*) FROM treatment_sessions ts 
        WHERE ts.cycle_id = pg.id AND ts.status IN ('paciente_faltou', 'falta')
      ), 0) AS faltas
    FROM page pg
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', p_page,
    'page_size', p_page_size,
    'cycles', COALESCE(jsonb_agg(to_jsonb(with_stats.*)), '[]'::jsonb)
  )
  INTO v_cycles
  FROM with_stats;

  RETURN v_cycles;
END;
$function$
;

REVOKE ALL ON FUNCTION public."get_treatment_cycles_scoped"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean, p_integrity_only boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_treatment_cycles_scoped"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean, p_integrity_only boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_treatment_cycles_scoped"(p_page integer, p_page_size integer, p_professional_id text, p_unit_id text, p_status text, p_search text, p_only_own_professional boolean, p_integrity_only boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_treatment_integrity_pending(p_page integer DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE actor public.funcionarios%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO actor FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo IS TRUE;
  IF NOT FOUND OR lower(btrim(actor.role)) <> 'master' THEN RAISE EXCEPTION 'Consulta exclusiva do Master.' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(pending)), '[]'::jsonb) INTO result FROM (
    SELECT to_jsonb(c) AS cycle, coalesce(p.nome, 'Paciente não localizado') AS patient_name,
      (SELECT count(*) FROM public.treatment_sessions s WHERE s.cycle_id = c.id) AS registered_sessions,
      public.treatment_cycle_integrity_issues(c.id) AS issues
    FROM public.treatment_cycles c LEFT JOIN public.pacientes p ON p.id = c.patient_id
    WHERE (actor.usuario = 'admin.sms' OR (nullif(actor.unidade_id,'') IS NOT NULL AND c.unit_id = actor.unidade_id))
      AND cardinality(public.treatment_cycle_integrity_issues(c.id)) > 0
    ORDER BY c.created_at DESC, c.id LIMIT greatest(1,least(coalesce(p_limit,20),50)) OFFSET greatest(coalesce(p_page,0),0) * greatest(1,least(coalesce(p_limit,20),50))
  ) pending;
  RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."get_treatment_integrity_pending"(p_page integer, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_treatment_integrity_pending"(p_page integer, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_treatment_integrity_pending"(p_page integer, p_limit integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.gravar_triagem_atendimento(p_agendamento_id text, p_tecnico_id text, p_dados jsonb, p_confirmar boolean, p_enfermagem boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; t public.triage_records%ROWTYPE;
 v_actor jsonb; d jsonb; v_status text; v_before jsonb; v_before_fila jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado. Atualize a fila.' USING ERRCODE='23503'; END IF;
  v_actor := public.assert_care_flow_actor(a.unidade_id,p_tecnico_id,'triagem');
  IF p_dados ? 'paciente_id_esperado' AND a.paciente_id IS DISTINCT FROM p_dados->>'paciente_id_esperado' THEN RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a fila antes de continuar.' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  IF NOT FOUND OR f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id THEN
    RAISE EXCEPTION 'A fila não corresponde a este agendamento. Peça à Recepção para sincronizar com a Triagem.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO t FROM public.triage_records WHERE agendamento_id=a.id FOR UPDATE;
  IF t.confirmado_em IS NOT NULL THEN
    IF p_confirmar THEN RETURN jsonb_build_object('already_processed',true,'status',a.status,'triage_id',t.id,'agendamento',to_jsonb(a),'fila',to_jsonb(f)); END IF;
    RAISE EXCEPTION 'Esta triagem já foi concluída. O rascunho não pode substituí-la.' USING ERRCODE='23514';
  END IF;
  IF a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') OR f.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
    RAISE EXCEPTION 'O paciente não está aguardando triagem. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  d := public.validar_sinais_triagem(p_dados);
  v_before := jsonb_build_object('agendamento_status',a.status,'triagem',to_jsonb(t));
  v_before_fila := to_jsonb(f);
  INSERT INTO public.triage_records(agendamento_id,tecnico_id,peso,altura,imc,pressao_arterial,temperatura,frequencia_cardiaca,saturacao_oxigenio,glicemia,alergias,medicamentos,queixa,classificacao_risco,observacoes,custom_data,iniciado_em,confirmado_em)
    VALUES(a.id,p_tecnico_id,(d->>'peso')::numeric,(d->>'altura')::numeric,(d->>'imc')::numeric,nullif(d->>'pressao_arterial',''),(d->>'temperatura')::numeric,(d->>'frequencia_cardiaca')::numeric::integer,(d->>'saturacao_oxigenio')::numeric::integer,(d->>'glicemia')::numeric,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(d->'alergias','[]'))),ARRAY(SELECT jsonb_array_elements_text(coalesce(d->'medicamentos','[]'))),nullif(d->>'queixa',''),coalesce(d->>'classificacao_risco',''),coalesce(d->>'observacoes',''),coalesce(d->'custom_data','{}'),coalesce(t.iniciado_em,now()),CASE WHEN p_confirmar THEN now() ELSE NULL END)
    ON CONFLICT(agendamento_id) DO UPDATE SET tecnico_id=EXCLUDED.tecnico_id,peso=EXCLUDED.peso,altura=EXCLUDED.altura,imc=EXCLUDED.imc,pressao_arterial=EXCLUDED.pressao_arterial,temperatura=EXCLUDED.temperatura,frequencia_cardiaca=EXCLUDED.frequencia_cardiaca,saturacao_oxigenio=EXCLUDED.saturacao_oxigenio,glicemia=EXCLUDED.glicemia,alergias=EXCLUDED.alergias,medicamentos=EXCLUDED.medicamentos,queixa=EXCLUDED.queixa,classificacao_risco=EXCLUDED.classificacao_risco,observacoes=EXCLUDED.observacoes,custom_data=EXCLUDED.custom_data,confirmado_em=EXCLUDED.confirmado_em
    RETURNING * INTO t;
  IF p_confirmar THEN
    v_status := CASE WHEN p_enfermagem THEN 'aguardando_enfermagem' ELSE 'apto_atendimento' END;
    UPDATE public.agendamentos SET status=v_status WHERE id=a.id RETURNING * INTO a;
    UPDATE public.fila_espera SET status=v_status WHERE id=a.id RETURNING * INTO f;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,CASE WHEN p_confirmar THEN 'finalizar_triagem' ELSE 'salvar_rascunho_triagem' END,'agendamento',a.id,'triagem',a.id,a.paciente_id,a.profissional_id,
      v_before || jsonb_build_object('fila',v_before_fila),jsonb_build_object('agendamento_status',a.status,'fila',to_jsonb(f),'triagem',to_jsonb(t)),jsonb_build_object('triage_id',t.id,'encaminhamento',CASE WHEN p_enfermagem THEN 'enfermagem' ELSE 'direto' END,'operacao_atomica',true));
  RETURN jsonb_build_object('already_processed',false,'status',a.status,'triage_id',t.id,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $function$
;

REVOKE ALL ON FUNCTION public."gravar_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados jsonb, p_confirmar boolean, p_enfermagem boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."gravar_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados jsonb, p_confirmar boolean, p_enfermagem boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_external_quota_admin_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.external_quota_admin_rpc', true) = 'on'
     OR current_setting('app.external_booking_rpc', true) IN ('create','cancel') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Alteração de cota exige a função administrativa auditada' USING ERRCODE = '42501';
END;
$function$
;

REVOKE ALL ON FUNCTION public."guard_external_quota_admin_write"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_external_quota_admin_write"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_external_quota_counter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.vagas_usadas <> 0 THEN
    RAISE EXCEPTION 'Uma nova cota deve iniciar com zero vagas usadas';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.vagas_usadas IS DISTINCT FROM OLD.vagas_usadas AND
     current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'create' AND
     current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'cancel' THEN
    RAISE EXCEPTION 'O contador da cota é controlado pelo servidor';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.vagas_usadas > 0 AND
     (NEW.unidade_id IS DISTINCT FROM OLD.unidade_id OR
      NEW.profissional_interno_id IS DISTINCT FROM OLD.profissional_interno_id OR
      NEW.profissional_externo_id IS DISTINCT FROM OLD.profissional_externo_id) THEN
    RAISE EXCEPTION 'Cota com agendamentos vinculados não pode mudar de unidade ou titular';
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."guard_external_quota_counter"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_external_quota_counter"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_external_shared_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slot public.disponibilidades%ROWTYPE;
  v_count integer;
  v_hour_count integer;
  v_matching integer := 0;
  v_valid_grid boolean := false;
  v_duration integer;
  v_master boolean;
  v_hora time;
  v_treatment_override boolean;
  v_internal boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origem = 'externo' OR nullif(OLD.agendado_por_externo, '') IS NOT NULL THEN
      RAISE EXCEPTION 'Agendamento externo vinculado não pode ser excluído diretamente';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origem = 'externo' THEN
    IF (NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora,
        NEW.agendado_por_externo, NEW.origem) IS DISTINCT FROM
       (OLD.paciente_id, OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora,
        OLD.agendado_por_externo, OLD.origem) THEN
      RAISE EXCEPTION 'Agendamento externo vinculado: solicite revisão ao Master';
    END IF;
    IF OLD.status <> 'cancelado' AND NEW.status = 'cancelado'
       AND current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'cancel' THEN
      RAISE EXCEPTION 'Cancelamento externo exige a função transacional';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.origem <> 'externo' AND NEW.origem = 'externo' THEN
    RAISE EXCEPTION 'Conversão direta para agendamento externo não permitida';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.origem = 'externo'
     AND current_setting('app.external_booking_rpc', true) IS DISTINCT FROM 'create' THEN
    RAISE EXCEPTION 'Agendamento externo exige a função transacional';
  END IF;
  IF NEW.status IN ('cancelado', 'falta') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('cancelado', 'falta')
     AND (NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora) IS NOT DISTINCT FROM
         (OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.profissional_id || '|' || NEW.unidade_id || '|' || NEW.data::text, 0));
  v_internal := NEW.origem IS DISTINCT FROM 'externo';
  IF v_internal AND NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.profissional_id = NEW.profissional_id AND a.unidade_id = NEW.unidade_id
      AND a.data = NEW.data AND a.origem = 'externo'
      AND a.status NOT IN ('cancelado', 'falta')
  ) THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.role = 'master' AND f.ativo) INTO v_master;
  IF v_master AND v_internal THEN RETURN NEW; END IF;
  IF NEW.hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RAISE EXCEPTION 'Horário inválido';
  END IF;
  v_hora := NEW.hora::time;
  v_treatment_override := public.treatment_manual_capacity_override_matches(
    NEW.id, NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.tipo, NEW.origem);
  IF public.is_date_blocked(NEW.data, NEW.profissional_id, NEW.unidade_id) THEN
    RAISE EXCEPTION 'Data bloqueada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b
    WHERE NEW.data BETWEEN b.data_inicio AND b.data_fim
      AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
        OR (b.unidade_id = NEW.unidade_id AND coalesce(b.profissional_id, '') = '')
        OR b.profissional_id = NEW.profissional_id)
      AND (b.dia_inteiro = true OR coalesce(b.hora_inicio, '') = ''
        OR (v_hora >= b.hora_inicio::time AND
            v_hora < coalesce(nullif(b.hora_fim, ''), '23:59')::time))) THEN
    RAISE EXCEPTION 'Horário bloqueado';
  END IF;

  -- Equipe interna pode encaixar mesmo com capacidade esgotada; feriados e
  -- bloqueios acima continuam valendo. A partir daqui vale apenas o fluxo externo.
  IF v_internal THEN RETURN NEW; END IF;

  FOR v_slot IN SELECT d.* FROM public.disponibilidades d
    WHERE d.profissional_id = NEW.profissional_id AND d.unidade_id = NEW.unidade_id
      AND NEW.data BETWEEN d.data_inicio AND d.data_fim
      AND extract(dow FROM NEW.data)::integer = ANY(d.dias_semana)
      AND v_hora >= d.hora_inicio::time AND v_hora < d.hora_fim::time
    ORDER BY d.id FOR SHARE OF d
  LOOP
    v_matching := v_matching + 1;
    IF v_slot.vagas_por_hora = 0 THEN
      IF v_hora <> v_slot.hora_inicio::time AND NOT v_treatment_override AND NOT v_internal THEN CONTINUE; END IF;
    ELSE
      v_duration := coalesce(nullif(v_slot.duracao_consulta, 0), 30);
      IF v_duration <= 0 THEN RAISE EXCEPTION 'Duração da disponibilidade inválida'; END IF;
      IF NOT v_internal AND (mod(extract(epoch FROM (v_hora - v_slot.hora_inicio::time))::numeric,
             (v_duration * 60)::numeric) <> 0
         OR extract(epoch FROM (v_slot.hora_fim::time - v_hora)) < v_duration * 60) THEN
        CONTINUE;
      END IF;
    END IF;
    v_valid_grid := true;
    SELECT count(*) INTO v_count FROM public.agendamentos a
    WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
      AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
      AND a.status NOT IN ('cancelado', 'falta')
      AND (v_slot.vagas_por_hora <> 0 OR
           (a.hora >= v_slot.hora_inicio AND a.hora < v_slot.hora_fim));
    IF v_count >= v_slot.vagas_por_dia AND NOT v_treatment_override THEN RAISE EXCEPTION 'Capacidade da data ou turno esgotada'; END IF;

    IF v_slot.vagas_por_hora > 0 THEN
      SELECT count(*) INTO v_hour_count FROM public.agendamentos a
      WHERE a.id <> NEW.id AND a.profissional_id = NEW.profissional_id
        AND a.unidade_id = NEW.unidade_id AND a.data = NEW.data
        AND a.status NOT IN ('cancelado', 'falta')
        AND left(a.hora, 3) = left(NEW.hora, 3);
      IF v_hour_count >= v_slot.vagas_por_hora AND NOT v_treatment_override THEN RAISE EXCEPTION 'Capacidade do horário esgotada'; END IF;
    END IF;
  END LOOP;
  IF v_matching = 0 THEN RAISE EXCEPTION 'Sem disponibilidade para a unidade, data e horário'; END IF;
  IF NOT v_valid_grid THEN RAISE EXCEPTION 'Horário fora da grade da disponibilidade'; END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."guard_external_shared_capacity"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_external_shared_capacity"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_external_specific_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_check jsonb;
BEGIN
  IF NEW.origem = 'externo' OR NEW.status IN ('cancelado', 'falta') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora)
       IS NOT DISTINCT FROM (OLD.profissional_id, OLD.unidade_id, OLD.data, OLD.hora)
     AND OLD.status NOT IN ('cancelado', 'falta') THEN
    -- Mudanças clínicas entre estados que já ocupavam vaga não reconsomem capacidade.
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.profissional_id || '|' || NEW.unidade_id || '|' || NEW.data::text, 0));
  IF current_setting('app.master_capacity_override', true) = 'on' THEN RETURN NEW; END IF;
  v_check := public.check_internal_slot_availability(NEW.profissional_id, NEW.unidade_id, NEW.data, NEW.hora,
    CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END);
  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM true
     AND NOT (v_check->>'reason' IN ('day_full','turno_full','hour_full')
       AND public.treatment_manual_capacity_override_matches(
         NEW.id, NEW.paciente_id, NEW.profissional_id, NEW.unidade_id, NEW.tipo, NEW.origem)) THEN
    RAISE EXCEPTION 'Agendamento interno bloqueado: %', coalesce(v_check->>'reason', 'capacidade_indisponivel')
      USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."guard_external_specific_reservation"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_external_specific_reservation"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_patient_profession_careness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_check jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paciente_id IS NOT DISTINCT FROM OLD.paciente_id
     AND NEW.profissional_id IS NOT DISTINCT FROM OLD.profissional_id
     AND NEW.unidade_id IS NOT DISTINCT FROM OLD.unidade_id
     AND NEW.data IS NOT DISTINCT FROM OLD.data THEN RETURN NEW; END IF;
  IF current_setting('app.profession_careness_override', true) = 'on' THEN RETURN NEW; END IF;
  v_check := public.check_patient_profession_careness(NEW.paciente_id, NEW.profissional_id, NEW.unidade_id);
  IF coalesce((v_check->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION '%', v_check->>'message' USING ERRCODE = 'P0001', DETAIL = v_check::text;
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."guard_patient_profession_careness"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_patient_profession_careness"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_treatment_cycle_conclusion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.assert_treatment_cycle_integrity(NEW.id);
  END IF;
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."guard_treatment_cycle_conclusion"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_treatment_cycle_conclusion"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."guard_treatment_cycle_conclusion"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_treatment_discharge_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.tipo_alta::text = 'conclusao' THEN
    PERFORM 1 FROM public.treatment_cycles WHERE id = NEW.cycle_id FOR UPDATE;
    PERFORM public.assert_treatment_cycle_integrity(NEW.cycle_id);
    IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id = NEW.cycle_id AND scheduled_date >= CURRENT_DATE AND status IN ('pendente_agendamento','agendada')) THEN
      RAISE EXCEPTION 'Conclusão não registrada: existem sessões futuras pendentes. Revise o ciclo; nenhuma sessão foi removida.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."guard_treatment_discharge_integrity"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_treatment_discharge_integrity"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."guard_treatment_discharge_integrity"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_treatment_plan_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; baseline jsonb; old_ids uuid[];
 old_fingerprint text; added integer; old_total integer; final_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.total_sessions IS NOT DISTINCT FROM OLD.total_sessions THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  baseline := (coalesce(nullif(current_setting('app.treatment_plan_baselines', true), ''), '{}')::jsonb)->NEW.id::text;
  IF TG_OP = 'UPDATE' AND coalesce((baseline->>'legacy')::boolean, false)
      AND c.total_sessions > (baseline->>'total')::integer THEN
    old_total := (baseline->>'total')::integer;
    SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[]) INTO old_ids
      FROM jsonb_array_elements_text(baseline->'ids');
    SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb)::text)
      INTO old_fingerprint FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.id = ANY(old_ids);
    IF old_fingerprint IS DISTINCT FROM baseline->>'fingerprint' THEN
      RAISE EXCEPTION 'A extensão não pode alterar ou excluir sessões anteriores. Recarregue o ciclo.' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO final_count FROM public.treatment_sessions WHERE cycle_id = c.id;
    added := final_count - (baseline->>'count')::integer;
    IF added <> c.total_sessions - old_total OR added < 1 THEN
      RAISE EXCEPTION 'Quantidade incompleta no acréscimo: nenhuma sessão foi gravada.' USING ERRCODE = '23514';
    END IF;
    -- Check only the appended rows against the final state, even if constraints
    -- were deferred or a second operation occurred in this transaction.
    IF EXISTS (
      SELECT 1 FROM public.treatment_sessions s LEFT JOIN public.agendamentos a ON a.id = s.appointment_id
      WHERE s.cycle_id = c.id AND NOT (s.id = ANY(old_ids)) AND (
        s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
        OR nullif(c.unit_id, '') IS NULL OR s.session_number <= old_total OR s.session_number > c.total_sessions
        OR (s.scheduled_date IS NULL AND (s.status <> 'pendente_agendamento' OR s.appointment_id IS NOT NULL))
        OR EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.cycle_id=c.id AND other.id<>s.id AND other.session_number=s.session_number)
        OR (s.status NOT IN ('cancelada','remarcada') AND EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.cycle_id=c.id AND other.id<>s.id AND other.scheduled_date=s.scheduled_date AND other.status NOT IN ('cancelada','remarcada')))
        OR (s.appointment_id IS NOT NULL AND (a.id IS NULL OR a.paciente_id IS DISTINCT FROM c.patient_id
          OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM s.scheduled_date
          OR EXISTS (SELECT 1 FROM public.treatment_sessions other WHERE other.id<>s.id AND other.appointment_id=s.appointment_id)))
      )
    ) THEN
      RAISE EXCEPTION 'Nova sessão inválida: confira paciente, profissional, unidade, data e numeração.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- New and previously consistent plans retain the complete validation.
  PERFORM public.assert_treatment_cycle_integrity(c.id);
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."guard_treatment_plan_count"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_treatment_plan_count"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."guard_treatment_plan_count"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_treatment_session_duplicate_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.scheduled_date IS NULL OR NEW.cycle_id IS NULL
     OR NEW.status IN ('cancelada','remarcada') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.treatment_sessions s
    WHERE s.cycle_id = NEW.cycle_id
      AND s.scheduled_date = NEW.scheduled_date
      AND s.id <> NEW.id
      AND s.status NOT IN ('cancelada','remarcada')
  ) THEN
    RAISE EXCEPTION 'Já existe outra sessão deste ciclo na data %. Escolha uma data diferente.',
      to_char(NEW.scheduled_date::date, 'DD/MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."guard_treatment_session_duplicate_date"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_duplicate_date"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_duplicate_date"() TO "anon";

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_duplicate_date"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_duplicate_date"() TO "service_role";

CREATE OR REPLACE FUNCTION public.guard_treatment_session_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; a public.agendamentos%ROWTYPE; check_date boolean; check_link boolean;
BEGIN
  check_date := TG_OP = 'INSERT'; check_link := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    check_date := NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR (OLD.status IN ('cancelada','remarcada') AND NEW.status NOT IN ('cancelada','remarcada')) OR (NEW.appointment_id IS DISTINCT FROM OLD.appointment_id AND NEW.appointment_id IS NOT NULL);
    check_link := NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date AND nullif(btrim(current_setting('app.treatment_change_reason', true)), '') IS NULL THEN
      RAISE EXCEPTION 'Informe uma justificativa pela revisão segura da sessão.' USING ERRCODE = '23514';
    END IF;
    IF NEW.session_number IS DISTINCT FROM OLD.session_number THEN
      RAISE EXCEPTION 'A numeração histórica não pode ser alterada automaticamente.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NOT check_date AND NOT check_link THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = NEW.cycle_id FOR UPDATE;
  IF NOT FOUND OR NEW.patient_id IS DISTINCT FROM c.patient_id OR NEW.professional_id IS DISTINCT FROM c.professional_id THEN
    RAISE EXCEPTION 'Sessão divergente do paciente ou profissional do ciclo.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.session_number < 1 OR NEW.session_number > c.total_sessions OR EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.session_number = NEW.session_number)) THEN
    RAISE EXCEPTION 'Numeração inconsistente: a sessão excede ou repete a sequência planejada.' USING ERRCODE = '23514';
  END IF;
  IF check_date AND NEW.status NOT IN ('cancelada','remarcada') AND EXISTS(SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = NEW.cycle_id AND s.id <> NEW.id AND s.scheduled_date = NEW.scheduled_date AND s.status NOT IN ('cancelada','remarcada')) THEN
    RAISE EXCEPTION 'Já existe a sessão nº % deste ciclo em %. Escolha outra data.', (SELECT s.session_number FROM public.treatment_sessions s WHERE s.cycle_id = NEW.cycle_id AND s.id <> NEW.id AND s.scheduled_date = NEW.scheduled_date AND s.status NOT IN ('cancelada','remarcada') ORDER BY s.session_number LIMIT 1), to_char(NEW.scheduled_date, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;
  IF check_link AND NEW.appointment_id IS NOT NULL THEN
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id) THEN
      RAISE EXCEPTION 'Agendamento já vinculado à sessão nº % do ciclo %. O vínculo original foi preservado.', (SELECT s.session_number FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id LIMIT 1), (SELECT s.cycle_id FROM public.treatment_sessions s WHERE s.appointment_id = NEW.appointment_id AND s.id <> NEW.id LIMIT 1) USING ERRCODE = '23514';
    END IF;
    SELECT * INTO a FROM public.agendamentos WHERE id = NEW.appointment_id;
    IF NOT FOUND OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM NEW.scheduled_date THEN
      RAISE EXCEPTION 'Agendamento divergente de paciente, profissional, unidade ou data.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

REVOKE ALL ON FUNCTION public."guard_treatment_session_integrity"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_integrity"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."guard_treatment_session_integrity"() TO "service_role";

CREATE OR REPLACE FUNCTION public.has_staff_role(_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
    AND role = _role
  )
$function$
;

REVOKE ALL ON FUNCTION public."has_staff_role"(_role text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."has_staff_role"(_role text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."has_staff_role"(_role text) TO "service_role";

CREATE OR REPLACE FUNCTION public.iniciar_atendimento(p_agendamento_id text, p_profissional_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_profissional_id text;
BEGIN
  SELECT status, profissional_id
    INTO v_status, v_profissional_id
    FROM agendamentos
   WHERE id = p_agendamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF v_profissional_id != p_profissional_id THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Profissional não autorizado para este agendamento';
  END IF;

  IF v_status NOT IN ('confirmado_chegada', 'aguardando_atendimento') THEN
    RAISE EXCEPTION 'arrival_not_confirmed'
      USING HINT = 'Chegada do paciente ainda não foi confirmada pela recepção';
  END IF;

  UPDATE agendamentos
     SET status = 'em_atendimento',
         iniciado_em = COALESCE(iniciado_em, now()),
         atualizado_em = now()
   WHERE id = p_agendamento_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public."iniciar_atendimento"(p_agendamento_id text, p_profissional_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."iniciar_atendimento"(p_agendamento_id text, p_profissional_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."iniciar_atendimento"(p_agendamento_id text, p_profissional_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.iniciar_triagem_atendimento(p_agendamento_id text, p_tecnico_id text, p_paciente_id_esperado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.agendamentos%ROWTYPE; f public.fila_espera%ROWTYPE; v_actor jsonb; v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.agendamentos WHERE id=p_agendamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE='23503'; END IF;
  v_actor := public.assert_care_flow_actor(a.unidade_id,p_tecnico_id,'triagem');
  IF p_paciente_id_esperado IS NOT NULL AND a.paciente_id IS DISTINCT FROM p_paciente_id_esperado THEN RAISE EXCEPTION 'O paciente do agendamento mudou. Atualize a fila antes de continuar.' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM public.fila_espera WHERE id=a.id FOR UPDATE;
  IF NOT FOUND OR f.unidade_id IS DISTINCT FROM a.unidade_id OR f.paciente_id IS DISTINCT FROM a.paciente_id THEN
    RAISE EXCEPTION 'Fila divergente. Peça à Recepção para sincronizar com a Triagem.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id AND confirmado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Esta triagem já foi concluída. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  IF a.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') OR f.status NOT IN ('confirmado_chegada','chegada_confirmada','aguardando_triagem') THEN
    RAISE EXCEPTION 'O paciente já avançou no atendimento. Atualize a fila.' USING ERRCODE='23514';
  END IF;
  IF a.status='aguardando_triagem' AND f.status='aguardando_triagem' THEN
    RETURN jsonb_build_object('already_processed',true,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
  END IF;
  v_before := jsonb_build_object('agendamento_status',a.status,'fila_status',f.status);
  UPDATE public.agendamentos SET status='aguardando_triagem' WHERE id=a.id RETURNING * INTO a;
  UPDATE public.fila_espera SET status='aguardando_triagem' WHERE id=a.id RETURNING * INTO f;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,agendamento_id,paciente_id,profissional_id,"before","after",detalhes)
    VALUES(v_actor->>'id',v_actor->>'nome',v_actor->>'role',a.unidade_id,'iniciar_triagem','agendamento',a.id,'triagem',a.id,a.paciente_id,a.profissional_id,v_before,jsonb_build_object('agendamento_status',a.status,'fila_status',f.status),jsonb_build_object('operacao_atomica',true));
  RETURN jsonb_build_object('already_processed',false,'status',a.status,'agendamento',to_jsonb(a),'fila',to_jsonb(f));
END $function$
;

REVOKE ALL ON FUNCTION public."iniciar_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_paciente_id_esperado text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."iniciar_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_paciente_id_esperado text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."iniciar_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_paciente_id_esperado text) TO "service_role";

CREATE OR REPLACE FUNCTION public.is_date_blocked(p_date date, p_profissional_id text, p_unidade_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bloqueios
    WHERE p_date >= data_inicio
      AND p_date <= data_fim
      AND (
        -- Global: no unit and no professional specified
        (unidade_id IS NULL OR unidade_id = '') AND (profissional_id IS NULL OR profissional_id = '')
        -- Unit-level: matches unit, no professional
        OR ((unidade_id = p_unidade_id) AND (profissional_id IS NULL OR profissional_id = ''))
        -- Professional-level: matches professional
        OR (profissional_id = p_profissional_id)
      )
      AND (
        dia_inteiro = true
        OR (hora_inicio IS NULL OR hora_inicio = '')
      )
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public."is_date_blocked"(p_date date, p_profissional_id text, p_unidade_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_date_blocked"(p_date date, p_profissional_id text, p_unidade_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_date_blocked"(p_date date, p_profissional_id text, p_unidade_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.is_external_professional()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profissionais_externos
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$function$
;

REVOKE ALL ON FUNCTION public."is_external_professional"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_external_professional"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_external_professional"() TO "service_role";

CREATE OR REPLACE FUNCTION public.is_global_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.funcionarios WHERE auth_user_id = auth.uid() AND usuario = 'admin.sms' AND ativo = true)
$function$
;

REVOKE ALL ON FUNCTION public."is_global_owner"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_global_owner"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_global_owner"() TO "service_role";

CREATE OR REPLACE FUNCTION public.is_master_for_careness()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.funcionarios f
    WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role)) = 'master')
$function$
;

REVOKE ALL ON FUNCTION public."is_master_for_careness"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_master_for_careness"() TO "service_role";

CREATE OR REPLACE FUNCTION public.is_staff_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE auth_user_id = auth.uid()
    AND ativo = true
  )
$function$
;

REVOKE ALL ON FUNCTION public."is_staff_member"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_staff_member"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_staff_member"() TO "service_role";

CREATE OR REPLACE FUNCTION public.is_whatsapp_24h_window_open(p_phone text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_conversations
    WHERE phone = p_phone
      AND last_patient_message_at IS NOT NULL
      AND last_patient_message_at >= now() - interval '24 hours'
      AND COALESCE(opted_out,false) = false
  );
$function$
;

REVOKE ALL ON FUNCTION public."is_whatsapp_24h_window_open"(p_phone text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_whatsapp_24h_window_open"(p_phone text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_whatsapp_24h_window_open"(p_phone text) TO "service_role";

CREATE OR REPLACE FUNCTION public.liberar_falta(p_paciente_id text, p_agendamento_id text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_paciente_nome text;
  v_status jsonb;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'paciente_nao_encontrado';
  END IF;

  IF p_all THEN
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE paciente_id = p_paciente_id
       AND status = 'falta'
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE patient_id = p_paciente_id
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
  ELSIF p_agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_agendamento_id AND status = 'falta';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_session_id IS NOT NULL THEN
    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_session_id AND status IN ('falta','paciente_faltou');
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Libera somente a última falta injustificada do paciente
    UPDATE public.agendamentos a
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE a.id = (
       SELECT id FROM public.agendamentos
        WHERE paciente_id = p_paciente_id
          AND status = 'falta'
          AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada,false) = false
        ORDER BY data DESC, hora DESC
        LIMIT 1
     );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','falta_liberada',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'paciente_nome', v_paciente_nome,
      'agendamento_id', p_agendamento_id,
      'session_id', p_session_id,
      'liberadas', v_count,
      'liberar_todas', p_all,
      'motivo', p_motivo,
      'liberado_por_id', p_user_id,
      'liberado_por_nome', p_user_nome,
      'mensagem', format('%s liberou %s falta(s) do paciente %s. Motivo: %s',
        COALESCE(p_user_nome,'(usuário)'), v_count, v_paciente_nome, p_motivo)
    ),'pendente', now());

  v_status := public.atualizar_status_falta(p_paciente_id);

  RETURN jsonb_build_object('ok', true, 'liberadas', v_count, 'status', v_status);
END;
$function$
;

REVOKE ALL ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.liberar_falta(p_paciente_id text, p_agendamento_id text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text, p_all boolean DEFAULT false, p_profissional_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_paciente_nome text;
  v_status jsonb;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'paciente_nao_encontrado';
  END IF;

  IF p_all THEN
    -- Se passou profissional, libera apenas dele. Senão libera tudo (Master).
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE paciente_id = p_paciente_id
       AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)
       AND status = 'falta'
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE patient_id = p_paciente_id
       AND (p_profissional_id IS NULL OR professional_id = p_profissional_id)
       AND status IN ('falta','paciente_faltou')
       AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
       AND COALESCE(falta_liberada,false) = false;
  ELSIF p_agendamento_id IS NOT NULL THEN
    UPDATE public.agendamentos
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_agendamento_id AND status = 'falta';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_session_id IS NOT NULL THEN
    UPDATE public.treatment_sessions
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE id = p_session_id AND status IN ('falta','paciente_faltou');
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Libera somente a última falta injustificada do paciente NO CONTEXTO do profissional (se informado)
    UPDATE public.agendamentos a
       SET falta_liberada = true,
           liberada_em = now(),
           liberada_por = p_user_id,
           motivo_liberacao = p_motivo
     WHERE a.id = (
       SELECT id FROM public.agendamentos
        WHERE paciente_id = p_paciente_id
          AND (p_profissional_id IS NULL OR profissional_id = p_profissional_id)
          AND status = 'falta'
          AND COALESCE(tipo_falta,'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada,false) = false
        ORDER BY data DESC, hora DESC
        LIMIT 1
     );
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  -- Log de auditoria
  INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
  VALUES ('sistema','falta_liberada',
    jsonb_build_object(
      'paciente_id', p_paciente_id,
      'profissional_id', p_profissional_id,
      'liberadas', v_count,
      'motivo', p_motivo,
      'liberado_por_nome', p_user_nome
    ),'pendente', now());

  -- Recalcula status
  v_status := public.atualizar_status_falta(p_paciente_id, p_profissional_id);

  RETURN jsonb_build_object('ok', true, 'liberadas', v_count, 'status', v_status);
END;
$function$
;

REVOKE ALL ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean, p_profissional_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean, p_profissional_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."liberar_falta"(p_paciente_id text, p_agendamento_id text, p_session_id uuid, p_motivo text, p_user_id uuid, p_user_nome text, p_all boolean, p_profissional_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.link_existing_treatment_session_appointment(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.* INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF p_appointment_id IS NULL OR p_expected_session_date IS NULL THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'vinculo');
  END IF;

  SELECT a.* INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_appointment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ausente');
  END IF;
  IF v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM p_expected_session_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_divergente');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.treatment_sessions other_session
     WHERE other_session.appointment_id = p_appointment_id
       AND other_session.id <> p_session_id
  ) THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento_ja_vinculado');
  END IF;

  -- Idempotent retry: report the existing valid link without writing again.
  IF v_session.status = 'agendada' AND v_session.appointment_id = p_appointment_id
     AND v_session.scheduled_date = p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_alterada');
  END IF;

  UPDATE public.treatment_sessions s
     SET appointment_id = p_appointment_id, status = 'agendada'
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id
     AND s.status = 'pendente_agendamento' AND s.appointment_id IS NULL
     AND s.scheduled_date = p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Sessão alterada durante o vínculo' USING ERRCODE = '40001';
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status', 'ja_agendado', 'session', to_jsonb(v_session), 'appointment', to_jsonb(v_appointment));
END;
$function$
;

REVOKE ALL ON FUNCTION public."link_existing_treatment_session_appointment"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."link_existing_treatment_session_appointment"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."link_existing_treatment_session_appointment"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.link_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa do vínculo manual.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  -- Historical discrepancies on other sessions do not block a valid manual link.
  result := public.link_existing_treatment_session_appointment(p_session_id,p_cycle_id,p_expected_session_date,p_appointment_id);
  IF result->>'status' = 'ja_agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'vincular_agenda_manual','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'agendamento_id',p_appointment_id));
  END IF;
  RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."link_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."link_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."link_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment_id text, p_reason text) TO "service_role";

CREATE OR REPLACE FUNCTION public.list_active_profession_careness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role := lower(trim(v_staff.role));
  IF v_role NOT IN ('master','gestao','gestão','coordenador','coordenacao') THEN
    RAISE EXCEPTION 'Sem permissão para consultar este relatório' USING ERRCODE='42501';
  END IF;
  IF NOT public.profession_careness_mapping_is_current() THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('patient_id',c.patient_id,'patient_name',p.nome,
      'profession',c.profession_name,'discharge_date',c.discharge_date,'release_date',c.release_date,
      'source_unit_id',c.source_unit_id,'unit_name',u.nome,'scope',c.scope)
      ORDER BY c.release_date,c.profession_name,p.nome)
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key=c.profession_key AND r.enabled IS TRUE
    JOIN public.pacientes p ON p.id=c.patient_id
    LEFT JOIN public.unidades u ON u.id=c.source_unit_id
    WHERE c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date>current_date
      AND (v_role='master' OR v_staff.usuario='admin.sms' OR c.scope='global'
           OR c.source_unit_id=coalesce(v_staff.unidade_id,''))),'[]'::jsonb);
END;
$function$
;

REVOKE ALL ON FUNCTION public."list_active_profession_careness"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."list_active_profession_careness"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."list_active_profession_careness"() TO "service_role";

CREATE OR REPLACE FUNCTION public.list_patient_profession_careness(p_patient_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (
       NOT public.is_staff_member()
       AND NOT EXISTS (
         SELECT 1 FROM public.pacientes p
          WHERE p.id = p_patient_id AND p.auth_user_id = auth.uid()
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos dados de carência deste paciente' USING ERRCODE = '42501';
  END IF;

  IF NOT public.profession_careness_mapping_is_current() THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('profession',c.profession_name,'discharge_date',c.discharge_date,
      'release_date',c.release_date,'source_unit_id',c.source_unit_id,'scope',c.scope))
    FROM public.patient_profession_careness c
    JOIN public.profession_careness_rules r ON r.profession_key = c.profession_key AND r.enabled IS TRUE
    WHERE c.patient_id = p_patient_id AND c.released_at IS NULL AND c.annulled_at IS NULL AND c.release_date>current_date), '[]'::jsonb);
END;
$function$
;

REVOKE ALL ON FUNCTION public."list_patient_profession_careness"(p_patient_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."list_patient_profession_careness"(p_patient_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."list_patient_profession_careness"(p_patient_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.list_profession_careness_setup()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb; v_catalog jsonb; v_signature text; v_confirmed text;
BEGIN
  IF NOT public.is_master_for_careness() THEN RAISE EXCEPTION 'Somente Master pode configurar carência' USING ERRCODE='42501'; END IF;
  v_catalog := public.profession_careness_catalog();
  v_signature := md5(v_catalog::text);
  SELECT confirmed_signature INTO v_confirmed FROM public.profession_careness_mapping_state WHERE id IS TRUE;
  SELECT jsonb_agg(p.value || jsonb_build_object(
    'profession_name',coalesce(r.profession_name,p.value->>'suggested_name'),
    'enabled',coalesce(r.enabled,false),'duration_value',coalesce(r.duration_value,30),
    'duration_unit',coalesce(r.duration_unit,'days'),'scope',coalesce(r.scope,'global')
  ) ORDER BY p.value->>'suggested_name') INTO v_result
    FROM jsonb_array_elements(v_catalog) p(value)
    LEFT JOIN public.profession_careness_rules r ON r.profession_key=p.value->>'profession_key';
  RETURN jsonb_build_object('professions',coalesce(v_result,'[]'::jsonb),'mapping_signature',v_signature,
    'mapping_confirmed',coalesce(v_confirmed,'')=v_signature);
END;
$function$
;

REVOKE ALL ON FUNCTION public."list_profession_careness_setup"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."list_profession_careness_setup"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."list_profession_careness_setup"() TO "service_role";

CREATE OR REPLACE FUNCTION public.manage_external_quota(p_action text, p_quota_id uuid, p_payload jsonb, p_motivo_alteracao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_old public.quotas_externas%ROWTYPE;
  v_new public.quotas_externas%ROWTYPE; v_unit text; v_profile text; v_authorized boolean := false;
  v_profissional_id uuid; v_active boolean; v_start date; v_end date; v_turn text;
  v_start_time time; v_end_time time; v_total integer;
  v_matching_availability integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO v_staff FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado'; END IF;
  IF p_action NOT IN ('create','update','toggle','delete') THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  IF p_action <> 'create' THEN
    SELECT * INTO v_old FROM public.quotas_externas WHERE id = p_quota_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cota não encontrada'; END IF;
  END IF;
  v_unit := coalesce(nullif(p_payload->>'unidade_id',''), v_old.unidade_id);
  v_profile := CASE lower(btrim(v_staff.role)) WHEN 'coordenador' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao' WHEN 'gestão' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    ELSE lower(btrim(v_staff.role)) END;
  IF v_profile = 'master' AND (v_staff.usuario = 'admin.sms' OR v_staff.unidade_id = v_unit) THEN v_authorized := true;
  ELSIF v_staff.unidade_id = v_unit THEN
    SELECT coalesce(
      (SELECT pu.can_edit FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
       AND pu.modulo='usuarios' AND pu.unidade_id IN ('',v_unit)
       ORDER BY (pu.unidade_id=v_unit) DESC LIMIT 1),
      (SELECT p.can_edit FROM public.permissoes p WHERE p.perfil IN (v_profile,lower(btrim(v_staff.role)))
       AND p.modulo='usuarios' AND p.unidade_id IN ('',v_unit)
       ORDER BY (p.unidade_id=v_unit) DESC,(p.perfil=v_profile) DESC LIMIT 1),false) INTO v_authorized;
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'Sem permissão para alterar cotas nesta unidade' USING ERRCODE='42501'; END IF;
  IF p_action <> 'create' AND coalesce(length(btrim(p_motivo_alteracao)),0) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da alteração';
  END IF;
  IF p_action IN ('create','update') THEN
    v_profissional_id := coalesce(nullif(p_payload->>'profissional_interno_id','')::uuid, v_old.profissional_interno_id);
    v_active := coalesce(nullif(p_payload->>'ativo','')::boolean, v_old.ativo, true);
    v_start := coalesce(nullif(p_payload->>'periodo_inicio','')::date, v_old.periodo_inicio);
    v_end := coalesce(nullif(p_payload->>'periodo_fim','')::date, v_old.periodo_fim);
    v_turn := coalesce(nullif(p_payload->>'turno',''), v_old.turno);
    v_start_time := coalesce(nullif(p_payload->>'horario_inicio','')::time, v_old.horario_inicio);
    v_end_time := coalesce(nullif(p_payload->>'horario_fim','')::time, v_old.horario_fim);
    v_total := coalesce(nullif(p_payload->>'vagas_total','')::integer, v_old.vagas_total);
    IF v_active AND (coalesce(btrim(v_unit),'')='' OR v_profissional_id IS NULL OR v_total <= 0
       OR v_start IS NULL OR v_end IS NULL OR v_start > v_end
       OR v_turn NOT IN ('manha','tarde','noite','integral','personalizado')
       OR (v_turn <> 'integral' AND (v_start_time IS NULL OR v_end_time IS NULL OR v_start_time >= v_end_time))) THEN
      RAISE EXCEPTION 'Configuração ativa da cota é inválida';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.id=v_unit AND u.ativo) THEN
      RAISE EXCEPTION 'Unidade da cota indisponível';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id=v_profissional_id AND f.ativo) THEN
      RAISE EXCEPTION 'Profissional interno indisponível';
    END IF;
    IF v_active AND NOT EXISTS (SELECT 1 FROM public.disponibilidades d
      WHERE d.profissional_id=v_profissional_id::text AND d.unidade_id=v_unit) THEN
      RAISE EXCEPTION 'Profissional sem disponibilidade nesta unidade';
    END IF;
    IF v_active AND v_start = v_end THEN
      SELECT count(*) INTO v_matching_availability
      FROM public.disponibilidades d
      WHERE d.profissional_id = v_profissional_id::text AND d.unidade_id = v_unit
        AND v_start BETWEEN d.data_inicio AND d.data_fim
        AND extract(dow FROM v_start)::integer = ANY(d.dias_semana)
        AND ((v_turn = 'integral' AND NOT EXISTS (
          SELECT 1 FROM public.disponibilidades other
          WHERE other.profissional_id = v_profissional_id::text AND other.unidade_id = v_unit
            AND v_start BETWEEN other.data_inicio AND other.data_fim
            AND extract(dow FROM v_start)::integer = ANY(other.dias_semana)
            AND other.id <> d.id))
          OR (v_turn <> 'integral' AND d.hora_inicio::time = v_start_time AND d.hora_fim::time = v_end_time));
      IF v_matching_availability <> 1 THEN
        RAISE EXCEPTION 'Reserva de data específica não corresponde a uma disponibilidade inequívoca';
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.external_quota_admin_rpc','on',true);
  IF p_action = 'create' THEN
    INSERT INTO public.quotas_externas (profissional_externo_id,profissional_interno_id,unidade_id,
      vagas_total,vagas_usadas,periodo_inicio,periodo_fim,turno,horario_inicio,horario_fim,especialidade,ativo)
    VALUES ((p_payload->>'profissional_externo_id')::uuid,(p_payload->>'profissional_interno_id')::uuid,
      v_unit,(p_payload->>'vagas_total')::integer,0,(p_payload->>'periodo_inicio')::date,
      (p_payload->>'periodo_fim')::date,p_payload->>'turno',nullif(p_payload->>'horario_inicio','')::time,
      nullif(p_payload->>'horario_fim','')::time,p_payload->>'especialidade',true) RETURNING * INTO v_new;
  ELSIF p_action = 'update' THEN
    IF v_old.vagas_usadas > 0 AND v_unit IS DISTINCT FROM v_old.unidade_id THEN RAISE EXCEPTION 'Cota utilizada não pode mudar de unidade'; END IF;
    IF (p_payload->>'vagas_total')::integer < v_old.vagas_usadas THEN RAISE EXCEPTION 'Total menor que vagas usadas'; END IF;
    UPDATE public.quotas_externas SET unidade_id=v_unit,vagas_total=(p_payload->>'vagas_total')::integer,
      periodo_inicio=(p_payload->>'periodo_inicio')::date,periodo_fim=(p_payload->>'periodo_fim')::date,
      turno=p_payload->>'turno',horario_inicio=nullif(p_payload->>'horario_inicio','')::time,
      horario_fim=nullif(p_payload->>'horario_fim','')::time,ativo=(p_payload->>'ativo')::boolean
      WHERE id=p_quota_id RETURNING * INTO v_new;
  ELSIF p_action = 'toggle' THEN
    UPDATE public.quotas_externas SET ativo=(p_payload->>'ativo')::boolean WHERE id=p_quota_id RETURNING * INTO v_new;
  ELSE
    IF v_old.vagas_usadas > 0 THEN UPDATE public.quotas_externas SET ativo=false WHERE id=p_quota_id RETURNING * INTO v_new;
    ELSE DELETE FROM public.quotas_externas WHERE id=p_quota_id; v_new := v_old; END IF;
  END IF;
  INSERT INTO public.action_logs (user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,before,after,detalhes)
  VALUES (v_staff.id::text,v_staff.nome,v_staff.role,v_unit,p_action||'_external_quota','quotas_externas',
    coalesce(p_quota_id,v_new.id)::text,'usuarios',CASE WHEN p_action='create' THEN NULL ELSE to_jsonb(v_old) END,
    CASE WHEN p_action='delete' AND v_old.vagas_usadas=0 THEN NULL ELSE to_jsonb(v_new) END,
    jsonb_build_object('motivo_alteracao',nullif(btrim(p_motivo_alteracao),'')));
  PERFORM set_config('app.external_quota_admin_rpc','off',true);
  RETURN jsonb_build_object('id',coalesce(p_quota_id,v_new.id),'action',p_action);
END;
$function$
;

REVOKE ALL ON FUNCTION public."manage_external_quota"(p_action text, p_quota_id uuid, p_payload jsonb, p_motivo_alteracao text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."manage_external_quota"(p_action text, p_quota_id uuid, p_payload jsonb, p_motivo_alteracao text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."manage_external_quota"(p_action text, p_quota_id uuid, p_payload jsonb, p_motivo_alteracao text) TO "service_role";

CREATE OR REPLACE FUNCTION public.manage_external_quotas(p_payloads jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_payload jsonb; v_results jsonb := '[]'::jsonb; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_payloads) <> 'array' OR jsonb_array_length(p_payloads) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma cota';
  END IF;
  FOR v_payload IN SELECT payload FROM jsonb_array_elements(p_payloads) AS item(payload) LOOP
    v_result := public.manage_external_quota('create', NULL, v_payload, NULL);
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;
  RETURN v_results;
END;
$function$
;

REVOKE ALL ON FUNCTION public."manage_external_quotas"(p_payloads jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."manage_external_quotas"(p_payloads jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."manage_external_quotas"(p_payloads jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.normalize_profession(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
DECLARE v_value text;
BEGIN
  v_value := trim(regexp_replace(public.unaccent(lower(p_value)), '[^a-z0-9]+', ' ', 'g'));
  v_value := regexp_replace(v_value, '\s+', ' ', 'g');
  -- Normalize gender inflections only when they are recognized suffixes.
  v_value := regexp_replace(v_value, 'ologa$', 'ologo');
  v_value := regexp_replace(v_value, 'ica$', 'ico');
  v_value := regexp_replace(v_value, 'eira$', 'eiro');
  v_value := regexp_replace(v_value, 'ora$', 'or');
  v_value := CASE v_value
    WHEN 'fonoaudiologia' THEN 'fonoaudiologo'
    WHEN 'fisioterapia' THEN 'fisioterapeuta'
    WHEN 'nutricao' THEN 'nutricionista'
    WHEN 'medicina' THEN 'medico'
    WHEN 'psicologia' THEN 'psicologo'
    WHEN 'odontologia' THEN 'odontologo'
    WHEN 'assistencia social' THEN 'assistente social'
    ELSE v_value END;
  RETURN nullif(v_value, '');
END;
$function$
;

REVOKE ALL ON FUNCTION public."normalize_profession"(p_value text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."normalize_profession"(p_value text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."normalize_profession"(p_value text) TO "anon";

GRANT EXECUTE ON FUNCTION public."normalize_profession"(p_value text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."normalize_profession"(p_value text) TO "service_role";

CREATE OR REPLACE FUNCTION public.notify_permissao_alterada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
  v_table text := TG_TABLE_NAME;
  v_op text := TG_OP;
BEGIN
  v_payload := jsonb_build_object(
    'evento', 'permissao_alterada',
    'tabela', v_table,
    'operacao', v_op,
    'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'timestamp', now()
  );

  INSERT INTO public.notification_logs (canal, evento, payload, status)
  VALUES ('webhook', 'permissao_alterada', v_payload, 'pendente');

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

REVOKE ALL ON FUNCTION public."notify_permissao_alterada"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."notify_permissao_alterada"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."notify_permissao_alterada"() TO "service_role";

CREATE OR REPLACE FUNCTION public.prevent_action_logs_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são legalmente imutáveis e não podem ser alterados ou excluídos.';
END; $function$
;

REVOKE ALL ON FUNCTION public."prevent_action_logs_mutation"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."prevent_action_logs_mutation"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."prevent_action_logs_mutation"() TO "anon";

GRANT EXECUTE ON FUNCTION public."prevent_action_logs_mutation"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."prevent_action_logs_mutation"() TO "service_role";

CREATE OR REPLACE FUNCTION public.preview_profession_careness_retroactive(p_profession_key text, p_duration_value integer, p_duration_unit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_total integer; v_expired integer; v_blocked integer;
BEGIN
  IF NOT public.is_master_for_careness() THEN RAISE EXCEPTION 'Somente Master pode visualizar impacto' USING ERRCODE='42501'; END IF;
  IF p_duration_value NOT BETWEEN 1 AND 3650 OR p_duration_unit NOT IN ('days','months') THEN RAISE EXCEPTION 'Período de carência inválido'; END IF;
  WITH eligible AS (
    SELECT DISTINCT d.id, public.careness_release_date(d.discharge_date,p_duration_value,p_duration_unit) AS release_date
      FROM public.patient_discharges d
      JOIN public.treatment_cycles c ON c.id=d.cycle_id
      JOIN public.funcionarios f ON f.id::text=c.professional_id
     WHERE d.tipo_alta='conclusao' AND public.normalize_profession(f.profissao)=p_profession_key
       AND NOT EXISTS (SELECT 1 FROM public.patient_profession_careness pc WHERE pc.discharge_id=d.id AND pc.annulled_at IS NULL
           AND (pc.released_at IS NULL OR pc.release_reason <> 'regra desativada'))
       AND NOT EXISTS (
         SELECT 1 FROM public.treatment_cycles oc JOIN public.funcionarios ofp ON ofp.id::text=oc.professional_id
          WHERE oc.patient_id=d.patient_id AND oc.id<>c.id AND oc.professional_id<>c.professional_id
            AND oc.status IN ('em_andamento','ativo') AND public.normalize_profession(ofp.profissao)=p_profession_key
       )
  ) SELECT count(*)::integer, count(*) FILTER (WHERE release_date < current_date)::integer,
           count(*) FILTER (WHERE release_date > current_date)::integer
      INTO v_total,v_expired,v_blocked FROM eligible;
  RETURN jsonb_build_object('total',coalesce(v_total,0),'expired',coalesce(v_expired,0),'blocked_now',coalesce(v_blocked,0));
END;
$function$
;

REVOKE ALL ON FUNCTION public."preview_profession_careness_retroactive"(p_profession_key text, p_duration_value integer, p_duration_unit text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."preview_profession_careness_retroactive"(p_profession_key text, p_duration_value integer, p_duration_unit text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."preview_profession_careness_retroactive"(p_profession_key text, p_duration_value integer, p_duration_unit text) TO "service_role";

CREATE OR REPLACE FUNCTION public.profession_careness_catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'profession_key',x.profession_key,'suggested_name',x.suggested_name,
    'source_values',x.source_values,'professional_count',x.professional_count
  ) ORDER BY x.suggested_name),'[]'::jsonb)
  FROM (
    SELECT public.normalize_profession(f.profissao) AS profession_key,
      CASE public.normalize_profession(f.profissao)
        WHEN 'fonoaudiologo' THEN 'Fonoaudiólogo(a)'
        WHEN 'medico' THEN 'Médico(a)'
        WHEN 'odontologo' THEN 'Odontólogo(a)'
        WHEN 'psicologo' THEN 'Psicólogo(a)'
        WHEN 'assistente social' THEN 'Assistente Social'
        ELSE initcap(min(trim(f.profissao))) END AS suggested_name,
      array_agg(DISTINCT trim(f.profissao) ORDER BY trim(f.profissao)) AS source_values,
      count(*)::integer AS professional_count
    FROM public.funcionarios f
    WHERE nullif(trim(f.profissao),'') IS NOT NULL
      AND public.normalize_profession(f.profissao) IS NOT NULL
    GROUP BY public.normalize_profession(f.profissao)
  ) x
$function$
;

REVOKE ALL ON FUNCTION public."profession_careness_catalog"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."profession_careness_catalog"() TO "service_role";

CREATE OR REPLACE FUNCTION public.profession_careness_mapping_is_current()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.profession_careness_mapping_state s
     WHERE s.id IS TRUE
       AND s.confirmed_signature = md5(public.profession_careness_catalog()::text)
  )
$function$
;

REVOKE ALL ON FUNCTION public."profession_careness_mapping_is_current"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."profession_careness_mapping_is_current"() TO "service_role";

CREATE OR REPLACE FUNCTION public.propagate_paciente_nome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.prontuarios SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.agendamentos SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.atendimentos SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.fila_espera SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.documentos_gerados SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.whatsapp_queue SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
    UPDATE public.whatsapp_inbound_messages SET paciente_nome = NEW.nome WHERE paciente_id = NEW.id AND paciente_nome IS DISTINCT FROM NEW.nome;
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."propagate_paciente_nome"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."propagate_paciente_nome"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."propagate_paciente_nome"() TO "service_role";

CREATE OR REPLACE FUNCTION public.reavaliar_todos_status_falta()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
  v_atualizados int := 0;
  v_bloqueados int := 0;
  v_faltosos int := 0;
  v_regulares int := 0;
BEGIN
  SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
  FROM public.system_config WHERE id = 'default';

  IF v_cfg IS NOT NULL THEN
    v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
    v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
  END IF;

  WITH counts AS (
    SELECT p.id AS pid,
           COALESCE((SELECT COUNT(*) FROM public.agendamentos a WHERE a.paciente_id = p.id AND a.status = 'falta'),0)
         + COALESCE((SELECT COUNT(*) FROM public.treatment_sessions s WHERE s.patient_id = p.id AND s.status IN ('falta','paciente_faltou')),0) AS total
    FROM public.pacientes p
  ), upd AS (
    UPDATE public.pacientes p
       SET total_faltas = c.total,
           status_falta = CASE
             WHEN c.total >= v_limite_bloqueio THEN 'BLOQUEADO'
             WHEN c.total >= v_limite_alerta   THEN 'FALTOSO'
             ELSE 'REGULAR'
           END
      FROM counts c
     WHERE p.id = c.pid
       AND (p.total_faltas IS DISTINCT FROM c.total
            OR p.status_falta IS DISTINCT FROM CASE
                  WHEN c.total >= v_limite_bloqueio THEN 'BLOQUEADO'
                  WHEN c.total >= v_limite_alerta   THEN 'FALTOSO'
                  ELSE 'REGULAR' END)
     RETURNING p.status_falta
  )
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status_falta='BLOQUEADO'),
         COUNT(*) FILTER (WHERE status_falta='FALTOSO'),
         COUNT(*) FILTER (WHERE status_falta='REGULAR')
    INTO v_atualizados, v_bloqueados, v_faltosos, v_regulares
    FROM upd;

  -- Limpa fila de bloqueio para pacientes que deixaram de estar BLOQUEADO
  UPDATE public.fila_espera fe
     SET status = 'atendido',
         hora_chamada = COALESCE(fe.hora_chamada, to_char(now(),'HH24:MI'))
   WHERE fe.origem_cadastro = 'BLOQUEIO_FALTA'
     AND fe.status IN ('aguardando','chamado')
     AND EXISTS (
       SELECT 1 FROM public.pacientes p
        WHERE p.id = fe.paciente_id AND p.status_falta <> 'BLOQUEADO'
     );

  RETURN jsonb_build_object(
    'atualizados', v_atualizados,
    'bloqueados', v_bloqueados,
    'faltosos', v_faltosos,
    'regulares', v_regulares,
    'limite_alerta', v_limite_alerta,
    'limite_bloqueio', v_limite_bloqueio
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public."reavaliar_todos_status_falta"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reavaliar_todos_status_falta"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reavaliar_todos_status_falta"() TO "service_role";

CREATE OR REPLACE FUNCTION public.recover_missing_treatment_appointments(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; s public.treatment_sessions%ROWTYPE; actor jsonb;
 recovered jsonb:='[]'::jsonb; old_reason text;
BEGIN
 SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
 actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF c.status NOT IN ('em_andamento','ativo','concluido') THEN RETURN jsonb_build_object('recovered_ids',recovered); END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 FOR s IN SELECT * FROM public.treatment_sessions ts WHERE ts.cycle_id=c.id AND ts.status='agendada'
   AND ts.appointment_id IS NOT NULL AND ts.patient_id=c.patient_id AND ts.professional_id=c.professional_id
   AND NOT EXISTS(SELECT 1 FROM public.agendamentos a WHERE a.id=ts.appointment_id)
   AND NOT EXISTS(SELECT 1 FROM public.prontuarios p WHERE p.agendamento_id=ts.appointment_id)
   AND NOT EXISTS(SELECT 1 FROM public.atendimentos a WHERE a.agendamento_id=ts.appointment_id)
   ORDER BY ts.id FOR UPDATE
 LOOP
  PERFORM set_config('app.treatment_change_reason','Agendamento vinculado ausente; sessão não realizada liberada para novo agendamento',true);
  UPDATE public.treatment_sessions SET appointment_id=NULL,status='pendente_agendamento',scheduled_date=NULL WHERE id=s.id;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'liberar_sessao_agendamento_ausente','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
   jsonb_build_object('agendamento_anterior',s.appointment_id,'data_anterior',s.scheduled_date,'numero_sessao',s.session_number,'status_anterior',s.status,'status_novo','pendente_agendamento','motivo_alteracao','Agendamento ausente no banco; liberação restrita ao ciclo aberto pelo usuário autorizado'));
  recovered:=recovered || jsonb_build_array(s.id);
 END LOOP;
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN jsonb_build_object('recovered_ids',recovered);
END $function$
;

REVOKE ALL ON FUNCTION public."recover_missing_treatment_appointments"(p_cycle_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."recover_missing_treatment_appointments"(p_cycle_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."recover_missing_treatment_appointments"(p_cycle_id uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.refresh_paciente_profissional_status()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg jsonb;
  v_limite_alerta int := 2;
  v_limite_bloqueio int := 4;
BEGIN
    SELECT configuracoes->'config_fluxo_faltas' INTO v_cfg
      FROM public.system_config WHERE id = 'default';

    IF v_cfg IS NOT NULL THEN
      v_limite_alerta   := COALESCE((v_cfg->>'limite_alerta')::int, v_limite_alerta);
      v_limite_bloqueio := COALESCE((v_cfg->>'limite_bloqueio')::int, v_limite_bloqueio);
    END IF;

    TRUNCATE public.paciente_profissional_status;
    
    INSERT INTO public.paciente_profissional_status (
        paciente_id, 
        profissional_id, 
        total_faltas, 
        ultima_falta, 
        status_falta
    )
    SELECT 
        t.paciente_id, 
        t.profissional_id, 
        COUNT(*) as total_faltas,
        MAX(t.data_falta) as ultima_falta,
        CASE 
            WHEN COUNT(*) >= v_limite_bloqueio THEN 'BLOQUEADO'
            WHEN COUNT(*) >= v_limite_alerta THEN 'FALTOSO'
            ELSE 'REGULAR'
        END as status_falta
    FROM (
        SELECT 
            paciente_id, 
            profissional_id::uuid, 
            data::date as data_falta
        FROM public.agendamentos
        WHERE status = 'falta' 
          AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada, false) = false
          AND profissional_id IS NOT NULL
        
        UNION ALL
        
        SELECT 
            patient_id as paciente_id, 
            professional_id::uuid as profissional_id, 
            scheduled_date::date as data_falta
        FROM public.treatment_sessions
        WHERE status IN ('falta', 'paciente_faltou')
          AND COALESCE(tipo_falta, 'injustificada') = 'injustificada'
          AND COALESCE(falta_liberada, false) = false
          AND professional_id IS NOT NULL
    ) t
    JOIN public.pacientes p ON t.paciente_id = p.id
    WHERE p.is_tfd = false 
      AND p.possui_ordem_judicial = false
    GROUP BY t.paciente_id, t.profissional_id;

    INSERT INTO public.paciente_profissional_status (
        paciente_id,
        profissional_id,
        total_faltas,
        status_falta,
        ultima_falta
    )
    SELECT DISTINCT
        p.id as paciente_id,
        curr.id::uuid as profissional_id,
        0,
        'REGULAR',
        NULL::DATE
    FROM public.pacientes p
    CROSS JOIN public.funcionarios curr
    WHERE (p.is_tfd = true OR p.possui_ordem_judicial = true)
    ON CONFLICT (paciente_id, profissional_id) DO UPDATE 
    SET total_faltas = 0, status_falta = 'REGULAR', ultima_falta = NULL;
END;
$function$
;

REVOKE ALL ON FUNCTION public."refresh_paciente_profissional_status"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."refresh_paciente_profissional_status"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."refresh_paciente_profissional_status"() TO "service_role";

CREATE OR REPLACE FUNCTION public.register_treatment_discharge(p_cycle_id uuid, p_tipo_alta tipo_alta, p_reason text, p_final_notes text DEFAULT ''::text, p_escopo text DEFAULT 'ciclo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff record; v_role text; v_permission boolean; v_cycle record; v_discharge_id uuid;
  v_appointment_ids text[] := ARRAY[]::text[]; v_removed_sessions integer := 0; v_removed_appointments integer := 0;
  v_cancelled_global integer := 0; v_careness jsonb; v_escopo text := lower(coalesce(nullif(btrim(p_escopo),''),'ciclo'));
  v_global_ids text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE='42501'; END IF;
  IF v_escopo NOT IN ('ciclo','geral') THEN RAISE EXCEPTION 'Escopo de alta inválido'; END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alta'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id,f.nome INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role:=lower(trim(v_staff.role));
  v_role:=CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao' WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  SELECT c.id,c.patient_id,c.professional_id,c.unit_id,c.status,c.total_sessions,c.sessions_done
    INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo de tratamento não encontrado'; END IF;
  IF v_cycle.status NOT IN ('em_andamento','ativo') AND NOT (v_cycle.status='concluido'
      AND v_cycle.total_sessions>0 AND v_cycle.sessions_done>=v_cycle.total_sessions) THEN
    RAISE EXCEPTION 'Este ciclo não está disponível para alta'; END IF;
  IF EXISTS(SELECT 1 FROM public.patient_discharges d WHERE d.cycle_id=p_cycle_id) THEN RAISE EXCEPTION 'Este ciclo já possui alta registrada'; END IF;
  IF v_role<>'master' AND NOT (v_role='profissional' AND v_cycle.professional_id=v_staff.id::text) THEN
    SELECT chosen.can_delete INTO v_permission FROM (
      SELECT pu.can_delete,1 rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento'
        AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_delete,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_delete,3 FROM public.permissoes p WHERE p.perfil IN(v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento'
        AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_delete,4 FROM public.permissoes p WHERE p.perfil IN(v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para registrar alta deste tratamento' USING ERRCODE='42501'; END IF;
  END IF;
  IF v_role<>'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms' AND nullif(v_staff.unidade_id,'') IS NOT NULL
     AND v_cycle.unit_id IS DISTINCT FROM v_staff.unidade_id THEN RAISE EXCEPTION 'Ciclo fora do escopo da unidade' USING ERRCODE='42501'; END IF;
  IF v_role<>'master' AND v_staff.usuario IS DISTINCT FROM 'admin.sms' AND nullif(v_staff.unidade_id,'') IS NULL AND v_role<>'profissional' THEN
    RAISE EXCEPTION 'Unidade do funcionário não identificada' USING ERRCODE='42501'; END IF;

  SELECT coalesce(array_agg(s.appointment_id) FILTER(WHERE s.appointment_id IS NOT NULL),ARRAY[]::text[]) INTO v_appointment_ids
    FROM public.treatment_sessions s WHERE s.cycle_id=p_cycle_id
     AND (s.scheduled_date>=CURRENT_DATE OR s.scheduled_date IS NULL) AND s.status IN('pendente_agendamento','agendada');
  INSERT INTO public.patient_discharges(cycle_id,patient_id,professional_id,discharge_date,reason,final_notes,tipo_alta)
    VALUES(v_cycle.id,v_cycle.patient_id,v_staff.id::text,CURRENT_DATE,btrim(p_reason),
      CASE WHEN v_escopo='geral' THEN '[Desligamento geral do CER] ' ELSE '' END || coalesce(p_final_notes,''),p_tipo_alta)
    RETURNING id INTO v_discharge_id;
  DELETE FROM public.treatment_sessions s WHERE s.cycle_id=p_cycle_id
    AND (s.scheduled_date>=CURRENT_DATE OR s.scheduled_date IS NULL) AND s.status IN('pendente_agendamento','agendada');
  GET DIAGNOSTICS v_removed_sessions=ROW_COUNT;
  IF cardinality(v_appointment_ids)>0 THEN
    DELETE FROM public.agendamentos a WHERE a.id=ANY(v_appointment_ids) AND a.paciente_id=v_cycle.patient_id
      AND a.profissional_id=v_cycle.professional_id AND a.unidade_id=v_cycle.unit_id
      AND a.status NOT IN('cancelado','falta','remarcado','realizado','atendido','concluido');
    GET DIAGNOSTICS v_removed_appointments=ROW_COUNT;
  END IF;

  IF v_escopo='geral' THEN
    WITH c AS (
      UPDATE public.agendamentos a SET status='cancelado',
        observacoes=trim(coalesce(a.observacoes,'') || ' [Cancelado: desligamento geral do CER em ' || to_char(CURRENT_DATE,'DD/MM/YYYY') || ' por ' || coalesce(v_staff.nome,'') || ']'),
        custom_data=coalesce(a.custom_data,'{}'::jsonb) || jsonb_build_object('motivo_alteracao','Desligamento geral do CER: '||btrim(p_reason),'discharge_id',v_discharge_id)
      WHERE a.paciente_id=v_cycle.patient_id AND a.unidade_id=v_cycle.unit_id AND a.data>=CURRENT_DATE
        AND a.status NOT IN('cancelado','falta','remarcado','realizado','atendido','concluido','em_atendimento')
      RETURNING a.id)
    SELECT coalesce(array_agg(id),ARRAY[]::text[]) INTO v_global_ids FROM c;
    v_cancelled_global := cardinality(v_global_ids);
    UPDATE public.treatment_sessions s SET status='cancelada'
      WHERE s.appointment_id=ANY(v_global_ids) AND s.status IN('agendada','pendente_agendamento');
  END IF;

  UPDATE public.treatment_cycles SET status='finalizado_alta',updated_at=now() WHERE id=p_cycle_id;
  SELECT public.apply_profession_careness_for_discharge(v_discharge_id,false) INTO v_careness;
  RETURN jsonb_build_object('discharge_id',v_discharge_id,'removed_sessions',v_removed_sessions,
    'removed_appointments',v_removed_appointments,'cancelled_other_appointments',v_cancelled_global,'scope',v_escopo,
    'careness',coalesce(v_careness,'{}'::jsonb));
END;
$function$
;

REVOKE ALL ON FUNCTION public."register_treatment_discharge"(p_cycle_id uuid, p_tipo_alta tipo_alta, p_reason text, p_final_notes text, p_escopo text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."register_treatment_discharge"(p_cycle_id uuid, p_tipo_alta tipo_alta, p_reason text, p_final_notes text, p_escopo text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."register_treatment_discharge"(p_cycle_id uuid, p_tipo_alta tipo_alta, p_reason text, p_final_notes text, p_escopo text) TO "service_role";

CREATE OR REPLACE FUNCTION public.register_whatsapp_inbound(p_phone text, p_body text, p_provider text DEFAULT 'evolution'::text, p_provider_message_id text DEFAULT ''::text, p_raw jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := upper(btrim(COALESCE(p_body,'')));
  v_intent text := 'livre';
  v_id uuid;
  v_paciente_id text := '';
  v_paciente_nome text := '';
BEGIN
  SELECT id, nome INTO v_paciente_id, v_paciente_nome
    FROM public.pacientes
    WHERE regexp_replace(COALESCE(telefone,''), '\D','','g') = regexp_replace(p_phone,'\D','','g')
    LIMIT 1;

  IF v_norm IN ('1','CONFIRMAR','CONFIRMO','SIM') THEN v_intent := 'confirmar';
  ELSIF v_norm IN ('2','REMARCAR','REMARCACAO','REMARCAÇÃO') THEN v_intent := 'remarcar';
  ELSIF v_norm IN ('3','ATENDENTE','RECEPCAO','RECEPÇÃO','FALAR') THEN v_intent := 'atendente';
  ELSIF v_norm IN ('SAIR','PARAR','CANCELAR','STOP','UNSUBSCRIBE') THEN v_intent := 'sair';
  END IF;

  INSERT INTO public.whatsapp_conversations (phone, paciente_id, last_patient_message_at, human_handoff, human_handoff_at)
  VALUES (p_phone, COALESCE(v_paciente_id,''), now(),
          (v_intent IN ('atendente','livre')), CASE WHEN v_intent IN ('atendente','livre') THEN now() END)
  ON CONFLICT (phone) DO UPDATE SET
    last_patient_message_at = EXCLUDED.last_patient_message_at,
    paciente_id = CASE WHEN EXCLUDED.paciente_id <> '' THEN EXCLUDED.paciente_id ELSE whatsapp_conversations.paciente_id END,
    human_handoff = whatsapp_conversations.human_handoff OR EXCLUDED.human_handoff,
    human_handoff_at = COALESCE(whatsapp_conversations.human_handoff_at, EXCLUDED.human_handoff_at),
    updated_at = now();

  IF v_intent = 'sair' THEN
    UPDATE public.whatsapp_conversations
       SET opted_out = true, opted_out_at = now(), opted_out_reason = 'patient_request', updated_at = now()
     WHERE phone = p_phone;
  END IF;

  INSERT INTO public.whatsapp_inbound_messages
    (phone, paciente_id, paciente_nome, body, intent, provider, provider_message_id, raw)
  VALUES (p_phone, COALESCE(v_paciente_id,''), COALESCE(v_paciente_nome,''), COALESCE(p_body,''),
          v_intent, p_provider, COALESCE(p_provider_message_id,''), COALESCE(p_raw,'{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'intent', v_intent, 'paciente_id', v_paciente_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public."register_whatsapp_inbound"(p_phone text, p_body text, p_provider text, p_provider_message_id text, p_raw jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."register_whatsapp_inbound"(p_phone text, p_body text, p_provider text, p_provider_message_id text, p_raw jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."register_whatsapp_inbound"(p_phone text, p_body text, p_provider text, p_provider_message_id text, p_raw jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.release_careness_from_patient_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_result jsonb;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=NEW.professional_id AND f.ativo IS TRUE;
  IF FOUND AND public.unaccent(lower(coalesce(v_staff.profissao,''))) ~ '^medic' AND NEW.status='ativo' THEN
    UPDATE public.patient_profession_careness SET released_at=now(),release_reason='nova prescrição médica'
     WHERE patient_id=NEW.patient_id AND profession_key=public.normalize_profession(NEW.especialidade_destino)
       AND released_at IS NULL AND annulled_at IS NULL AND release_date>current_date;
    IF FOUND THEN
      INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
      VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_liberada_nova_prescricao',
        'patient_referral',NEW.id::text,jsonb_build_object('patient_id',NEW.patient_id,'profession',NEW.especialidade_destino,'reason','nova prescrição médica'));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."release_careness_from_patient_referral"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."release_careness_from_patient_referral"() TO "service_role";

CREATE OR REPLACE FUNCTION public.release_profession_careness_for_medical_referral(p_patient_id text, p_specialty text, p_source text DEFAULT 'patient_referral'::text, p_source_id text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_key text; v_count integer := 0;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND OR public.unaccent(lower(coalesce(v_staff.profissao,''))) !~ '^medic' THEN
    RETURN jsonb_build_object('released',0,'authorized',false);
  END IF;
  v_key := public.normalize_profession(p_specialty);
  IF v_key IS NULL THEN RETURN jsonb_build_object('released',0,'authorized',true); END IF;
  UPDATE public.patient_profession_careness SET released_at=now(),release_reason='nova prescrição médica'
   WHERE patient_id=p_patient_id AND profession_key=v_key AND released_at IS NULL AND annulled_at IS NULL AND release_date>current_date;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_liberada_nova_prescricao',
      'patient_profession_careness',coalesce(p_source_id,p_patient_id),jsonb_build_object('patient_id',p_patient_id,
      'profession',p_specialty,'source',p_source,'released_count',v_count,'reason','nova prescrição médica'));
  END IF;
  RETURN jsonb_build_object('released',v_count,'authorized',true);
END;
$function$
;

REVOKE ALL ON FUNCTION public."release_profession_careness_for_medical_referral"(p_patient_id text, p_specialty text, p_source text, p_source_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."release_profession_careness_for_medical_referral"(p_patient_id text, p_specialty text, p_source text, p_source_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."release_profession_careness_for_medical_referral"(p_patient_id text, p_specialty text, p_source text, p_source_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.release_treatment_session_for_booking(p_session_id uuid, p_expected_appointment_id text, p_expected_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE;
 a public.agendamentos%ROWTYPE; actor jsonb; shared boolean:=false; found_appointment boolean:=false;
 old_reason text; changed integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
 SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
 actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id THEN
  RAISE EXCEPTION 'Paciente ou profissional divergente do ciclo.' USING ERRCODE='23514'; END IF;
 IF c.status NOT IN ('em_andamento','ativo') OR s.status NOT IN ('agendada','pendente_agendamento') THEN
  RAISE EXCEPTION 'Sessão encerrada: o histórico clínico foi preservado.' USING ERRCODE='23514'; END IF;
 IF s.appointment_id IS DISTINCT FROM p_expected_appointment_id OR s.scheduled_date IS DISTINCT FROM p_expected_date THEN
  RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo antes de confirmar.' USING ERRCODE='40001'; END IF;
 IF s.appointment_id IS NULL AND s.scheduled_date IS NULL AND s.status='pendente_agendamento' THEN
  RETURN jsonb_build_object('status','liberado','appointment_preserved',false); END IF;
 IF nullif(btrim(s.procedure_done),'') IS NOT NULL OR nullif(btrim(s.clinical_notes),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Sessão com conteúdo clínico: use a revisão do atendimento; nenhum registro foi removido.' USING ERRCODE='23514'; END IF;
 IF s.appointment_id IS NOT NULL THEN
  SELECT * INTO a FROM public.agendamentos WHERE id=s.appointment_id FOR UPDATE;
  found_appointment:=FOUND;
  SELECT EXISTS(SELECT 1 FROM public.treatment_sessions t WHERE t.appointment_id=s.appointment_id AND t.id<>s.id) INTO shared;
  IF EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=s.appointment_id)
    OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=s.appointment_id) THEN
   RAISE EXCEPTION 'Há registro clínico neste agendamento; nenhum dado foi alterado.' USING ERRCODE='23514'; END IF;
  IF found_appointment THEN
   IF a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id THEN
    RAISE EXCEPTION 'Reserva de outro paciente, profissional ou unidade: revisão administrativa necessária.' USING ERRCODE='23514'; END IF;
   IF a.status NOT IN ('confirmado','agendado','pendente')
     OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=a.id)
     OR EXISTS(SELECT 1 FROM public.fila_espera WHERE id=a.id) THEN
    RAISE EXCEPTION 'Paciente já recebido ou em fluxo clínico. A reserva não foi excluída.' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 PERFORM set_config('app.treatment_change_reason','Regularização manual: sessão liberada para novo agendamento',true);
 UPDATE public.treatment_sessions SET appointment_id=NULL,scheduled_date=NULL,status='pendente_agendamento' WHERE id=s.id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a operação.' USING ERRCODE='40001'; END IF;
 -- Shared reservations belong to the remaining session and must NEVER be deleted here.
 IF found_appointment AND NOT shared THEN
  DELETE FROM public.agendamentos WHERE id=a.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Reserva alterada durante a operação.' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
 VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'regularizar_sessao_para_agendar','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
  jsonb_build_object('valor_anterior',to_jsonb(s),'numero_preservado',s.session_number,'agendamento_preservado',shared AND found_appointment,'agendamento_excluido',found_appointment AND NOT shared,'motivo','Liberação manual confirmada pelo profissional/Master; sessão e número preservados'));
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN jsonb_build_object('status','liberado','appointment_preserved',shared AND found_appointment);
END $function$
;

REVOKE ALL ON FUNCTION public."release_treatment_session_for_booking"(p_session_id uuid, p_expected_appointment_id text, p_expected_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."release_treatment_session_for_booking"(p_session_id uuid, p_expected_appointment_id text, p_expected_date date) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."release_treatment_session_for_booking"(p_session_id uuid, p_expected_appointment_id text, p_expected_date date) TO "service_role";

CREATE OR REPLACE FUNCTION public.release_treatment_sessions_before_appointment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb; old_reason text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=OLD.id) THEN RETURN OLD; END IF;
 IF EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=OLD.id AND status IN ('realizada','concluida','concluido','presente','compareceu','falta','paciente_faltou'))
   OR EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=OLD.id) THEN
  RAISE EXCEPTION 'Agendamento com registro clínico: histórico preservado. Não é possível excluí-lo.' USING ERRCODE='23514';
 END IF;
 old_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
 FOR s IN SELECT * FROM public.treatment_sessions WHERE appointment_id=OLD.id AND status IN ('agendada','pendente_agendamento') ORDER BY id FOR UPDATE LOOP
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
    OR OLD.paciente_id IS DISTINCT FROM c.patient_id OR OLD.profissional_id IS DISTINCT FROM c.professional_id OR OLD.unidade_id IS DISTINCT FROM c.unit_id THEN
   RAISE EXCEPTION 'Vínculo divergente: a exclusão não alterou a sessão nem o agendamento.' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.treatment_change_reason','Exclusão do agendamento: sessão liberada para novo agendamento',true);
  UPDATE public.treatment_sessions SET appointment_id=NULL,status='pendente_agendamento',scheduled_date=NULL WHERE id=s.id;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'liberar_sessao_apos_exclusao_agenda','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
   jsonb_build_object('agendamento_anterior',OLD.id,'data_anterior',s.scheduled_date,'numero_sessao',s.session_number,'status_novo','pendente_agendamento','motivo_alteracao','Exclusão explícita pela Agenda; sessão e numeração preservadas'));
 END LOOP;
 PERFORM set_config('app.treatment_change_reason',old_reason,true);
 RETURN OLD;
END $function$
;

REVOKE ALL ON FUNCTION public."release_treatment_sessions_before_appointment_delete"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."release_treatment_sessions_before_appointment_delete"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."release_treatment_sessions_before_appointment_delete"() TO "service_role";

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text DEFAULT NULL::text, p_check_patient_conflict boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_new_time text;
  v_check jsonb;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff
    FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid()
     AND f.ativo IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501';
  END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao'
    WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao'
    WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem'
    ELSE v_role
  END;

  IF nullif(v_role, '') IS NULL THEN
    RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('master', 'profissional') THEN
    SELECT chosen.can_execute
      INTO v_permission
      FROM (
        SELECT pu.can_execute, 1 AS rank
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text
           AND pu.modulo = 'tratamento'
           AND pu.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT pu.can_execute, 2
          FROM public.permissoes_usuario pu
         WHERE pu.user_id = v_staff.id::text
           AND pu.modulo = 'tratamento'
           AND pu.unidade_id = ''
        UNION ALL
        SELECT p.can_execute, 3
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = coalesce(v_staff.unidade_id, '')
           AND coalesce(v_staff.unidade_id, '') <> ''
        UNION ALL
        SELECT p.can_execute, 4
          FROM public.permissoes p
         WHERE p.perfil IN (v_role, lower(trim(v_staff.role)))
           AND p.modulo = 'tratamento'
           AND p.unidade_id = ''
      ) chosen
     ORDER BY chosen.rank
     LIMIT 1;

    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para remarcar sessões de tratamento'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.*
    INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;

  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_sessao');
  END IF;

  IF v_staff.usuario IS DISTINCT FROM 'admin.sms'
     AND (
       (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master')
       OR (nullif(v_staff.unidade_id, '') IS NOT NULL
           AND v_cycle.unit_id <> v_staff.unidade_id)
     ) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'profissional'
     AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;

  IF v_cycle.status <> 'em_andamento'
     OR v_session.status <> 'agendada'
     OR v_session.appointment_id IS NULL THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_nao_remarcavel');
  END IF;

  IF v_session.scheduled_date IS DISTINCT FROM p_expected_session_date
     OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id THEN
    RETURN jsonb_build_object('status', 'conflito', 'reason', 'sessao_alterada');
  END IF;

  IF p_new_date IS NULL
     OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'data_invalida');
  END IF;

  IF extract(isodow FROM p_new_date) IN (6, 7) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;

  SELECT a.*
    INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_expected_appointment_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date
     OR v_appointment.status IN ('cancelado', 'falta', 'remarcado') THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'agendamento');
  END IF;

  v_new_time := coalesce(nullif(btrim(p_new_time), ''), v_appointment.hora);

  IF v_new_time IS NULL
     OR v_new_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'horario');
  END IF;

  -- Mesmas chaves de concorrência usadas pelo agendamento e pela capacidade externa.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text,
      0
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_cycle.patient_id || '|' || p_new_date::text || '|' || v_new_time,
      0
    )
  );

  -- Impede que uma alteração concorrente da grade invalide a checagem durante a operação.
  PERFORM 1
    FROM public.disponibilidades d
   WHERE d.profissional_id = v_cycle.professional_id
     AND d.unidade_id = v_cycle.unit_id
     AND p_new_date BETWEEN d.data_inicio AND d.data_fim
   FOR SHARE OF d;

  v_check := public.check_internal_slot_availability(
    v_cycle.professional_id,
    v_cycle.unit_id,
    p_new_date,
    v_new_time,
    p_expected_appointment_id
  );

  IF coalesce((v_check->>'available')::boolean, false) IS DISTINCT FROM TRUE THEN
    IF v_check->>'reason' = 'date_blocked' THEN
      RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', v_check->>'reason');
    END IF;

    RETURN jsonb_build_object(
      'status',
      CASE
        WHEN v_check->>'reason' IN ('day_full', 'hour_full', 'turno_full', 'external_reservation')
          THEN 'capacidade_esgotada'
        ELSE 'sem_disponibilidade'
      END,
      'reason',
      coalesce(v_check->>'reason', 'indisponivel')
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE
            OR a.profissional_id = v_cycle.professional_id)
       AND a.data = p_new_date
       AND a.hora = v_new_time
       AND a.status NOT IN ('cancelado', 'falta', 'remarcado')
       AND a.id IS DISTINCT FROM p_expected_appointment_id
  ) THEN
    RETURN jsonb_build_object('status', 'duplicado', 'reason', 'horario_ocupado');
  END IF;

  UPDATE public.agendamentos a
     SET data = p_new_date,
         hora = v_new_time
   WHERE a.id = p_expected_appointment_id
     AND a.paciente_id = v_session.patient_id
     AND a.profissional_id = v_session.professional_id
     AND a.unidade_id = v_cycle.unit_id
     AND a.data = p_expected_session_date
     AND a.status NOT IN ('cancelado', 'falta', 'remarcado');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Agendamento alterado durante a remarcação' USING ERRCODE = '40001';
  END IF;

  UPDATE public.treatment_sessions s
     SET scheduled_date = p_new_date
   WHERE s.id = p_session_id
     AND s.cycle_id = p_cycle_id
     AND s.status = 'agendada'
     AND s.appointment_id = p_expected_appointment_id
     AND s.scheduled_date = p_expected_session_date;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Sessão alterada durante a remarcação' USING ERRCODE = '40001';
  END IF;

  SELECT a.*
    INTO v_appointment
    FROM public.agendamentos a
   WHERE a.id = p_expected_appointment_id;

  SELECT s.*
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id;

  RETURN jsonb_build_object(
    'status', 'remarcado',
    'session', to_jsonb(v_session),
    'appointment', to_jsonb(v_appointment)
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public."reschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da remarcação.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  actor := public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  PERFORM set_config('app.treatment_change_reason',btrim(p_reason),true);
  IF p_manual_capacity THEN
    result := public.reschedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  ELSE
    result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  END IF;
  IF result->>'status' = 'remarcado' THEN
    -- The trigger validates the target session; unrelated historical gaps must not freeze this action.
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'remarcar_sessao','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'data_anterior',p_expected_session_date,'data_nova',p_new_date));
  END IF;
  RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."reschedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) TO "service_role";

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_manual_capacity(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_capacity boolean;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id=auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id=p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role))='profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
  THEN RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE='42501'; END IF;
  IF nullif(p_expected_appointment_id,'') IS NULL OR p_new_date < (now() AT TIME ZONE 'America/Fortaleza')::date
     OR nullif(p_new_time,'') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || p_new_date::text, 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id,v_cycle.unit_id,
    p_new_date,p_new_time,p_expected_appointment_id);
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  IF coalesce(v_capacity,false) AND EXISTS (
    SELECT 1 FROM public.quotas_externas q
     WHERE q.ativo IS TRUE AND q.profissional_interno_id::text=v_cycle.professional_id
       AND q.unidade_id=v_cycle.unit_id AND q.periodo_inicio=p_new_date
       AND q.periodo_fim=p_new_date AND q.vagas_usadas<q.vagas_total
  ) THEN RETURN jsonb_build_object('status','capacidade_esgotada','reason','reserva_externa_ativa'); END IF;
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',v_check->>'reason');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_expected_appointment_id,true);
  v_result := public.reschedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_capacity,false) AND v_result->>'status'='remarcado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'remarcacao_encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('capacity',v_check,'cycle_id',p_cycle_id),
      p_expected_appointment_id,v_cycle.patient_id,v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public."reschedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.reschedule_treatment_session_with_room(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text, p_new_room_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb; previous_room text; appointment public.agendamentos%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  result:=public.reschedule_treatment_session_checked(p_session_id,p_cycle_id,p_expected_session_date,p_expected_appointment_id,p_new_date,p_new_time,p_check_patient_conflict,p_manual_capacity,p_reason);
  IF result->>'status'='remarcado' THEN
    SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id;
    actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
    SELECT sala_id INTO previous_room FROM public.agendamentos WHERE id=p_expected_appointment_id;
    UPDATE public.agendamentos SET sala_id=p_new_room_id WHERE id=p_expected_appointment_id RETURNING * INTO appointment;
    IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado; remarcação revertida.' USING ERRCODE='40001'; END IF;
    result:=jsonb_set(result,'{appointment}',to_jsonb(appointment));
    IF previous_room IS DISTINCT FROM p_new_room_id THEN
      INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'alterar_sala_sessao','treatment_session',p_session_id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',p_session_id,'valor_anterior',previous_room,'valor_novo',p_new_room_id));
    END IF;
  END IF;
  RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."reschedule_treatment_session_with_room"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text, p_new_room_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_with_room"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text, p_new_room_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."reschedule_treatment_session_with_room"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_expected_appointment_id text, p_new_date date, p_new_time text, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text, p_new_room_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.resetar_faltas_paciente(p_paciente_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.pacientes
     SET total_faltas = 0,
         faltas_consecutivas = 0,
         status_falta = 'REGULAR'
   WHERE id = p_paciente_id;

  UPDATE public.fila_espera
     SET status = 'atendido',
         hora_chamada = COALESCE(hora_chamada, to_char(now(),'HH24:MI'))
   WHERE paciente_id = p_paciente_id
     AND origem_cadastro = 'BLOQUEIO_FALTA'
     AND status IN ('aguardando','chamado');
END;
$function$
;

REVOKE ALL ON FUNCTION public."resetar_faltas_paciente"(p_paciente_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."resetar_faltas_paciente"(p_paciente_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."resetar_faltas_paciente"(p_paciente_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.resolve_form_template(p_form_slug text, p_profissional_id text DEFAULT NULL::text, p_unidade_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- 1º: template do profissional (em qualquer unidade dele)
  IF p_profissional_id IS NOT NULL AND p_profissional_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.profissional_id = p_profissional_id
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"profissional"'::jsonb);
    END IF;
  END IF;

  -- 2º: template da unidade
  IF p_unidade_id IS NOT NULL AND p_unidade_id <> '' THEN
    SELECT to_jsonb(t.*) INTO v_result
    FROM form_templates t
    WHERE t.form_slug = p_form_slug
      AND t.unidade_id = p_unidade_id
      AND t.profissional_id = ''
      AND t.ativo = true
    ORDER BY t.updated_at DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN jsonb_set(v_result, '{_origem}', '"unidade"'::jsonb);
    END IF;
  END IF;

  -- 3º: template global
  SELECT to_jsonb(t.*) INTO v_result
  FROM form_templates t
  WHERE t.form_slug = p_form_slug
    AND t.unidade_id = ''
    AND t.profissional_id = ''
    AND t.ativo = true
  ORDER BY t.updated_at DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN jsonb_set(v_result, '{_origem}', '"global"'::jsonb);
  END IF;

  RETURN NULL;
END;
$function$
;

REVOKE ALL ON FUNCTION public."resolve_form_template"(p_form_slug text, p_profissional_id text, p_unidade_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."resolve_form_template"(p_form_slug text, p_profissional_id text, p_unidade_id text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."resolve_form_template"(p_form_slug text, p_profissional_id text, p_unidade_id text) TO "service_role";

CREATE OR REPLACE FUNCTION public.restore_missing_treatment_session(p_cycle_id uuid, p_session_number integer, p_date date, p_reason text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; s public.treatment_sessions%ROWTYPE; actor jsonb; actual integer;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Confirme a regularização e informe motivo_alteracao.' USING ERRCODE='23514'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE='23503'; END IF;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,true);
  IF c.status<>'em_andamento' OR p_session_number IS NULL OR p_session_number<1 OR p_session_number>c.total_sessions THEN RAISE EXCEPTION 'Número fora do planejamento ou ciclo encerrado.' USING ERRCODE='23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE cycle_id=c.id AND session_number=p_session_number;
  IF FOUND THEN RETURN jsonb_build_object('status','already_exists','message',format('A sessão nº %s já está registrada. Nenhuma sessão foi duplicada.',p_session_number),'session',to_jsonb(s)); END IF;
  SELECT count(*) INTO actual FROM public.treatment_sessions WHERE cycle_id=c.id;
  IF actual>=c.total_sessions THEN RAISE EXCEPTION 'O ciclo já possui a quantidade planejada. Revise a numeração; não será criada sessão adicional.' USING ERRCODE='23514'; END IF;
  IF p_date IS NOT NULL AND (p_date<CURRENT_DATE OR extract(isodow FROM p_date) IN (6,7) OR EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id=c.professional_id OR (coalesce(b.profissional_id,'')='' AND (coalesce(b.unidade_id,'')='' OR b.unidade_id=c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'')=''))) THEN RAISE EXCEPTION 'Data inválida ou bloqueada. Escolha outra data ou deixe sem data para marcação posterior.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.treatment_sessions(cycle_id,patient_id,professional_id,session_number,total_sessions,scheduled_date,status)
    VALUES(c.id,c.patient_id,c.professional_id,p_session_number,c.total_sessions,p_date,'pendente_agendamento') RETURNING * INTO s;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'registrar_sessao_faltante','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'valor_anterior',NULL,'valor_novo',to_jsonb(s),'previsto',c.total_sessions,'registradas',actual+1));
  RETURN jsonb_build_object('status','created','session',to_jsonb(s),'registered_sessions',actual+1,'message',format('%s de %s sessões registradas. Sessão nº %s incluída manualmente, sem alterar os registros anteriores.',actual+1,c.total_sessions,p_session_number));
END $function$
;

REVOKE ALL ON FUNCTION public."restore_missing_treatment_session"(p_cycle_id uuid, p_session_number integer, p_date date, p_reason text, p_confirmed boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."restore_missing_treatment_session"(p_cycle_id uuid, p_session_number integer, p_date date, p_reason text, p_confirmed boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."restore_missing_treatment_session"(p_cycle_id uuid, p_session_number integer, p_date date, p_reason text, p_confirmed boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.review_treatment_session_date(p_session_id uuid, p_expected_date date, p_date date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
BEGIN
  IF nullif(btrim(p_reason),'') IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'Informe a data e a justificativa.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO s FROM public.treatment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id = s.cycle_id FOR UPDATE;
  actor := public.assert_treatment_write_scope(c.professional_id, c.unit_id, true);
  IF s.appointment_id IS NOT NULL OR s.status <> 'pendente_agendamento' OR c.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Revisão de data permitida somente para sessão pendente sem vínculo. Histórico clínico preservado.' USING ERRCODE = '23514';
  END IF;
  IF s.scheduled_date IS DISTINCT FROM p_expected_date THEN RAISE EXCEPTION 'A sessão mudou. Recarregue.' USING ERRCODE = '40001'; END IF;
  IF p_date < CURRENT_DATE OR extract(isodow FROM p_date) IN (6,7) THEN RAISE EXCEPTION 'Selecione um dia útil futuro.' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.bloqueios b WHERE p_date BETWEEN b.data_inicio AND coalesce(b.data_fim,b.data_inicio) AND (b.profissional_id = c.professional_id OR (coalesce(b.profissional_id,'') = '' AND (coalesce(b.unidade_id,'') = '' OR b.unidade_id = c.unit_id))) AND (coalesce(b.dia_inteiro,true) OR coalesce(b.hora_inicio,'') = '')) THEN
    RAISE EXCEPTION 'Data bloqueada.' USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.treatment_change_reason', btrim(p_reason), true);
  UPDATE public.treatment_sessions SET scheduled_date = p_date WHERE id = s.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'revisar_data_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',btrim(p_reason),'ciclo',c.id,'sessao',s.id,'data_anterior',s.scheduled_date,'data_nova',p_date,'valor_anterior',to_jsonb(s),'valor_novo',jsonb_build_object('scheduled_date',p_date,'status',s.status,'appointment_id',s.appointment_id)));
  RETURN jsonb_build_object('id',s.id,'scheduled_date',p_date);
END $function$
;

REVOKE ALL ON FUNCTION public."review_treatment_session_date"(p_session_id uuid, p_expected_date date, p_date date, p_reason text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."review_treatment_session_date"(p_session_id uuid, p_expected_date date, p_date date, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."review_treatment_session_date"(p_session_id uuid, p_expected_date date, p_date date, p_reason text) TO "service_role";

CREATE OR REPLACE FUNCTION public.salvar_rascunho_triagem_atendimento(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.gravar_triagem_atendimento(p_agendamento_id,p_tecnico_id,p_dados_triagem,false,false);
$function$
;

REVOKE ALL ON FUNCTION public."salvar_rascunho_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."salvar_rascunho_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."salvar_rascunho_triagem_atendimento"(p_agendamento_id text, p_tecnico_id text, p_dados_triagem jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.save_document_template(p_template_id uuid DEFAULT NULL::uuid, p_nome text DEFAULT ''::text, p_tipo text DEFAULT 'Atestado Médico'::text, p_conteudo text DEFAULT ''::text, p_ativo boolean DEFAULT true, p_perfis_permitidos text[] DEFAULT ARRAY['master'::text, 'profissional'::text], p_tipo_modelo text DEFAULT NULL::text, p_unidade_id text DEFAULT NULL::text, p_blocos_clinicos jsonb DEFAULT '[]'::jsonb, p_versoes jsonb DEFAULT '[]'::jsonb)
 RETURNS document_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff record;
  v_existing public.document_templates%ROWTYPE;
  v_result public.document_templates%ROWTYPE;
  v_tipo_modelo text := COALESCE(NULLIF(p_tipo_modelo, ''), 'UNIDADE');
  v_target_unidade text := COALESCE(p_unidade_id, '');
  v_is_manager boolean := false;
  v_is_global_owner boolean := false;
BEGIN
  SELECT id::text AS id, nome, usuario, role, COALESCE(unidade_id, '') AS unidade_id
    INTO v_staff
    FROM public.funcionarios
   WHERE auth_user_id = auth.uid()
     AND ativo = true
   LIMIT 1;

  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'usuario_sem_perfil_ativo' USING ERRCODE = '42501';
  END IF;

  v_is_global_owner := (v_staff.usuario = 'admin.sms');
  v_is_manager := v_is_global_owner OR v_staff.role IN ('master', 'coordenador', 'gestao');

  IF length(trim(COALESCE(p_nome, ''))) = 0 THEN
    RAISE EXCEPTION 'nome_obrigatorio';
  END IF;

  IF length(trim(COALESCE(p_conteudo, ''))) = 0 THEN
    RAISE EXCEPTION 'conteudo_obrigatorio';
  END IF;

  IF p_template_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.document_templates
     WHERE id = p_template_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'template_nao_encontrado';
    END IF;

    v_tipo_modelo := COALESCE(NULLIF(p_tipo_modelo, ''), v_existing.tipo_modelo, 'UNIDADE');
    v_target_unidade := COALESCE(p_unidade_id, v_existing.unidade_id, '');

    IF v_tipo_modelo NOT IN ('GLOBAL', 'UNIDADE', 'PROFISSIONAL') THEN
      v_tipo_modelo := v_existing.tipo_modelo;
    END IF;

    IF NOT v_is_global_owner AND v_tipo_modelo = 'GLOBAL' AND v_existing.tipo_modelo <> 'GLOBAL' THEN
      RAISE EXCEPTION 'apenas_admin_sms_pode_salvar_modelo_global' USING ERRCODE = '42501';
    END IF;

    IF v_tipo_modelo = 'GLOBAL' THEN
      v_target_unidade := '';
    ELSIF NOT v_is_global_owner THEN
      v_target_unidade := v_staff.unidade_id;
    END IF;

    IF NOT v_is_global_owner THEN
      IF v_existing.tipo_modelo = 'GLOBAL' THEN
        RAISE EXCEPTION 'modelo_global_nao_editavel' USING ERRCODE = '42501';
      END IF;

      IF v_is_manager THEN
        IF COALESCE(v_existing.unidade_id, '') NOT IN ('', v_staff.unidade_id) THEN
          RAISE EXCEPTION 'template_de_outra_unidade' USING ERRCODE = '42501';
        END IF;
      ELSIF v_existing.criado_por <> v_staff.id THEN
        RAISE EXCEPTION 'template_de_outro_profissional' USING ERRCODE = '42501';
      END IF;
    END IF;

    UPDATE public.document_templates
       SET nome = trim(p_nome),
           tipo = COALESCE(NULLIF(p_tipo, ''), v_existing.tipo),
           conteudo = p_conteudo,
           ativo = COALESCE(p_ativo, true),
           perfis_permitidos = COALESCE(p_perfis_permitidos, v_existing.perfis_permitidos),
           tipo_modelo = v_tipo_modelo,
           unidade_id = v_target_unidade,
           blocos_clinicos = COALESCE(p_blocos_clinicos, v_existing.blocos_clinicos, '[]'::jsonb),
           versoes = COALESCE(p_versoes, v_existing.versoes, '[]'::jsonb),
           updated_at = now()
     WHERE id = p_template_id
     RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  v_tipo_modelo := COALESCE(NULLIF(p_tipo_modelo, ''), 'UNIDADE');
  IF v_tipo_modelo NOT IN ('GLOBAL', 'UNIDADE', 'PROFISSIONAL') THEN
    v_tipo_modelo := 'UNIDADE';
  END IF;

  IF NOT v_is_global_owner AND v_tipo_modelo = 'GLOBAL' THEN
    RAISE EXCEPTION 'apenas_admin_sms_pode_salvar_modelo_global' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_manager AND v_tipo_modelo <> 'PROFISSIONAL' THEN
    v_tipo_modelo := 'PROFISSIONAL';
  END IF;

  IF v_tipo_modelo = 'GLOBAL' THEN
    v_target_unidade := '';
  ELSIF v_is_global_owner THEN
    v_target_unidade := COALESCE(p_unidade_id, '');
  ELSE
    v_target_unidade := v_staff.unidade_id;
  END IF;

  INSERT INTO public.document_templates (
    nome, tipo, conteudo, ativo, perfis_permitidos, tipo_modelo, unidade_id,
    criado_por, criado_por_nome, blocos_clinicos, versoes
  ) VALUES (
    trim(p_nome),
    COALESCE(NULLIF(p_tipo, ''), 'Atestado Médico'),
    p_conteudo,
    COALESCE(p_ativo, true),
    COALESCE(p_perfis_permitidos, ARRAY['master','profissional']),
    v_tipo_modelo,
    v_target_unidade,
    v_staff.id,
    v_staff.nome,
    COALESCE(p_blocos_clinicos, '[]'::jsonb),
    COALESCE(p_versoes, '[]'::jsonb)
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public."save_document_template"(p_template_id uuid, p_nome text, p_tipo text, p_conteudo text, p_ativo boolean, p_perfis_permitidos text[], p_tipo_modelo text, p_unidade_id text, p_blocos_clinicos jsonb, p_versoes jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."save_document_template"(p_template_id uuid, p_nome text, p_tipo text, p_conteudo text, p_ativo boolean, p_perfis_permitidos text[], p_tipo_modelo text, p_unidade_id text, p_blocos_clinicos jsonb, p_versoes jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."save_document_template"(p_template_id uuid, p_nome text, p_tipo text, p_conteudo text, p_ativo boolean, p_perfis_permitidos text[], p_tipo_modelo text, p_unidade_id text, p_blocos_clinicos jsonb, p_versoes jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.save_profession_careness_rule(p_profession_key text, p_profession_name text, p_enabled boolean, p_duration_value integer, p_duration_unit text, p_scope text, p_apply_retroactive boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_staff public.funcionarios%ROWTYPE; v_preview jsonb; v_rows integer := 0;
  v_existing record; v_release date;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios f WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE AND lower(trim(f.role))='master';
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente Master pode configurar carência' USING ERRCODE='42501'; END IF;
  IF p_profession_key IS NULL OR p_profession_key <> public.normalize_profession(p_profession_key)
     OR nullif(trim(p_profession_name),'') IS NULL THEN RAISE EXCEPTION 'Profissão consolidada inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.profession_careness_catalog()) p(value)
      WHERE p.value->>'profession_key'=p_profession_key) THEN RAISE EXCEPTION 'Profissão não encontrada no cadastro atual'; END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM public.profession_careness_mapping_state WHERE id IS TRUE
       AND confirmed_signature=md5(public.profession_careness_catalog()::text)) THEN
    RAISE EXCEPTION 'Confirme primeiro a lista consolidada de profissões.';
  END IF;
  IF p_duration_value NOT BETWEEN 1 AND 3650 OR p_duration_unit NOT IN ('days','months') OR p_scope NOT IN ('global','unit') THEN
    RAISE EXCEPTION 'Período ou escopo inválido';
  END IF;
  INSERT INTO public.profession_careness_rules(profession_key,profession_name,enabled,duration_value,duration_unit,scope,updated_by,updated_at)
  VALUES(p_profession_key,trim(p_profession_name),p_enabled,p_duration_value,p_duration_unit,p_scope,v_staff.id::text,now())
  ON CONFLICT(profession_key) DO UPDATE SET profession_name=EXCLUDED.profession_name,enabled=EXCLUDED.enabled,
    duration_value=EXCLUDED.duration_value,duration_unit=EXCLUDED.duration_unit,scope=EXCLUDED.scope,
    updated_by=EXCLUDED.updated_by,updated_at=now();

  IF p_apply_retroactive AND p_enabled THEN
    v_preview := public.preview_profession_careness_retroactive(p_profession_key,p_duration_value,p_duration_unit);
    FOR v_existing IN
      SELECT d.id, d.patient_id, d.cycle_id, d.discharge_date, c.professional_id, c.unit_id
      FROM public.patient_discharges d JOIN public.treatment_cycles c ON c.id=d.cycle_id
      JOIN public.funcionarios f ON f.id::text=c.professional_id
      WHERE d.tipo_alta='conclusao' AND public.normalize_profession(f.profissao)=p_profession_key
        AND NOT EXISTS (SELECT 1 FROM public.patient_profession_careness pc WHERE pc.discharge_id=d.id AND pc.annulled_at IS NULL
            AND (pc.released_at IS NULL OR pc.release_reason <> 'regra desativada'))
    LOOP
      IF coalesce((public.apply_profession_careness_for_discharge(v_existing.id,true)->>'created')::boolean,false) THEN
        v_rows := v_rows + 1;
      END IF;
    END LOOP;
    UPDATE public.patient_profession_careness pc SET
      release_date=public.careness_release_date(pc.discharge_date,p_duration_value,p_duration_unit),
      scope=p_scope, profession_name=trim(p_profession_name)
    WHERE pc.profession_key=p_profession_key AND pc.released_at IS NULL AND pc.annulled_at IS NULL
      AND EXISTS (SELECT 1 FROM public.patient_discharges d WHERE d.id=pc.discharge_id AND d.tipo_alta='conclusao');
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'carencia_retroativa_aplicada',
      'profession_careness_rule',p_profession_key,jsonb_build_object('preview',v_preview,'novos_registros',v_rows));
  END IF;
  IF NOT p_enabled THEN
    UPDATE public.patient_profession_careness SET released_at=now(),release_reason='regra desativada'
     WHERE profession_key=p_profession_key AND released_at IS NULL AND annulled_at IS NULL;
  END IF;
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_staff.id::text,v_staff.nome,v_staff.role,coalesce(v_staff.unidade_id,''),'regra_carencia_atualizada',
    'profession_careness_rule',p_profession_key,jsonb_build_object('enabled',p_enabled,'duration_value',p_duration_value,
      'duration_unit',p_duration_unit,'scope',p_scope,'retroactive',p_apply_retroactive));
  RETURN jsonb_build_object('saved',true,'retroactive',coalesce(v_preview,'{}'::jsonb),'created',v_rows);
END;
$function$
;

REVOKE ALL ON FUNCTION public."save_profession_careness_rule"(p_profession_key text, p_profession_name text, p_enabled boolean, p_duration_value integer, p_duration_unit text, p_scope text, p_apply_retroactive boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."save_profession_careness_rule"(p_profession_key text, p_profession_name text, p_enabled boolean, p_duration_value integer, p_duration_unit text, p_scope text, p_apply_retroactive boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."save_profession_careness_rule"(p_profession_key text, p_profession_name text, p_enabled boolean, p_duration_value integer, p_duration_unit text, p_scope text, p_apply_retroactive boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.save_treatment_cycle_plan(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; previous public.treatment_cycles%ROWTYPE;
 actor jsonb; planned integer; actual integer; added integer;
BEGIN
  IF jsonb_typeof(p_cycle) <> 'object' OR p_cycle IS NULL THEN RAISE EXCEPTION 'Plano inválido' USING ERRCODE = '23514'; END IF;
  planned := (p_cycle->>'total_sessions')::integer;
  added := coalesce(cardinality(p_dates), 0);
  IF planned IS NULL OR planned NOT BETWEEN 1 AND 400 OR added < 1 OR p_expected_total IS NULL OR p_expected_total < 0 THEN
    RAISE EXCEPTION 'Quantidade de sessões inválida' USING ERRCODE = '23514';
  END IF;
  IF added + p_expected_total <> planned THEN
    RAISE EXCEPTION 'Geração incompleta: % sessões previstas, mas % datas informadas.', planned, added + p_expected_total USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_dates) d WHERE d IS NULL) OR (SELECT count(DISTINCT d) FROM unnest(p_dates) d) <> added THEN
    RAISE EXCEPTION 'Data repetida na lista de novas sessões.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO previous FROM public.treatment_cycles WHERE id = (p_cycle->>'id')::uuid FOR UPDATE;
  IF FOUND THEN
    actor := public.assert_treatment_write_scope(previous.professional_id, previous.unit_id, true);
    IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Informe a justificativa da extensão.' USING ERRCODE = '23514'; END IF;
    IF previous.total_sessions <> p_expected_total THEN
      RAISE EXCEPTION 'O ciclo mudou. Recarregue antes de estender.' USING ERRCODE = '40001';
    END IF;
    IF previous.status NOT IN ('em_andamento', 'ativo', 'concluido') THEN RAISE EXCEPTION 'Este ciclo não permite extensão.' USING ERRCODE = '23514'; END IF;
    -- Pendências antigas do ciclo não bloqueiam a extensão; só a nova data não pode repetir sessão ativa.
    IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = previous.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date = ANY(p_dates)) THEN
      RAISE EXCEPTION 'Já existe sessão ativa deste ciclo na data informada. Escolha outra data.' USING ERRCODE = '23514';
    END IF;
    UPDATE public.treatment_cycles SET total_sessions = planned,
      end_date_predicted = greatest(previous.end_date_predicted, (SELECT max(d) FROM unnest(p_dates) d)), status = 'em_andamento', updated_at = now()
      WHERE id = previous.id RETURNING * INTO c;
    INSERT INTO public.treatment_extensions(cycle_id, previous_sessions, new_sessions, previous_end_date, new_end_date, reason, changed_by)
      VALUES(c.id, previous.total_sessions, planned, previous.end_date_predicted, c.end_date_predicted, btrim(p_reason), actor->>'id');
  ELSE
    IF p_expected_total <> 0 OR p_reason IS NOT NULL THEN RAISE EXCEPTION 'Ciclo não encontrado para extensão.' USING ERRCODE = '23503'; END IF;
    actor := public.assert_treatment_write_scope(p_cycle->>'professional_id', p_cycle->>'unit_id', true);
    IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE id = p_cycle->>'patient_id') THEN RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = '23503'; END IF;
    IF nullif(p_cycle->>'pts_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pts p WHERE p.id = (p_cycle->>'pts_id')::uuid AND p.patient_id = p_cycle->>'patient_id' AND p.unit_id = p_cycle->>'unit_id') THEN
      RAISE EXCEPTION 'PTS divergente do paciente ou unidade.' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.treatment_cycles(id, patient_id, professional_id, unit_id, specialty, treatment_type, start_date, end_date_predicted, total_sessions, sessions_done, frequency, status, clinical_notes, created_by, pts_id)
      VALUES((p_cycle->>'id')::uuid, p_cycle->>'patient_id', p_cycle->>'professional_id', p_cycle->>'unit_id', coalesce(p_cycle->>'specialty',''), p_cycle->>'treatment_type', (p_cycle->>'start_date')::date,
        (SELECT max(d) FROM unnest(p_dates) d), planned, 0, p_cycle->>'frequency', 'em_andamento', coalesce(p_cycle->>'clinical_notes',''), actor->>'id', nullif(p_cycle->>'pts_id','')::uuid) RETURNING * INTO c;
  END IF;
  INSERT INTO public.treatment_sessions(cycle_id, patient_id, professional_id, session_number, total_sessions, scheduled_date, status)
    SELECT c.id, c.patient_id, c.professional_id, p_expected_total + ord::integer, planned, d, 'pendente_agendamento' FROM unnest(p_dates) WITH ORDINALITY AS dates(d, ord);
  IF p_expected_total = 0 THEN PERFORM public.assert_treatment_cycle_integrity(c.id); END IF;
  SELECT count(*) INTO actual FROM public.treatment_sessions WHERE cycle_id = c.id;
  INSERT INTO public.action_logs(user_id, user_nome, role, unidade_id, acao, entidade, entidade_id, modulo, paciente_id, profissional_id, detalhes)
    VALUES(actor->>'id', actor->>'nome', actor->>'role', c.unit_id, CASE WHEN p_expected_total = 0 THEN 'criar_ciclo_integridade' ELSE 'extensao_tratamento' END,
      'treatment_cycle', c.id::text, 'tratamentos', c.patient_id, c.professional_id,
      jsonb_build_object('motivo_alteracao', coalesce(p_reason, 'Criação explícita do plano de sessões'), 'total_anterior', p_expected_total, 'total_previsto', planned, 'total_registrado', actual, 'sessoes_adicionadas', added));
  RETURN jsonb_build_object('cycle', to_jsonb(c), 'registered_sessions', actual, 'added_sessions', added);
END $function$
;

REVOKE ALL ON FUNCTION public."save_treatment_cycle_plan"(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."save_treatment_cycle_plan"(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."save_treatment_cycle_plan"(p_cycle jsonb, p_dates date[], p_reason text, p_expected_total integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.schedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_id text;
  v_new_date date;
  v_blocked boolean;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  SELECT f.id, f.role, f.usuario, f.unidade_id
    INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id = auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE = '42501'; END IF;

  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role
    WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao'
    WHEN 'recepção' THEN 'recepcao' WHEN 'tecnico' THEN 'triagem'
    WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role, '') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE = '42501'; END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute, 1 AS rank FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento'
         AND pu.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT pu.can_execute, 2 FROM public.permissoes_usuario pu
       WHERE pu.user_id = v_staff.id::text AND pu.modulo = 'tratamento' AND pu.unidade_id = ''
      UNION ALL SELECT p.can_execute, 3 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento'
         AND p.unidade_id = coalesce(v_staff.unidade_id, '') AND coalesce(v_staff.unidade_id, '') <> ''
      UNION ALL SELECT p.can_execute, 4 FROM public.permissoes p
       WHERE p.perfil IN (v_role, lower(trim(v_staff.role))) AND p.modulo = 'tratamento' AND p.unidade_id = ''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Sem permissão para agendar sessões de tratamento' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id = p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento' THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id, '') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id, '') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'profissional' AND v_cycle.professional_id <> v_staff.id::text THEN
    RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE = '42501';
  END IF;
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id = v_session.appointment_id FOR UPDATE;
    IF FOUND AND v_appointment.paciente_id IS NOT DISTINCT FROM v_session.patient_id
       AND v_appointment.profissional_id IS NOT DISTINCT FROM v_session.professional_id
       AND v_appointment.unidade_id IS NOT DISTINCT FROM v_cycle.unit_id
       AND v_appointment.data IS NOT DISTINCT FROM v_session.scheduled_date
       AND v_appointment.data IS NOT DISTINCT FROM nullif(p_appointment->>'data','')::date
       AND v_appointment.hora IS NOT DISTINCT FROM p_appointment->>'hora'
       AND v_appointment.status = 'confirmado' THEN
      RETURN jsonb_build_object('status','ja_agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
    END IF;
    IF FOUND THEN RETURN jsonb_build_object('status','estado_protegido','reason','sessao_ja_vinculada'); END IF;
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento_ausente');
  END IF;
  IF v_session.status <> 'pendente_agendamento' OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_alterada');
  END IF;

  v_id := nullif(p_appointment->>'id', '');
  v_new_date := nullif(p_appointment->>'data','')::date;
  IF v_id IS NULL OR p_appointment->>'status' IS DISTINCT FROM 'confirmado'
     OR p_appointment->>'paciente_id' IS DISTINCT FROM v_cycle.patient_id
     OR p_appointment->>'profissional_id' IS DISTINCT FROM v_cycle.professional_id
     OR p_appointment->>'unidade_id' IS DISTINCT FROM v_cycle.unit_id
     OR v_new_date IS NULL
     OR nullif(p_appointment->>'hora','') IS NULL THEN
    RETURN jsonb_build_object('status','payload_invalido','reason','agendamento');
  END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT public.is_date_blocked(v_new_date,v_cycle.professional_id,v_cycle.unit_id) INTO v_blocked;
    IF v_blocked IS DISTINCT FROM false THEN
      RETURN jsonb_build_object('status','data_bloqueada','reason','indisponivel');
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.patient_id || '|' || v_new_date::text || '|' || (p_appointment->>'hora'), 0));
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
     WHERE a.paciente_id = v_cycle.patient_id
       AND (p_check_patient_conflict IS TRUE OR a.profissional_id = v_cycle.professional_id)
       AND a.data = v_new_date AND a.hora = p_appointment->>'hora'
       AND a.status NOT IN ('cancelado','falta','remarcado')
  ) THEN RETURN jsonb_build_object('status','duplicado','reason','horario_ocupado'); END IF;

  INSERT INTO public.agendamentos (
    id,paciente_id,paciente_nome,unidade_id,sala_id,setor_id,profissional_id,profissional_nome,
    data,hora,status,tipo,observacoes,origem,google_event_id,sync_status,criado_por,prioridade_perfil
  ) VALUES (
    v_id,v_cycle.patient_id,p_appointment->>'paciente_nome',v_cycle.unit_id,
    coalesce(p_appointment->>'sala_id',''),coalesce(p_appointment->>'setor_id',''),
    v_cycle.professional_id,p_appointment->>'profissional_nome',v_new_date,
    p_appointment->>'hora','confirmado',p_appointment->>'tipo',coalesce(p_appointment->>'observacoes',''),
    coalesce(p_appointment->>'origem','recepcao'),coalesce(p_appointment->>'google_event_id',''),
    coalesce(p_appointment->>'sync_status','pendente'),coalesce(p_appointment->>'criado_por',''),'normal'
  ) RETURNING * INTO v_appointment;

  UPDATE public.treatment_sessions s
     SET appointment_id = v_id, status = 'agendada', scheduled_date = v_new_date
   WHERE s.id = p_session_id AND s.cycle_id = p_cycle_id AND s.status = 'pendente_agendamento'
     AND s.appointment_id IS NULL AND s.scheduled_date IS NOT DISTINCT FROM p_expected_session_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'Sessão alterada durante o agendamento' USING ERRCODE = '40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id = p_session_id;
  RETURN jsonb_build_object('status','agendado','session',to_jsonb(v_session),'appointment',to_jsonb(v_appointment));
END;
$function$
;

REVOKE ALL ON FUNCTION public."schedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_batch(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_session record;
  v_cycle record;
  v_date date;
  v_time time;
  v_blocked boolean;
  v_lock_key bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.cycle_id, s.patient_id, s.professional_id, s.status,
         s.scheduled_date, s.appointment_id
    INTO v_session
    FROM public.treatment_sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nao_encontrado', 'reason', 'sessao');
  END IF;

  SELECT c.id, c.patient_id, c.professional_id, c.unit_id, c.status
    INTO v_cycle
    FROM public.treatment_cycles c
   WHERE c.id = p_cycle_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'vinculo_inconsistente', 'reason', 'ciclo_ausente');
  END IF;

  -- Idempotent retries do not need to revalidate a booking that is already committed.
  IF v_session.status = 'agendada' AND v_session.appointment_id IS NOT NULL THEN
    RETURN public.schedule_treatment_session(
      p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
    );
  END IF;

  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id
     OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id
     OR v_cycle.status <> 'em_andamento'
     OR v_session.status <> 'pendente_agendamento'
     OR v_session.appointment_id IS NOT NULL
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status', 'estado_protegido', 'reason', 'sessao_alterada');
  END IF;

  v_date := nullif(p_appointment->>'data', '')::date;
  v_time := substring(coalesce(p_appointment->>'hora', ''), 1, 5)::time;
  IF v_date IS NULL OR v_time IS NULL THEN
    RETURN jsonb_build_object('status', 'payload_invalido', 'reason', 'data_hora');
  END IF;

  -- Serialize batch reservations by professional/unit/day.
  v_lock_key := pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || v_date::text, 0
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

  IF extract(isodow FROM v_date) IN (6, 7) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'fim_de_semana');
  END IF;
  SELECT public.is_date_blocked(v_date, v_cycle.professional_id, v_cycle.unit_id)
    INTO v_blocked;
  IF v_blocked IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_integral');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bloqueios b
     WHERE v_date BETWEEN b.data_inicio AND b.data_fim
       AND ((coalesce(b.unidade_id, '') = '' AND coalesce(b.profissional_id, '') = '')
         OR (b.unidade_id = v_cycle.unit_id AND coalesce(b.profissional_id, '') = '')
         OR b.profissional_id = v_cycle.professional_id)
       AND (b.dia_inteiro IS TRUE OR coalesce(b.hora_inicio, '') = ''
         OR (v_time >= b.hora_inicio::time
             AND v_time < coalesce(nullif(b.hora_fim, ''), '23:59')::time))
  ) THEN
    RETURN jsonb_build_object('status', 'data_bloqueada', 'reason', 'bloqueio_de_horario');
  END IF;

  -- Capacidade e grade nao bloqueiam mais a equipe interna: a sessao e gravada
  -- pela funcao transacional, que mantem as validacoes de paciente duplicado.
  RETURN public.schedule_treatment_session(
    p_session_id, p_cycle_id, p_expected_session_date, p_appointment, p_check_patient_conflict
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public."schedule_treatment_session_batch"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_batch"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_batch"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_checked(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb; result jsonb; new_date date;
BEGIN
  SELECT * INTO s FROM public.treatment_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE='23503'; END IF;
  SELECT * INTO c FROM public.treatment_cycles WHERE id=p_cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
  IF s.cycle_id IS DISTINCT FROM c.id OR s.scheduled_date IS DISTINCT FROM p_expected_session_date THEN RAISE EXCEPTION 'A sessão mudou. Atualize o ciclo.' USING ERRCODE='40001'; END IF;
  new_date:=nullif(p_appointment->>'data','')::date;
  IF new_date IS DISTINCT FROM s.scheduled_date AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alteração da data.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.treatment_change_reason',coalesce(nullif(btrim(p_reason),''),'Agendamento confirmado manualmente'),true);
  IF p_manual_capacity THEN
    result:=public.schedule_treatment_session_manual_capacity(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  ELSE
    result:=public.schedule_treatment_session_batch(p_session_id,p_cycle_id,p_expected_session_date,p_appointment,p_check_patient_conflict);
  END IF;
  IF result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
      VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'agendar_sessao','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,jsonb_build_object('motivo_alteracao',coalesce(p_reason,'Agendamento confirmado manualmente'),'ciclo',c.id,'sessao',s.id,'valor_anterior',to_jsonb(s),'valor_novo',result->'session'));
  END IF;
  RETURN result;
END $function$
;

REVOKE ALL ON FUNCTION public."schedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_checked"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean, p_manual_capacity boolean, p_reason text) TO "service_role";

CREATE OR REPLACE FUNCTION public.schedule_treatment_session_manual_capacity(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
  v_check jsonb;
  v_result jsonb;
  v_capacity boolean;
BEGIN
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente o profissional ou Master pode fazer encaixe manual de tratamento' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id=p_cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM v_cycle.unit_id)))
     OR (lower(trim(v_staff.role))='profissional' AND v_staff.id::text IS DISTINCT FROM v_cycle.professional_id)
  THEN RAISE EXCEPTION 'Fora do escopo do tratamento' USING ERRCODE='42501'; END IF;
  IF p_appointment->>'tipo' IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_appointment->>'origem' IS DISTINCT FROM 'recepcao'
     OR nullif(p_appointment->>'id','') IS NULL
     OR (p_appointment->>'data')::date < (now() AT TIME ZONE 'America/Fortaleza')::date
  THEN RETURN jsonb_build_object('status','payload_invalido','reason','agendamento_manual'); END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_cycle.professional_id || '|' || v_cycle.unit_id || '|' || (p_appointment->>'data'), 0));
  v_check := public.check_internal_slot_availability(v_cycle.professional_id, v_cycle.unit_id,
    (p_appointment->>'data')::date, p_appointment->>'hora');
  v_capacity := (v_check->>'reason') IN ('day_full','turno_full','hour_full');
  -- An internal encaixe must never consume an external professional's reserved place.
  IF coalesce(v_capacity,false) AND EXISTS (
    SELECT 1 FROM public.quotas_externas q
     WHERE q.ativo IS TRUE AND q.profissional_interno_id::text=v_cycle.professional_id
       AND q.unidade_id=v_cycle.unit_id AND q.periodo_inicio=(p_appointment->>'data')::date
       AND q.periodo_fim=(p_appointment->>'data')::date AND q.vagas_usadas<q.vagas_total
  ) THEN RETURN jsonb_build_object('status','capacidade_esgotada','reason','reserva_externa_ativa'); END IF;
  IF coalesce((v_check->>'available')::boolean,false) IS NOT TRUE AND NOT coalesce(v_capacity,false) THEN
    RETURN jsonb_build_object('status','sem_disponibilidade','reason',v_check->>'reason');
  END IF;
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','on',true);
  PERFORM pg_catalog.set_config('app.treatment_manual_session_id',p_session_id::text,true);
  PERFORM pg_catalog.set_config('app.treatment_manual_appointment_id',p_appointment->>'id',true);
  v_result := public.schedule_treatment_session(p_session_id,p_cycle_id,p_expected_session_date,
    p_appointment,p_check_patient_conflict);
  PERFORM pg_catalog.set_config('app.treatment_manual_capacity_override','off',true);
  IF coalesce(v_capacity,false) AND v_result->>'status'='agendado' THEN
    INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,
      detalhes,agendamento_id,paciente_id,profissional_id)
    VALUES(v_staff.id::text,v_staff.nome,v_staff.role,v_cycle.unit_id,'encaixe_manual_tratamento',
      'treatment_session',p_session_id::text,
      pg_catalog.jsonb_build_object('capacity',v_check,'cycle_id',p_cycle_id),
      p_appointment->>'id',v_cycle.patient_id,v_cycle.professional_id);
  END IF;
  RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public."schedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."schedule_treatment_session_manual_capacity"(p_session_id uuid, p_cycle_id uuid, p_expected_session_date date, p_appointment jsonb, p_check_patient_conflict boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.search_patients(p_search text, p_unit_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS SETOF pacientes
 LANGUAGE plpgsql
 STABLE
AS $function$
 DECLARE
   v_search_digits text;
 BEGIN
   v_search_digits := regexp_replace(p_search, '\D', '', 'g');

   RETURN QUERY
   SELECT *
   FROM pacientes
   WHERE
     (p_unit_id IS NULL OR unit_id = p_unit_id)
     AND (
       unaccent(nome) ILIKE '%' || unaccent(p_search) || '%' OR 
       (v_search_digits <> '' AND cpf ILIKE '%' || v_search_digits || '%') OR 
       (v_search_digits <> '' AND cns ILIKE '%' || v_search_digits || '%') OR 
       (v_search_digits <> '' AND telefone ILIKE '%' || v_search_digits || '%')
     )
   ORDER BY nome ASC
   LIMIT p_limit;
 END;
$function$
;

REVOKE ALL ON FUNCTION public."search_patients"(p_search text, p_unit_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."search_patients"(p_search text, p_unit_id uuid, p_limit integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."search_patients"(p_search text, p_unit_id uuid, p_limit integer) TO "anon";

GRANT EXECUTE ON FUNCTION public."search_patients"(p_search text, p_unit_id uuid, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."search_patients"(p_search text, p_unit_id uuid, p_limit integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.search_sigtap_and_cid(q text, lim integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := COALESCE(trim(q), '');
  v_qu text;
  v_procs jsonb;
  v_cids jsonb;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_object('procedimentos', '[]'::jsonb, 'cids', '[]'::jsonb);
  END IF;

  v_qu := unaccent(v_q);

  WITH direct AS (
    SELECT sp.codigo,
           sp.nome,
           sp.especialidade,
           CASE WHEN sp.codigo ILIKE v_q || '%' THEN 'codigo' ELSE 'nome' END AS matched_by,
           NULL::text AS cid_codigo,
           NULL::text AS cid_descricao,
           GREATEST(
             similarity(unaccent(sp.nome), v_qu),
             similarity(sp.codigo, v_q),
             CASE WHEN sp.codigo ILIKE v_q || '%' THEN 1.0 ELSE 0 END
           ) AS score
    FROM public.sigtap_procedimentos sp
    WHERE sp.ativo = true
      AND (
        sp.codigo ILIKE v_q || '%'
        OR unaccent(sp.nome) ILIKE '%' || v_qu || '%'
        OR unaccent(sp.nome) % v_qu
      )
  ),
  by_cid AS (
    SELECT sp.codigo,
           sp.nome,
           sp.especialidade,
           'cid'::text AS matched_by,
           spc.cid_codigo,
           spc.cid_descricao,
           GREATEST(
             similarity(unaccent(COALESCE(spc.cid_descricao, '')), v_qu),
             similarity(spc.cid_codigo, v_q),
             CASE WHEN spc.cid_codigo ILIKE v_q || '%' THEN 0.95 ELSE 0 END
           ) AS score
    FROM public.sigtap_procedimento_cids spc
    JOIN public.sigtap_procedimentos sp
      ON sp.codigo = spc.procedimento_codigo AND sp.ativo = true
    WHERE spc.cid_codigo ILIKE v_q || '%'
       OR unaccent(COALESCE(spc.cid_descricao,'')) ILIKE '%' || v_qu || '%'
  ),
  unioned AS (
    SELECT * FROM direct
    UNION ALL
    SELECT * FROM by_cid
  ),
  ranked AS (
    SELECT DISTINCT ON (codigo)
           codigo, nome, especialidade, matched_by, cid_codigo, cid_descricao, score
    FROM unioned
    ORDER BY codigo, score DESC
  ),
  top_procs AS (
    SELECT codigo, nome, especialidade, matched_by, cid_codigo, cid_descricao
    FROM ranked
    ORDER BY (matched_by = 'codigo') DESC, score DESC, nome ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) INTO v_procs FROM top_procs t;

  WITH c AS (
    SELECT DISTINCT ON (codigo) codigo, descricao,
           GREATEST(
             similarity(unaccent(descricao), v_qu),
             similarity(codigo, v_q),
             CASE WHEN codigo ILIKE v_q || '%' THEN 1.0 ELSE 0 END
           ) AS score
    FROM public.cid10_codigos
    WHERE codigo ILIKE v_q || '%'
       OR unaccent(descricao) ILIKE '%' || v_qu || '%'
       OR unaccent(descricao) % v_qu
    ORDER BY codigo, score DESC
  ), c2 AS (
    SELECT * FROM c
    ORDER BY (codigo ILIKE v_q || '%') DESC, score DESC, codigo ASC
    LIMIT lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(c2.*)), '[]'::jsonb) INTO v_cids FROM c2;

  RETURN jsonb_build_object('procedimentos', v_procs, 'cids', v_cids);
END;
$function$
;

REVOKE ALL ON FUNCTION public."search_sigtap_and_cid"(q text, lim integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."search_sigtap_and_cid"(q text, lim integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."search_sigtap_and_cid"(q text, lim integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.set_agendamento_updated_at_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."set_agendamento_updated_at_now"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."set_agendamento_updated_at_now"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_agendamento_updated_at_now"() TO "service_role";

CREATE OR REPLACE FUNCTION public.set_excecao_bloqueio(p_paciente_id text, p_is_tfd boolean, p_ordem_judicial boolean, p_motivo text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_user_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_tfd boolean;
  v_old_oj boolean;
  v_paciente_nome text;
  v_status jsonb;
BEGIN
  SELECT nome, COALESCE(is_tfd,false), COALESCE(possui_ordem_judicial,false)
    INTO v_paciente_nome, v_old_tfd, v_old_oj
    FROM public.pacientes WHERE id = p_paciente_id;
  IF v_paciente_nome IS NULL THEN
    RAISE EXCEPTION 'paciente_nao_encontrado';
  END IF;

  IF (p_is_tfd OR p_ordem_judicial) AND (p_motivo IS NULL OR length(trim(p_motivo)) = 0) THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  UPDATE public.pacientes
     SET is_tfd = COALESCE(p_is_tfd, false),
         possui_ordem_judicial = COALESCE(p_ordem_judicial, false),
         motivo_excecao_bloqueio = CASE WHEN p_is_tfd OR p_ordem_judicial THEN p_motivo ELSE NULL END,
         observacao_tfd_ordem_judicial = p_observacao,
         data_marcacao_excecao = CASE WHEN p_is_tfd OR p_ordem_judicial THEN now() ELSE NULL END,
         marcado_por = CASE WHEN p_is_tfd OR p_ordem_judicial THEN p_user_id ELSE NULL END
   WHERE id = p_paciente_id;

  -- Auditoria por flag alterada
  IF v_old_tfd IS DISTINCT FROM COALESCE(p_is_tfd,false) THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema',
      CASE WHEN p_is_tfd THEN 'paciente_tfd_marcado' ELSE 'paciente_tfd_desmarcado' END,
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'valor_anterior', v_old_tfd,
        'valor_novo', COALESCE(p_is_tfd,false),
        'motivo', p_motivo,
        'observacao', p_observacao,
        'usuario_id', p_user_id,
        'usuario_nome', p_user_nome,
        'mensagem', format('%s %s o paciente %s como TFD.',
          COALESCE(p_user_nome,'(usuário)'),
          CASE WHEN p_is_tfd THEN 'marcou' ELSE 'desmarcou' END,
          v_paciente_nome)
      ),'pendente', now());
  END IF;

  IF v_old_oj IS DISTINCT FROM COALESCE(p_ordem_judicial,false) THEN
    INSERT INTO public.notification_logs (canal, evento, payload, status, criado_em)
    VALUES ('sistema',
      CASE WHEN p_ordem_judicial THEN 'paciente_ordem_judicial_marcado' ELSE 'paciente_ordem_judicial_desmarcado' END,
      jsonb_build_object(
        'paciente_id', p_paciente_id,
        'paciente_nome', v_paciente_nome,
        'valor_anterior', v_old_oj,
        'valor_novo', COALESCE(p_ordem_judicial,false),
        'motivo', p_motivo,
        'observacao', p_observacao,
        'usuario_id', p_user_id,
        'usuario_nome', p_user_nome,
        'mensagem', format('%s %s o paciente %s como Ordem Judicial.',
          COALESCE(p_user_nome,'(usuário)'),
          CASE WHEN p_ordem_judicial THEN 'marcou' ELSE 'desmarcou' END,
          v_paciente_nome)
      ),'pendente', now());
  END IF;

  v_status := public.atualizar_status_falta(p_paciente_id);
  RETURN jsonb_build_object('ok', true, 'status', v_status);
END;
$function$
;

REVOKE ALL ON FUNCTION public."set_excecao_bloqueio"(p_paciente_id text, p_is_tfd boolean, p_ordem_judicial boolean, p_motivo text, p_observacao text, p_user_id uuid, p_user_nome text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."set_excecao_bloqueio"(p_paciente_id text, p_is_tfd boolean, p_ordem_judicial boolean, p_motivo text, p_observacao text, p_user_id uuid, p_user_nome text) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_excecao_bloqueio"(p_paciente_id text, p_is_tfd boolean, p_ordem_judicial boolean, p_motivo text, p_observacao text, p_user_id uuid, p_user_nome text) TO "service_role";

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."set_updated_at_now"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."set_updated_at_now"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."set_updated_at_now"() TO "service_role";

CREATE OR REPLACE FUNCTION public.sync_profession_careness_from_discharge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.patient_profession_careness
       SET annulled_at = now(), release_reason = 'alta cancelada/ciclo removido'
     WHERE discharge_id = OLD.id AND annulled_at IS NULL;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.tipo_alta IS DISTINCT FROM OLD.tipo_alta OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.discharge_date IS DISTINCT FROM OLD.discharge_date
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
     ) THEN
    UPDATE public.patient_profession_careness
       SET annulled_at = now(), release_reason = 'alta corrigida'
     WHERE discharge_id = OLD.id AND annulled_at IS NULL;
  END IF;
  PERFORM public.apply_profession_careness_for_discharge(NEW.id, false);
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."sync_profession_careness_from_discharge"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."sync_profession_careness_from_discharge"() TO "service_role";

CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_paciente_id TEXT;
BEGIN
    -- Get patient_id from the related prontuario
    SELECT paciente_id INTO v_paciente_id FROM public.prontuarios WHERE id = NEW.prontuario_id;
    
    IF v_paciente_id IS NOT NULL THEN
        INSERT INTO public.paciente_procedimentos_persistentes (
            paciente_id, 
            procedimento_id, 
            cids_selecionados, 
            quantidade, 
            observacao
        )
        VALUES (
            v_paciente_id, 
            NEW.procedimento_id, 
            NEW.cids_selecionados, 
            NEW.quantidade, 
            NEW.observacao
        )
        ON CONFLICT (paciente_id, procedimento_id) DO UPDATE SET
            cids_selecionados = ARRAY(SELECT DISTINCT unnest(paciente_procedimentos_persistentes.cids_selecionados || NEW.cids_selecionados)),
            quantidade = GREATEST(paciente_procedimentos_persistentes.quantidade, NEW.quantidade),
            observacao = COALESCE(NEW.observacao, paciente_procedimentos_persistentes.observacao),
            atualizado_em = now();
    END IF;
    
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."sync_prontuario_to_global_procedures"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures"() TO "service_role";

CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_paciente_id TEXT;
    v_data_atendimento DATE;
BEGIN
    -- Get patient_id and data_atendimento from the related prontuario
    SELECT paciente_id, data_atendimento INTO v_paciente_id, v_data_atendimento 
    FROM public.prontuarios 
    WHERE id = NEW.prontuario_id;
    
    IF v_paciente_id IS NOT NULL AND v_data_atendimento IS NOT NULL THEN
        INSERT INTO public.procedimentos_realizados (
            paciente_id, 
            procedimento_id, 
            data_atendimento,
            cids_selecionados, 
            quantidade, 
            observacao
        )
        VALUES (
            v_paciente_id, 
            NEW.procedimento_id, 
            v_data_atendimento,
            NEW.cids_selecionados, 
            NEW.quantidade, 
            NEW.observacao
        )
        ON CONFLICT (paciente_id, procedimento_id, data_atendimento) DO UPDATE SET
            cids_selecionados = ARRAY(SELECT DISTINCT unnest(procedimentos_realizados.cids_selecionados || NEW.cids_selecionados)),
            quantidade = GREATEST(procedimentos_realizados.quantidade, NEW.quantidade),
            observacao = COALESCE(NEW.observacao, procedimentos_realizados.observacao),
            atualizado_em = now();
    END IF;
    
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."sync_prontuario_to_global_procedures_v2"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures_v2"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures_v2"() TO "service_role";

CREATE OR REPLACE FUNCTION public.sync_prontuario_to_global_procedures_v4()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_paciente_id TEXT;
    v_data_atendimento DATE;
BEGIN
    -- Get patient_id and data_atendimento from the related prontuario
    SELECT paciente_id, data_atendimento INTO v_paciente_id, v_data_atendimento 
    FROM public.prontuarios 
    WHERE id = NEW.prontuario_id;
    
    IF v_paciente_id IS NOT NULL AND v_data_atendimento IS NOT NULL THEN
        -- Insert into the global table
        INSERT INTO public.procedimentos_realizados (
            paciente_id, 
            procedimento_id, 
            data_atendimento,
            cids_selecionados, 
            quantidade, 
            observacao
        )
        VALUES (
            v_paciente_id, 
            NEW.procedimento_id, 
            v_data_atendimento,
            NEW.cids_selecionados, 
            NEW.quantidade, 
            NEW.observacao
        )
        ON CONFLICT (paciente_id, procedimento_id, data_atendimento) DO UPDATE SET
            cids_selecionados = ARRAY(SELECT DISTINCT unnest(procedimentos_realizados.cids_selecionados || NEW.cids_selecionados)),
            quantidade = GREATEST(procedimentos_realizados.quantidade, NEW.quantidade),
            observacao = COALESCE(NEW.observacao, procedimentos_realizados.observacao),
            atualizado_em = now();
    END IF;
    
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."sync_prontuario_to_global_procedures_v4"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures_v4"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."sync_prontuario_to_global_procedures_v4"() TO "service_role";

CREATE OR REPLACE FUNCTION public.treatment_cycle_integrity_issues(p_cycle_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE c public.treatment_cycles%ROWTYPE; n integer; unique_numbers integer; first_number integer; last_number integer; issues text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO c FROM public.treatment_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado' USING ERRCODE = '23503'; END IF;
  SELECT count(*), count(DISTINCT session_number), min(session_number), max(session_number) INTO n, unique_numbers, first_number, last_number FROM public.treatment_sessions WHERE cycle_id = c.id;
  IF n <> c.total_sessions OR c.total_sessions < 1 THEN
    issues := array_append(issues, format('Quantidade %s: ciclo previsto para %s sessões, mas possui %s registradas.', CASE WHEN n < c.total_sessions THEN 'incompleta' ELSE 'inconsistente' END, c.total_sessions, n));
  END IF;
  IF n <> c.total_sessions OR unique_numbers <> n OR first_number IS DISTINCT FROM 1 OR last_number IS DISTINCT FROM c.total_sessions THEN issues := array_append(issues, 'Numeração inconsistente: há sessões com sequência incompleta.'); END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s WHERE s.cycle_id = c.id AND s.status NOT IN ('cancelada','remarcada') AND s.scheduled_date IS NOT NULL GROUP BY s.scheduled_date HAVING count(*) > 1) THEN
    issues := array_append(issues, 'Data duplicada: duas sessões ativas deste ciclo estão previstas para a mesma data.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s JOIN public.treatment_sessions other ON other.appointment_id = s.appointment_id AND other.id <> s.id WHERE s.cycle_id = c.id AND s.appointment_id IS NOT NULL) THEN
    issues := array_append(issues, 'Agendamento já vinculado a outra sessão deste ciclo ou de outro ciclo.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions s LEFT JOIN public.agendamentos a ON a.id = s.appointment_id WHERE s.cycle_id = c.id AND
    (s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id OR nullif(c.unit_id,'') IS NULL
     OR (s.appointment_id IS NOT NULL AND (a.id IS NULL OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id OR a.data IS DISTINCT FROM s.scheduled_date)))) THEN
    issues := array_append(issues, 'Vínculo com paciente, profissional, unidade ou data divergente — revisão necessária.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.treatment_sessions WHERE cycle_id=c.id AND scheduled_date IS NULL AND status NOT IN ('cancelada','remarcada') AND NOT (status = 'pendente_agendamento' AND appointment_id IS NULL)) THEN
    issues:=array_append(issues,'Sessão sem data — aguarda nova marcação manual.');
  END IF;
  RETURN issues;
END $function$
;

REVOKE ALL ON FUNCTION public."treatment_cycle_integrity_issues"(p_cycle_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."treatment_cycle_integrity_issues"(p_cycle_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."treatment_cycle_integrity_issues"(p_cycle_id uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.treatment_manual_capacity_override_matches(p_appointment_id text, p_patient_id text, p_professional_id text, p_unit_id text, p_type text, p_origin text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_staff public.funcionarios%ROWTYPE;
  v_session public.treatment_sessions%ROWTYPE;
  v_cycle public.treatment_cycles%ROWTYPE;
BEGIN
  IF current_setting('app.treatment_manual_capacity_override', true) IS DISTINCT FROM 'on'
     OR current_setting('app.treatment_manual_appointment_id', true) IS DISTINCT FROM p_appointment_id
     OR p_type IS DISTINCT FROM 'Sessão de Tratamento'
     OR p_origin IS DISTINCT FROM 'recepcao' THEN RETURN false; END IF;
  SELECT * INTO v_staff FROM public.funcionarios
   WHERE auth_user_id = auth.uid() AND ativo IS TRUE AND lower(trim(role)) IN ('profissional','master');
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_session FROM public.treatment_sessions
   WHERE id::text = current_setting('app.treatment_manual_session_id', true);
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.treatment_cycles WHERE id = v_session.cycle_id;
  IF NOT FOUND OR v_cycle.status IS DISTINCT FROM 'em_andamento'
     OR v_cycle.patient_id IS DISTINCT FROM p_patient_id
     OR v_cycle.professional_id IS DISTINCT FROM p_professional_id
     OR v_cycle.unit_id IS DISTINCT FROM p_unit_id
     OR v_session.patient_id IS DISTINCT FROM p_patient_id
     OR v_session.professional_id IS DISTINCT FROM p_professional_id
     OR (v_session.appointment_id IS NOT NULL AND v_session.appointment_id IS DISTINCT FROM p_appointment_id)
     OR (v_staff.usuario IS DISTINCT FROM 'admin.sms'
         AND ((nullif(v_staff.unidade_id,'') IS NULL AND lower(trim(v_staff.role)) <> 'master')
           OR (nullif(v_staff.unidade_id,'') IS NOT NULL AND v_staff.unidade_id IS DISTINCT FROM p_unit_id)))
     OR (lower(trim(v_staff.role)) = 'profissional' AND v_staff.id::text IS DISTINCT FROM p_professional_id)
  THEN RETURN false; END IF;
  RETURN true;
END;
$function$
;

REVOKE ALL ON FUNCTION public."treatment_manual_capacity_override_matches"(p_appointment_id text, p_patient_id text, p_professional_id text, p_unit_id text, p_type text, p_origin text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."treatment_manual_capacity_override_matches"(p_appointment_id text, p_patient_id text, p_professional_id text, p_unit_id text, p_type text, p_origin text) TO "service_role";

CREATE OR REPLACE FUNCTION public.trg_atualizar_falta_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Agendamentos
        IF TG_TABLE_NAME = 'agendamentos' THEN
            IF NEW.status = 'falta' OR OLD.status = 'falta' THEN
                PERFORM public.atualizar_status_falta(NEW.paciente_id, NEW.profissional_id);
            END IF;
        -- Sessões de Tratamento
        ELSIF TG_TABLE_NAME = 'treatment_sessions' THEN
            IF NEW.status IN ('falta','paciente_faltou') OR OLD.status IN ('falta','paciente_faltou') THEN
                PERFORM public.atualizar_status_falta(NEW.patient_id, NEW.professional_id);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."trg_atualizar_falta_after_change"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."trg_atualizar_falta_after_change"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."trg_atualizar_falta_after_change"() TO "anon";

GRANT EXECUTE ON FUNCTION public."trg_atualizar_falta_after_change"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."trg_atualizar_falta_after_change"() TO "service_role";

CREATE OR REPLACE FUNCTION public.trigger_refresh_pps()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM public.refresh_paciente_profissional_status();
    RETURN NULL;
END;
$function$
;

REVOKE ALL ON FUNCTION public."trigger_refresh_pps"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."trigger_refresh_pps"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."trigger_refresh_pps"() TO "anon";

GRANT EXECUTE ON FUNCTION public."trigger_refresh_pps"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."trigger_refresh_pps"() TO "service_role";

CREATE OR REPLACE FUNCTION public.unschedule_treatment_session(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_staff record;
  v_role text;
  v_permission boolean;
  v_session record;
  v_cycle record;
  v_appointment public.agendamentos%ROWTYPE;
  v_deleted_id text;
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE='42501'; END IF;
  SELECT f.id,f.role,f.usuario,f.unidade_id INTO v_staff FROM public.funcionarios f
   WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário ativo não encontrado' USING ERRCODE='42501'; END IF;
  v_role := lower(trim(v_staff.role));
  v_role := CASE v_role WHEN 'gestão' THEN 'gestao' WHEN 'gestor' THEN 'gestao'
    WHEN 'coordenacao' THEN 'gestao' WHEN 'coordenador' THEN 'gestao' WHEN 'recepção' THEN 'recepcao'
    WHEN 'tecnico' THEN 'triagem' WHEN 'tecnico_enfermagem' THEN 'enfermagem' ELSE v_role END;
  IF nullif(v_role,'') IS NULL THEN RAISE EXCEPTION 'Perfil não identificado' USING ERRCODE='42501'; END IF;
  IF v_role NOT IN ('master','profissional') THEN
    SELECT chosen.can_execute INTO v_permission FROM (
      SELECT pu.can_execute,1 AS rank FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text
        AND pu.modulo='tratamento' AND pu.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT pu.can_execute,2 FROM public.permissoes_usuario pu WHERE pu.user_id=v_staff.id::text AND pu.modulo='tratamento' AND pu.unidade_id=''
      UNION ALL SELECT p.can_execute,3 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role)))
        AND p.modulo='tratamento' AND p.unidade_id=coalesce(v_staff.unidade_id,'') AND coalesce(v_staff.unidade_id,'')<>''
      UNION ALL SELECT p.can_execute,4 FROM public.permissoes p WHERE p.perfil IN (v_role,lower(trim(v_staff.role))) AND p.modulo='tratamento' AND p.unidade_id=''
    ) chosen ORDER BY chosen.rank LIMIT 1;
    IF v_permission IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Sem permissão para desmarcar sessões de tratamento' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','nao_encontrado','reason','sessao'); END IF;
  SELECT c.* INTO v_cycle FROM public.treatment_cycles c WHERE c.id=p_cycle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_ausente'); END IF;
  IF v_session.cycle_id IS DISTINCT FROM p_cycle_id OR v_session.patient_id IS DISTINCT FROM v_cycle.patient_id
     OR v_session.professional_id IS DISTINCT FROM v_cycle.professional_id THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','ciclo_sessao');
  END IF;
  IF v_staff.usuario IS DISTINCT FROM 'admin.sms' AND
     (nullif(v_staff.unidade_id,'') IS NULL AND v_role <> 'master'
       OR nullif(v_staff.unidade_id,'') IS NOT NULL AND v_cycle.unit_id <> v_staff.unidade_id) THEN
    RAISE EXCEPTION 'Fora do escopo de unidade' USING ERRCODE='42501';
  END IF;
  IF v_role='profissional' AND v_cycle.professional_id<>v_staff.id::text THEN RAISE EXCEPTION 'Fora do escopo profissional' USING ERRCODE='42501'; END IF;
  IF v_cycle.status <> 'em_andamento' OR v_session.status <> 'agendada' THEN
    RETURN jsonb_build_object('status','estado_protegido','reason','sessao_nao_desmarcavel');
  END IF;
  IF p_expected_appointment_id IS NULL OR v_session.appointment_id IS DISTINCT FROM p_expected_appointment_id
     OR v_session.scheduled_date IS DISTINCT FROM p_expected_session_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','vinculo_ausente_ou_alterado');
  END IF;
  SELECT a.* INTO v_appointment FROM public.agendamentos a WHERE a.id=p_expected_appointment_id FOR UPDATE;
  IF NOT FOUND OR v_appointment.paciente_id IS DISTINCT FROM v_session.patient_id
     OR v_appointment.profissional_id IS DISTINCT FROM v_session.professional_id
     OR v_appointment.unidade_id IS DISTINCT FROM v_cycle.unit_id
     OR v_appointment.data IS DISTINCT FROM v_session.scheduled_date THEN
    RETURN jsonb_build_object('status','vinculo_inconsistente','reason','agendamento');
  END IF;

  IF EXISTS(SELECT 1 FROM public.treatment_sessions other WHERE other.appointment_id=p_expected_appointment_id AND other.id<>p_session_id) THEN
    RETURN jsonb_build_object('status','vinculo_compartilhado','reason','use_liberar_para_agendar');
  END IF;
  IF v_appointment.status NOT IN ('confirmado','agendado','pendente')
     OR EXISTS(SELECT 1 FROM public.prontuarios WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.atendimentos WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.triage_records WHERE agendamento_id=p_expected_appointment_id)
     OR EXISTS(SELECT 1 FROM public.fila_espera WHERE id=p_expected_appointment_id) THEN
    RAISE EXCEPTION 'Paciente já recebido ou com registro clínico. A reserva foi preservada.' USING ERRCODE='23514';
  END IF;

  -- Unlink first in this same transaction; the Agenda deletion trigger must
  -- not process an operation already handled by the canonical deschedule RPC.
  UPDATE public.treatment_sessions s SET status='pendente_agendamento', appointment_id=NULL
   WHERE s.id=p_session_id AND s.cycle_id=p_cycle_id AND s.status='agendada'
     AND s.appointment_id=p_expected_appointment_id AND s.scheduled_date=p_expected_session_date;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'Sessão alterada durante a desmarcação' USING ERRCODE='40001'; END IF;
  DELETE FROM public.agendamentos a WHERE a.id=p_expected_appointment_id
    AND a.paciente_id=v_session.patient_id AND a.profissional_id=v_session.professional_id
    AND a.unidade_id=v_cycle.unit_id AND a.data=v_session.scheduled_date
  RETURNING a.id INTO v_deleted_id;
  IF v_deleted_id IS NULL THEN RAISE EXCEPTION 'Agendamento alterado durante a desmarcação' USING ERRCODE='40001'; END IF;
  SELECT s.* INTO v_session FROM public.treatment_sessions s WHERE s.id=p_session_id;
  RETURN jsonb_build_object('status','desmarcado','session',to_jsonb(v_session),'appointment_id',v_deleted_id);
END;
$function$
;

REVOKE ALL ON FUNCTION public."unschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."unschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."unschedule_treatment_session"(p_session_id uuid, p_cycle_id uuid, p_expected_appointment_id text, p_expected_session_date date) TO "service_role";

CREATE OR REPLACE FUNCTION public.update_agenda_treatment_appointment(p_id text, p_patch jsonb, p_expected jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE a public.agendamentos%ROWTYPE; proposed public.agendamentos%ROWTYPE;
 s public.treatment_sessions%ROWTYPE; c public.treatment_cycles%ROWTYPE; actor jsonb;
 linked boolean; previous_reason text; moved boolean; changed integer;
BEGIN
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN
  ('data','hora','profissional_id','profissional_nome','tipo','observacoes','status','sala_id','google_event_id','sync_status','lembrete_24h_enviado_em','lembrete_proximo_enviado_em')) THEN
  RAISE EXCEPTION 'Campos inválidos na edição da Agenda.' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM public.treatment_sessions WHERE appointment_id=p_id)>1 THEN
  RAISE EXCEPTION 'Este agendamento possui múltiplas sessões vinculadas. Confira os vínculos antes de remarcar.' USING ERRCODE='23514';
 END IF;
 SELECT * INTO s FROM public.treatment_sessions WHERE appointment_id=p_id FOR UPDATE;
 linked:=FOUND;
 IF linked THEN
  SELECT * INTO c FROM public.treatment_cycles WHERE id=s.cycle_id FOR UPDATE;
  actor:=public.assert_treatment_write_scope(c.professional_id,c.unit_id,false);
 END IF;
 SELECT * INTO a FROM public.agendamentos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado ou sem acesso.' USING ERRCODE='42501'; END IF;
 IF NOT linked AND EXISTS(SELECT 1 FROM public.treatment_sessions WHERE appointment_id=p_id) THEN
  RAISE EXCEPTION 'O vínculo mudou. Atualize a Agenda e tente novamente.' USING ERRCODE='40001';
 END IF;
 IF p_expected IS NOT NULL AND (a.data::text IS DISTINCT FROM p_expected->>'data' OR a.hora IS DISTINCT FROM p_expected->>'hora'
   OR a.profissional_id IS DISTINCT FROM p_expected->>'profissional_id') THEN
  RAISE EXCEPTION 'O agendamento mudou em outro terminal. Atualize a Agenda.' USING ERRCODE='40001';
 END IF;
 proposed:=jsonb_populate_record(a,p_patch);
 moved:=proposed.data IS DISTINCT FROM a.data OR proposed.hora IS DISTINCT FROM a.hora;
 IF linked THEN
  IF s.patient_id IS DISTINCT FROM c.patient_id OR s.professional_id IS DISTINCT FROM c.professional_id
   OR a.paciente_id IS DISTINCT FROM c.patient_id OR a.profissional_id IS DISTINCT FROM c.professional_id OR a.unidade_id IS DISTINCT FROM c.unit_id
   OR proposed.profissional_id IS DISTINCT FROM c.professional_id THEN
   RAISE EXCEPTION 'Paciente, profissional ou unidade do vínculo divergem. Nenhum registro foi alterado.' USING ERRCODE='23514';
  END IF;
  IF (moved OR s.scheduled_date IS DISTINCT FROM proposed.data) AND
    (s.status NOT IN ('agendada','pendente_agendamento') OR a.status IN ('concluido','em_atendimento','cancelado','falta','remarcado')) THEN
   RAISE EXCEPTION 'Esta sessão possui estado clínico protegido. A data não foi alterada.' USING ERRCODE='23514';
  END IF;
 END IF;
 UPDATE public.agendamentos SET data=proposed.data,hora=proposed.hora,profissional_id=proposed.profissional_id,
 profissional_nome=proposed.profissional_nome,tipo=proposed.tipo,observacoes=proposed.observacoes,status=proposed.status,
 sala_id=proposed.sala_id,google_event_id=proposed.google_event_id,sync_status=proposed.sync_status,
 lembrete_24h_enviado_em=proposed.lembrete_24h_enviado_em,lembrete_proximo_enviado_em=proposed.lembrete_proximo_enviado_em WHERE id=p_id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Sem permissão para atualizar este agendamento.' USING ERRCODE='42501'; END IF;
 IF linked AND (moved OR s.scheduled_date IS DISTINCT FROM proposed.data) THEN
  previous_reason:=coalesce(current_setting('app.treatment_change_reason',true),'');
  PERFORM set_config('app.treatment_change_reason','Remarcação pela Agenda com sincronização da sessão vinculada',true);
  UPDATE public.treatment_sessions SET scheduled_date=proposed.data WHERE id=s.id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Sem permissão para sincronizar a sessão. Nenhuma alteração foi salva.' USING ERRCODE='42501'; END IF;
  PERFORM set_config('app.treatment_change_reason',previous_reason,true);
  INSERT INTO public.action_logs(user_id,user_nome,role,unidade_id,acao,entidade,entidade_id,modulo,paciente_id,profissional_id,detalhes)
   VALUES(actor->>'id',actor->>'nome',actor->>'role',c.unit_id,'sincronizar_sessao_pela_agenda','treatment_session',s.id::text,'tratamentos',c.patient_id,c.professional_id,
    jsonb_build_object('agendamento_id',p_id,'data_anterior_sessao',s.scheduled_date,'data_anterior_agenda',a.data,'data_nova',proposed.data,'hora_anterior',a.hora,'hora_nova',proposed.hora,'motivo_alteracao','Edição explícita pela Agenda'));
 END IF;
 RETURN jsonb_build_object('id',p_id,'session_id',CASE WHEN linked THEN s.id ELSE NULL END);
END $function$
;

REVOKE ALL ON FUNCTION public."update_agenda_treatment_appointment"(p_id text, p_patch jsonb, p_expected jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."update_agenda_treatment_appointment"(p_id text, p_patch jsonb, p_expected jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_agenda_treatment_appointment"(p_id text, p_patch jsonb, p_expected jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.update_google_calendar_tokens_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."update_google_calendar_tokens_updated_at"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."update_google_calendar_tokens_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_google_calendar_tokens_updated_at"() TO "service_role";

CREATE OR REPLACE FUNCTION public.update_prontuarios_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."update_prontuarios_updated_at"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."update_prontuarios_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_prontuarios_updated_at"() TO "service_role";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."update_updated_at_column"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "anon";

GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO "service_role";

CREATE OR REPLACE FUNCTION public.update_whatsapp_event_config_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

REVOKE ALL ON FUNCTION public."update_whatsapp_event_config_updated_at"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."update_whatsapp_event_config_updated_at"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."update_whatsapp_event_config_updated_at"() TO "anon";

GRANT EXECUTE ON FUNCTION public."update_whatsapp_event_config_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."update_whatsapp_event_config_updated_at"() TO "service_role";

CREATE OR REPLACE FUNCTION public.validar_sinais_triagem(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_key text; v_raw text; v numeric; v_min numeric; v_max numeric; v_values jsonb := '{}'; v_imc numeric;
BEGIN
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados de triagem inválidos.' USING ERRCODE='23514'; END IF;
  FOREACH v_key IN ARRAY ARRAY['peso','altura','temperatura','frequencia_cardiaca','saturacao_oxigenio','glicemia'] LOOP
    v_raw := nullif(btrim(p_data->>v_key),'');
    IF v_raw IS NULL THEN v_values := v_values || jsonb_build_object(v_key,NULL); CONTINUE; END IF;
    IF length(v_raw)>32 OR replace(v_raw,',','.') !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Valor inválido no campo %.',v_key USING ERRCODE='23514'; END IF;
    v := replace(v_raw,',','.')::numeric;
    v_min := CASE v_key WHEN 'peso' THEN 0.5 WHEN 'altura' THEN 20 ELSE 0 END;
    v_max := CASE v_key WHEN 'peso' THEN 400 WHEN 'altura' THEN 260 WHEN 'temperatura' THEN 60 WHEN 'frequencia_cardiaca' THEN 350 WHEN 'saturacao_oxigenio' THEN 100 ELSE 9999.99 END;
    IF v<v_min OR v>v_max OR (v_key IN ('frequencia_cardiaca','saturacao_oxigenio') AND trunc(v)<>v) THEN
      RAISE EXCEPTION 'Valor inválido no campo %. Informe entre % e %.',v_key,v_min,v_max USING ERRCODE='23514';
    END IF;
    v_values := v_values || jsonb_build_object(v_key,v);
  END LOOP;
  IF v_values->>'peso' IS NOT NULL AND v_values->>'altura' IS NOT NULL THEN
    v_imc := round((v_values->>'peso')::numeric / power((v_values->>'altura')::numeric/100,2),2);
    IF v_imc>999.99 THEN RAISE EXCEPTION 'Confira peso e altura: o IMC calculado excede o limite suportado.' USING ERRCODE='23514'; END IF;
  END IF;
  IF length(coalesce(p_data->>'pressao_arterial',''))>20 THEN RAISE EXCEPTION 'Pressão arterial inválida. Use o formato 120/80.' USING ERRCODE='23514'; END IF;
  IF p_data ? 'custom_data' AND jsonb_typeof(p_data->'custom_data') <> 'object' THEN RAISE EXCEPTION 'Campos adicionais de triagem inválidos.' USING ERRCODE='23514'; END IF;
  FOREACH v_key IN ARRAY ARRAY['alergias','medicamentos'] LOOP
    IF p_data ? v_key AND (jsonb_typeof(p_data->v_key) <> 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_data->v_key)='array' THEN p_data->v_key ELSE '[]' END) e WHERE jsonb_typeof(e)<>'string')) THEN
      RAISE EXCEPTION 'Lista de % inválida.',v_key USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN p_data || v_values || jsonb_build_object('imc',v_imc);
END $function$
;

REVOKE ALL ON FUNCTION public."validar_sinais_triagem"(p_data jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."validar_sinais_triagem"(p_data jsonb) TO "service_role";

ALTER TABLE public."action_logs" ADD CONSTRAINT "action_logs_pkey" PRIMARY KEY (id);

ALTER TABLE public."agendamentos" ADD CONSTRAINT "agendamentos_pkey" PRIMARY KEY (id);

ALTER TABLE public."agendamentos_externos" ADD CONSTRAINT "agendamentos_externos_pkey" PRIMARY KEY (id);

ALTER TABLE public."atendimentos" ADD CONSTRAINT "atendimentos_pkey" PRIMARY KEY (id);

ALTER TABLE public."bloqueios" ADD CONSTRAINT "bloqueios_pkey" PRIMARY KEY (id);

ALTER TABLE public."cbo_codigos" ADD CONSTRAINT "cbo_codigos_codigo_key" UNIQUE (codigo);

ALTER TABLE public."cbo_codigos" ADD CONSTRAINT "cbo_codigos_pkey" PRIMARY KEY (id);

ALTER TABLE public."cid10_codigos" ADD CONSTRAINT "cid10_codigos_pkey" PRIMARY KEY (id);

ALTER TABLE public."clinica_config" ADD CONSTRAINT "clinica_config_pkey" PRIMARY KEY (id);

ALTER TABLE public."clinica_config" ADD CONSTRAINT "clinica_config_provider_check" CHECK (whatsapp_provider_active = ANY (ARRAY['evolution'::text, 'uazapigo'::text]));

ALTER TABLE public."disponibilidades" ADD CONSTRAINT "disponibilidades_pkey" PRIMARY KEY (id);

ALTER TABLE public."document_templates" ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY (id);

ALTER TABLE public."documentos_gerados" ADD CONSTRAINT "documentos_gerados_pkey" PRIMARY KEY (id);

ALTER TABLE public."documentos_gerados" ADD CONSTRAINT "documentos_gerados_status_check" CHECK (status = ANY (ARRAY['rascunho'::text, 'assinado'::text, 'cancelado'::text, 'anexado'::text, 'gerado'::text]));

ALTER TABLE public."episodios_clinicos" ADD CONSTRAINT "episodios_clinicos_pkey" PRIMARY KEY (id);

ALTER TABLE public."especialidades" ADD CONSTRAINT "especialidades_pkey" PRIMARY KEY (id);

ALTER TABLE public."exam_types" ADD CONSTRAINT "exam_types_pkey" PRIMARY KEY (id);

ALTER TABLE public."fila_espera" ADD CONSTRAINT "fila_espera_pkey" PRIMARY KEY (id);

ALTER TABLE public."form_templates" ADD CONSTRAINT "form_templates_pkey" PRIMARY KEY (id);

ALTER TABLE public."funcionarios" ADD CONSTRAINT "funcionarios_auth_user_id_key" UNIQUE (auth_user_id);

ALTER TABLE public."funcionarios" ADD CONSTRAINT "funcionarios_pkey" PRIMARY KEY (id);

ALTER TABLE public."funcionarios" ADD CONSTRAINT "funcionarios_usuario_key" UNIQUE (usuario);

ALTER TABLE public."google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_pkey" PRIMARY KEY (id);

ALTER TABLE public."google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_user_id_key" UNIQUE (user_id);

ALTER TABLE public."google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_user_id_unique" UNIQUE (user_id);

ALTER TABLE public."horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_dia_semana_key" UNIQUE (dia_semana);

ALTER TABLE public."horarios_funcionamento" ADD CONSTRAINT "horarios_funcionamento_pkey" PRIMARY KEY (id);

ALTER TABLE public."integracoes_log" ADD CONSTRAINT "integracoes_log_pkey" PRIMARY KEY (id);

ALTER TABLE public."logradouros_dne" ADD CONSTRAINT "logradouros_dne_pkey" PRIMARY KEY (codigo);

ALTER TABLE public."medications" ADD CONSTRAINT "medications_pkey" PRIMARY KEY (id);

ALTER TABLE public."multiprofessional_evaluations" ADD CONSTRAINT "multiprofessional_evaluations_pkey" PRIMARY KEY (id);

ALTER TABLE public."notification_logs" ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY (id);

ALTER TABLE public."nursing_evaluations" ADD CONSTRAINT "nursing_evaluations_pkey" PRIMARY KEY (id);

ALTER TABLE public."paciente_profissional_status" ADD CONSTRAINT "paciente_profissional_status_pkey" PRIMARY KEY (paciente_id, profissional_id);

ALTER TABLE public."pacientes" ADD CONSTRAINT "pacientes_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_discharges" ADD CONSTRAINT "patient_discharges_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_documents" ADD CONSTRAINT "patient_documents_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_evaluations" ADD CONSTRAINT "patient_evaluations_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_procedures" ADD CONSTRAINT "patient_procedures_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_profession_careness" ADD CONSTRAINT "patient_profession_careness_discharge_id_key" UNIQUE (discharge_id);

ALTER TABLE public."patient_profession_careness" ADD CONSTRAINT "patient_profession_careness_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_profession_careness" ADD CONSTRAINT "patient_profession_careness_scope_check" CHECK (scope = ANY (ARRAY['global'::text, 'unit'::text]));

ALTER TABLE public."patient_referrals" ADD CONSTRAINT "patient_referrals_pkey" PRIMARY KEY (id);

ALTER TABLE public."patient_regulation" ADD CONSTRAINT "patient_regulation_pkey" PRIMARY KEY (id);

ALTER TABLE public."permissoes" ADD CONSTRAINT "permissoes_pkey" PRIMARY KEY (id);

ALTER TABLE public."permissoes_usuario" ADD CONSTRAINT "permissoes_usuario_pkey" PRIMARY KEY (id);

ALTER TABLE public."procedimento_profissionais" ADD CONSTRAINT "procedimento_profissionais_pkey" PRIMARY KEY (id);

ALTER TABLE public."procedimento_profissionais" ADD CONSTRAINT "procedimento_profissionais_procedimento_codigo_profissional_key" UNIQUE (procedimento_codigo, profissional_id);

ALTER TABLE public."procedimentos" ADD CONSTRAINT "procedimentos_pkey" PRIMARY KEY (id);

ALTER TABLE public."procedimentos_realizados" ADD CONSTRAINT "procedimentos_realizados_paciente_id_procedimento_id_data_a_key" UNIQUE (paciente_id, procedimento_id, data_atendimento);

ALTER TABLE public."procedimentos_realizados" ADD CONSTRAINT "procedimentos_realizados_pkey" PRIMARY KEY (id);

ALTER TABLE public."profession_careness_mapping_state" ADD CONSTRAINT "profession_careness_mapping_state_id_check" CHECK (id IS TRUE);

ALTER TABLE public."profession_careness_mapping_state" ADD CONSTRAINT "profession_careness_mapping_state_pkey" PRIMARY KEY (id);

ALTER TABLE public."profession_careness_rules" ADD CONSTRAINT "profession_careness_rules_duration_unit_check" CHECK (duration_unit = ANY (ARRAY['days'::text, 'months'::text]));

ALTER TABLE public."profession_careness_rules" ADD CONSTRAINT "profession_careness_rules_duration_value_check" CHECK (duration_value >= 1 AND duration_value <= 3650);

ALTER TABLE public."profession_careness_rules" ADD CONSTRAINT "profession_careness_rules_pkey" PRIMARY KEY (profession_key);

ALTER TABLE public."profession_careness_rules" ADD CONSTRAINT "profession_careness_rules_scope_check" CHECK (scope = ANY (ARRAY['global'::text, 'unit'::text]));

ALTER TABLE public."professional_preferences" ADD CONSTRAINT "professional_preferences_pkey" PRIMARY KEY (id);

ALTER TABLE public."profissionais_carimbo" ADD CONSTRAINT "profissionais_carimbo_pkey" PRIMARY KEY (id);

ALTER TABLE public."profissionais_carimbo" ADD CONSTRAINT "profissionais_carimbo_profissional_id_key" UNIQUE (profissional_id);

ALTER TABLE public."profissionais_carimbo" ADD CONSTRAINT "profissionais_carimbo_tipo_check" CHECK (tipo = ANY (ARRAY['digital'::text, 'imagem'::text]));

ALTER TABLE public."profissionais_externos" ADD CONSTRAINT "profissionais_externos_auth_user_id_key" UNIQUE (auth_user_id);

ALTER TABLE public."profissionais_externos" ADD CONSTRAINT "profissionais_externos_email_key" UNIQUE (email);

ALTER TABLE public."profissionais_externos" ADD CONSTRAINT "profissionais_externos_pkey" PRIMARY KEY (id);

ALTER TABLE public."prontuario_config" ADD CONSTRAINT "prontuario_config_pkey" PRIMARY KEY (id);

ALTER TABLE public."prontuario_config" ADD CONSTRAINT "prontuario_config_profissional_id_tipo_prontuario_key" UNIQUE (profissional_id, tipo_prontuario);

ALTER TABLE public."prontuario_exames" ADD CONSTRAINT "prontuario_exames_pkey" PRIMARY KEY (id);

ALTER TABLE public."prontuario_procedimentos" ADD CONSTRAINT "prontuario_procedimentos_pkey" PRIMARY KEY (id);

ALTER TABLE public."prontuarios" ADD CONSTRAINT "prontuarios_pkey" PRIMARY KEY (id);

ALTER TABLE public."pts" ADD CONSTRAINT "pts_pkey" PRIMARY KEY (id);

ALTER TABLE public."pts_cid" ADD CONSTRAINT "pts_cid_pkey" PRIMARY KEY (id);

ALTER TABLE public."pts_import_log" ADD CONSTRAINT "pts_import_log_pkey" PRIMARY KEY (id);

ALTER TABLE public."pts_metas" ADD CONSTRAINT "pts_metas_pkey" PRIMARY KEY (id);

ALTER TABLE public."pts_sigtap" ADD CONSTRAINT "pts_sigtap_pkey" PRIMARY KEY (id);

ALTER TABLE public."quotas_externas" ADD CONSTRAINT "quotas_externas_pkey" PRIMARY KEY (id);

ALTER TABLE public."referral_attachments" ADD CONSTRAINT "referral_attachments_pkey" PRIMARY KEY (id);

ALTER TABLE public."salas" ADD CONSTRAINT "salas_pkey" PRIMARY KEY (id);

ALTER TABLE public."sigtap_procedimento_cids" ADD CONSTRAINT "sigtap_procedimento_cids_pkey" PRIMARY KEY (id);

ALTER TABLE public."sigtap_procedimento_cids" ADD CONSTRAINT "sigtap_procedimento_cids_proc_cid_unique" UNIQUE (procedimento_codigo, cid_codigo);

ALTER TABLE public."sigtap_procedimentos" ADD CONSTRAINT "sigtap_procedimentos_codigo_key" UNIQUE (codigo);

ALTER TABLE public."sigtap_procedimentos" ADD CONSTRAINT "sigtap_procedimentos_pkey" PRIMARY KEY (id);

ALTER TABLE public."sistemas_integrados" ADD CONSTRAINT "sistemas_integrados_identificador_key" UNIQUE (identificador);

ALTER TABLE public."sistemas_integrados" ADD CONSTRAINT "sistemas_integrados_pkey" PRIMARY KEY (id);

ALTER TABLE public."soap_custom_options" ADD CONSTRAINT "soap_custom_options_pkey" PRIMARY KEY (id);

ALTER TABLE public."system_cleanup_logs" ADD CONSTRAINT "system_cleanup_logs_pkey" PRIMARY KEY (id);

ALTER TABLE public."system_config" ADD CONSTRAINT "system_config_pkey" PRIMARY KEY (id);

ALTER TABLE public."system_monitoring_alerts" ADD CONSTRAINT "system_monitoring_alerts_pkey" PRIMARY KEY (id);

ALTER TABLE public."system_monitoring_settings" ADD CONSTRAINT "system_monitoring_settings_pkey" PRIMARY KEY (id);

ALTER TABLE public."system_monitoring_snapshots" ADD CONSTRAINT "system_monitoring_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE public."treatment_cycles" ADD CONSTRAINT "treatment_cycles_pkey" PRIMARY KEY (id);

ALTER TABLE public."treatment_extensions" ADD CONSTRAINT "treatment_extensions_pkey" PRIMARY KEY (id);

ALTER TABLE public."treatment_sessions" ADD CONSTRAINT "treatment_session_undated_pending_only" CHECK (scheduled_date IS NOT NULL OR status = 'pendente_agendamento'::text AND appointment_id IS NULL);

ALTER TABLE public."treatment_sessions" ADD CONSTRAINT "treatment_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE public."triage_records" ADD CONSTRAINT "triage_records_agendamento_id_key" UNIQUE (agendamento_id);

ALTER TABLE public."triage_records" ADD CONSTRAINT "triage_records_pkey" PRIMARY KEY (id);

ALTER TABLE public."triage_settings" ADD CONSTRAINT "triage_settings_pkey" PRIMARY KEY (id);

ALTER TABLE public."unidades" ADD CONSTRAINT "unidades_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_config" ADD CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_config" ADD CONSTRAINT "whatsapp_config_unidade_id_key" UNIQUE (unidade_id);

ALTER TABLE public."whatsapp_connection_status" ADD CONSTRAINT "whatsapp_connection_status_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_consents" ADD CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_consents" ADD CONSTRAINT "whatsapp_consents_tipo_check" CHECK (tipo = ANY (ARRAY['opt_in'::text, 'opt_out'::text, 'interaction'::text]));

ALTER TABLE public."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY (phone);

ALTER TABLE public."whatsapp_event_config" ADD CONSTRAINT "whatsapp_event_config_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_event_config" ADD CONSTRAINT "whatsapp_event_config_prioridade_check" CHECK (prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text]));

ALTER TABLE public."whatsapp_event_config" ADD CONSTRAINT "whatsapp_event_config_unidade_id_evento_key" UNIQUE (unidade_id, evento);

ALTER TABLE public."whatsapp_health_snapshots" ADD CONSTRAINT "whatsapp_health_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_inbound_messages" ADD CONSTRAINT "whatsapp_inbound_intent_check" CHECK (intent = ANY (ARRAY['confirmar'::text, 'remarcar'::text, 'atendente'::text, 'sair'::text, 'livre'::text]));

ALTER TABLE public."whatsapp_inbound_messages" ADD CONSTRAINT "whatsapp_inbound_messages_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_prioridade_check" CHECK (prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text]));

ALTER TABLE public."whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_status_check" CHECK (status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'entregue'::text, 'lido'::text, 'erro'::text, 'bloqueado'::text, 'cancelado'::text, 'ignorado'::text]));

ALTER TABLE public."whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_categoria_check" CHECK (categoria = ANY (ARRAY['utility'::text, 'service'::text, 'authentication'::text, 'marketing'::text]));

ALTER TABLE public."whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY (id);

ALTER TABLE public."whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_status_check" CHECK (status = ANY (ARRAY['rascunho'::text, 'pendente_aprovacao'::text, 'aprovado'::text, 'rejeitado'::text, 'inativo'::text]));

ALTER TABLE public."whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_unidade_id_tipo_key" UNIQUE (unidade_id, tipo);

ALTER TABLE public."agendamentos_externos" ADD CONSTRAINT "agendamentos_externos_cota_id_fkey" FOREIGN KEY (cota_id) REFERENCES quotas_externas(id);

ALTER TABLE public."agendamentos_externos" ADD CONSTRAINT "agendamentos_externos_profissional_externo_id_fkey" FOREIGN KEY (profissional_externo_id) REFERENCES profissionais_externos(id);

ALTER TABLE public."agendamentos_externos" ADD CONSTRAINT "agendamentos_externos_profissional_interno_id_fkey" FOREIGN KEY (profissional_interno_id) REFERENCES funcionarios(id);

ALTER TABLE public."google_calendar_tokens" ADD CONSTRAINT "google_calendar_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."paciente_profissional_status" ADD CONSTRAINT "fk_pps_paciente" FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE public."paciente_profissional_status" ADD CONSTRAINT "fk_pps_profissional" FOREIGN KEY (profissional_id) REFERENCES funcionarios(id) ON DELETE CASCADE;

ALTER TABLE public."pacientes" ADD CONSTRAINT "pacientes_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public."patient_discharges" ADD CONSTRAINT "patient_discharges_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES treatment_cycles(id) ON DELETE CASCADE;

ALTER TABLE public."patient_documents" ADD CONSTRAINT "patient_documents_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id);

ALTER TABLE public."patient_documents" ADD CONSTRAINT "patient_documents_paciente_id_fkey" FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE public."patient_documents" ADD CONSTRAINT "patient_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

ALTER TABLE public."patient_evaluations" ADD CONSTRAINT "patient_evaluations_regulation_id_fkey" FOREIGN KEY (regulation_id) REFERENCES patient_regulation(id);

ALTER TABLE public."patient_procedures" ADD CONSTRAINT "patient_procedures_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE public."patient_profession_careness" ADD CONSTRAINT "patient_profession_careness_discharge_id_fkey" FOREIGN KEY (discharge_id) REFERENCES patient_discharges(id) ON DELETE SET NULL;

ALTER TABLE public."patient_profession_careness" ADD CONSTRAINT "patient_profession_careness_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE public."patient_referrals" ADD CONSTRAINT "patient_referrals_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES pacientes(id) ON DELETE CASCADE;

ALTER TABLE public."patient_referrals" ADD CONSTRAINT "patient_referrals_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES auth.users(id);

ALTER TABLE public."procedimento_profissionais" ADD CONSTRAINT "procedimento_profissionais_procedimento_codigo_fkey" FOREIGN KEY (procedimento_codigo) REFERENCES sigtap_procedimentos(codigo) ON DELETE CASCADE;

ALTER TABLE public."prontuario_procedimentos" ADD CONSTRAINT "prontuario_procedimentos_prontuario_id_fkey" FOREIGN KEY (prontuario_id) REFERENCES prontuarios(id) ON DELETE CASCADE;

ALTER TABLE public."prontuarios" ADD CONSTRAINT "prontuarios_pts_meta_id_fkey" FOREIGN KEY (pts_meta_id) REFERENCES pts_metas(id) ON DELETE SET NULL;

ALTER TABLE public."pts_cid" ADD CONSTRAINT "pts_cid_pts_id_fkey" FOREIGN KEY (pts_id) REFERENCES pts(id) ON DELETE CASCADE;

ALTER TABLE public."pts_metas" ADD CONSTRAINT "pts_metas_pts_id_fkey" FOREIGN KEY (pts_id) REFERENCES pts(id) ON DELETE CASCADE;

ALTER TABLE public."pts_sigtap" ADD CONSTRAINT "pts_sigtap_pts_id_fkey" FOREIGN KEY (pts_id) REFERENCES pts(id) ON DELETE CASCADE;

ALTER TABLE public."quotas_externas" ADD CONSTRAINT "quotas_externas_profissional_externo_id_fkey" FOREIGN KEY (profissional_externo_id) REFERENCES profissionais_externos(id) ON DELETE CASCADE;

ALTER TABLE public."referral_attachments" ADD CONSTRAINT "referral_attachments_referral_id_fkey" FOREIGN KEY (referral_id) REFERENCES patient_referrals(id) ON DELETE CASCADE;

ALTER TABLE public."salas" ADD CONSTRAINT "salas_unidade_id_fkey" FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE;

ALTER TABLE public."sigtap_procedimento_cids" ADD CONSTRAINT "sigtap_procedimento_cids_procedimento_codigo_fkey" FOREIGN KEY (procedimento_codigo) REFERENCES sigtap_procedimentos(codigo) ON DELETE CASCADE;

ALTER TABLE public."system_cleanup_logs" ADD CONSTRAINT "system_cleanup_logs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public."system_monitoring_alerts" ADD CONSTRAINT "system_monitoring_alerts_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

ALTER TABLE public."system_monitoring_snapshots" ADD CONSTRAINT "system_monitoring_snapshots_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public."treatment_cycles" ADD CONSTRAINT "treatment_cycles_pts_id_fkey" FOREIGN KEY (pts_id) REFERENCES pts(id) ON DELETE SET NULL;

ALTER TABLE public."treatment_extensions" ADD CONSTRAINT "treatment_extensions_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES treatment_cycles(id) ON DELETE CASCADE;

ALTER TABLE public."treatment_sessions" ADD CONSTRAINT "treatment_sessions_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES treatment_cycles(id) ON DELETE CASCADE;

ALTER TABLE public."whatsapp_event_config" ADD CONSTRAINT "whatsapp_event_config_template_id_fkey" FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL;

ALTER TABLE public."whatsapp_queue" ADD CONSTRAINT "whatsapp_queue_template_id_fkey" FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_action_logs_acao ON public.action_logs USING btree (acao);

CREATE INDEX idx_action_logs_acao_legivel ON public.action_logs USING gin (acao_legivel gin_trgm_ops);

CREATE INDEX idx_action_logs_created ON public.action_logs USING btree (created_at DESC);

CREATE INDEX idx_action_logs_created_at ON public.action_logs USING btree (created_at DESC);

CREATE INDEX idx_action_logs_entidade_id ON public.action_logs USING btree (entidade_id);

CREATE INDEX idx_action_logs_modulo ON public.action_logs USING btree (modulo);

CREATE INDEX idx_action_logs_paciente_id ON public.action_logs USING btree (paciente_id);

CREATE INDEX idx_action_logs_paciente_nome ON public.action_logs USING gin (paciente_nome gin_trgm_ops);

CREATE INDEX idx_action_logs_profissional_id ON public.action_logs USING btree (profissional_id);

CREATE INDEX idx_action_logs_profissional_nome ON public.action_logs USING gin (profissional_nome gin_trgm_ops);

CREATE INDEX idx_action_logs_status ON public.action_logs USING btree (status);

CREATE INDEX idx_action_logs_unidade_id ON public.action_logs USING btree (unidade_id);

CREATE INDEX idx_action_logs_user ON public.action_logs USING btree (user_id);

CREATE INDEX idx_action_logs_user_id ON public.action_logs USING btree (user_id);

CREATE INDEX idx_action_logs_user_nome ON public.action_logs USING gin (user_nome gin_trgm_ops);

CREATE INDEX idx_agendamentos_data ON public.agendamentos USING btree (data);

CREATE INDEX idx_agendamentos_data_prof_status ON public.agendamentos USING btree (data, profissional_id, status);

CREATE INDEX idx_agendamentos_data_profissional ON public.agendamentos USING btree (data, profissional_id);

CREATE INDEX idx_agendamentos_data_status ON public.agendamentos USING btree (data, status);

CREATE INDEX idx_agendamentos_data_status_unidade ON public.agendamentos USING btree (data, status, unidade_id);

CREATE INDEX idx_agendamentos_data_unidade ON public.agendamentos USING btree (data, unidade_id);

CREATE INDEX idx_agendamentos_em_atendimento_iniciado ON public.agendamentos USING btree (iniciado_em) WHERE (status = 'em_atendimento'::text);

CREATE INDEX idx_agendamentos_paciente ON public.agendamentos USING btree (paciente_id);

CREATE INDEX idx_agendamentos_paciente_data ON public.agendamentos USING btree (paciente_id, data);

CREATE INDEX idx_agendamentos_paciente_falta ON public.agendamentos USING btree (paciente_id) WHERE (status = 'falta'::text);

CREATE INDEX idx_agendamentos_prof_data ON public.agendamentos USING btree (profissional_id, data);

CREATE INDEX idx_agendamentos_profissional_id ON public.agendamentos USING btree (profissional_id);

CREATE INDEX idx_agendamentos_profissional_unidade_data ON public.agendamentos USING btree (profissional_id, unidade_id, data, status);

CREATE INDEX idx_agendamentos_status ON public.agendamentos USING btree (status);

CREATE INDEX idx_agendamentos_unidade_data ON public.agendamentos USING btree (unidade_id, data);

CREATE INDEX idx_agendamentos_unidade_data_desc ON public.agendamentos USING btree (unidade_id, data DESC);

CREATE INDEX idx_agendamentos_unidade_paciente ON public.agendamentos USING btree (unidade_id, paciente_id);

CREATE UNIQUE INDEX idx_agendamentos_unique_slot ON public.agendamentos USING btree (paciente_id, profissional_id, data, hora) WHERE (status <> ALL (ARRAY['cancelado'::text, 'falta'::text]));

CREATE INDEX idx_atendimentos_data ON public.atendimentos USING btree (data);

CREATE INDEX idx_atendimentos_data_status ON public.atendimentos USING btree (data, status);

CREATE INDEX idx_atendimentos_paciente ON public.atendimentos USING btree (paciente_id);

CREATE INDEX idx_atendimentos_profissional ON public.atendimentos USING btree (profissional_id);

CREATE INDEX idx_atendimentos_profissional_id ON public.atendimentos USING btree (profissional_id);

CREATE INDEX idx_bloqueios_datas ON public.bloqueios USING btree (data_inicio, data_fim);

CREATE INDEX idx_bloqueios_dates ON public.bloqueios USING btree (data_inicio, data_fim);

CREATE INDEX idx_bloqueios_profissional ON public.bloqueios USING btree (profissional_id, data_inicio, data_fim) WHERE ((profissional_id IS NOT NULL) AND (profissional_id <> ''::text));

CREATE INDEX idx_cbo_codigos_codigo ON public.cbo_codigos USING btree (codigo);

CREATE INDEX idx_cbo_codigos_descricao ON public.cbo_codigos USING gin (to_tsvector('portuguese'::regconfig, descricao));

CREATE UNIQUE INDEX idx_cid10_codigo_esp ON public.cid10_codigos USING btree (codigo, especialidade);

CREATE INDEX idx_cid10_codigo_trgm ON public.cid10_codigos USING gin (codigo gin_trgm_ops);

CREATE INDEX idx_cid10_descricao_trgm ON public.cid10_codigos USING gin (descricao gin_trgm_ops);

CREATE INDEX idx_cid10_especialidade ON public.cid10_codigos USING btree (especialidade);

CREATE INDEX idx_disponibilidades_prof_unidade ON public.disponibilidades USING btree (profissional_id, unidade_id, data_inicio, data_fim);

CREATE INDEX idx_disponibilidades_profissional ON public.disponibilidades USING btree (profissional_id, unidade_id);

CREATE INDEX idx_disponibilidades_profissional_id ON public.disponibilidades USING btree (profissional_id);

CREATE INDEX idx_document_templates_criado_por ON public.document_templates USING btree (criado_por);

CREATE INDEX idx_document_templates_tipo_modelo ON public.document_templates USING btree (tipo_modelo);

CREATE INDEX idx_document_templates_unidade ON public.document_templates USING btree (unidade_id);

CREATE INDEX idx_exam_types_categoria ON public.exam_types USING btree (categoria);

CREATE INDEX idx_exam_types_global ON public.exam_types USING btree (is_global, ativo);

CREATE INDEX idx_fila_espera_criado_em ON public.fila_espera USING btree (criado_em);

CREATE INDEX idx_fila_espera_paciente ON public.fila_espera USING btree (paciente_id);

CREATE INDEX idx_fila_espera_status ON public.fila_espera USING btree (status);

CREATE INDEX idx_fila_espera_status_criado ON public.fila_espera USING btree (status, criado_em);

CREATE INDEX idx_fila_espera_status_unidade_prof ON public.fila_espera USING btree (status, unidade_id, profissional_id);

CREATE INDEX idx_fila_espera_unidade ON public.fila_espera USING btree (unidade_id);

CREATE INDEX idx_fila_espera_unidade_criado ON public.fila_espera USING btree (unidade_id, criado_em);

CREATE INDEX idx_fila_espera_unidade_criado_ativos ON public.fila_espera USING btree (unidade_id, criado_em) WHERE (status <> ALL (ARRAY['atendido'::text, 'cancelado'::text, 'removido'::text]));

CREATE INDEX idx_fila_espera_unidade_status ON public.fila_espera USING btree (unidade_id, status);

CREATE INDEX idx_fila_unidade_status_criado ON public.fila_espera USING btree (unidade_id, status, criado_em DESC);

CREATE INDEX form_templates_prof_idx ON public.form_templates USING btree (profissional_id);

CREATE INDEX form_templates_slug_idx ON public.form_templates USING btree (form_slug);

CREATE UNIQUE INDEX form_templates_slug_prof_unid_uidx ON public.form_templates USING btree (form_slug, profissional_id, unidade_id);

CREATE INDEX form_templates_unid_idx ON public.form_templates USING btree (unidade_id);

CREATE INDEX idx_funcionarios_auth_ativo ON public.funcionarios USING btree (auth_user_id) WHERE (ativo = true);

CREATE INDEX idx_funcionarios_auth_ativo_role ON public.funcionarios USING btree (auth_user_id, role) WHERE (ativo = true);

CREATE INDEX idx_funcionarios_auth_user ON public.funcionarios USING btree (auth_user_id);

CREATE INDEX idx_funcionarios_auth_user_ativo ON public.funcionarios USING btree (auth_user_id) WHERE (ativo = true);

CREATE INDEX idx_funcionarios_unidade ON public.funcionarios USING btree (unidade_id);

CREATE INDEX idx_integracoes_log_created ON public.integracoes_log USING btree (created_at DESC);

CREATE INDEX idx_integracoes_log_sistema ON public.integracoes_log USING btree (sistema_id);

CREATE INDEX idx_logradouros_dne_descricao ON public.logradouros_dne USING btree (descricao);

CREATE INDEX idx_medications_ativo ON public.medications USING btree (ativo);

CREATE INDEX idx_medications_busca_trgm ON public.medications USING gin ((((((((COALESCE(nome, ''::text) || ' '::text) || COALESCE(nome_comercial, ''::text)) || ' '::text) || COALESCE(principio_ativo, ''::text)) || ' '::text) || COALESCE(classe_terapeutica, ''::text))) gin_trgm_ops);

CREATE INDEX idx_medications_classe ON public.medications USING btree (classe_terapeutica);

CREATE UNIQUE INDEX idx_medications_codigo_rename ON public.medications USING btree (codigo_rename) WHERE ((codigo_rename IS NOT NULL) AND (codigo_rename <> ''::text));

CREATE INDEX idx_medications_origem ON public.medications USING btree (origem);

CREATE INDEX idx_medications_tipo ON public.medications USING btree (tipo);

CREATE INDEX idx_multi_evaluations_patient_id ON public.multiprofessional_evaluations USING btree (patient_id);

CREATE INDEX idx_notification_logs_agendamento ON public.notification_logs USING btree (agendamento_id);

CREATE INDEX idx_notification_logs_created ON public.notification_logs USING btree (criado_em DESC);

CREATE INDEX idx_notification_logs_telefone_criado ON public.notification_logs USING btree (destinatario_telefone, criado_em DESC) WHERE ((destinatario_telefone IS NOT NULL) AND (destinatario_telefone <> ''::text));

CREATE INDEX idx_nursing_evaluations_patient_id ON public.nursing_evaluations USING btree (patient_id);

CREATE INDEX idx_pps_status ON public.paciente_profissional_status USING btree (status_falta);

CREATE INDEX idx_pacientes_auth_user ON public.pacientes USING btree (auth_user_id);

CREATE INDEX idx_pacientes_cns ON public.pacientes USING btree (cns);

CREATE INDEX idx_pacientes_cns_trgm ON public.pacientes USING gin (cns gin_trgm_ops);

CREATE INDEX idx_pacientes_cpf_trgm ON public.pacientes USING gin (cpf gin_trgm_ops);

CREATE UNIQUE INDEX idx_pacientes_cpf_unique ON public.pacientes USING btree (cpf) WHERE ((cpf IS NOT NULL) AND (cpf <> ''::text));

CREATE INDEX idx_pacientes_criado_desc ON public.pacientes USING btree (criado_em DESC);

CREATE INDEX idx_pacientes_criado_em ON public.pacientes USING btree (criado_em);

CREATE INDEX idx_pacientes_email_lookup ON public.pacientes USING btree (email) WHERE ((email IS NOT NULL) AND (email <> ''::text));

CREATE INDEX idx_pacientes_excecao_bloqueio ON public.pacientes USING btree (id) WHERE ((is_tfd = true) OR (possui_ordem_judicial = true));

CREATE INDEX idx_pacientes_nome ON public.pacientes USING btree (nome);

CREATE INDEX idx_pacientes_nome_mae ON public.pacientes USING btree (nome_mae);

CREATE INDEX idx_pacientes_nome_trgm ON public.pacientes USING gin (nome gin_trgm_ops);

CREATE INDEX idx_pacientes_status_falta ON public.pacientes USING btree (status_falta);

CREATE INDEX idx_pacientes_telefone_lookup ON public.pacientes USING btree (telefone) WHERE ((telefone IS NOT NULL) AND (telefone <> ''::text));

CREATE INDEX idx_pacientes_unidade_criado ON public.pacientes USING btree (unidade_id, criado_em DESC);

CREATE INDEX idx_pacientes_unidade_criado_desc ON public.pacientes USING btree (unidade_id, criado_em DESC);

CREATE INDEX idx_pacientes_unidade_id ON public.pacientes USING btree (unidade_id);

CREATE INDEX idx_patient_documents_ativo ON public.patient_documents USING btree (ativo);

CREATE INDEX idx_patient_documents_created_at ON public.patient_documents USING btree (created_at);

CREATE INDEX idx_patient_documents_paciente_id ON public.patient_documents USING btree (paciente_id);

CREATE INDEX idx_patient_documents_unidade_id ON public.patient_documents USING btree (unidade_id);

CREATE INDEX idx_patient_evaluations_patient_id ON public.patient_evaluations USING btree (patient_id);

CREATE INDEX idx_patient_evaluations_regulation_id ON public.patient_evaluations USING btree (regulation_id);

CREATE INDEX patient_profession_careness_lookup_idx ON public.patient_profession_careness USING btree (patient_id, profession_key, release_date) WHERE ((released_at IS NULL) AND (annulled_at IS NULL));

CREATE INDEX idx_patient_regulation_patient_id ON public.patient_regulation USING btree (patient_id);

CREATE INDEX idx_patient_regulation_status ON public.patient_regulation USING btree (status);

CREATE INDEX idx_permissoes_perfil_unidade ON public.permissoes USING btree (perfil, unidade_id);

CREATE UNIQUE INDEX permissoes_perfil_modulo_unidade_uidx ON public.permissoes USING btree (perfil, modulo, unidade_id);

CREATE INDEX idx_permissoes_usuario_user_unidade ON public.permissoes_usuario USING btree (user_id, unidade_id);

CREATE INDEX permissoes_usuario_user_idx ON public.permissoes_usuario USING btree (user_id);

CREATE UNIQUE INDEX permissoes_usuario_user_modulo_unidade_uidx ON public.permissoes_usuario USING btree (user_id, modulo, unidade_id);

CREATE INDEX idx_procprof_codigo ON public.procedimento_profissionais USING btree (procedimento_codigo);

CREATE INDEX idx_procprof_profissional ON public.procedimento_profissionais USING btree (profissional_id);

CREATE INDEX idx_procedimentos_ativo ON public.procedimentos USING btree (ativo);

CREATE INDEX idx_procedimentos_codigo_sigtap ON public.procedimentos USING btree (codigo_sigtap) WHERE (codigo_sigtap <> ''::text);

CREATE INDEX idx_procedimentos_profissao ON public.procedimentos USING btree (profissao);

CREATE INDEX idx_prof_prefs_prof ON public.professional_preferences USING btree (profissional_id, tipo);

CREATE UNIQUE INDEX idx_prof_prefs_unique ON public.professional_preferences USING btree (profissional_id, tipo, item_id);

CREATE INDEX idx_prontuario_config_prof_tipo ON public.prontuario_config USING btree (profissional_id, tipo_prontuario);

CREATE INDEX idx_prontuario_exames_atendimento ON public.prontuario_exames USING btree (atendimento_id);

CREATE INDEX idx_prontuario_exames_paciente ON public.prontuario_exames USING btree (paciente_id);

CREATE INDEX idx_prontuario_exames_prontuario ON public.prontuario_exames USING btree (prontuario_id);

CREATE INDEX idx_prontuario_procedimentos_criado_em ON public.prontuario_procedimentos USING btree (criado_em);

CREATE INDEX idx_prontuario_procs_proc_id ON public.prontuario_procedimentos USING btree (procedimento_id);

CREATE INDEX idx_prontuario_procs_prontuario_id ON public.prontuario_procedimentos USING btree (prontuario_id);

CREATE INDEX idx_prontuarios_agendamento ON public.prontuarios USING btree (agendamento_id);

CREATE INDEX idx_prontuarios_criado_em ON public.prontuarios USING btree (criado_em);

CREATE INDEX idx_prontuarios_data ON public.prontuarios USING btree (data_atendimento);

CREATE INDEX idx_prontuarios_data_atendimento ON public.prontuarios USING btree (data_atendimento);

CREATE INDEX idx_prontuarios_data_desc ON public.prontuarios USING btree (data_atendimento DESC);

CREATE INDEX idx_prontuarios_paciente ON public.prontuarios USING btree (paciente_id);

CREATE INDEX idx_prontuarios_paciente_id ON public.prontuarios USING btree (paciente_id);

CREATE INDEX idx_prontuarios_paciente_nome_trgm ON public.prontuarios USING gin (paciente_nome gin_trgm_ops);

CREATE INDEX idx_prontuarios_profissional ON public.prontuarios USING btree (profissional_id);

CREATE INDEX idx_prontuarios_profissional_data ON public.prontuarios USING btree (profissional_id, data_atendimento);

CREATE INDEX idx_prontuarios_profissional_id ON public.prontuarios USING btree (profissional_id);

CREATE INDEX idx_prontuarios_profissional_nome_trgm ON public.prontuarios USING gin (profissional_nome gin_trgm_ops);

CREATE INDEX idx_prontuarios_status ON public.prontuarios USING btree (status);

CREATE INDEX idx_prontuarios_unidade ON public.prontuarios USING btree (unidade_id);

CREATE INDEX idx_prontuarios_unidade_data ON public.prontuarios USING btree (unidade_id, data_atendimento);

CREATE INDEX idx_prontuarios_unidade_data_criado ON public.prontuarios USING btree (unidade_id, data_atendimento DESC, criado_em DESC);

CREATE INDEX idx_prontuarios_unidade_data_desc ON public.prontuarios USING btree (unidade_id, data_atendimento DESC, criado_em DESC);

CREATE INDEX idx_prontuarios_unidade_id ON public.prontuarios USING btree (unidade_id);

CREATE INDEX idx_pts_patient_id ON public.pts USING btree (patient_id);

CREATE INDEX idx_pts_unit_id ON public.pts USING btree (unit_id);

CREATE INDEX idx_pts_cid_pts_id ON public.pts_cid USING btree (pts_id);

CREATE INDEX idx_pts_sigtap_pts_id ON public.pts_sigtap USING btree (pts_id);

CREATE UNIQUE INDEX idx_sigtap_proc_cid_unique ON public.sigtap_procedimento_cids USING btree (procedimento_codigo, cid_codigo);

CREATE INDEX idx_sigtap_proc_cids_cid ON public.sigtap_procedimento_cids USING btree (cid_codigo);

CREATE INDEX idx_sigtap_proc_cids_codigo ON public.sigtap_procedimento_cids USING btree (procedimento_codigo);

CREATE INDEX idx_sigtap_ativo_esp_nome ON public.sigtap_procedimentos USING btree (especialidade, nome) WHERE (ativo = true);

CREATE INDEX idx_sigtap_proc_codigo_trgm ON public.sigtap_procedimentos USING gin (codigo gin_trgm_ops);

CREATE INDEX idx_sigtap_proc_especialidade ON public.sigtap_procedimentos USING btree (especialidade);

CREATE INDEX idx_sigtap_proc_nome_trgm ON public.sigtap_procedimentos USING gin (nome gin_trgm_ops);

CREATE INDEX idx_sigtap_proc_origem ON public.sigtap_procedimentos USING btree (origem);

CREATE INDEX idx_sistemas_integrados_identificador ON public.sistemas_integrados USING btree (identificador);

CREATE INDEX idx_sistemas_integrados_unidade ON public.sistemas_integrados USING btree (unidade_id);

CREATE INDEX idx_soap_custom_options_prof ON public.soap_custom_options USING btree (profissional_id, campo);

CREATE INDEX idx_treatment_cycles_created_at_desc ON public.treatment_cycles USING btree (created_at DESC);

CREATE INDEX idx_treatment_cycles_patient_id ON public.treatment_cycles USING btree (patient_id);

CREATE INDEX idx_treatment_cycles_professional_id ON public.treatment_cycles USING btree (professional_id);

CREATE INDEX idx_treatment_cycles_pts_id ON public.treatment_cycles USING btree (pts_id);

CREATE INDEX idx_treatment_cycles_status ON public.treatment_cycles USING btree (status);

CREATE INDEX idx_treatment_cycles_unit_id ON public.treatment_cycles USING btree (unit_id);

CREATE INDEX idx_treatment_extensions_cycle_id ON public.treatment_extensions USING btree (cycle_id);

CREATE INDEX idx_treatment_sessions_created_desc ON public.treatment_sessions USING btree (created_at DESC);

CREATE INDEX idx_treatment_sessions_cycle ON public.treatment_sessions USING btree (cycle_id);

CREATE INDEX idx_treatment_sessions_cycle_id ON public.treatment_sessions USING btree (cycle_id);

CREATE INDEX idx_treatment_sessions_date ON public.treatment_sessions USING btree (scheduled_date);

CREATE INDEX idx_treatment_sessions_patient ON public.treatment_sessions USING btree (patient_id);

CREATE INDEX idx_treatment_sessions_patient_id ON public.treatment_sessions USING btree (patient_id);

CREATE INDEX idx_treatment_sessions_professional_id ON public.treatment_sessions USING btree (professional_id);

CREATE INDEX idx_treatment_sessions_scheduled_date ON public.treatment_sessions USING btree (scheduled_date);

CREATE INDEX idx_treatment_sessions_status ON public.treatment_sessions USING btree (status);

CREATE UNIQUE INDEX idx_triage_records_agendamento_unique ON public.triage_records USING btree (agendamento_id);

CREATE INDEX idx_triage_records_criado_desc ON public.triage_records USING btree (criado_em DESC);

CREATE UNIQUE INDEX idx_wcs_instance ON public.whatsapp_connection_status USING btree (instance_name);

CREATE INDEX idx_whatsapp_consents_paciente_tipo ON public.whatsapp_consents USING btree (paciente_id, tipo, criado_em DESC);

CREATE INDEX idx_whatsapp_consents_telefone ON public.whatsapp_consents USING btree (telefone, tipo, criado_em DESC);

CREATE INDEX idx_whatsapp_conv_paciente ON public.whatsapp_conversations USING btree (paciente_id);

CREATE UNIQUE INDEX uniq_wa_health_day ON public.whatsapp_health_snapshots USING btree (snapshot_date, provider, unidade_id);

CREATE INDEX idx_wa_inbound_pending ON public.whatsapp_inbound_messages USING btree (processed, recebido_em) WHERE (processed = false);

CREATE INDEX idx_wa_inbound_phone ON public.whatsapp_inbound_messages USING btree (phone, recebido_em DESC);

CREATE INDEX idx_whatsapp_queue_paciente ON public.whatsapp_queue USING btree (paciente_id, criado_em DESC);

CREATE INDEX idx_whatsapp_queue_priority ON public.whatsapp_queue USING btree (priority DESC, agendado_para) WHERE (status = 'pendente'::text);

CREATE INDEX idx_whatsapp_queue_provider_msg ON public.whatsapp_queue USING btree (provider_message_id) WHERE (provider_message_id <> ''::text);

CREATE INDEX idx_whatsapp_queue_status_agendado ON public.whatsapp_queue USING btree (status, agendado_para) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text]));

CREATE INDEX idx_whatsapp_queue_telefone ON public.whatsapp_queue USING btree (telefone, criado_em DESC);

CREATE UNIQUE INDEX uniq_whatsapp_queue_dedup ON public.whatsapp_queue USING btree (paciente_id, agendamento_id, evento) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'entregue'::text, 'lido'::text]));

CREATE VIEW public."clinica_config_safe" WITH (security_invoker=on) AS  SELECT id,
    nome_clinica,
    logo_url,
    telefone,
    evolution_base_url,
    evolution_instance_name,
    created_at,
    updated_at
   FROM clinica_config;

GRANT DELETE ON public."clinica_config_safe" TO "anon";

GRANT INSERT ON public."clinica_config_safe" TO "anon";

GRANT MAINTAIN ON public."clinica_config_safe" TO "anon";

GRANT REFERENCES ON public."clinica_config_safe" TO "anon";

GRANT SELECT ON public."clinica_config_safe" TO "anon";

GRANT UPDATE ON public."clinica_config_safe" TO "anon";

GRANT DELETE ON public."clinica_config_safe" TO "authenticated";

GRANT INSERT ON public."clinica_config_safe" TO "authenticated";

GRANT MAINTAIN ON public."clinica_config_safe" TO "authenticated";

GRANT REFERENCES ON public."clinica_config_safe" TO "authenticated";

GRANT SELECT ON public."clinica_config_safe" TO "authenticated";

GRANT UPDATE ON public."clinica_config_safe" TO "authenticated";

GRANT DELETE ON public."clinica_config_safe" TO "service_role";

GRANT INSERT ON public."clinica_config_safe" TO "service_role";

GRANT MAINTAIN ON public."clinica_config_safe" TO "service_role";

GRANT REFERENCES ON public."clinica_config_safe" TO "service_role";

GRANT SELECT ON public."clinica_config_safe" TO "service_role";

GRANT TRIGGER ON public."clinica_config_safe" TO "service_role";

GRANT TRUNCATE ON public."clinica_config_safe" TO "service_role";

GRANT UPDATE ON public."clinica_config_safe" TO "service_role";

CREATE POLICY "Master read action logs" ON "public"."action_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_staff_role('master'::text) OR has_staff_role('coordenador'::text) OR has_staff_role('gestao'::text)));

CREATE POLICY "Staff insert action logs" ON "public"."action_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "External bookings use atomic RPC for insert" ON "public"."agendamentos" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM profissionais_externos e
  WHERE (e.auth_user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "External bookings use atomic RPC for update" ON "public"."agendamentos" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM profissionais_externos e
  WHERE (e.auth_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM profissionais_externos e
  WHERE (e.auth_user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "External read own agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT is_external_professional() AS is_external_professional) AND (criado_por IN ( SELECT (profissionais_externos.id)::text AS id
   FROM profissionais_externos
  WHERE (profissionais_externos.auth_user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Pacientes cancel own agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((paciente_id IN ( SELECT pacientes.id
   FROM pacientes
  WHERE (pacientes.auth_user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((paciente_id IN ( SELECT pacientes.id
   FROM pacientes
  WHERE (pacientes.auth_user_id = ( SELECT auth.uid() AS uid)))) AND (status = 'cancelado'::text)));

CREATE POLICY "Pacientes read own agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((paciente_id IN ( SELECT pacientes.id
   FROM pacientes
  WHERE (pacientes.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Staff delete agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update agendamentos" ON "public"."agendamentos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Admins podem ver agendamentos externos" ON "public"."agendamentos_externos" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND ((funcionarios.role = 'master'::text) OR (funcionarios.role = 'admin'::text))))));

CREATE POLICY "Externos podem ver seus próprios agendamentos" ON "public"."agendamentos_externos" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) IN ( SELECT profissionais_externos.auth_user_id
   FROM profissionais_externos
  WHERE (profissionais_externos.id = agendamentos_externos.profissional_externo_id))));

CREATE POLICY "Staff delete atendimentos" ON "public"."atendimentos" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert atendimentos" ON "public"."atendimentos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read atendimentos" ON "public"."atendimentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update atendimentos" ON "public"."atendimentos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Auth users read bloqueios" ON "public"."bloqueios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "External read bloqueios" ON "public"."bloqueios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "Staff manage bloqueios" ON "public"."bloqueios" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage cbo_codigos" ON "public"."cbo_codigos" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read cbo_codigos" ON "public"."cbo_codigos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage cid10_codigos" ON "public"."cid10_codigos" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read cid10_codigos" ON "public"."cid10_codigos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage clinica_config" ON "public"."clinica_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Only master read clinica_config" ON "public"."clinica_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (has_staff_role('master'::text));

CREATE POLICY "Authenticated read disponibilidades" ON "public"."disponibilidades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "External read disponibilidades" ON "public"."disponibilidades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "Staff delete disponibilidades" ON "public"."disponibilidades" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert disponibilidades" ON "public"."disponibilidades" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update disponibilidades" ON "public"."disponibilidades" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage document_templates" ON "public"."document_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((has_staff_role('master'::text) AND ((unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true))))))) WITH CHECK ((has_staff_role('master'::text) AND ((unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true)))))));

CREATE POLICY "Professional manage own document_templates" ON "public"."document_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT is_staff_member() AS is_staff_member) AND (criado_por IN ( SELECT (f.id)::text AS id
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true)))))) WITH CHECK ((( SELECT is_staff_member() AS is_staff_member) AND (criado_por IN ( SELECT (f.id)::text AS id
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true))))));

CREATE POLICY "Staff read document_templates" ON "public"."document_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((( SELECT is_staff_member() AS is_staff_member) AND ((tipo_modelo = 'GLOBAL'::text) OR (unidade_id = ''::text) OR (unidade_id IN ( SELECT COALESCE(f.unidade_id, ''::text) AS "coalesce"
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true)))) OR (criado_por IN ( SELECT (f.id)::text AS id
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true)))))));

CREATE POLICY "Staff insert documentos_gerados" ON "public"."documentos_gerados" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read documentos_gerados" ON "public"."documentos_gerados" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update documentos_gerados" ON "public"."documentos_gerados" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage episodios" ON "public"."episodios_clinicos" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read episodios" ON "public"."episodios_clinicos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage especialidades" ON "public"."especialidades" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read especialidades" ON "public"."especialidades" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert exam_types" ON "public"."exam_types" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read exam_types" ON "public"."exam_types" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update exam_types" ON "public"."exam_types" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Pacientes read own fila" ON "public"."fila_espera" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((paciente_id IN ( SELECT pacientes.id
   FROM pacientes
  WHERE (pacientes.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Staff delete fila" ON "public"."fila_espera" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert fila" ON "public"."fila_espera" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read fila" ON "public"."fila_espera" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update fila" ON "public"."fila_espera" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage form_templates" ON "public"."form_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Professional manage own form_templates" ON "public"."form_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING ((( SELECT is_staff_member() AS is_staff_member) AND (profissional_id <> ''::text) AND (profissional_id IN ( SELECT (f.id)::text AS id
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true)))))) WITH CHECK ((( SELECT is_staff_member() AS is_staff_member) AND (profissional_id <> ''::text) AND (profissional_id IN ( SELECT (f.id)::text AS id
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo = true))))));

CREATE POLICY "Staff read form_templates" ON "public"."form_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "External read funcionarios" ON "public"."funcionarios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "Staff read funcionarios" ON "public"."funcionarios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Users manage own tokens" ON "public"."google_calendar_tokens" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Users read own tokens" ON "public"."google_calendar_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Master manage horarios" ON "public"."horarios_funcionamento" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read horarios" ON "public"."horarios_funcionamento" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master read integracoes_log" ON "public"."integracoes_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_staff_role('master'::text) OR has_staff_role('coordenador'::text) OR has_staff_role('gestao'::text)));

CREATE POLICY "Staff insert integracoes_log" ON "public"."integracoes_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Anyone can read logradouros_dne" ON "public"."logradouros_dne" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Master manage logradouros_dne" ON "public"."logradouros_dne" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Master manage medications" ON "public"."medications" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff insert medications" ON "public"."medications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read medications" ON "public"."medications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage multiprofessional_evaluations" ON "public"."multiprofessional_evaluations" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read multiprofessional_evaluations" ON "public"."multiprofessional_evaluations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Admin read notification_logs" ON "public"."notification_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((has_staff_role('master'::text) OR has_staff_role('coordenador'::text) OR has_staff_role('gestao'::text)));

CREATE POLICY "Staff insert notification_logs" ON "public"."notification_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage nursing_evaluations" ON "public"."nursing_evaluations" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read nursing_evaluations" ON "public"."nursing_evaluations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Enable read access for authenticated users" ON "public"."paciente_profissional_status" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "External insert pacientes" ON "public"."pacientes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "External read pacientes" ON "public"."pacientes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "External update pacientes" ON "public"."pacientes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_external_professional() AS is_external_professional)) WITH CHECK (( SELECT is_external_professional() AS is_external_professional));

CREATE POLICY "Pacientes read own data" ON "public"."pacientes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Staff delete pacientes" ON "public"."pacientes" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert pacientes" ON "public"."pacientes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read pacientes" ON "public"."pacientes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update pacientes" ON "public"."pacientes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage patient_discharges" ON "public"."patient_discharges" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read patient_discharges" ON "public"."patient_discharges" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Users can insert patient documents" ON "public"."patient_documents" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY "Users can update their own unit patient documents" ON "public"."patient_documents" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (true);

CREATE POLICY "Users can view patient documents of their unit" ON "public"."patient_documents" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((ativo = true) AND (((auth.jwt() ->> 'role'::text) = 'master'::text) OR (EXISTS ( SELECT 1
   FROM pacientes p
  WHERE ((p.id = patient_documents.paciente_id) AND ((p.unidade_id = ( SELECT funcionarios.unidade_id
           FROM funcionarios
          WHERE (funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)))) OR (p.unidade_id IS NULL))))))));

CREATE POLICY "Staff manage patient_evaluations" ON "public"."patient_evaluations" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read patient_evaluations" ON "public"."patient_evaluations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Users can delete patient procedures" ON "public"."patient_procedures" AS PERMISSIVE FOR DELETE TO PUBLIC USING (true);

CREATE POLICY "Users can insert patient procedures" ON "public"."patient_procedures" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY "Users can update patient procedures" ON "public"."patient_procedures" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (true);

CREATE POLICY "Users can view all patient procedures" ON "public"."patient_procedures" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Master reads patient profession carence" ON "public"."patient_profession_careness" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo IS TRUE) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Referrals are viewable by authenticated users" ON "public"."patient_referrals" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Referrals can be deleted by authenticated users" ON "public"."patient_referrals" AS PERMISSIVE FOR DELETE TO PUBLIC USING (true);

CREATE POLICY "Referrals can be inserted by authenticated users" ON "public"."patient_referrals" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY "Referrals can be updated by authenticated users" ON "public"."patient_referrals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (true);

CREATE POLICY "Staff manage patient_regulation" ON "public"."patient_regulation" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read patient_regulation" ON "public"."patient_regulation" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Auth users read permissoes" ON "public"."permissoes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manages permissoes" ON "public"."permissoes" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Master manage permissoes_usuario" ON "public"."permissoes_usuario" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read permissoes_usuario" ON "public"."permissoes_usuario" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage procedimento_profissionais" ON "public"."procedimento_profissionais" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read procedimento_profissionais" ON "public"."procedimento_profissionais" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Anyone can read procedimentos" ON "public"."procedimentos" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Staff manage procedimentos" ON "public"."procedimentos" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Enable all for authenticated users" ON "public"."procedimentos_realizados" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Master manages profession carence rules" ON "public"."profession_careness_rules" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo IS TRUE) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.auth_user_id = ( SELECT auth.uid() AS uid)) AND (f.ativo IS TRUE) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Staff manage own preferences" ON "public"."professional_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read own preferences" ON "public"."professional_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage own carimbo" ON "public"."profissionais_carimbo" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read carimbos" ON "public"."profissionais_carimbo" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "External read own record" ON "public"."profissionais_externos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Staff manage profissionais_externos" ON "public"."profissionais_externos" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "profissional_delete_own_config" ON "public"."prontuario_config" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND (funcionarios.ativo = true)))));

CREATE POLICY "profissional_insert_own_config" ON "public"."prontuario_config" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND (funcionarios.ativo = true)))));

CREATE POLICY "profissional_read_own_config" ON "public"."prontuario_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND (funcionarios.ativo = true)))) OR has_staff_role('master'::text)));

CREATE POLICY "profissional_update_own_config" ON "public"."prontuario_config" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND (funcionarios.ativo = true))))) WITH CHECK ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND (funcionarios.ativo = true)))));

CREATE POLICY "Staff delete prontuario_exames" ON "public"."prontuario_exames" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert prontuario_exames" ON "public"."prontuario_exames" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read prontuario_exames" ON "public"."prontuario_exames" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update prontuario_exames" ON "public"."prontuario_exames" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Patients can view own prontuario procedures" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.paciente_id IN ( SELECT pac.id
           FROM pacientes pac
          WHERE (pac.auth_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Profissionais can delete procedures from own prontuarios" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id IN ( SELECT (f.id)::text AS id
           FROM funcionarios f
          WHERE (f.auth_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Profissionais can insert procedures to own prontuarios" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id IN ( SELECT (f.id)::text AS id
           FROM funcionarios f
          WHERE (f.auth_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Profissionais can update procedures of own prontuarios" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id IN ( SELECT (f.id)::text AS id
           FROM funcionarios f
          WHERE (f.auth_user_id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM prontuarios p
  WHERE ((p.id = prontuario_procedimentos.prontuario_id) AND (p.profissional_id IN ( SELECT (f.id)::text AS id
           FROM funcionarios f
          WHERE (f.auth_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Staff manage prontuario_procedimentos" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read prontuario_procedimentos" ON "public"."prontuario_procedimentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Pacientes read own prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((paciente_id IN ( SELECT pacientes.id
   FROM pacientes
  WHERE (pacientes.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Profissionais manage own prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR ALL TO "authenticated" USING ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE (funcionarios.auth_user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((profissional_id IN ( SELECT (funcionarios.id)::text AS id
   FROM funcionarios
  WHERE (funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Staff delete prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update prontuarios" ON "public"."prontuarios" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage pts" ON "public"."pts" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read pts" ON "public"."pts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage pts_cid" ON "public"."pts_cid" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read pts_cid" ON "public"."pts_cid" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert pts_import_log" ON "public"."pts_import_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read pts_import_log" ON "public"."pts_import_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Users can manage metas for accessible PTS" ON "public"."pts_metas" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM pts
  WHERE (pts.id = pts_metas.pts_id))));

CREATE POLICY "Users can manage metas for their PTS" ON "public"."pts_metas" AS PERMISSIVE FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Users can view metas for accessible PTS" ON "public"."pts_metas" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Staff manage pts_sigtap" ON "public"."pts_sigtap" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read pts_sigtap" ON "public"."pts_sigtap" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "External quotas use atomic RPC for update" ON "public"."quotas_externas" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM profissionais_externos e
  WHERE (e.auth_user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM profissionais_externos e
  WHERE (e.auth_user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "External read own quotas" ON "public"."quotas_externas" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((profissional_externo_id IN ( SELECT profissionais_externos.id
   FROM profissionais_externos
  WHERE (profissionais_externos.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Staff manage quotas_externas" ON "public"."quotas_externas" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Referral attachments are viewable by authenticated users" ON "public"."referral_attachments" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Referral attachments can be deleted by authenticated users" ON "public"."referral_attachments" AS PERMISSIVE FOR DELETE TO PUBLIC USING (true);

CREATE POLICY "Referral attachments can be inserted by authenticated users" ON "public"."referral_attachments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY "Anyone can read salas" ON "public"."salas" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Staff manage salas" ON "public"."salas" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage sigtap_procedimento_cids" ON "public"."sigtap_procedimento_cids" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read sigtap_procedimento_cids" ON "public"."sigtap_procedimento_cids" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master delete custom procedimentos" ON "public"."sigtap_procedimentos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((has_staff_role('master'::text) AND (origem = 'PERSONALIZADO'::text)));

CREATE POLICY "Master or sync insert procedimentos" ON "public"."sigtap_procedimentos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND ( SELECT is_staff_member() AS is_staff_member))));

CREATE POLICY "Master or sync update procedimentos" ON "public"."sigtap_procedimentos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND ( SELECT is_staff_member() AS is_staff_member)))) WITH CHECK ((has_staff_role('master'::text) OR ((origem = 'SIGTAP'::text) AND ( SELECT is_staff_member() AS is_staff_member))));

CREATE POLICY "Staff read sigtap_procedimentos" ON "public"."sigtap_procedimentos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage sistemas_integrados" ON "public"."sistemas_integrados" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read sistemas_integrados" ON "public"."sistemas_integrados" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff delete own soap options" ON "public"."soap_custom_options" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert own soap options" ON "public"."soap_custom_options" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read own soap options" ON "public"."soap_custom_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update own soap options" ON "public"."soap_custom_options" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master can insert system_cleanup_logs" ON "public"."system_cleanup_logs" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can view system_cleanup_logs" ON "public"."system_cleanup_logs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master manages system config" ON "public"."system_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Owner only deletes license/saas" ON "public"."system_config" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (((id <> ALL (ARRAY['saas_clientes'::text, 'licenca'::text])) OR is_global_owner()));

CREATE POLICY "Owner only inserts license/saas" ON "public"."system_config" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (((id <> ALL (ARRAY['saas_clientes'::text, 'licenca'::text])) OR is_global_owner()));

CREATE POLICY "Owner only reads saas registry" ON "public"."system_config" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (((id <> 'saas_clientes'::text) OR is_global_owner()));

CREATE POLICY "Owner only updates license/saas" ON "public"."system_config" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (((id <> ALL (ARRAY['saas_clientes'::text, 'licenca'::text])) OR is_global_owner())) WITH CHECK (((id <> ALL (ARRAY['saas_clientes'::text, 'licenca'::text])) OR is_global_owner()));

CREATE POLICY "Staff read system config" ON "public"."system_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "master_upsert_system_config" ON "public"."system_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Master can update system_monitoring_alerts" ON "public"."system_monitoring_alerts" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can view system_monitoring_alerts" ON "public"."system_monitoring_alerts" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can manage system_monitoring_settings" ON "public"."system_monitoring_settings" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can view system_monitoring_settings" ON "public"."system_monitoring_settings" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can insert system_monitoring_snapshots" ON "public"."system_monitoring_snapshots" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Master can view system_monitoring_snapshots" ON "public"."system_monitoring_snapshots" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios f
  WHERE ((f.id = ( SELECT auth.uid() AS uid)) AND (lower(TRIM(BOTH FROM f.role)) = 'master'::text)))));

CREATE POLICY "Staff manage treatment_cycles" ON "public"."treatment_cycles" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read treatment_cycles" ON "public"."treatment_cycles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage treatment_extensions" ON "public"."treatment_extensions" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read treatment_extensions" ON "public"."treatment_extensions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage treatment_sessions" ON "public"."treatment_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read treatment_sessions" ON "public"."treatment_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert triage_records" ON "public"."triage_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read triage_records" ON "public"."triage_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update triage_records" ON "public"."triage_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage triage_settings" ON "public"."triage_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read triage_settings" ON "public"."triage_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Anyone can read unidades" ON "public"."unidades" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Staff manage unidades" ON "public"."unidades" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage whatsapp_config" ON "public"."whatsapp_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read whatsapp_config" ON "public"."whatsapp_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage whatsapp_connection_status" ON "public"."whatsapp_connection_status" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read whatsapp_connection_status" ON "public"."whatsapp_connection_status" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff insert whatsapp_consents" ON "public"."whatsapp_consents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read whatsapp_consents" ON "public"."whatsapp_consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage whatsapp_conversations" ON "public"."whatsapp_conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read whatsapp_conversations" ON "public"."whatsapp_conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage whatsapp_event_config" ON "public"."whatsapp_event_config" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read whatsapp_event_config" ON "public"."whatsapp_event_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Users can manage their own unit events" ON "public"."whatsapp_event_config" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM funcionarios
  WHERE ((funcionarios.auth_user_id = ( SELECT auth.uid() AS uid)) AND ((funcionarios.role = 'admin'::text) OR (funcionarios.unidade_id = whatsapp_event_config.unidade_id))))));

CREATE POLICY "Master manage whatsapp_health" ON "public"."whatsapp_health_snapshots" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read whatsapp_health" ON "public"."whatsapp_health_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff manage whatsapp_inbound" ON "public"."whatsapp_inbound_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read whatsapp_inbound" ON "public"."whatsapp_inbound_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master delete whatsapp_queue" ON "public"."whatsapp_queue" AS PERMISSIVE FOR DELETE TO "authenticated" USING (has_staff_role('master'::text));

CREATE POLICY "Staff insert whatsapp_queue" ON "public"."whatsapp_queue" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff read whatsapp_queue" ON "public"."whatsapp_queue" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Staff update whatsapp_queue" ON "public"."whatsapp_queue" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "Master manage whatsapp_templates" ON "public"."whatsapp_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (has_staff_role('master'::text)) WITH CHECK (has_staff_role('master'::text));

CREATE POLICY "Staff read whatsapp_templates" ON "public"."whatsapp_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_staff_member() AS is_staff_member));

CREATE POLICY "tenant_unit_scope_agendamentos_v1" ON "public"."agendamentos" AS RESTRICTIVE FOR ALL TO "authenticated" USING ((
      public.is_global_owner()
      OR EXISTS (SELECT 1 FROM public.funcionarios f
        WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE
        AND f.unidade_id=agendamentos.unidade_id)
      OR EXISTS (SELECT 1 FROM public.pacientes p
        WHERE p.auth_user_id=auth.uid() AND p.id=agendamentos.paciente_id)
      OR EXISTS (SELECT 1 FROM public.profissionais_externos e
        WHERE e.auth_user_id=auth.uid() AND e.ativo IS TRUE
        AND e.id::text=agendamentos.criado_por)
    )) WITH CHECK ((
      public.is_global_owner()
      OR EXISTS (SELECT 1 FROM public.funcionarios f
        WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE
        AND f.unidade_id=agendamentos.unidade_id)
      OR EXISTS (SELECT 1 FROM public.pacientes p
        WHERE p.auth_user_id=auth.uid() AND p.id=agendamentos.paciente_id)
      OR EXISTS (SELECT 1 FROM public.profissionais_externos e
        WHERE e.auth_user_id=auth.uid() AND e.ativo IS TRUE
        AND e.id::text=agendamentos.criado_por)
    ));

CREATE TRIGGER trg_action_logs_immutable BEFORE DELETE OR UPDATE ON action_logs FOR EACH ROW EXECUTE FUNCTION prevent_action_logs_mutation();

CREATE TRIGGER trg_action_logs_no_truncate BEFORE TRUNCATE ON action_logs FOR EACH STATEMENT EXECUTE FUNCTION prevent_action_logs_mutation();

CREATE TRIGGER trg_ag_falta_change AFTER INSERT OR UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION trg_atualizar_falta_after_change();

CREATE TRIGGER trg_agendamentos_updated_at BEFORE UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION set_agendamento_updated_at_now();

CREATE TRIGGER trg_external_shared_capacity BEFORE INSERT OR DELETE OR UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION guard_external_shared_capacity();

CREATE TRIGGER trg_external_specific_reservation BEFORE INSERT OR UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION guard_external_specific_reservation();

CREATE TRIGGER trg_guard_patient_profession_careness BEFORE INSERT OR UPDATE ON agendamentos FOR EACH ROW EXECUTE FUNCTION guard_patient_profession_careness();

CREATE TRIGGER trg_release_treatment_before_appointment_delete BEFORE DELETE ON agendamentos FOR EACH ROW EXECUTE FUNCTION release_treatment_sessions_before_appointment_delete();

CREATE TRIGGER update_agendamentos_externos_updated_at BEFORE UPDATE ON agendamentos_externos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_cbo_codigos_updated_at BEFORE UPDATE ON cbo_codigos FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_document_templates_updated_at BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_documentos_gerados_updated_at BEFORE UPDATE ON documentos_gerados FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_form_templates_updated BEFORE UPDATE ON form_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_google_calendar_tokens_updated_at BEFORE UPDATE ON google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION update_google_calendar_tokens_updated_at();

CREATE TRIGGER trg_propagate_paciente_nome AFTER UPDATE OF nome ON pacientes FOR EACH ROW EXECUTE FUNCTION propagate_paciente_nome();

CREATE TRIGGER patient_discharge_careness_sync AFTER INSERT OR DELETE OR UPDATE ON patient_discharges FOR EACH ROW EXECUTE FUNCTION sync_profession_careness_from_discharge();

CREATE TRIGGER trg_guard_treatment_discharge_integrity BEFORE INSERT ON patient_discharges FOR EACH ROW EXECUTE FUNCTION guard_treatment_discharge_integrity();

CREATE TRIGGER update_patient_documents_updated_at BEFORE UPDATE ON patient_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_procedures_updated_at BEFORE UPDATE ON patient_procedures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER patient_referral_releases_profession_careness AFTER INSERT OR UPDATE OF status, especialidade_destino, professional_id ON patient_referrals FOR EACH ROW EXECUTE FUNCTION release_careness_from_patient_referral();

CREATE TRIGGER update_patient_referrals_updated_at BEFORE UPDATE ON patient_referrals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_notify_permissoes AFTER INSERT OR DELETE OR UPDATE ON permissoes FOR EACH ROW EXECUTE FUNCTION notify_permissao_alterada();

CREATE TRIGGER trg_permissoes_updated BEFORE UPDATE ON permissoes FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_notify_permissoes_usuario AFTER INSERT OR DELETE OR UPDATE ON permissoes_usuario FOR EACH ROW EXECUTE FUNCTION notify_permissao_alterada();

CREATE TRIGGER trg_permissoes_usuario_updated BEFORE UPDATE ON permissoes_usuario FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');

CREATE TRIGGER update_profissionais_carimbo_updated_at BEFORE UPDATE ON profissionais_carimbo FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_profissionais_externos_updated_at BEFORE UPDATE ON profissionais_externos FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_prontuario_config_updated_at BEFORE UPDATE ON prontuario_config FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_prontuario_exames_updated_at BEFORE UPDATE ON prontuario_exames FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER tr_sync_prontuario_procedures AFTER INSERT OR UPDATE ON prontuario_procedimentos FOR EACH ROW EXECUTE FUNCTION sync_prontuario_to_global_procedures_v4();

CREATE TRIGGER prontuarios_updated_at BEFORE UPDATE ON prontuarios FOR EACH ROW EXECUTE FUNCTION update_prontuarios_updated_at();

CREATE TRIGGER trg_enforce_fono_avaliativo_cbo BEFORE INSERT OR UPDATE ON prontuarios FOR EACH ROW EXECUTE FUNCTION enforce_fono_avaliativo_cbo();

CREATE TRIGGER update_pts_metas_updated_at BEFORE UPDATE ON pts_metas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_external_quota_admin_write BEFORE INSERT OR DELETE OR UPDATE ON quotas_externas FOR EACH ROW EXECUTE FUNCTION guard_external_quota_admin_write();

CREATE TRIGGER trg_external_quota_counter BEFORE INSERT OR UPDATE ON quotas_externas FOR EACH ROW EXECUTE FUNCTION guard_external_quota_counter();

CREATE TRIGGER update_quotas_externas_updated_at BEFORE UPDATE ON quotas_externas FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_sistemas_integrados_updated BEFORE UPDATE ON sistemas_integrados FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_system_monitoring_settings_updated_at BEFORE UPDATE ON system_monitoring_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_capture_treatment_plan_baseline BEFORE UPDATE OF total_sessions ON treatment_cycles FOR EACH ROW EXECUTE FUNCTION capture_treatment_plan_baseline();

CREATE TRIGGER trg_guard_treatment_cycle_conclusion BEFORE UPDATE OF status ON treatment_cycles FOR EACH ROW EXECUTE FUNCTION guard_treatment_cycle_conclusion();

CREATE CONSTRAINT TRIGGER trg_guard_treatment_plan_count AFTER INSERT OR UPDATE ON treatment_cycles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_treatment_plan_count();

CREATE TRIGGER trg_guard_treatment_session_integrity BEFORE INSERT OR UPDATE OF scheduled_date, status, appointment_id, cycle_id, patient_id, professional_id, session_number ON treatment_sessions FOR EACH ROW EXECUTE FUNCTION guard_treatment_session_integrity();

CREATE TRIGGER trg_sess_falta_change AFTER INSERT OR UPDATE ON treatment_sessions FOR EACH ROW EXECUTE FUNCTION trg_atualizar_falta_after_change();

CREATE TRIGGER trg_whatsapp_config_updated BEFORE UPDATE ON whatsapp_config FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_wcs_updated_at BEFORE UPDATE ON whatsapp_connection_status FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_whatsapp_conversations_updated BEFORE UPDATE ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER trg_whatsapp_event_config_updated BEFORE UPDATE ON whatsapp_event_config FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_whatsapp_event_config_updated_at BEFORE UPDATE ON whatsapp_event_config FOR EACH ROW EXECUTE FUNCTION update_whatsapp_event_config_updated_at();

CREATE TRIGGER trg_whatsapp_queue_updated BEFORE UPDATE ON whatsapp_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

CREATE TRIGGER update_whatsapp_templates_updated_at BEFORE UPDATE ON whatsapp_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

COMMIT;