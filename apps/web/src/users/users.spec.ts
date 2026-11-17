import { describe, expect, it } from 'vitest';
import { fullName, listName } from './users';

describe('listName (USR-01 Name column)', () => {
  it('is "surname, firstName"', () => {
    expect(listName({ firstName: 'Jana', surname: 'Nová' })).toBe('Nová, Jana');
  });

  it('omits the comma part when a value is empty', () => {
    expect(listName({ firstName: '', surname: 'Nová' })).toBe('Nová');
    expect(listName({ firstName: 'Jana', surname: ' ' })).toBe('Jana');
    expect(listName({ firstName: '', surname: '' })).toBe('');
  });
});

describe('fullName (USR-04 confirmation)', () => {
  it('is "First Surname", trimmed', () => {
    expect(fullName({ firstName: ' Jana ', surname: 'Nová' })).toBe(
      'Jana Nová',
    );
    expect(fullName({ firstName: '', surname: 'Nová' })).toBe('Nová');
    expect(fullName({ firstName: '', surname: '' })).toBe('');
  });
});
