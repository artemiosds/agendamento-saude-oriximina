import React from 'react';
import { render,cleanup } from '@testing-library/react';
import { afterEach,expect,it } from 'vitest';
import ApacClinicalOverlay from './ApacClinicalOverlay';
import { emptyApacClinicalData } from '@/lib/apacClinicalData';
afterEach(cleanup);
it('renderiza dados clínicos no mesmo SVG sem criar assinatura ou autorização',()=>{
 const d=emptyApacClinicalData();d.principal={codigo:'0301010048',nome:'Consulta',quantidade:2};d.cidPrincipal='M54.5';d.solicitante='Solicitante';
 const {container}=render(<svg><ApacClinicalOverlay data={d}/></svg>);
 expect(container.querySelectorAll('svg')).toHaveLength(1);
 expect(container.textContent).toContain('M545');expect(container.textContent).toContain('Solicitante');
 expect(container.querySelector('image')).toBeNull();
});
it('campos opcionais não preenchem o formulário antigo',()=>{
 const {container}=render(<svg><ApacClinicalOverlay data={emptyApacClinicalData()}/></svg>);
 expect(container.querySelectorAll('text')).toHaveLength(0);
});
