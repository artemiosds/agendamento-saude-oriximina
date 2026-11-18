import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlotInfoBadge } from './SlotInfoBadge';

const fixture = vi.hoisted(() => ({ external: 5 }));

vi.mock('@/contexts/OperacionalContext', () => ({
  useOperacional: () => ({
    disponibilidades: [{ profissionalId: 'prof-1', unidadeId: 'unit-1', diasSemana: [1], dataInicio: '2099-01-01', dataFim: '2099-12-31', vagasPorHora: 0 }],
    getAvailableSlots: () => [],
    getTurnoInfo: () => [{
      turnoId: 'turno-1', nome: 'Manhã', horaInicio: '08:00', horaFim: '12:00',
      vagasTotal: 40, vagasOcupadas: 35, vagasOcupadasInterno: 35,
      vagasOcupadasExterno: fixture.external, vagasLivresInternas: Math.max(0, 40 - 35 - fixture.external),
      lotado: 35 + fixture.external >= 40, excedido: 35 + fixture.external > 40,
    }],
  }),
}));

vi.mock('@/contexts/AgendamentosContext', () => ({
  useAgendamentos: () => ({ agendamentos: [] }),
}));

describe('SlotInfoBadge: ocupação física do turno', () => {
  afterEach(() => { cleanup(); fixture.external = 5; });

  it('mostra lotado quando recepção e cota externa preenchem a capacidade', () => {
    render(<SlotInfoBadge profissionalId="prof-1" unidadeId="unit-1" date="2099-10-05" />);
    expect(screen.getByText('Lotado')).toBeInTheDocument();
    expect(screen.getByText('Sem vagas restantes neste bloco.')).toBeInTheDocument();
    expect(screen.getAllByText(/35 recepção \+ 5 externo/)).toHaveLength(2);
    expect(screen.getByText('Disponíveis:').parentElement).toHaveTextContent('0 vagas');
  });

  it('mostra excedente físico quando as duas origens ultrapassam o limite', () => {
    fixture.external = 7;
    render(<SlotInfoBadge profissionalId="prof-1" unidadeId="unit-1" date="2099-10-05" />);
    expect(screen.getByText('Excedido')).toBeInTheDocument();
    expect(screen.getByText('Há 2 agendamentos acima da capacidade prevista.')).toBeInTheDocument();
  });
});
