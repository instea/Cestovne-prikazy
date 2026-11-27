import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';

export const PING_TIMEOUT_MS = 2000;

export interface HealthResult {
  ok: boolean;
  /** `ok`, or the error string returned as `checkMongo`. */
  message: string;
}

/** OPS-01: readiness = Mongoose connected and MongoDB answers `ping`. */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async check(): Promise<HealthResult> {
    const result = await this.ping();
    if (!result.ok) this.logger.warn(`Health check failed: ${result.message}`);
    return result;
  }

  private async ping(): Promise<HealthResult> {
    const { readyState } = this.connection;
    if (readyState !== ConnectionStates.connected) {
      return {
        ok: false,
        message: `MongoDB not connected (readyState=${readyState})`,
      };
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`MongoDB ping timed out after ${PING_TIMEOUT_MS} ms`),
          ),
        PING_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([
        this.connection
          .db!.admin()
          .command({ ping: 1, maxTimeMS: PING_TIMEOUT_MS }),
        timeout,
      ]);
      return { ok: true, message: 'ok' };
    } catch (e) {
      return { ok: false, message: String(e) };
    } finally {
      clearTimeout(timer);
    }
  }
}
