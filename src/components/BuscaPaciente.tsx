import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Paciente } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

interface BuscaPacienteProps {
  pacientes: Paciente[];
  value: string;
  onChange: (pacienteId: string, pacienteNome: string) => void;
}

type PacienteRow = Database['public']['Tables']['pacientes']['Row'];

const mapPaciente = (row: PacienteRow): Paciente => ({
  id: row.id,
  nome: row.nome,
  cpf: row.cpf,
  cns: row.cns,
  nomeMae: row.nome_mae,
  telefone: row.telefone,
  dataNascimento: row.data_nascimento,
  email: row.email,
  endereco: row.endereco,
  observacoes: row.observacoes,
  descricaoClinica: row.descricao_clinica,
  cid: row.cid,
  criadoEm: row.criado_em || '',
});

const sanitizeSearchTerm = (value: string) => value.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
const escapeIlikeTerm = (value: string) => sanitizeSearchTerm(value).replace(/[%_]/g, '\\$&');

export function BuscaPaciente({ pacientes, value, onChange }: BuscaPacienteProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedPaciente = async () => {
      if (!value) {
        setSelectedPaciente(null);
        return;
      }

      const localPaciente = pacientes.find((paciente) => paciente.id === value);
      if (localPaciente) {
        setSelectedPaciente(localPaciente);
        return;
      }

      const { data, error } = await supabase
        .from('pacientes')
        .select(
          'id, nome, cpf, cns, nome_mae, telefone, data_nascimento, email, endereco, observacoes, descricao_clinica, cid, criado_em',
        )
        .eq('id', value)
        .maybeSingle();

      if (!cancelled) {
        if (error || !data) {
          setSelectedPaciente(null);
          return;
        }

        setSelectedPaciente(mapPaciente(data));
      }
    };

    loadSelectedPaciente();

    return () => {
      cancelled = true;
    };
  }, [value, pacientes]);

  useEffect(() => {
    let cancelled = false;
    const term = debouncedQuery.trim();

    if (term.length < 2) {
      setResultados([]);
      setLoading(false);
      return;
    }

    const searchPatients = async () => {
      setLoading(true);

      const ilikeTerm = escapeIlikeTerm(term);
      const { data, error } = await supabase
        .from('pacientes')
        .select(
          'id, nome, cpf, cns, nome_mae, telefone, data_nascimento, email, endereco, observacoes, descricao_clinica, cid, criado_em',
        )
        .or(`nome.ilike.%${ilikeTerm}%,cpf.ilike.%${ilikeTerm}%,telefone.ilike.%${ilikeTerm}%`)
        .order('nome', { ascending: true })
        .limit(10);

      if (!cancelled) {
        setResultados(error || !data ? [] : data.map(mapPaciente));
        setLoading(false);
      }
    };

    searchPatients();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  if (selectedPaciente) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedPaciente.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {selectedPaciente.cpf ? `CPF: ${selectedPaciente.cpf} · ` : ''}
            Tel: {selectedPaciente.telefone || 'Não informado'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange('', '');
            setSelectedPaciente(null);
            setQuery('');
            setResultados([]);
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF ou telefone..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAberto(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setAberto(true);
          }}
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {aberto && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {loading ? (
            <p className="p-3 text-center text-sm text-muted-foreground">Buscando pacientes...</p>
          ) : resultados.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">Nenhum paciente encontrado para "{query}"</p>
          ) : (
            resultados.map((paciente) => (
              <button
                key={paciente.id}
                type="button"
                onClick={() => {
                  setSelectedPaciente(paciente);
                  onChange(paciente.id, paciente.nome);
                  setAberto(false);
                  setQuery('');
                }}
                className="w-full border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent"
              >
                <p className="text-sm font-medium">{paciente.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {paciente.cpf ? `CPF: ${paciente.cpf} · ` : ''}
                  {paciente.telefone ? `Tel: ${paciente.telefone}` : 'Telefone não informado'}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
