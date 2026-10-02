import { afterEach, describe, expect, it, vi } from 'vitest';

import { answer, mockStrapi } from './posthog-mock';

const file = {
  host: 'https://eu.posthog.com/',
  projectId: 4321,
  personalApiKey: 'phx_fromfile1234',
};
const stored = {
  host: 'https://us.posthog.com',
  projectId: '99',
  personalApiKey: 'encrypted(phx_savedkey5678)',
};
const input = {
  host: 'https://us.posthog.com',
  projectId: '12345',
  personalApiKey: ' phx_newkey9999 ',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connection', () => {
  it('is not connected by default', async () => {
    expect(await mockStrapi().posthog.connection()).toEqual({
      connected: false,
      host: null,
      projectId: null,
      source: null,
      keyHint: null,
    });
  });

  it('describes a connection without the key', async () => {
    const connection = await mockStrapi({ stored }).posthog.connection();

    expect(connection).toEqual({
      connected: true,
      host: 'https://us.posthog.com',
      projectId: '99',
      source: 'settings',
      keyHint: 'phx_…5678',
    });
    expect(JSON.stringify(connection)).not.toContain('savedkey');
  });

  it('lets the plugin config file win over the settings page', async () => {
    const connection = await mockStrapi({ config: file, stored }).posthog.connection();

    expect(connection).toMatchObject({
      host: 'https://eu.posthog.com',
      projectId: '4321',
      source: 'config',
    });
  });

  it('defaults to the US region', async () => {
    const { posthog } = mockStrapi({ config: { projectId: '1', personalApiKey: 'phx_abcdefgh' } });

    expect((await posthog.connection()).host).toBe('https://us.posthog.com');
  });

  it('is not connected when the saved key can no longer be decrypted', async () => {
    const { posthog } = mockStrapi({ stored, canEncrypt: false });

    expect((await posthog.connection()).connected).toBe(false);
  });
});

describe('connect', () => {
  it('checks the key against PostHog, then saves it encrypted', async () => {
    const fetch = answer({ results: [[1]] });
    vi.stubGlobal('fetch', fetch);

    const { posthog, saved } = mockStrapi();
    const connection = await posthog.connect(input);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('https://us.posthog.com/api/projects/12345/query/');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer phx_newkey9999');
    expect(connection).toEqual({
      connected: true,
      host: 'https://us.posthog.com',
      projectId: '12345',
      source: 'settings',
      keyHint: 'phx_…9999',
    });
    expect(saved.get('posthog')).toEqual({
      host: 'https://us.posthog.com',
      projectId: '12345',
      personalApiKey: 'encrypted(phx_newkey9999)',
    });
  });

  it('saves nothing when PostHog refuses the key', async () => {
    vi.stubGlobal('fetch', answer({ detail: 'Invalid personal API key.' }, 401));

    const { posthog, saved } = mockStrapi();

    await expect(posthog.connect(input)).rejects.toThrow(/personal API key \(phx_…\)/);
    expect(saved.has('posthog')).toBe(false);
  });

  it('names the kind of key pasted by mistake, without asking PostHog', async () => {
    const fetch = answer({ results: [] });
    vi.stubGlobal('fetch', fetch);

    const { posthog } = mockStrapi();

    await expect(posthog.connect({ ...input, personalApiKey: 'phc_abcdef' })).rejects.toThrow(
      /project token your frontend uses/
    );
    await expect(posthog.connect({ ...input, personalApiKey: 'phs_abcdef' })).rejects.toThrow(
      /project secret key/
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a project id that is not a number, a host that is not a URL, a missing key', async () => {
    vi.stubGlobal('fetch', answer({ results: [] }));

    const { posthog } = mockStrapi();

    await expect(posthog.connect({ ...input, projectId: 'my-project' })).rejects.toThrow(
      /number in the address/
    );
    await expect(posthog.connect({ ...input, host: 'eu.posthog.com' })).rejects.toThrow(
      /must be a URL/
    );
    await expect(posthog.connect({ ...input, personalApiKey: '' })).rejects.toThrow(
      /key is required/
    );
  });

  it('keeps the saved key when none is typed again', async () => {
    const fetch = answer({ results: [[1]] });
    vi.stubGlobal('fetch', fetch);

    const { posthog, saved } = mockStrapi({ stored });

    await posthog.connect({ host: 'https://eu.posthog.com', projectId: '7', personalApiKey: '' });

    expect(saved.get('posthog')).toEqual({
      host: 'https://eu.posthog.com',
      projectId: '7',
      personalApiKey: 'encrypted(phx_savedkey5678)',
    });
  });

  it('never stores a key it cannot encrypt', async () => {
    const fetch = answer({ results: [[1]] });
    vi.stubGlobal('fetch', fetch);

    const { posthog, saved } = mockStrapi({ canEncrypt: false });

    await expect(posthog.connect(input)).rejects.toThrow(/no encryption key/);
    expect(saved.has('posthog')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves a connection set in the config file alone', async () => {
    const { posthog, saved } = mockStrapi({ config: file });

    await expect(posthog.connect(input)).rejects.toThrow(/config\/plugins\.ts/);
    expect(saved.has('posthog')).toBe(false);
  });
});

describe('disconnect', () => {
  it('forgets the saved connection and its key', async () => {
    const { posthog, saved } = mockStrapi({ stored });

    expect((await posthog.disconnect()).connected).toBe(false);
    expect(saved.has('posthog')).toBe(false);
  });
});
