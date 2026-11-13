import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { EXIT_DB_DISCONNECTED, shutdownState } from './shutdown';

/** Injection token for the exit function; tests replace it. */
export const PROCESS_EXIT = Symbol('PROCESS_EXIT');
export type ProcessExit = (code: number) => void;

const GRACE_MS = 5000;

/**
 * OPS-01: losing the DB connection at runtime exits the process (254), so
 * k8s restarts the pod. Ignored during an intentional shutdown.
 */
@Injectable()
export class ConnectionWatcher implements OnModuleInit {
  private readonly logger = new Logger(ConnectionWatcher.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(PROCESS_EXIT) private readonly exit: ProcessExit,
  ) {}

  onModuleInit(): void {
    this.connection.once('disconnected', () => void this.onDisconnected());
  }

  private async onDisconnected(): Promise<void> {
    if (shutdownState.active) return;
    this.logger.error('Disconnected from the database -> exiting');
    const force = setTimeout(() => this.exit(EXIT_DB_DISCONNECTED), GRACE_MS);
    force.unref();
    try {
      await this.adapterHost.httpAdapter?.close();
    } finally {
      clearTimeout(force);
      this.exit(EXIT_DB_DISCONNECTED);
    }
  }
}
