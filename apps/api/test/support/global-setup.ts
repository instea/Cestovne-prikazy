import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of a MongoDB 8 replica-set member, without database name. */
    mongoUrl: string;
  }
}

/**
 * TST-02: one MongoDB 8 per test run. `MONGO_TEST_URL` (e.g. the SET-04
 * compose `mongo`) skips Testcontainers; it must be a replica-set member.
 */
export default async function setup(project: TestProject) {
  let container: StartedMongoDBContainer | undefined;
  let url = process.env.MONGO_TEST_URL;
  if (!url) {
    container = await new MongoDBContainer('mongo:8.0').start();
    url = container.getConnectionString();
  }
  project.provide('mongoUrl', url);
  return async () => {
    await container?.stop();
  };
}
