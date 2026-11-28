import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import ConfigNavigation from './ConfigNavigation';
import {CONFIG_SECTIONS,type ConfigTabId} from '@/lib/configNavigation';
import {useState} from 'react';
afterEach(cleanup);
function Navigation({global=true}:{global?:boolean}){const [active,setActive]=useState<ConfigTabId>('prontuario');return <ConfigNavigation activeTab={active} onSelect={setActive} isGlobalMaster={global}/>;}
describe('homologação DOM das seções de configuração',()=>{
 it('seleciona cada uma das doze seções e mantém apenas uma ativa',()=>{render(<Navigation/>);const nav=within(screen.getByRole('navigation',{name:'Seções de configurações'}));expect(nav.getAllByRole('button')).toHaveLength(12);for(const section of CONFIG_SECTIONS){const button=nav.getByRole('button',{name:section.label,exact:true});fireEvent.click(button);expect(button).toHaveAttribute('aria-current','page');expect(nav.getAllByRole('button').filter(b=>b.getAttribute('aria-current')==='page')).toHaveLength(1);}});
 it('limita master local a dez seções e não revela as globais na busca',()=>{render(<Navigation global={false}/>);expect(screen.getAllByRole('button')).toHaveLength(10);fireEvent.change(screen.getByRole('textbox',{name:'Buscar configurações'}),{target:{value:'SIGTAP'}});expect(screen.getByRole('status')).toHaveTextContent('0 de 10');expect(screen.queryByRole('button',{name:'Unidades e Setores'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Limpar busca'}));expect(screen.getAllByRole('button')).toHaveLength(10);});
 it('busca sem acentos, preserva seleção enquanto digita e limpa após selecionar',()=>{const select=vi.fn();render(<ConfigNavigation activeTab="prontuario" onSelect={select} isGlobalMaster/>);const search=screen.getByRole('textbox',{name:'Buscar configurações'});fireEvent.change(search,{target:{value:'carencia pos alta'}});expect(select).not.toHaveBeenCalled();expect(screen.getByRole('status')).toHaveTextContent('1 de 12');fireEvent.click(screen.getByRole('button',{name:'Carência Pós-Alta'}));expect(select).toHaveBeenCalledWith('carencia');expect(search).toHaveValue('');});
});
