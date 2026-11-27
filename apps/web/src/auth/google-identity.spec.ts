import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeGis } from '../test/fake-gis';
import { GIS_SCRIPT_URL, gisSignIn } from './google-identity';

/**
 * The real GIS adapter: script loading and its failure path. Order matters:
 * a failed load resets the module's cached script promise.
 */
describe('gisSignIn', () => {
  afterEach(() => {
    document.head
      .querySelectorAll(`script[src="${GIS_SCRIPT_URL}"]`)
      .forEach((s) => s.remove());
    installFakeGis();
  });

  const options = () => ({
    clientId: 'cid',
    hostedDomain: 'instea.co',
    locale: 'sk',
    onCredential: vi.fn(),
    onError: vi.fn(),
  });

  it('reports a script load failure', async () => {
    delete window.google;
    const opts = options();
    gisSignIn.renderButton(document.createElement('div'), opts);
    document.head
      .querySelector(`script[src="${GIS_SCRIPT_URL}"]`)!
      .dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(opts.onError).toHaveBeenCalled());
  });

  it('loads the GIS script once, then initialises with client id and hd', async () => {
    delete window.google;
    const opts = options();
    const container = document.createElement('div');
    gisSignIn.renderButton(container, opts);
    const script = document.head.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_URL}"]`,
    );
    expect(script).not.toBeNull();
    installFakeGis();
    script!.dispatchEvent(new Event('load'));
    await vi.waitFor(() =>
      expect(container.querySelector('button')).not.toBeNull(),
    );
    container.querySelector('button')!.click();
    expect(opts.onCredential).toHaveBeenCalledWith('test-id-token');
    expect(opts.onError).not.toHaveBeenCalled();
  });
});
