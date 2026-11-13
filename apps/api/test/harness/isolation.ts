import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, inject, it } from 'vitest';
import { useTestDatabase } from '../support/mongo';

/** Shared (not per-file) database where the isolation files meet. */
export const ISOLATION_SYNC_DB = 'test_isolation_sync';
/** How long a file waits for the other one to show up. */
const RENDEZVOUS_MS = 3_000;

interface Arrival {
  runId: string;
  marker: string;
  dbName: string;
  at: Date;
}

/**
 * TST-02 acceptance: "Given two test files run in parallel, then they don't
 * see each other's data." `isolation-a` / `isolation-b` both call this.
 *
 * Each file records `{ runId, marker, dbName }` in `ISOLATION_SYNC_DB` and
 * writes its marker into its own per-file DB. Whichever file finds the
 * other's record (the later one always does, the earlier one too when they
 * overlap) asserts that the two DB names differ and that the other's DB
 * never holds this file's marker. Different DB names on one server cannot
 * share data, so this holds whether Vitest runs the files at the same time
 * or one after the other (`maxWorkers` defaults to CPUs - 1, so a 2-vCPU
 * runner has one worker and a hard "must overlap" barrier would always fail).
 */
export function isolationSuite(marker: string, other: string): void {
  describe(`per-file database (${marker})`, () => {
    const db = useTestDatabase();
    const runId = inject('testRunId');

    it('uses its own test_<random> database', () => {
      expect(db.connection().name).toMatch(/^test_[0-9a-f]{32}$/);
    });

    it('never sees documents written by the other file', async () => {
      const conn = db.connection();
      const arrivals = conn
        .useDb(ISOLATION_SYNC_DB)
        .collection<Arrival>('arrivals');
      // Old runs against a persistent MONGO_TEST_URL expire after an hour.
      await arrivals.createIndex({ at: 1 }, { expireAfterSeconds: 3600 });

      const markers = conn.collection('isolation');
      await markers.insertOne({ marker });
      await arrivals.insertOne({
        runId,
        marker,
        dbName: conn.name,
        at: new Date(),
      });

      let peer: Arrival | null = null;
      for (let waited = 0; ; waited += 50) {
        const docs = await markers.find({}).toArray();
        expect(docs.map((d) => d.marker as unknown)).toEqual([marker]);
        peer ??= await arrivals.findOne({ runId, marker: other });
        if (peer || waited >= RENDEZVOUS_MS) break;
        await sleep(50);
      }
      // No peer yet: it starts later and does the cross-check against us.
      if (!peer) return;

      expect(peer.dbName).toMatch(/^test_[0-9a-f]{32}$/);
      expect(peer.dbName).not.toBe(conn.name);
      // The peer's DB holds its marker (still running) or nothing (dropped),
      // never ours.
      const peerDocs = await conn
        .useDb(peer.dbName)
        .collection('isolation')
        .find({})
        .toArray();
      expect(peerDocs.every((d) => (d.marker as unknown) === other)).toBe(true);
    });
  });
}
