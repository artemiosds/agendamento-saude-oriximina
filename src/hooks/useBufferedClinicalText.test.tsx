import { useEffect, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBufferedClinicalText } from './useBufferedClinicalText';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import AutosaveBadge, { createAutosaveIndicator } from '@/components/prontuario/AutosaveBadge';
import { canCloseClinicalDraft, clinicalDraftKey, readClinicalDraft, storeClinicalDraft } from '@/lib/clinicalDraftRecovery';

const initial = { paciente_id: 'patient-a', queixa: '', soap: '', date: '2026-11-22', custom_data: { cid: ['F840'], prescriptions: [{ name: 'Prescrição existente' }] } };
function useFixture(onIdle = vi.fn()) {
  const [form, setForm] = useState(initial);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  const buffer = useBufferedClinicalText(formRef, setForm, onIdle);
  return { form, setForm, ...buffer };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('buffer clínico por ficha', () => {
  it('fechar e retomar sem paciente preserva último caractere sem fingir salvamento no banco', () => {
    const { result } = renderHook(() => useFixture());
    const key = clinicalDraftKey('isolated-professional', 'isolated-unit');
    const entries = new Map<string, string>();
    const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, value: string) => { entries.set(k, value); }, removeItem: (k: string) => { entries.delete(k); } };
    act(() => {
      result.current.resetTextForm({ ...initial, paciente_id: '' });
      result.current.bufferText('soap', 'Última letra antes do X: ç');
    });
    const confirmed = storeClinicalDraft(storage, key, result.current.readLatestForm());
    expect(canCloseClinicalDraft(false, confirmed, false)).toBe(true);
    expect(result.current.savedTextRevision.current).toBeLessThan(result.current.textRevision.current);
    const restored = readClinicalDraft<typeof initial>(storage, key);
    expect(restored?.soap).toBe('Última letra antes do X: ç');
    expect(restored?.custom_data).toEqual(initial.custom_data);
    expect(restored?.paciente_id).toBe('');
  });
  it('digita e salva em segundo plano sem atualizar o formulário React a cada pausa', () => {
    let renders = 0;
    const idle = vi.fn();
    const { result } = renderHook(() => { renders++; return useFixture(idle); });
    act(() => { for (let i = 1; i <= 100; i++) result.current.bufferText('queixa', 'Texto '.repeat(i)); });
    expect(renders).toBe(1);
    act(() => vi.advanceTimersByTime(800));
    expect(idle).toHaveBeenCalledTimes(1);
    expect(renders).toBe(1);
    expect(result.current.form.queixa).toBe('');
    expect(result.current.readLatestForm().queixa).toBe('Texto '.repeat(100));
  });

  it.each(['Salvar Prontuário', 'Finalizar Atendimento', 'Registrar Sessão'])('%s lê o último caractere antes dos 800 ms', () => {
    const { result } = renderHook(() => useFixture());
    let saved = initial;
    act(() => {
      result.current.bufferText('soap', 'Último caractere: ç');
      saved = result.current.flushText();
    });
    expect(saved.soap).toBe('Último caractere: ç');
    expect(saved.custom_data).toEqual(initial.custom_data);
    expect(result.current.form.soap).toBe('Último caractere: ç');
    expect(result.current.textTimer.current).toBeNull();
  });

  it('mantém texto pendente quando outro campo do formulário muda', () => {
    const { result } = renderHook(() => useFixture());
    act(() => result.current.bufferText('queixa', 'Texto em edição'));
    act(() => result.current.setForm(old => ({ ...old, date: '2026-11-21' })));
    expect(result.current.readLatestForm()).toMatchObject({ queixa: 'Texto em edição', date: '2026-11-21', custom_data: initial.custom_data });
  });

  it('uma confirmação atrasada não apaga texto novo nem o marca como salvo', () => {
    const { result } = renderHook(() => useFixture());
    act(() => result.current.bufferText('soap', 'Primeira versão'));
    const sent = result.current.readLatestForm(), epoch = result.current.textEpoch.current, revision = result.current.textRevision.current;
    act(() => result.current.bufferText('soap', 'Primeira versão com complemento'));
    expect(result.current.acknowledgeTextSave(epoch, revision)).toBe(false);
    expect(sent.soap).toBe('Primeira versão');
    expect(result.current.readLatestForm().soap).toBe('Primeira versão com complemento');
    expect(result.current.savedTextRevision.current).toBeLessThan(result.current.textRevision.current);
  });

  it.each(['patient-b', 'patient-a'])('outra ficha (%s) não recebe timer nem confirmação da ficha anterior', patient => {
    const idle = vi.fn();
    const { result } = renderHook(() => useFixture(idle));
    act(() => result.current.bufferText('soap', 'Texto da primeira ficha'));
    const epoch = result.current.textEpoch.current;
    act(() => result.current.resetTextForm({ ...initial, paciente_id: patient, soap: 'Conteúdo da outra ficha' }));
    expect(result.current.acknowledgeTextSave(epoch, 1)).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(idle).not.toHaveBeenCalled();
    expect(result.current.readLatestForm()).toMatchObject({ paciente_id: patient, soap: 'Conteúdo da outra ficha', queixa: '' });
    expect(result.current.readBufferedValue('soap')).toBeUndefined();
  });

  it('falha de gravação mantém a revisão pendente e permite nova tentativa com todo o texto', () => {
    const { result } = renderHook(() => useFixture());
    act(() => result.current.bufferText('soap', 'Não perder na falha de rede'));
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.savedTextRevision.current).not.toBe(result.current.textRevision.current);
    let retry = initial;
    act(() => { retry = result.current.flushText(); });
    expect(retry.soap).toBe('Não perder na falha de rede');
    expect(result.current.acknowledgeTextSave(result.current.textEpoch.current, result.current.textRevision.current)).toBe(true);
  });

  it('apagar todo o texto continua sendo uma alteração que precisa ser salva', () => {
    const { result } = renderHook(() => useFixture());
    act(() => result.current.bufferText('soap', 'Texto anterior'));
    const saved = result.current.textRevision.current;
    result.current.acknowledgeTextSave(result.current.textEpoch.current, saved);
    act(() => result.current.bufferText('soap', ''));
    expect(result.current.readLatestForm().soap).toBe('');
    expect(result.current.textRevision.current).toBeGreaterThan(result.current.savedTextRevision.current);
    expect(result.current.acknowledgeTextSave(result.current.textEpoch.current, saved)).toBe(false);
  });

  it('comando de copiar SOAP preserva outro texto pendente e cancela timer ao desmontar', () => {
    const idle = vi.fn();
    const { result, unmount } = renderHook(() => useFixture(idle));
    act(() => result.current.bufferText('queixa', 'Queixa atual'));
    act(() => result.current.replaceText({ soap: 'SOAP anterior confirmado' }));
    expect(result.current.form).toMatchObject({ queixa: 'Queixa atual', soap: 'SOAP anterior confirmado', custom_data: initial.custom_data });
    expect(result.current.textResetKey).toBe(1);
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(idle).not.toHaveBeenCalled();
  });

  it('badge e 800 ms de autosave não renderizam novamente a ficha durante a escrita', async () => {
    let renders = 0;
    const indicator = createAutosaveIndicator();
    const writes: string[] = [];
    function Editor() {
      renders++;
      const [form, setForm] = useState(initial), formRef = useRef(form);
      useEffect(() => { formRef.current = form; }, [form]);
      const buffer = useBufferedClinicalText(formRef, setForm, () => {
        indicator.setStatus('saving');
        writes.push(buffer.readLatestForm().soap);
        buffer.acknowledgeTextSave(buffer.textEpoch.current, buffer.textRevision.current);
        indicator.setAt(new Date()); indicator.setStatus('saved');
      });
      return <><DebouncedTextarea buffered bufferedResetKey={buffer.textResetKey} aria-label="SOAP" value={form.soap} onChange={e => buffer.bufferText('soap', e.target.value)} /><AutosaveBadge indicator={indicator} /></>;
    }
    render(<Editor />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Conteúdo final sem engasgo' } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(writes).toEqual(['Conteúdo final sem engasgo']);
    expect(screen.getByText(/Salvo automaticamente/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Conteúdo final sem engasgo');
    expect(renders).toBe(1);
  });
});
