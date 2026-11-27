import type { Connection, Model, Schema } from 'mongoose';
import { userChangeDrafts } from '../audit/audit-details';
import { AuditLog, AuditLogSchema } from '../audit/audit-log.schema';
import { withTransaction } from '../database/transaction';
import { User, UserSchema } from '../users/user.schema';

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

export const PROMOTE_ADMIN_USAGE = 'Usage: promote-admin --email=<email>';

export interface CliOutput {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface PromoteAdminOptions {
  /** Audit `at` (tests); defaults to the system clock. */
  now?: () => Date;
}

/** `--email=<email>` or `--email <email>`; `undefined` when missing. */
export function parseEmailArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--email=')) return a.slice('--email='.length);
    if (a === '--email') return argv[i + 1];
  }
  return undefined;
}

/** The connection's model `name`, registered on first use. */
function model<T>(
  connection: Connection,
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (
    (connection.models[name] as Model<T> | undefined) ??
    connection.model<T>(name, schema)
  );
}

type Outcome = 'not-found' | 'deactivated' | 'already-admin' | 'promoted';

/**
 * AUTH-04: promote an existing, active user to admin by email (trimmed,
 * lowercased). Bootstrap of the first admin and recovery when no admin is
 * left. The change and its `USER_ROLE_CHANGED` audit entry (actorType
 * `cli`, NFR-06) are written in one transaction. Returns the exit code.
 */
export async function promoteAdmin(
  connection: Connection,
  rawEmail: string | undefined,
  out: CliOutput,
  options: PromoteAdminOptions = {},
): Promise<number> {
  const shown = rawEmail?.trim() ?? '';
  if (!shown) {
    out.stderr(PROMOTE_ADMIN_USAGE);
    return EXIT_USAGE;
  }
  const email = shown.toLowerCase();
  const now = options.now ?? (() => new Date());
  const Users = model<User>(connection, User.name, UserSchema);
  const Entries = model<AuditLog>(connection, AuditLog.name, AuditLogSchema);

  try {
    const outcome = await withTransaction<Outcome>(
      connection,
      async (session) => {
        const user = await Users.findOne({ email }, null, { session });
        if (!user) return 'not-found';
        if (!user.active) return 'deactivated';
        if (user.isAdmin) return 'already-admin';
        const drafts = userChangeDrafts(
          {
            firstName: user.firstName,
            surname: user.surname,
            isAdmin: user.isAdmin,
          },
          { isAdmin: true },
        );
        user.isAdmin = true;
        await user.save({ session });
        const at = now();
        await Entries.create(
          drafts.map((d) => ({
            ...d,
            at,
            actorType: 'cli' as const,
            actorId: null,
            targetType: 'USER' as const,
            // `user.id` on a hydrated document is Mongoose's `any` virtual.
            targetId: user.get('id', String),
          })),
          { session, ordered: true },
        );
        return 'promoted';
      },
    );
    switch (outcome) {
      case 'not-found':
        out.stderr(`User with email '${shown}' not found.`);
        return EXIT_FAILED;
      case 'deactivated':
        out.stderr(`User with email '${shown}' is deactivated.`);
        return EXIT_FAILED;
      case 'already-admin':
        out.stdout(`User with email '${shown}' is already an admin.`);
        return EXIT_OK;
      case 'promoted':
        out.stdout(`User with email '${shown}' promoted to admin.`);
        return EXIT_OK;
    }
  } catch (err) {
    out.stderr(err instanceof Error ? err.message : String(err));
    return EXIT_FAILED;
  }
}
