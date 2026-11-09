import { describe, expect, it } from 'vitest';
import { listName } from './users';

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
