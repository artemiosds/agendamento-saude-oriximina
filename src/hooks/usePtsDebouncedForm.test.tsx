import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { usePtsDebouncedForm } from './usePtsDebouncedForm';

describe('buffer de textos do PTS', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const initial = { diagnostico: '', meta: '', prioridade: 'Média' };
  function Harness({ save, renderCount }: { save: (v: typeof initial) => void; renderCount: () => void }) {
    renderCount();
    const { value, read, setText, setValue, flush, resetKey } = usePtsDebouncedForm(initial);
    const [visible, setVisible] = useState(true);
    return <>
      {visible && <DebouncedTextarea aria-label="Diagnóstico" buffered debounceMs={350} bufferedResetKey={resetKey}
        value={read().diagnostico} onChange={e => setText('diagnostico', e.target.value)} onBlur={flush} />}
      <DebouncedTextarea aria-label="Meta" buffered debounceMs={350} bufferedResetKey={resetKey}
        value={read().meta} onChange={e => setText('meta', e.target.value)} onBlur={flush} />
      <output data-testid="publicado">{value.diagnostico}</output>
      <button onClick={() => save(flush())}>Salvar</button>
      <button onClick={() => setVisible(v => !v)}>Alternar aba</button>
      <button onClick={() => setValue(p => ({ ...p, prioridade: 'Alta' }))}>Prioridade</button>
      <button onClick={() => setValue({ ...initial })}>Descartar</button>
    </>;
  }

  it('não renderiza o formulário por tecla e publica após 350 ms', () => {
    const renders = vi.fn();
    render(<Harness save={vi.fn()} renderCount={renders} />);
    const baseline = renders.mock.calls.length;
    const input = screen.getByRole('textbox', { name: 'Diagnóstico' });
    fireEvent.change(input, { target: { value: 'Texto' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: 'Texto completo' } });
    act(() => vi.advanceTimersByTime(349));
    expect(input).toHaveValue('Texto completo');
    expect(renders).toHaveBeenCalledTimes(baseline);
    expect(screen.getByTestId('publicado')).toHaveTextContent(/^$/);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('publicado')).toHaveTextContent('Texto completo');
  });

  it('salva todos os textos recentes mesmo sem blur e antes do debounce', () => {
    const save = vi.fn();
    render(<Harness save={save} renderCount={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Diagnóstico' }), { target: { value: 'Diagnóstico final' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Meta' }), { target: { value: 'Meta final' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(save).toHaveBeenCalledWith({ diagnostico: 'Diagnóstico final', meta: 'Meta final', prioridade: 'Média' });
    act(() => vi.runAllTimers());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('preserva texto na troca de aba e nas alterações de outros campos', () => {
    const save = vi.fn();
    render(<Harness save={save} renderCount={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Diagnóstico' }), { target: { value: 'Último caractere!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alternar aba' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prioridade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alternar aba' }));
    expect(screen.getByRole('textbox', { name: 'Diagnóstico' })).toHaveValue('Último caractere!');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(save).toHaveBeenCalledWith({ diagnostico: 'Último caractere!', meta: '', prioridade: 'Alta' });
  });

  it('descarta a edição pendente sem repopular o novo formulário', () => {
    const save = vi.fn();
    render(<Harness save={save} renderCount={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Diagnóstico' }), { target: { value: 'Texto descartado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    act(() => vi.runAllTimers());
    expect(screen.getByRole('textbox', { name: 'Diagnóstico' })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(save).toHaveBeenCalledWith(initial);
  });
});
