import {describe,it,expect} from 'vitest';
import {auditFeedDate,groupAuditFeed,auditFeedTone,auditFeedCounts} from './auditEventFeed';
describe('visualização de eventos da auditoria',()=>{
  it('agrupa por dia municipal e mantém ordem e identidade',()=>{
    const rows=[{id:'c',createdAt:'2026-11-28T03:00:00Z'},{id:'b',createdAt:'2026-11-28T02:59:59Z'},{id:'a',createdAt:'2026-11-28T02:59:59Z'}];
    const groups=groupAuditFeed(rows);
    expect(groups.map(g=>g.key)).toEqual(['2026-11-28','2026-11-27']);
    expect(groups.flatMap(g=>g.rows.map(r=>r.id))).toEqual(['c','b','a']);
    expect(auditFeedDate(rows[1].createdAt).time).toBe('23:59:59');
  });
  it('não inventa datas nem eventos',()=>{
    expect(auditFeedDate('invalid')).toEqual({key:'unknown',label:'Data não registrada',time:'—'});
    expect(groupAuditFeed([])).toEqual([]);
  });
  it('separa falhas e demais estados sem presumir sucesso',()=>{
    expect(auditFeedTone('bloqueado')).toBe('blocked');
    expect(auditFeedTone('desconhecido')).toBe('neutral');
    expect(auditFeedCounts(['sucesso','erro','falha','tentativa','pendente','bloqueado',''].map(status=>({status})))).toEqual({success:1,failure:2,other:4});
  });
});
