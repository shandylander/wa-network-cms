import { escapeCsvField, buildCsv } from './exportUtils';

describe('escapeCsvField', () => {
  test('leaves plain values unquoted', () => {
    expect(escapeCsvField('Ali')).toBe('Ali');
    expect(escapeCsvField(1500)).toBe('1500');
  });
  test('empty for null/undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
  test('quotes and doubles embedded quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
  test('quotes fields with commas and newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildCsv', () => {
  const columns = [{ key: 'name', label: 'Name' }, { key: 'net', label: 'Net Pay' }];
  test('builds header + rows with CRLF', () => {
    const csv = buildCsv(columns, [{ name: 'Ali', net: 3200 }, { name: 'Siti', net: 2800 }]);
    expect(csv).toBe('Name,Net Pay\r\nAli,3200\r\nSiti,2800');
  });
  test('escapes a name containing a comma', () => {
    const csv = buildCsv(columns, [{ name: 'Tan, Ah Kow', net: 3000 }]);
    expect(csv).toContain('"Tan, Ah Kow",3000');
  });
  test('missing keys render as empty fields', () => {
    const csv = buildCsv(columns, [{ name: 'Ali' }]);
    expect(csv).toBe('Name,Net Pay\r\nAli,');
  });
  test('handles empty rows', () => {
    expect(buildCsv(columns, [])).toBe('Name,Net Pay');
  });
});
