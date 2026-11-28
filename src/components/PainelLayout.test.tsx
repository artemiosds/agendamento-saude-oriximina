import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PainelLayout from './PainelLayout';

const account = vi.hoisted(() => ({
  role: 'master',
  global: true,
  allowed: new Set<string>(),
  licenses: {} as Record<string, boolean>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-1', nome: 'Conta de teste', role: account.role, unidadeId: 'cer' },
    logout: () => {},
    isGlobalAdmin: account.global,
  }),
}));
vi.mock('@/contexts/OperacionalContext', () => ({
  useOperacional: () => ({ unidades: [{ id: 'cer', nome: 'CER II' }] }),
}));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ loading: false, can: (module: string) => account.allowed.has(module) }),
}));
vi.mock('@/hooks/useBrand', () => ({
  useBrand: () => ({ logoUrl: '/logo.png', titulo: 'SMS Oriximiná', subtitulo: 'Secretaria Municipal de Saúde' }),
}));
vi.mock('@/hooks/useLicense', () => ({
  useLicense: () => ({ license: account.licenses, loading: false, source: 'local', status: 'valid' }),
}));
vi.mock('@/components/QuickSearch', () => ({ default: () => null }));
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/WhatsappPausedBanner', () => ({ default: () => null }));

function mount(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/painel" element={<PainelLayout />}>
          <Route path="*" element={<Link to="/painel/prontuario?pacienteId=teste">Abrir prontuário pelo atalho</Link>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return within(screen.getByRole('navigation', { name: 'Menu principal' }));
}

beforeEach(() => {
  localStorage.clear();
  account.role = 'master';
  account.global = true;
  account.allowed = new Set();
  account.licenses = {};
});
afterEach(cleanup);

describe('jornadas do menu lateral', () => {
  it('abre Gestão e Escalas no Dashboard e exibe um único acesso à Disponibilidade', () => {
    const menu = mount('/painel');
    expect(screen.getByText('Master Global')).toBeInTheDocument();
    expect(menu.getByRole('button', { name: 'Gestão e Escalas' })).toHaveAttribute('aria-expanded', 'true');
    expect(menu.getByRole('button', { name: 'Atendimento Clínico' })).toHaveAttribute('aria-expanded', 'false');
    const availability = within(document.getElementById('menu-grupo-gestao')!).getByRole('link', { name: 'Disponibilidade' });
    expect(availability).toHaveAttribute('href', '/painel/disponibilidade');
    expect(menu.queryByRole('link', { name: 'Escala dos Profissionais' })).toBeNull();
    fireEvent.click(availability);
    expect(availability).toHaveAttribute('aria-current', 'page');
  });

  it('destaca Disponibilidade quando o link direto da escala é aberto', () => {
    const menu = mount('/painel/disponibilidade?aba=escala');
    expect(menu.getByRole('button', { name: 'Gestão e Escalas' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(document.getElementById('menu-grupo-gestao')!).getByRole('link', { name: 'Disponibilidade' })).toHaveAttribute('aria-current', 'page');
    expect(menu.queryByRole('link', { name: 'Escala dos Profissionais' })).toBeNull();
  });

  it('localiza Disponibilidade ao buscar Escala dos Profissionais', () => {
    const menu = mount('/painel');
    fireEvent.change(menu.getByRole('searchbox', { name: 'Localizar módulo' }), { target: { value: 'Escala dos Profissionais' } });
    expect(menu.getByRole('link', { name: 'Disponibilidade' })).toHaveAttribute('href', '/painel/disponibilidade');
    expect(menu.queryByRole('link', { name: 'Escala dos Profissionais' })).toBeNull();
  });

  it('preserva favoritos antigos da escala sem duplicar Disponibilidade', () => {
    const key = JSON.stringify(['staff-1', 'master', 'cer', true]);
    localStorage.setItem('sidebar-quick-access-v1', JSON.stringify({[key]: ['/painel/disponibilidade?aba=escala', '/painel/disponibilidade']}));
    const menu = mount('/painel/disponibilidade?aba=escala');
    const quick = within(menu.getByRole('region', { name: 'Acesso rápido' }));
    expect(quick.getAllByRole('link', { name: 'Disponibilidade' })).toHaveLength(1);
    expect(quick.queryByRole('link', { name: 'Escala dos Profissionais' })).toBeNull();
    expect(quick.getByRole('link', { name: 'Disponibilidade' })).toHaveAttribute('aria-current', 'page');
  });

  it('abre o grupo da rota atual e reabre um grupo recolhido ao chegar por outro atalho', () => {
    account.global = false;
    const menu = mount('/painel/prontuario');
    const clinical = menu.getByRole('button', { name: 'Atendimento Clínico' });
    expect(screen.getByText('Master de unidade')).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Prontuários' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(clinical);
    expect(clinical).toHaveAttribute('aria-expanded', 'false');
    expect(menu.queryByRole('link', { name: 'Prontuários' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Abrir prontuário pelo atalho' }));
    expect(clinical).toHaveAttribute('aria-expanded', 'true');
    expect(menu.getByRole('link', { name: 'Prontuários' })).toHaveAttribute('aria-current', 'page');
  });

  it('mostra somente os grupos com páginas liberadas por permissão e licença', () => {
    account.global = false;
    account.role = 'recepcao';
    account.allowed = new Set(['agenda', 'pacientes', 'fila']);
    account.licenses = { regulacao: false };
    const menu = mount('/painel');
    expect(menu.getByRole('button', { name: 'Recepção e Fluxo do Paciente' })).toHaveAttribute('aria-expanded', 'true');
    const reception=within(document.getElementById('menu-grupo-recepcao')!);
    expect(reception.getByRole('link', { name: 'Agenda Diária' })).toHaveAttribute('href', '/painel/agenda');
    expect(reception.getByRole('link', { name: 'Pacientes' })).toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Fila de Espera' })).toBeNull();
    expect(menu.queryByRole('button', { name: 'Gestão e Escalas' })).toBeNull();
    expect(menu.queryByRole('button', { name: 'Atendimento Clínico' })).toBeNull();
  });
});
