/** Search only the existing loaded window; no query per keystroke. */
export function filterLoadedQueue<T extends {paciente_nome:string|null;telefone:string|null}>(rows:readonly T[],search:string):readonly T[]{
 const term=search.trim().toLowerCase();if(!term)return rows;
 return rows.filter(row=>(row.paciente_nome||'').toLowerCase().includes(term)||(row.telefone||'').includes(term));
}
