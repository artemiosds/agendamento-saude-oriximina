import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgendaItemCard, { AgendaItemCardProps } from './AgendaItemCard';
import { useAgendaDaySnapshot } from './useAgendaDaySnapshot';
vi.mock('@/components/ContactActionButton', () => ({ default: () => null }));
vi.mock('@/components/ChamarPacienteButton', () => ({ default: () => null }));
vi.mock('@/components/AgendaNotificacoes', () => ({ AgendaNotificacaoIndividual: () => null }));
const renderProbe = vi.hoisted(() => vi.fn());
vi.mock('@/components/CondicaoBadges', () => ({ default: () => { renderProbe(); return null; } }));
afterEach(() => { cleanup(); renderProbe.mockClear(); });
const noop = () => {};
function props(id: string): AgendaItemCardProps {
  return {
    ag: { id, data: '2026-01-01', hora: '08:00', tipo: 'Tipo livre', status: 'confirmado', pacienteNome: id },
    showMorningDivider: false, paciente: undefined, unidade: undefined, pacienteNomeResolved: id,
    lastAppt: undefined, triageRisco: undefined, iniciadoEm: null, displayStatus: 'confirmado',
    displayStatusLabel: 'Confirmado', displayStatusClass: '', user: null, isProfissional: false,
    isMaster: false, coordenadorPodeConcluir: false, canEdit: false, canAprovar: false,
    canRetorno: false, canDelete: true, canAgendaEdit: false, alertaMinutosEmAtendimento: 60,
    statusActions: [], onOpenDetalhe: noop, onOpenEdit: noop, onAprovar: noop, onRejeitarInit: noop,
    onIniciarAtendimento: noop, onContinuar: noop, onVerProntuario: noop, onAbrirRetorno: noop,
    onStatusChange: noop, onCancelInit: noop, onConcluir: noop, onDeleteInit: noop,
  };
}
describe('Agenda: renderização e revalidação', () => {
  it('80 cartões não montam diálogos e a lixeira envia exatamente o paciente escolhido', () => {
    const onDeleteInit = vi.fn();
    const cards = Array.from({ length: 80 }, (_, i) => ({ ...props(`Paciente ${i}`), onDeleteInit }));
    const list = (items: AgendaItemCardProps[]) => <>{items.map(p => <AgendaItemCard key={p.ag.id} {...p} />)}</>;
    const view = render(list(cards));
    expect(renderProbe).toHaveBeenCalledTimes(80);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Excluir')[37]);
    expect(onDeleteInit).toHaveBeenCalledTimes(1);
    expect(onDeleteInit).toHaveBeenCalledWith(expect.objectContaining({ id: 'Paciente 37', hora: '08:00' }));
    view.rerender(list(cards.map((p, i) => i === 37 ? { ...p, ag: { ...p.ag, status: 'apto_atendimento' }, displayStatusLabel: 'Apto' } : p)));
    expect(renderProbe).toHaveBeenCalledTimes(81);
  });
  it('a comparação rasa evita redesenhar cartões inalterados, inclusive com tipo sem badge cadastrado', () => {
    const cardProps = props('p1');
    const view = render(<AgendaItemCard {...cardProps} />);
    expect(renderProbe).toHaveBeenCalledTimes(1);
    view.rerender(<AgendaItemCard {...cardProps} />);
    expect(renderProbe).toHaveBeenCalledTimes(1);
    view.rerender(<AgendaItemCard {...cardProps} ag={{ ...cardProps.ag, status: 'apto_atendimento' }} displayStatusLabel="Apto" />);
    expect(renderProbe).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Apto')).toBeInTheDocument();
  });
  it('mantém a última lista completa durante revalidação e aceita uma resposta vazia definitiva', () => {
    const previous = [{ id: 'a' }]; const next = [{ id: 'b' }];
    const { result, rerender } = renderHook(({ rows, ready }) => useAgendaDaySnapshot('user|unit|day', rows, ready), { initialProps: { rows: previous, ready: true } });
    rerender({ rows: [], ready: false });
    expect(result.current.rows).toBe(previous);
    rerender({ rows: next, ready: true });
    expect(result.current.rows).toBe(next);
    rerender({ rows: [], ready: true });
    expect(result.current.rows).toEqual([]);
    expect(result.current.retained).toBe(false);
  });
  it('não reutiliza dados de outra data, unidade, usuário ou geração de navegação', () => {
    const privateRows = [{ id: 'privado' }];
    const { result, rerender } = renderHook(({ scope, ready }) => useAgendaDaySnapshot(scope, privateRows, ready), { initialProps: { scope: 'u1|unit1|day1|0', ready: true } });
    rerender({ scope: 'u2|unit2|day2|1', ready: false });
    expect(result.current.rows).toEqual([]);
    rerender({ scope: 'u1|unit1|day1|2', ready: false });
    expect(result.current.rows).toEqual([]);
  });
});
