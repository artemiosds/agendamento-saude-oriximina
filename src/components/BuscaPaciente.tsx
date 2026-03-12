import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Paciente } from '@/types';

interface BuscaPacienteProps {
  pacientes: Paciente[];
  value: string; // pacienteId
  onChange: (pacienteId: string, pacienteNome: string) => void;
}

export function BuscaPaciente({ pacientes, value, onChange }: BuscaPacienteProps) {
  const [query, setQuery] = useState('');
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? pacientes.find(p => p.id === value) : null;

  const resultados = React.useMemo(() => {
    if (query.length < 2) return [];
    const term = query.toLowerCase().replace(/[.\-/]/g, '');
    return pacientes
      .filter(p =>
        p.nome.toLowerCase().includes(term) ||
        p.cpf?.replace(/[.\-/]/g, '').includes(term) ||
        p.telefone?.replace(/[^\d]/g, '').includes(term.replace(/[^\d]/g, ''))
      )
      .slice(0, 8);
  }, [query, pacientes]);

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selected.nome}</p>
          <p className="text-xs text-muted-foreground truncate">
            {selected.cpf && `CPF: ${selected.cpf} · `}Tel: {selected.telefone}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onChange('', ''); setQuery(''); }}
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CPF ou telefone..."
          value={query}
          onChange={e => { setQuery(e.target.value); setAberto(true); }}
          onFocus={() => query.length >= 2 && setAberto(true)}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {aberto && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto">
          {resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              Nenhum paciente encontrado para "{query}"
            </p>
          ) : (
            resultados.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id, p.nome);
                  setAberto(false);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-0 transition-colors"
              >
                <p className="text-sm font-medium">{p.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {p.cpf ? `CPF: ${p.cpf} · ` : ''}Tel: {p.telefone}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
