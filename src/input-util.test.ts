import { splitFileList } from './input-util.js';

describe('splitFileList', () => {
  it('splits comma-separated values', () => {
    expect(splitFileList('a.yaml,b.yaml,c.yaml')).toEqual(['a.yaml', 'b.yaml', 'c.yaml']);
  });

  it('splits newline-separated values', () => {
    expect(splitFileList('a.yaml\nb.yaml\nc.yaml')).toEqual(['a.yaml', 'b.yaml', 'c.yaml']);
  });

  it('splits mixed comma and newline separated values', () => {
    expect(splitFileList('a.yaml,b.yaml\nc.yaml,\nd.yaml')).toEqual([
      'a.yaml',
      'b.yaml',
      'c.yaml',
      'd.yaml',
    ]);
  });

  it('trims whitespace around entries', () => {
    expect(splitFileList('  a.yaml , b.yaml  \n c.yaml ')).toEqual(['a.yaml', 'b.yaml', 'c.yaml']);
  });

  it('drops empty entries from trailing separators and blank lines', () => {
    expect(splitFileList('a.yaml,,b.yaml,\n\n')).toEqual(['a.yaml', 'b.yaml']);
  });

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(splitFileList('')).toEqual([]);
    expect(splitFileList('   \n  \n')).toEqual([]);
  });
});
