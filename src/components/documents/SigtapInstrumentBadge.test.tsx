import { act, render, renderHook, waitFor, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/bpaSigtapCatalog',()=>({loadBpaSigtapCatalog:vi.fn(),getCompetenciaReferenciaCatalogo:()=>''}));
import { loadBpaSigtapCatalog } from '@/lib/bpaSigtapCatalog';
import { SigtapInstrumentBadge, useSigtapInstruments } from './SigtapInstrumentBadge';
beforeEach(()=>vi.clearAllMocks());
it('loads once for an entire result list and retains the result when codes are unchanged',async()=>{
 vi.mocked(loadBpaSigtapCatalog).mockResolvedValue(new Map([['a',{instrumentos:new Set(['01'])}],['b',{instrumentos:new Set(['02'])}]] as any));
 const {result,rerender}=renderHook(()=>useSigtapInstruments(['a','b'],'202610'));
 await waitFor(()=>expect(result.current?.map.get('a')).toEqual(['01']));rerender();
 expect(loadBpaSigtapCatalog).toHaveBeenCalledTimes(1);expect(result.current?.map.get('b')).toEqual(['02']);
});
it('does not show a previous competence after the selection changes',async()=>{
 vi.mocked(loadBpaSigtapCatalog).mockResolvedValueOnce(new Map([['a',{instrumentos:new Set(['02'])}]] as any)).mockRejectedValueOnce(new Error('offline'));
 const {result,rerender}=renderHook(({comp})=>useSigtapInstruments(['a'],comp),{initialProps:{comp:'202610'}});
 await waitFor(()=>expect(result.current?.map.get('a')).toEqual(['02']));await act(async()=>{rerender({comp:'202611'});});
 expect(result.current).toBeUndefined();
});
it('distinguishes unknown, collective and individual instruments without disabling selection',()=>{
 const {rerender}=render(<SigtapInstrumentBadge/>);expect(screen.getByText('Instrumento não confirmado')).toBeInTheDocument();
 rerender(<SigtapInstrumentBadge codes={['01']}/>);expect(screen.getByText('BPA-C / Consolidado · Fora do BPA-I')).toBeInTheDocument();
 rerender(<SigtapInstrumentBadge codes={['01','02']}/>);expect(screen.getByText('BPA-I')).toBeInTheDocument();
});
