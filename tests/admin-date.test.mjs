import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/adminDate.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { toLocalDateTimeInput } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('promo timestamps round trip unchanged in local time', () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const zone of ['Asia/Colombo', 'UTC', 'America/New_York']) {
      process.env.TZ = zone;
      for (const stored of ['2026-10-25T04:30:00.000Z', '2026-01-15T18:00:00.000Z']) {
        assert.equal(new Date(toLocalDateTimeInput(stored)).toISOString(), stored, zone);
      }
    }
    process.env.TZ = 'Asia/Colombo';
    assert.equal(toLocalDateTimeInput('2026-10-25T04:30:00.000Z'), '2026-10-25T10:00');
    assert.equal(toLocalDateTimeInput(null), '');
    assert.equal(toLocalDateTimeInput('invalid'), '');
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
