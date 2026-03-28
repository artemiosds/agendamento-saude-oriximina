DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'agendamentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pacientes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pacientes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fila_espera') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_espera;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'disponibilidades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.disponibilidades;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'triage_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.triage_records;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'treatment_cycles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_cycles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'treatment_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.treatment_sessions;
  END IF;
END $$;