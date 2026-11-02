import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProcedureCidPicker from './ProcedureCidPicker';

const options = [{ codigo: 'G800', descricao: 'Paralisia cerebral quadriplágica espástica' }, { codigo: 'R262', descricao: 'Dificuldade para andar' }];
afterEach(cleanup);
describe('Busca restrita de CID no procedimento', () => {
  it('não oferece F84 na busca nem mistura catálogo geral com os sugeridos', () => {
    const change = vi.fn();
    render(<ProcedureCidPicker options={options} selected={[]} onChange={change} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'F84' } });
    expect(screen.getByText('Nenhum CID relacionado a este procedimento corresponde à busca.')).toBeInTheDocument();
    expect(screen.queryByText('Outros resultados')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
  it('filtra por descrição e código pontuado, seleciona somente o vínculo e usa contraste explícito', () => {
    const change = vi.fn();
    render(<ProcedureCidPicker options={options} selected={[]} onChange={change} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'G80.0' } });
    const button = screen.getByRole('button', { name: /G800/ });
    expect(button.className).toContain('text-slate-900');
    fireEvent.click(button);
    expect(change).toHaveBeenCalledWith(['G800']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'andar' } });
    expect(screen.getByRole('button', { name: /R262/ })).toBeInTheDocument();
  });
  it('preserva o CID antigo incompatível e só o retira após clique explícito', () => {
    const selected = ['F840', 'G800']; const change = vi.fn();
    render(<ProcedureCidPicker options={options} selected={selected} onChange={change} />);
    expect(screen.getByRole('note')).toHaveTextContent('F840');
    expect(change).not.toHaveBeenCalled();
    expect(selected).toEqual(['F840', 'G800']);
    fireEvent.click(screen.getByRole('button', { name: 'Retirar CID F840 da seleção' }));
    expect(change).toHaveBeenCalledWith(['G800']);
  });
  it('não apaga seleção quando a consulta falha ou não há lista restritiva', () => {
    const change = vi.fn();
    const { rerender } = render(<ProcedureCidPicker error="Rede indisponível" selected={['F840']} onChange={change} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/CIDs registrados/)).toHaveTextContent('F840');
    rerender(<ProcedureCidPicker options={[]} selected={['F840']} onChange={change} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByText(/CIDs registrados/)).toHaveTextContent('F840');
    expect(change).not.toHaveBeenCalled();
  });
});


describe('campo manual condicionado ao catálogo', () => {
 it('exibe a inclusão manual apenas para lista confirmada vazia', () => {
  const manual=vi.fn();const props={selected:[],onChange:vi.fn(),onAddManual:manual};
  const {rerender}=render(<ProcedureCidPicker {...props} options={options} />);
  expect(screen.queryByText('Adicionar CID informado')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Z000'}});
  expect(screen.queryByText('Adicionar CID informado')).not.toBeInTheDocument();
  rerender(<ProcedureCidPicker {...props} error="Consulta falhou" />);
  expect(screen.queryByText('Adicionar CID informado')).not.toBeInTheDocument();
  rerender(<ProcedureCidPicker {...props} options={[]} />);
  expect(screen.getByText('Adicionar CID informado')).toBeInTheDocument();
 });
 it('confirma o código digitado e não submete o formulário com Enter', async () => {
  const manual=vi.fn().mockResolvedValue(undefined),submit=vi.fn(e=>e.preventDefault());
  render(<form onSubmit={submit}><ProcedureCidPicker options={[]} selected={[]} onChange={vi.fn()} onAddManual={manual}/></form>);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Z000'}});
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
  await waitFor(()=>expect(manual).toHaveBeenCalledWith('Z000'));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue(''));
 });
 it('mantém o código digitado e informa erro quando ele não existe', async () => {
  const manual=vi.fn().mockRejectedValue(new Error('CID não encontrado'));
  render(<ProcedureCidPicker options={[]} selected={[]} onChange={vi.fn()} onAddManual={manual}/>);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Z999'}});
  fireEvent.click(screen.getByText('Adicionar CID informado'));
  expect(await screen.findByRole('alert')).toHaveTextContent('CID não encontrado');
  expect(screen.getByRole('textbox')).toHaveValue('Z999');
 });
});
