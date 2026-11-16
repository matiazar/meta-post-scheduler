import { cleanFilename } from './media.service.js';

describe('cleanFilename', () => {
  it.each([
    ['foto.jpg', 'foto.jpg'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\x\\foto.png', 'foto.png'],
    ['a\u0000b\nc.jpg', 'abc.jpg'],
    ['', 'imagen'],
    ['///', 'imagen'],
  ])('%j -> %j', (input, expected) => {
    expect(cleanFilename(input)).toBe(expected);
  });

  it('limita el largo a 200', () => {
    expect(cleanFilename('a'.repeat(500)).length).toBe(200);
  });
});
