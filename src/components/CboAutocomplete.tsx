import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CboValue {
  codigo: string;
  descricao: string;
}

interface CboAutocompleteProps {
  value: CboValue | null;
  onChange: (value: CboValue | null) => void;
  /** Used to suggest a CBO automatically when no value is set yet. */
  profissaoSugestao?: string;
  /** When true, shows a red border if value is empty. */
  required?: boolean;
  showError?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

interface CboRow {
  codigo: string;
  descricao: string;
  profissoes_relacionadas: string[];
}

const normalize = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const CboAutocomplete: React.FC<CboAutocompleteProps> = ({
  value,
  onChange,
  profissaoSugestao,
  required = false,
  showError = false,
  placeholder = 'Buscar por código ou descrição (ex: 223605, fisioterapeuta)',
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CboRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<CboRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSuggestedFor = useRef<string>('');

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Search debounced
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        let q = (supabase as any)
          .from('cbo_codigos')
          .select('codigo, descricao, profissoes_relacionadas')
          .eq('ativo', true)
          .order('descricao', { ascending: true })
          .limit(50);
        if (term) {
          // Search by code prefix OR description ilike
          q = q.or(`codigo.ilike.${term}%,descricao.ilike.%${term}%`);
        }
        const { data, error } = await q;
        if (!cancelled) {
          if (error) {
            console.error('CBO search error:', error);
            setResults([]);
          } else {
            setResults((data || []) as CboRow[]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  // Auto-suggest based on profissão
  useEffect(() => {
    const prof = normalize(profissaoSugestao || '');
    if (!prof || value?.codigo) {
      setSuggestion(null);
      return;
    }
    if (lastSuggestedFor.current === prof) return;
    lastSuggestedFor.current = prof;

    (async () => {
      const { data } = await (supabase as any)
        .from('cbo_codigos')
        .select('codigo, descricao, profissoes_relacionadas')
        .eq('ativo', true)
        .contains('profissoes_relacionadas', [prof])
        .limit(1);
      if (data && data.length > 0) {
        setSuggestion(data[0] as CboRow);
      } else {
        // Try a softer match by ilike on descricao
        const { data: data2 } = await (supabase as any)
          .from('cbo_codigos')
          .select('codigo, descricao, profissoes_relacionadas')
          .eq('ativo', true)
          .ilike('descricao', `%${prof}%`)
          .limit(1);
        if (data2 && data2.length > 0) setSuggestion(data2[0] as CboRow);
        else setSuggestion(null);
      }
    })();
  }, [profissaoSugestao, value?.codigo]);

  const handleSelect = (row: CboRow) => {
    onChange({ codigo: row.codigo, descricao: row.descricao });
    setOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  const acceptSuggestion = () => {
    if (suggestion) {
      handleSelect(suggestion);
      setSuggestion(null);
    }
  };

  const showSuggestionBanner = !!suggestion && !value?.codigo;
  const hasError = required && showError && !value?.codigo;

  return (
    <div className="space-y-2" ref={containerRef}>
      {value?.codigo ? (
        <div
          className={cn(
            'flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2',
            disabled && 'opacity-60'
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">{value.codigo}</Badge>
              <span className="text-sm text-foreground truncate">{value.descricao}</span>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remover CBO"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className={cn('pl-9', hasError && 'border-destructive focus-visible:ring-destructive')}
          />
          {open && (
            <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
              {loading ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Buscando...
                </div>
              ) : results.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum CBO encontrado.
                </div>
              ) : (
                <ul className="py-1">
                  {results.map((row) => (
                    <li key={row.codigo}>
                      <button
                        type="button"
                        onClick={() => handleSelect(row)}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2"
                      >
                        <Badge variant="outline" className="font-mono shrink-0">{row.codigo}</Badge>
                        <span className="text-sm text-foreground">{row.descricao}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {showSuggestionBanner && (
        <button
          type="button"
          onClick={acceptSuggestion}
          className="w-full flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-left hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              Sugestão para <strong className="text-foreground">{profissaoSugestao}</strong>:
              <span className="ml-1 font-mono">{suggestion!.codigo}</span> — {suggestion!.descricao}
            </span>
          </div>
          <Badge variant="default" className="text-[10px] shrink-0">Usar</Badge>
        </button>
      )}

      {hasError && (
        <p className="text-xs text-destructive">CBO é obrigatório para profissionais.</p>
      )}
    </div>
  );
};

export default CboAutocomplete;
