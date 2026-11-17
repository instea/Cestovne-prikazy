/**
 * AUTH-01 test double of the Google Identity Services script: defines the
 * `google.accounts.id` subset the app uses. Its button calls the registered
 * callback with `fakeGis.credential`, or reports no credential when null.
 */
export const fakeGis = {
  credential: 'test-id-token' as string | null,
  initialized: [] as { client_id: string; hd?: string }[],
  reset() {
    this.credential = 'test-id-token';
    this.initialized = [];
  },
};

let callback: ((response: { credential?: string }) => void) | null = null;

export function installFakeGis(): void {
  window.google = {
    accounts: {
      id: {
        initialize(config) {
          fakeGis.initialized.push({
            client_id: config.client_id,
            hd: config.hd,
          });
          callback = config.callback;
        },
        renderButton(parent) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Sign in with Google';
          button.onclick = () =>
            callback?.(
              fakeGis.credential === null
                ? {}
                : { credential: fakeGis.credential },
            );
          parent.replaceChildren(button);
        },
      },
    },
  };
}
