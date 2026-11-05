/** Set before an intentional shutdown so a DB `disconnected` is not fatal. */
let shuttingDown = false;

export const shutdownState = {
  begin(): void {
    shuttingDown = true;
  },
  get active(): boolean {
    return shuttingDown;
  },
};

/** Exit codes kept from the old app (`process.exit(-1)` / `-2`). */
export const EXIT_DB_CONNECT_FAILED = 255;
export const EXIT_DB_DISCONNECTED = 254;
