import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SoapFieldsAdaptive from './SoapFieldsAdaptive';
import { useBufferedClinicalText } from '@/hooks/useBufferedClinicalText';

const calls = vi.hoisted(() => ({ fields: new Map<string, number>(), save: vi.fn() }));
vi.mock('@/components/ui/textarea', async () => {
  const { forwardRef } = await import('react');
  return { Textarea: forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) => {
    calls.fields.set(props.name!, (calls.fields.get(props.name!) || 0) + 1);
    return <textarea {...props} ref={ref} />;
  }) };
});
vi.mock('@/data/soapOptionsByProfession', () => ({
  getSoapOptions: () => ({ subjetivo: ['Relato informado'], objetivo: ['Achado observado'], avaliacao: ['Avaliação de teste'], plano: ['Plano de teste'] }),
  hasDropdownSoap: () => true, isMedico: () => false,
}));

const initial = { paciente_id: 'a', soap_subjetivo: '', soap_objetivo: '', soap_avaliacao: '', soap_plano: '' };
type Field = Exclude<keyof typeof initial, 'paciente_id'>;
function Editor() {
  const [form, setForm] = useState(initial), ref = useRef(form);
  const [, setTick] = useState(0);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => { ref.current = form; }, [form]);
  const buffer = useBufferedClinicalText(ref, setForm, () => calls.save(buffer.readLatestForm()));
  const { bufferText, replaceText } = buffer;
  const { flushText } = buffer;
  const toggle = useCallback((value: boolean) => { calls.save(flushText()); setEnabled(value); }, [flushText]);
  const values = useMemo(() => ({ soap_subjetivo: form.soap_subjetivo, soap_objetivo: form.soap_objetivo,
    soap_avaliacao: form.soap_avaliacao, soap_plano: form.soap_plano }), [form.soap_subjetivo, form.soap_objetivo, form.soap_avaliacao, form.soap_plano]);
  const typing = useCallback((field: Field, value: string) => bufferText(field, value), [bufferText]);
  const change = useCallback((field: Field, value: string) => replaceText({ [field]: value }), [replaceText]);
  const noop = useCallback(() => {}, []);
  return <>
    <SoapFieldsAdaptive key={buffer.textEpoch.current} profissao="Fisioterapia" values={values} onChange={change} onTextChange={typing}
      bufferedResetKey={buffer.textResetKey} readBufferedValue={buffer.readBufferedValue} soapErrors={false} soapEnabled={enabled} onClearErrors={noop} onToggleSoap={toggle} />
    <button onClick={() => setTick(v => v + 1)}>Atualizar aviso lateral</button>
    <button onClick={() => buffer.replaceText({ soap_subjetivo: 'Evolução anterior confirmada' })}>Copiar anterior</button>
    <button onClick={() => buffer.resetTextForm({ ...initial, paciente_id: 'b' })}>Outra ficha</button>
  </>;
}

beforeEach(() => { vi.useFakeTimers(); calls.fields.clear(); calls.save.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('SOAP: digitação isolada e comandos explícitos', () => {
  it('renderiza só o campo digitado e ignora atualização lateral e pausa de autosave', () => {
    render(<Editor />);
    const before = new Map(calls.fields);
    fireEvent.change(screen.getByRole('textbox', { name: 'S — Subjetivo' }), { target: { value: 'Texto clínico atual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar aviso lateral' }));
    act(() => vi.advanceTimersByTime(800));
    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ soap_subjetivo: 'Texto clínico atual' }));
    expect(calls.fields.get('soap_subjetivo')).toBe(before.get('soap_subjetivo')! + 1);
    for (const field of ['soap_objetivo', 'soap_avaliacao', 'soap_plano']) expect(calls.fields.get(field)).toBe(before.get(field));
  });

  it('seleciona e retira chip sem apagar texto livre ainda não salvo', () => {
    render(<Editor />);
    const field = screen.getByRole('textbox', { name: 'S — Subjetivo' });
    fireEvent.change(field, { target: { value: 'Complemento digitado agora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Relato informado' }));
    expect(field).toHaveValue('• Relato informado\nComplemento digitado agora');
    fireEvent.click(screen.getByRole('button', { name: '✓ Relato informado' }));
    expect(field).toHaveValue('Complemento digitado agora');
    act(() => vi.advanceTimersByTime(800));
    expect(calls.save).toHaveBeenLastCalledWith(expect.objectContaining({ soap_subjetivo: 'Complemento digitado agora' }));
  });

  it('mantém copiar evolução e modelo padrão operantes, inclusive com foco no campo', () => {
    render(<Editor />);
    const field = screen.getByRole('textbox', { name: 'S — Subjetivo' });
    field.focus();
    fireEvent.change(field, { target: { value: 'Texto a substituir explicitamente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar anterior' }));
    expect(field).toHaveValue('Evolução anterior confirmada');
    fireEvent.click(screen.getByRole('button', { name: 'Usar modelo padrão' }));
    expect(field).toHaveValue('• Relato informado');
    expect(screen.getByRole('textbox', { name: 'O — Objetivo' })).toHaveValue('• Achado observado');
    act(() => vi.advanceTimersByTime(800));
    expect(calls.save).toHaveBeenCalledTimes(1);
    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({ soap_subjetivo: '• Relato informado', soap_plano: '• Plano de teste' }));
  });

  it('troca de ficha limpa texto e seleção de chips, sem reaplicar conteúdo anterior', () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: 'Relato informado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Outra ficha' }));
    expect(screen.getByRole('textbox', { name: 'S — Subjetivo' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Relato informado' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(calls.save).not.toHaveBeenCalled();
  });

  it('desativar e reativar SOAP conserva o texto ainda não salvo', () => {
    render(<Editor />);
    fireEvent.change(screen.getByRole('textbox', { name: 'S — Subjetivo' }), { target: { value: 'Preservar ao ocultar SOAP' } });
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.queryByRole('textbox', { name: 'S — Subjetivo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('textbox', { name: 'S — Subjetivo' })).toHaveValue('Preservar ao ocultar SOAP');
    expect(calls.save).toHaveBeenLastCalledWith(expect.objectContaining({ soap_subjetivo: 'Preservar ao ocultar SOAP' }));
  });
});
