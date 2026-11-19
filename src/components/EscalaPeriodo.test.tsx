import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EscalaPeriodo } from './EscalaPeriodo';

afterEach(cleanup);

function Fixture({ monthly }: { monthly: boolean }) {
  const [date, setDate] = useState('2026-11-23');
  return <EscalaPeriodo date={date} monthly={monthly} onChange={setDate} />;
}

describe('período da escala em formato brasileiro', () => {
  it('mostra o dia antes do mês e mantém a navegação por semana e por data', () => {
    render(<Fixture monthly={false} />);
    expect(screen.getByRole('button', { name: 'Período de consulta 23/11/2026' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    fireEvent.click(screen.getByRole('button', { name: 'Período de consulta 30/11/2026' }));
    const chooser = screen.getByRole('dialog', { name: 'Escolher data da escala' });
    fireEvent.click(within(chooser).getByRole('gridcell', { name: '25' }));
    expect(screen.getByRole('button', { name: 'Período de consulta 25/11/2026' })).toBeTruthy();
  });

  it('seleciona o mês em português e permite trocar o ano', () => {
    render(<Fixture monthly />);
    fireEvent.click(screen.getByRole('button', { name: 'Período de consulta 11/2026' }));
    const chooser = screen.getByRole('dialog', { name: 'Escolher mês da escala' });
    fireEvent.click(within(chooser).getByRole('button', { name: 'Próximo ano' }));
    fireEvent.click(within(chooser).getByRole('button', { name: 'janeiro de 2027' }));
    expect(screen.getByRole('button', { name: 'Período de consulta 01/2027' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByRole('button', { name: 'Período de consulta 12/2026' })).toBeTruthy();
  });
});
