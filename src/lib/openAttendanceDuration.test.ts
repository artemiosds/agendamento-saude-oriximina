import { expect, it } from 'vitest';
import { formatOpenAttendanceDuration } from './openAttendanceDuration';

it.each([
  [59, '59 min'],
  [60, '1 h 0 min'],
  [125, '2 h 5 min'],
  [1440, 'há 1 dia · 28/10'],
  [31680, 'há 22 dias · 28/10'],
  [43200, 'há 1 mês · 28/10'],
  [null, '28/10'],
])('formata %s minutos sem mostrar minutos brutos para datas antigas', (minutes, label) => {
  expect(formatOpenAttendanceDuration(minutes, '2026-10-28')).toBe(label);
});
