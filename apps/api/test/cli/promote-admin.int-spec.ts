import type { Model } from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog, AuditLogSchema } from '../../src/audit/audit-log.schema';
import {
  EXIT_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  parseEmailArg,
  promoteAdmin,
} from '../../src/cli/promote-admin';
import { User, UserSchema } from '../../src/users/user.schema';
import { useTestDatabase } from '../support/mongo';

const db = useTestDatabase();
let Users: Model<User>;
let Entries: Model<AuditLog>;

function capture() {
  const lines = { stdout: [] as string[], stderr: [] as string[] };
  return {
    lines,
    out: {
      stdout: (l: string) => lines.stdout.push(l),
      stderr: (l: string) => lines.stderr.push(l),
    },
  };
}

const AT = new Date('2026-11-06T10:00:00.000Z');

beforeAll(async () => {
  Users = db.connection().model(User.name, UserSchema);
  Entries = db.connection().model(AuditLog.name, AuditLogSchema);
  await Users.init();
  await Entries.init();
});

beforeEach(async () => {
  await Users.deleteMany({});
  await db.connection().db!.collection('auditlogs').deleteMany({});
  await Users.create([
    {
      id: 'u-jan',
      email: 'Jan.Novak@instea.co',
      firstName: 'Jan',
      surname: 'Novák',
    },
    { id: 'u-admin', email: 'admin@instea.co', isAdmin: true },
    {
      id: 'u-gone',
      email: 'gone@instea.co',
      active: false,
      deactivatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  ]);
});

describe('promote-admin (AUTH-04)', () => {
  it('promotes by trimmed, case-insensitive email and writes a cli audit entry', async () => {
    const { out, lines } = capture();
    const code = await promoteAdmin(
      db.connection(),
      '  jan.novak@INSTEA.co ',
      out,
      { now: () => AT },
    );

    expect(code).toBe(EXIT_OK);
    expect(lines.stdout).toEqual([
      "User with email 'jan.novak@INSTEA.co' promoted to admin.",
    ]);
    expect(lines.stderr).toEqual([]);
    const user = await Users.findOne({ id: 'u-jan' }).lean();
    expect(user?.isAdmin).toBe(true);

    const entries = await Entries.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      at: AT,
      actorType: 'cli',
      actorId: null,
      action: 'USER_ROLE_CHANGED',
      targetType: 'USER',
      targetId: 'u-jan',
      details: { before: { isAdmin: false }, after: { isAdmin: true } },
    });
  });

  it('unknown email: exit 1, not-found message, nothing written', async () => {
    const { out, lines } = capture();
    const code = await promoteAdmin(db.connection(), 'nobody@instea.co', out);

    expect(code).toBe(EXIT_FAILED);
    expect(lines.stderr).toEqual([
      "User with email 'nobody@instea.co' not found.",
    ]);
    expect(lines.stdout).toEqual([]);
    expect(await Entries.countDocuments()).toBe(0);
  });

  it('existing admin: exit 0, no write, updatedAt unchanged, no audit entry', async () => {
    const before = await Users.findOne({ id: 'u-admin' }).lean();
    const { out, lines } = capture();
    const code = await promoteAdmin(db.connection(), 'admin@instea.co', out);

    expect(code).toBe(EXIT_OK);
    expect(lines.stdout).toEqual([
      "User with email 'admin@instea.co' is already an admin.",
    ]);
    const after = await Users.findOne({ id: 'u-admin' }).lean();
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(await Entries.countDocuments()).toBe(0);
  });

  it('deactivated user: exit 1, stays deactivated and non-admin', async () => {
    const { out, lines } = capture();
    const code = await promoteAdmin(db.connection(), 'gone@instea.co', out);

    expect(code).toBe(EXIT_FAILED);
    expect(lines.stderr).toEqual([
      "User with email 'gone@instea.co' is deactivated.",
    ]);
    const user = await Users.findOne({ id: 'u-gone' }).lean();
    expect(user).toMatchObject({ active: false, isAdmin: false });
    expect(await Entries.countDocuments()).toBe(0);
  });

  it.each([undefined, '', '   '])(
    'missing email %j: exit 2 with usage',
    async (email) => {
      const { out, lines } = capture();
      const code = await promoteAdmin(db.connection(), email, out);

      expect(code).toBe(EXIT_USAGE);
      expect(lines.stderr).toEqual(['Usage: promote-admin --email=<email>']);
    },
  );

  it('audit insert failure rolls the promotion back (exit 1)', async () => {
    const { out, lines } = capture();
    // An invalid `at` makes the audit insert fail inside the transaction.
    const code = await promoteAdmin(
      db.connection(),
      'jan.novak@instea.co',
      out,
      {
        now: () => new Date('invalid'),
      },
    );

    expect(code).toBe(EXIT_FAILED);
    expect(lines.stderr).toHaveLength(1);
    const user = await Users.findOne({ id: 'u-jan' }).lean();
    expect(user?.isAdmin).toBe(false);
    expect(await Entries.countDocuments()).toBe(0);
  });
});

describe('parseEmailArg', () => {
  it.each([
    [['--email=a@b.co'], 'a@b.co'],
    [['--email', 'a@b.co'], 'a@b.co'],
    [['--email='], ''],
    [[], undefined],
    [['--other=x'], undefined],
  ])('%j → %j', (argv, expected) => {
    expect(parseEmailArg(argv)).toBe(expected);
  });
});
