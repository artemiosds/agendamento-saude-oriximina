
-- Create unidades table
CREATE TABLE public.unidades (
  id text PRIMARY KEY,
  nome text NOT NULL,
  endereco text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read unidades" ON public.unidades FOR SELECT USING (true);
CREATE POLICY "Auth users manage unidades" ON public.unidades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create salas table
CREATE TABLE public.salas (
  id text PRIMARY KEY,
  nome text NOT NULL,
  unidade_id text NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read salas" ON public.salas FOR SELECT USING (true);
CREATE POLICY "Auth users manage salas" ON public.salas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create disponibilidades table
CREATE TABLE public.disponibilidades (
  id text PRIMARY KEY DEFAULT 'd' || extract(epoch from now())::bigint::text,
  profissional_id text NOT NULL,
  unidade_id text NOT NULL,
  sala_id text DEFAULT '',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  hora_inicio text NOT NULL DEFAULT '08:00',
  hora_fim text NOT NULL DEFAULT '17:00',
  vagas_por_hora integer NOT NULL DEFAULT 3,
  vagas_por_dia integer NOT NULL DEFAULT 25,
  dias_semana integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  criado_em timestamp with time zone DEFAULT now()
);

ALTER TABLE public.disponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read disponibilidades" ON public.disponibilidades FOR SELECT USING (true);
CREATE POLICY "Auth users insert disponibilidades" ON public.disponibilidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update disponibilidades" ON public.disponibilidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users delete disponibilidades" ON public.disponibilidades FOR DELETE TO authenticated USING (true);

-- Seed the default unit
INSERT INTO public.unidades (id, nome, endereco, telefone, whatsapp, ativo)
VALUES ('un1', 'UBS Central de Oriximiná', 'Rua Principal, 100 - Centro, Oriximiná - PA', '(93) 3544-0000', '(93) 99999-0000', true);

-- Seed default rooms
INSERT INTO public.salas (id, nome, unidade_id, ativo) VALUES 
  ('s1', 'Consultório 01', 'un1', true),
  ('s2', 'Consultório 02', 'un1', true),
  ('s3', 'Sala de Procedimentos', 'un1', true);
