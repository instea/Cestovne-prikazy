import { describe, expect, it } from 'vitest';
import { nullable, objectSchema } from './schemas';

/**
 * DOC-02 stale-schema check: `objectSchema<T>` must not compile when the
 * schema drifts from `T`. The `@ts-expect-error` lines are the type tests
 * (`pnpm typecheck` fails if any of them compiles, i.e. a check is lost);
 * the runtime assertions pin the generated `required` list.
 */

interface Example {
  id: string;
  note: string | null;
  tag?: string;
  extra?: number;
  free?: unknown;
}

const str = { type: 'string' } as const;

describe('objectSchema<T> (DOC-02 stale check)', () => {
  it('accepts a schema that matches T and requires the non-optional keys', () => {
    const schema = objectSchema<Example>(
      'ok',
      { id: str, note: nullable(str), tag: str, extra: str, free: {} },
      ['extra', 'tag', 'free'],
    );
    expect(schema.required).toEqual(['id', 'note']);
    expect(schema.properties?.note).toEqual({ type: ['string', 'null'] });
  });

  it('rejects drift at compile time', () => {
    const fail = (build: () => unknown) => expect(build).not.toThrow();

    // Property missing / unknown property (the original check).
    fail(() =>
      objectSchema<Example>(
        'missing',
        // @ts-expect-error -- `free` is missing
        { id: str, note: nullable(str), tag: str, extra: str },
        ['tag', 'extra', 'free'],
      ),
    );
    fail(() =>
      objectSchema<Example>(
        'unknown',
        {
          id: str,
          note: nullable(str),
          tag: str,
          extra: str,
          free: {},
          // @ts-expect-error -- `other` is not a property of Example
          other: str,
        },
        ['tag', 'extra', 'free'],
      ),
    );

    // Nullability: `| null` in T ⇔ nullable(...) in the schema.
    fail(() =>
      objectSchema<Example>(
        'not nullable',
        // @ts-expect-error -- `note` is `string | null`: needs nullable(...)
        { id: str, note: str, tag: str, extra: str, free: {} },
        ['tag', 'extra', 'free'],
      ),
    );
    fail(() =>
      objectSchema<Example>(
        'wrongly nullable',
        {
          // @ts-expect-error -- `id` is never null
          id: nullable(str),
          note: nullable(str),
          tag: str,
          extra: str,
          free: {},
        },
        ['tag', 'extra', 'free'],
      ),
    );

    // Optional list ⇔ the `?` keys of T.
    fail(() =>
      objectSchema<Example>(
        'optional key missing',
        { id: str, note: nullable(str), tag: str, extra: str, free: {} },
        // @ts-expect-error -- `free` is optional in Example
        ['tag', 'extra'],
      ),
    );
    fail(() =>
      objectSchema<Example>(
        'required key listed',
        { id: str, note: nullable(str), tag: str, extra: str, free: {} },
        // @ts-expect-error -- `id` is required in Example
        ['tag', 'extra', 'free', 'id'],
      ),
    );
    fail(() =>
      objectSchema<Example>(
        'listed twice',
        { id: str, note: nullable(str), tag: str, extra: str, free: {} },
        // @ts-expect-error -- `tag` twice, `free` missing
        ['tag', 'extra', 'tag'],
      ),
    );
    fail(() =>
      // @ts-expect-error -- Example has optional keys: the list is required
      objectSchema<Example>('no list', {
        id: str,
        note: nullable(str),
        tag: str,
        extra: str,
        free: {},
      }),
    );
    fail(() =>
      objectSchema<{ id: string }>(
        'nothing optional',
        { id: str },
        // @ts-expect-error -- `{ id: string }` has no optional keys
        ['id'],
      ),
    );
  });
});
